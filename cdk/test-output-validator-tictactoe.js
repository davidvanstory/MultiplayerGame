
// Auto-generated server-side validator for tictactoe game
// Generated at: 2025-08-11T05:17:59.319Z
// Complexity: moderate

exports.handler = async (event) => {
  console.log('Validating game action:', JSON.stringify(event));
  
  const { action, gameState, playerId, data, gameId } = event;
  
  // Validation result structure
  const result = {
    valid: false,
    reason: '',
    updatedState: null,
    broadcast: null,
    timestamp: Date.now()
  };
  
  try {
    // Parse game state if string
    const state = typeof gameState === 'string' ? JSON.parse(gameState) : gameState;
    
    // Initialize state if empty
    if (!state || Object.keys(state).length === 0) {
      result.valid = true;
      result.updatedState = {
        players: {},
        gameActive: false,
        createdAt: Date.now(),
        board: createEmptyBoard(),
        scores: {},
        currentTurn: null,
        
        
        gameType: 'tictactoe'
      };
      return result;
    }
    
    // Validate based on action type
    switch(action) {
      case 'join':
        return handleJoinGame(state, playerId, data);
      
      case 'start':
        return handleStartGame(state, playerId, data);
      
      case 'move':
        return handleMove(state, playerId, data);
      
      case 'update':
        return handleUpdate(state, playerId, data);
      
      case 'end':
        return handleEndGame(state, playerId, data);
      
      default:
        // Allow custom actions
        return handleCustomAction(action, state, playerId, data);
    }
    
  } catch (error) {
    console.error('Validation error:', error);
    result.reason = 'Validation error: ' + error.message;
    return result;
  }
};

// Handle player joining
function handleJoinGame(state, playerId, data) {
  const maxPlayers = 2;
  
  if (state.players && Object.keys(state.players).length >= maxPlayers) {
    return { valid: false, reason: 'Game is full' };
  }
  
  if (state.players && state.players[playerId]) {
    return { valid: false, reason: 'Player already in game' };
  }
  
  const updatedState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: {
        id: playerId,
        joinedAt: Date.now(),
        score: 0,
        
        active: true,
        ...data
      }
    }
  };
  
  
  // Set first player as current turn
  if (!state.currentTurn && Object.keys(updatedState.players).length === 1) {
    updatedState.currentTurn = playerId;
  }
  
  return {
    valid: true,
    updatedState,
    broadcast: {
      type: 'PLAYER_JOINED',
      playerId,
      playerCount: Object.keys(updatedState.players).length
    }
  };
}

// Handle game start
function handleStartGame(state, playerId, data) {
  if (state.gameActive) {
    return { valid: false, reason: 'Game already active' };
  }
  
  const playerCount = Object.keys(state.players || {}).length;
  if (playerCount < 2) {
    return { valid: false, reason: 'Not enough players' };
  }
  
  const updatedState = {
    ...state,
    gameActive: true,
    startedAt: Date.now(),
    
    board: createEmptyBoard(),
    currentTurn: Object.keys(state.players)[0],
    ...data
  };
  
  return {
    valid: true,
    updatedState,
    broadcast: {
      type: 'GAME_STARTED',
      startedBy: playerId
    }
  };
}

// Handle player moves
function handleMove(state, playerId, data) {
  if (!state.gameActive) {
    return { valid: false, reason: 'Game not active' };
  }
  
  if (!state.players || !state.players[playerId]) {
    return { valid: false, reason: 'Player not in game' };
  }
  
  
  // Validate turn
  if (state.currentTurn !== playerId) {
    return { valid: false, reason: 'Not your turn' };
  }
  
  
  // Validate board move
  if (data.position !== undefined) {
    if (!isValidBoardMove(state.board, data.position, playerId)) {
      return { valid: false, reason: 'Invalid board position' };
    }
  }
  
  // Apply move
  const updatedState = {
    ...state,
    lastMove: {
      playerId,
      data,
      timestamp: Date.now()
    },
    board: applyBoardMove(state.board, data.position, playerId),
    currentTurn: getNextPlayer(state.players, playerId),
    moveCount: (state.moveCount || 0) + 1
  };
  
  // Check win condition
  
  const winner = checkWinCondition(updatedState);
  if (winner) {
    updatedState.gameActive = false;
    updatedState.winner = winner;
    updatedState.endedAt = Date.now();
  }
  
  return {
    valid: true,
    updatedState,
    broadcast: {
      type: 'MOVE_MADE',
      playerId,
      move: data,
      nextTurn: updatedState.currentTurn,
      winner: updatedState.winner,
    }
  };
}

// Handle state updates
function handleUpdate(state, playerId, data) {
  if (!state.players || !state.players[playerId]) {
    return { valid: false, reason: 'Player not in game' };
  }
  
  const updatedState = { ...state };
  
  
  // Handle score update
  if (data.score !== undefined) {
    updatedState.players = {
      ...updatedState.players,
      [playerId]: {
        ...updatedState.players[playerId],
        score: Math.max(0, data.score)
      }
    };
  }
  
  
  
  return {
    valid: true,
    updatedState,
    broadcast: {
      type: 'STATE_UPDATE',
      playerId,
      updates: data
    }
  };
}

// Handle game end
function handleEndGame(state, playerId, data) {
  if (!state.gameActive) {
    return { valid: false, reason: 'Game not active' };
  }
  
  const updatedState = {
    ...state,
    gameActive: false,
    endedAt: Date.now(),
    endedBy: playerId,
    winner: data.winner || null,
    finalScores: getFinalScores(state.players),
    ...data
  };
  
  return {
    valid: true,
    updatedState,
    broadcast: {
      type: 'GAME_ENDED',
      endedBy: playerId,
      winner: updatedState.winner,
      finalScores: updatedState.finalScores
    }
  };
}

// Handle custom actions
function handleCustomAction(action, state, playerId, data) {
  // Allow passthrough for game-specific actions
  console.log('Custom action:', action);
  
  return {
    valid: true,
    updatedState: state,
    broadcast: {
      type: 'CUSTOM_ACTION',
      action,
      playerId,
      data
    }
  };
}

// Helper functions
function getNextPlayer(players, currentPlayerId) {
  const playerIds = Object.keys(players).filter(id => !players[id].eliminated);
  const currentIndex = playerIds.indexOf(currentPlayerId);
  return playerIds[(currentIndex + 1) % playerIds.length];
}

function getFinalScores(players) {
  if (!players) return {};
  return Object.keys(players).reduce((scores, id) => {
    scores[id] = players[id].score || 0;
    return scores;
  }, {});
}


function createEmptyBoard() {
  // Create appropriate board based on game type
  return {}; // Dynamic board
}

function isValidBoardMove(board, position, playerId) {
  // Implement board validation logic
  if (!board || !position) return false;
  
  
  return board[position] === null || board[position] === undefined;
}

function applyBoardMove(board, position, playerId) {
  const newBoard = JSON.parse(JSON.stringify(board));
  
  newBoard[position] = playerId;
  return newBoard;
}


function checkWinCondition(state) {
  // Implement win condition checking
  
  // Tic-tac-toe win checking
  const board = state.board;
  if (!board) return null;
  
  // Check rows, columns, and diagonals
  for (let i = 0; i < 3; i++) {
    // Check rows
    if (board[i][0] && board[i][0] === board[i][1] && board[i][1] === board[i][2]) {
      return board[i][0];
    }
    // Check columns
    if (board[0][i] && board[0][i] === board[1][i] && board[1][i] === board[2][i]) {
      return board[0][i];
    }
  }
  // Check diagonals
  if (board[0][0] && board[0][0] === board[1][1] && board[1][1] === board[2][2]) {
    return board[0][0];
  }
  if (board[0][2] && board[0][2] === board[1][1] && board[1][1] === board[2][0]) {
    return board[0][2];
  }
  
  // Check for draw
  const isDraw = board.every(row => row.every(cell => cell !== null));
  return isDraw ? 'draw' : null;
}
