const { DynamoDBClient, GetItemCommand, UpdateItemCommand } = require('@aws-sdk/client-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { unmarshall, marshall } = require('@aws-sdk/util-dynamodb');

const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-2' });
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-2' });

// In-memory cache for game states
const stateCache = new Map();
const CACHE_TTL = 5000; // 5 seconds cache TTL
const TIMEOUT_LIMIT = 24000; // 24 seconds for AppSync (leaving buffer)

/**
 * Main handler for processing game actions
 */
exports.handler = async (event) => {
  console.log('Universal Game Engine invoked:', JSON.stringify(event, null, 2));
  
  // Handle both direct invocation and AppSync resolver format
  const { gameId, action } = event.arguments || event;
  
  if (!gameId || !action) {
    return {
      success: false,
      error: 'Missing required parameters: gameId and action',
      timestamp: Date.now()
    };
  }
  
  try {
    // Wrap main processing with timeout handler
    return await withTimeout(
      processGameAction(gameId, action),
      TIMEOUT_LIMIT
    );
  } catch (error) {
    console.error('Handler error:', error);
    
    if (error.message === 'Operation timeout') {
      return {
        success: false,
        error: 'Processing timeout - please retry',
        shouldRetry: true,
        timestamp: Date.now()
      };
    }
    
    return {
      success: false,
      error: error.message,
      timestamp: Date.now()
    };
  }
};

/**
 * Process a game action with validation and state updates
 */
async function processGameAction(gameId, action) {
  console.log(`Processing action for game ${gameId}:`, action);
  
  // Load current game state
  const game = await loadGameState(gameId);
  
  if (!game) {
    throw new Error(`Game ${gameId} not found`);
  }
  
  // Parse action if it's a string
  const actionData = typeof action === 'string' ? JSON.parse(action) : action;
  
  // Process the action
  const result = await processAction(game, actionData);
  
  // Save updated state if changed
  if (result.stateChanged) {
    const savedGame = await saveGameState(gameId, result.newState, result.metadata);
    result.response.stateVersion = savedGame.stateVersion;
  }
  
  // Return the response
  return result.response;
}

/**
 * Load game state with caching
 */
async function loadGameState(gameId) {
  // Check cache first
  const cached = stateCache.get(gameId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`Using cached state for game ${gameId}`);
    return cached.data;
  }
  
  console.log(`Loading game ${gameId} from DynamoDB`);
  
  try {
    const command = new GetItemCommand({
      TableName: process.env.GAME_TABLE_NAME || 'GameTable',
      Key: marshall({ gameId })
    });
    
    const result = await dynamoClient.send(command);
    
    if (!result.Item) {
      return null;
    }
    
    const game = unmarshall(result.Item);
    
    // Parse JSON fields
    if (game.gameState && typeof game.gameState === 'string') {
      game.gameState = JSON.parse(game.gameState);
    }
    if (game.players && typeof game.players === 'string') {
      game.players = JSON.parse(game.players);
    }
    if (game.metadata && typeof game.metadata === 'string') {
      game.metadata = JSON.parse(game.metadata);
    }
    
    // Cache the result
    stateCache.set(gameId, {
      data: game,
      timestamp: Date.now()
    });
    
    return game;
  } catch (error) {
    console.error('Error loading game state:', error);
    throw new Error(`Failed to load game state: ${error.message}`);
  }
}

/**
 * Process action based on game type and validators
 */
async function processAction(game, action) {
  const gameState = game.gameState || {};
  const { type, playerId, data } = action;
  
  console.log(`Processing ${type} action for player ${playerId}`);
  
  // Check for game-specific validator
  if (game.serverLogicUrl && game.serverLogicUrl.includes('arn:aws:lambda')) {
    console.log('Invoking game-specific validator:', game.serverLogicUrl);
    
    try {
      const validatorResult = await invokeValidator(game.serverLogicUrl, {
        action: type,
        gameState: gameState,
        playerId: playerId,
        data: data,
        gameId: game.gameId
      });
      
      if (validatorResult) {
        return validatorResult;
      }
    } catch (error) {
      console.error('Validator invocation failed, falling back to generic processing:', error);
    }
  }
  
  // Generic state processing
  return await processGenericAction(game, gameState, action);
}

/**
 * Invoke game-specific validator Lambda
 */
async function invokeValidator(functionArn, payload) {
  try {
    const command = new InvokeCommand({
      FunctionName: functionArn,
      InvocationType: 'RequestResponse',
      Payload: JSON.stringify(payload)
    });
    
    const response = await lambdaClient.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.Payload));
    
    console.log('Validator response:', result);
    
    // Transform validator response to our format
    return {
      stateChanged: result.valid && result.updatedState,
      newState: result.updatedState,
      metadata: result.metadata,
      response: {
        success: result.valid,
        state: result.updatedState,
        broadcast: result.broadcast,
        error: result.reason,
        timestamp: result.timestamp || Date.now()
      }
    };
  } catch (error) {
    console.error('Validator invocation error:', error);
    return null; // Fall back to generic processing
  }
}

/**
 * Generic action processing for any game type
 */
async function processGenericAction(game, currentState, action) {
  const { type, playerId, data } = action;
  
  switch (type) {
    case 'JOIN':
    case 'join':
      return handleJoin(game, currentState, playerId, data);
    
    case 'START':
    case 'start':
      return handleStart(game, currentState, playerId, data);
    
    case 'MOVE':
    case 'move':
      return handleMove(game, currentState, playerId, data);
    
    case 'UPDATE':
    case 'update':
      return handleUpdate(game, currentState, playerId, data);
    
    case 'END':
    case 'end':
      return handleEnd(game, currentState, playerId, data);
    
    default:
      // Pass through unknown actions
      return {
        stateChanged: false,
        response: {
          success: true,
          action: action,
          message: `Action ${type} recorded`,
          timestamp: Date.now()
        }
      };
  }
}

/**
 * Handle player joining
 */
function handleJoin(game, currentState, playerId, data) {
  console.log(`Player ${playerId} joining game ${game.gameId}`);
  
  const players = game.players || {};
  const metadata = game.metadata || {};
  
  // Check if player already in game
  if (players[playerId]) {
    return {
      stateChanged: false,
      response: {
        success: false,
        error: 'Player already in game',
        timestamp: Date.now()
      }
    };
  }
  
  // Check max players (default to 8 for party games, 2 for turn-based)
  const maxPlayers = metadata.maxPlayers ||
    (game.gameType === 'turn-based' || game.gameType === 'tictactoe' || game.gameType === 'chess' ? 2 : 8);
  
  if (Object.keys(players).length >= maxPlayers) {
    return {
      stateChanged: false,
      response: {
        success: false,
        error: 'Game is full',
        timestamp: Date.now()
      }
    };
  }
  
  // Add player
  const updatedPlayers = {
    ...players,
    [playerId]: {
      id: playerId,
      joinedAt: Date.now(),
      score: 0,
      active: true,
      ...data
    }
  };
  
  // Update game state
  const updatedState = {
    ...currentState,
    playerCount: Object.keys(updatedPlayers).length,
    lastActivity: Date.now()
  };
  
  // Set first player as current turn for turn-based games
  if (!currentState.currentTurn && Object.keys(updatedPlayers).length === 1) {
    updatedState.currentTurn = playerId;
  }
  
  return {
    stateChanged: true,
    newState: updatedState,
    metadata: { players: updatedPlayers },
    response: {
      success: true,
      state: updatedState,
      players: updatedPlayers,
      broadcast: {
        type: 'PLAYER_JOINED',
        playerId: playerId,
        playerCount: Object.keys(updatedPlayers).length
      },
      timestamp: Date.now()
    }
  };
}

/**
 * Handle game start
 */
function handleStart(game, currentState, playerId, data) {
  console.log(`Starting game ${game.gameId}`);
  
  if (currentState.gameActive) {
    return {
      stateChanged: false,
      response: {
        success: false,
        error: 'Game already active',
        timestamp: Date.now()
      }
    };
  }
  
  const players = game.players || {};
  const minPlayers = game.metadata?.minPlayers || 1;
  
  if (Object.keys(players).length < minPlayers) {
    return {
      stateChanged: false,
      response: {
        success: false,
        error: `Need at least ${minPlayers} players to start`,
        timestamp: Date.now()
      }
    };
  }
  
  const updatedState = {
    ...currentState,
    gameActive: true,
    startedAt: Date.now(),
    startedBy: playerId,
    currentTurn: currentState.currentTurn || Object.keys(players)[0],
    round: 1,
    ...data
  };
  
  return {
    stateChanged: true,
    newState: updatedState,
    response: {
      success: true,
      state: updatedState,
      broadcast: {
        type: 'GAME_STARTED',
        startedBy: playerId,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    }
  };
}

/**
 * Handle player move
 */
function handleMove(game, currentState, playerId, data) {
  console.log(`Player ${playerId} making move in game ${game.gameId}`);
  
  if (!currentState.gameActive) {
    return {
      stateChanged: false,
      response: {
        success: false,
        error: 'Game not active',
        timestamp: Date.now()
      }
    };
  }
  
  const players = game.players || {};
  
  if (!players[playerId]) {
    return {
      stateChanged: false,
      response: {
        success: false,
        error: 'Player not in game',
        timestamp: Date.now()
      }
    };
  }
  
  // For turn-based games, validate turn
  if (currentState.currentTurn && currentState.currentTurn !== playerId) {
    return {
      stateChanged: false,
      response: {
        success: false,
        error: 'Not your turn',
        timestamp: Date.now()
      }
    };
  }
  
  // Apply move to state
  const updatedState = {
    ...currentState,
    lastMove: {
      playerId: playerId,
      data: data,
      timestamp: Date.now()
    },
    moveCount: (currentState.moveCount || 0) + 1,
    lastActivity: Date.now()
  };
  
  // Update turn for turn-based games
  if (currentState.currentTurn) {
    const playerIds = Object.keys(players).filter(id => players[id].active !== false);
    const currentIndex = playerIds.indexOf(playerId);
    updatedState.currentTurn = playerIds[(currentIndex + 1) % playerIds.length];
  }
  
  // Apply move data to state
  if (data.position !== undefined) {
    updatedState.board = currentState.board || {};
    updatedState.board[data.position] = playerId;
  }
  
  // Check for simple win conditions
  const winner = checkWinCondition(updatedState, players);
  if (winner) {
    updatedState.gameActive = false;
    updatedState.winner = winner;
    updatedState.endedAt = Date.now();
  }
  
  return {
    stateChanged: true,
    newState: updatedState,
    response: {
      success: true,
      state: updatedState,
      broadcast: {
        type: 'MOVE_MADE',
        playerId: playerId,
        move: data,
        nextTurn: updatedState.currentTurn,
        winner: updatedState.winner,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    }
  };
}

/**
 * Handle state update
 */
function handleUpdate(game, currentState, playerId, data) {
  console.log(`Updating state for player ${playerId} in game ${game.gameId}`);
  
  const players = game.players || {};
  
  if (!players[playerId] && playerId !== 'system') {
    return {
      stateChanged: false,
      response: {
        success: false,
        error: 'Player not in game',
        timestamp: Date.now()
      }
    };
  }
  
  // Apply updates to state
  const updatedState = {
    ...currentState,
    ...data.state,
    lastActivity: Date.now()
  };
  
  // Update player-specific data
  let updatedPlayers = players;
  if (data.playerData) {
    updatedPlayers = {
      ...players,
      [playerId]: {
        ...players[playerId],
        ...data.playerData
      }
    };
  }
  
  return {
    stateChanged: true,
    newState: updatedState,
    metadata: { players: updatedPlayers },
    response: {
      success: true,
      state: updatedState,
      players: updatedPlayers,
      broadcast: {
        type: 'STATE_UPDATE',
        playerId: playerId,
        updates: data,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    }
  };
}

/**
 * Handle game end
 */
function handleEnd(game, currentState, playerId, data) {
  console.log(`Ending game ${game.gameId}`);
  
  if (!currentState.gameActive) {
    return {
      stateChanged: false,
      response: {
        success: false,
        error: 'Game not active',
        timestamp: Date.now()
      }
    };
  }
  
  const players = game.players || {};
  
  const updatedState = {
    ...currentState,
    gameActive: false,
    endedAt: Date.now(),
    endedBy: playerId,
    winner: data.winner || null,
    finalScores: getFinalScores(players),
    ...data
  };
  
  return {
    stateChanged: true,
    newState: updatedState,
    response: {
      success: true,
      state: updatedState,
      broadcast: {
        type: 'GAME_ENDED',
        endedBy: playerId,
        winner: updatedState.winner,
        finalScores: updatedState.finalScores,
        timestamp: Date.now()
      },
      timestamp: Date.now()
    }
  };
}

/**
 * Save game state with versioning
 */
async function saveGameState(gameId, newState, additionalMetadata = {}) {
  const version = Date.now();
  
  console.log(`Saving game state for ${gameId}, version: ${version}`);
  
  try {
    // Prepare update expression
    const updateExpressionParts = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    
    // Always update gameState and version
    updateExpressionParts.push('gameState = :state');
    updateExpressionParts.push('stateVersion = :version');
    updateExpressionParts.push('updatedAt = :time');
    expressionAttributeValues[':state'] = { S: JSON.stringify(newState) };
    expressionAttributeValues[':version'] = { N: version.toString() };
    expressionAttributeValues[':time'] = { S: new Date().toISOString() };
    
    // Update players if provided
    if (additionalMetadata.players) {
      updateExpressionParts.push('players = :players');
      expressionAttributeValues[':players'] = { S: JSON.stringify(additionalMetadata.players) };
    }
    
    // Update metadata if provided
    if (additionalMetadata.metadata) {
      updateExpressionParts.push('#metadata = :metadata');
      expressionAttributeNames['#metadata'] = 'metadata';
      expressionAttributeValues[':metadata'] = { S: JSON.stringify(additionalMetadata.metadata) };
    }
    
    const command = new UpdateItemCommand({
      TableName: process.env.GAME_TABLE_NAME || 'GameTable',
      Key: marshall({ gameId }),
      UpdateExpression: 'SET ' + updateExpressionParts.join(', '),
      ExpressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: 'ALL_NEW'
    });
    
    const result = await dynamoClient.send(command);
    
    // Invalidate cache
    stateCache.delete(gameId);
    
    // Return updated game
    const updatedGame = unmarshall(result.Attributes);
    return {
      ...updatedGame,
      stateVersion: version
    };
  } catch (error) {
    console.error('Error saving game state:', error);
    throw new Error(`Failed to save game state: ${error.message}`);
  }
}

/**
 * Check for simple win conditions
 */
function checkWinCondition(state, players) {
  // Check for score-based win
  if (state.targetScore) {
    for (const playerId in players) {
      if (players[playerId].score >= state.targetScore) {
        return playerId;
      }
    }
  }
  
  // Check for elimination
  const activePlayers = Object.keys(players).filter(id => players[id].active !== false);
  if (activePlayers.length === 1) {
    return activePlayers[0];
  }
  
  // Check for board-based win (simple 3x3 tic-tac-toe)
  if (state.board && Object.keys(state.board).length >= 5) {
    const winPatterns = [
      // Rows
      ['0,0', '0,1', '0,2'],
      ['1,0', '1,1', '1,2'],
      ['2,0', '2,1', '2,2'],
      // Columns
      ['0,0', '1,0', '2,0'],
      ['0,1', '1,1', '2,1'],
      ['0,2', '1,2', '2,2'],
      // Diagonals
      ['0,0', '1,1', '2,2'],
      ['0,2', '1,1', '2,0']
    ];
    
    for (const pattern of winPatterns) {
      const values = pattern.map(pos => state.board[pos]).filter(Boolean);
      if (values.length === 3 && values[0] === values[1] && values[1] === values[2]) {
        return values[0];
      }
    }
  }
  
  return null;
}

/**
 * Get final scores for all players
 */
function getFinalScores(players) {
  if (!players) return {};
  
  return Object.keys(players).reduce((scores, id) => {
    scores[id] = players[id].score || 0;
    return scores;
  }, {});
}

/**
 * Timeout handler wrapper
 */
async function withTimeout(promise, timeoutMs) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Operation timeout')), timeoutMs)
  );
  
  return Promise.race([promise, timeout]);
}

// Export for testing
if (process.env.NODE_ENV === 'test') {
  exports.loadGameState = loadGameState;
  exports.processAction = processAction;
  exports.saveGameState = saveGameState;
  exports.checkWinCondition = checkWinCondition;
}