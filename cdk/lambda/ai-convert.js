const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { LambdaClient, CreateFunctionCommand, GetFunctionCommand, InvokeCommand } = require('@aws-sdk/client-lambda');
const { DynamoDBClient, PutItemCommand, UpdateItemCommand, GetItemCommand } = require('@aws-sdk/client-dynamodb');
const OpenAI = require('openai');
const crypto = require('crypto');
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-2' });
const dynamoClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-2' });

exports.handler = async (event, context) => {
  console.log('Lambda invoked with event:', JSON.stringify(event, null, 2));
  console.log('Environment Variables Check:');
  console.log('WEBSITE_BUCKET:', process.env.WEBSITE_BUCKET);
  console.log('CF_DOMAIN:', process.env.CF_DOMAIN);
  console.log('API_ENDPOINT:', process.env.API_ENDPOINT);
  console.log('API_KEY:', process.env.API_KEY ? 'Set (hidden)' : 'Not set');
  console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Set (hidden)' : 'Not set');
  console.log('Function Name:', context ? context.functionName : 'Not available');
  
  const operation = event.info ? event.info.fieldName : 'convertToMultiplayer';
  console.log('Operation:', operation);
  
  // Check if this is an async processing invocation
  if (event.isAsyncProcessing) {
    console.log('Processing async conversion for gameId:', event.gameId);
    return await handleAsyncConversion(event);
  }
  
  try {
    if (operation === 'generateGame') {
      return await handleGenerateGame(event);
    } else if (operation === 'convertToMultiplayer') {
      return await handleConvertToMultiplayer(event, context);
    }
    
    throw new Error(`Unknown operation: ${operation}`);
  } catch (error) {
    console.error('Handler error:', error);
    throw error;
  }
};

/**
 * Analyzes HTML to identify game elements that should have data attributes
 * @param {string} html - The HTML content to analyze
 * @returns {Object} Analysis results with element patterns
 */
function analyzeGameElements(html) {
  console.log('Analyzing game elements in HTML');
  
  const analysis = {
    hasButtons: false,
    hasScore: false,
    hasBoard: false,
    hasTurns: false,
    hasCanvas: false,
    hasInputs: false,
    buttonPatterns: [],
    statePatterns: [],
    interactionPatterns: []
  };
  
  // Check for common game patterns
  analysis.hasButtons = /<button/i.test(html);
  analysis.hasScore = /score|points|lives/i.test(html);
  analysis.hasBoard = /board|grid|cell/i.test(html);
  analysis.hasTurns = /turn|player\s*\d|current.*player/i.test(html);
  analysis.hasCanvas = /<canvas/i.test(html);
  analysis.hasInputs = /<input|<select|<textarea/i.test(html);
  
  // Identify button patterns
  const buttonMatches = html.match(/<button[^>]*>([^<]+)<\/button>/gi) || [];
  analysis.buttonPatterns = buttonMatches.map(btn => {
    const text = btn.match(/>([^<]+)</)?.[1] || '';
    return text.toLowerCase().trim();
  });
  
  // Identify elements that likely contain state
  if (analysis.hasScore) {
    analysis.statePatterns.push('score', 'points', 'lives', 'health');
  }
  if (analysis.hasTurns) {
    analysis.statePatterns.push('turn', 'player', 'current');
  }
  if (analysis.hasBoard) {
    analysis.statePatterns.push('board', 'grid', 'cell');
  }
  
  // Identify interaction patterns
  if (analysis.hasButtons) {
    analysis.interactionPatterns.push('button', 'btn');
  }
  if (analysis.hasBoard) {
    analysis.interactionPatterns.push('cell', 'tile', 'square');
  }
  if (analysis.hasCanvas) {
    analysis.interactionPatterns.push('canvas');
  }
  
  console.log('Game analysis:', analysis);
  return analysis;
}

/**
 * Dynamically detects the type of game based on HTML content analysis
 * Uses intelligent pattern matching and contextual analysis rather than hardcoded types
 * @param {string} html - The HTML content to analyze
 * @returns {string} The detected game type
 */
function detectGameType(html) {
  console.log('Dynamically detecting game type from HTML content');
  
  // Extract potential game name from title, h1, or comments
  const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const gameNameComment = html.match(/<!--\s*game[:\s]+([^-]+)-->/i);
  
  let detectedName = null;
  if (titleMatch) {
    detectedName = titleMatch[1].toLowerCase().trim();
  } else if (h1Match) {
    detectedName = h1Match[1].toLowerCase().trim();
  } else if (gameNameComment) {
    detectedName = gameNameComment[1].toLowerCase().trim();
  }
  
  // Clean up common words to get core game name
  if (detectedName) {
    detectedName = detectedName
      .replace(/\b(game|play|online|free|new|my|the|a)\b/gi, '')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '')
      .trim();
    
    if (detectedName && detectedName.length > 2) {
      console.log(`Detected game name from metadata: ${detectedName}`);
      return detectedName;
    }
  }
  
  // Analyze game characteristics to build a descriptive type
  const characteristics = [];
  
  // Check for board/grid characteristics
  if (/class=["'][^"']*board[^"']*["']/i.test(html) || 
      /id=["'][^"']*board[^"']*["']/i.test(html) ||
      /grid|cell|tile|square/i.test(html)) {
    characteristics.push('board');
    
    // Try to detect grid size
    const gridSizeMatch = html.match(/(\d+)[x×](\d+)/i);
    if (gridSizeMatch) {
      characteristics.push(`${gridSizeMatch[1]}x${gridSizeMatch[2]}`);
    }
  }
  
  // Check for card game elements
  if (/card|deck|suit|spade|heart|diamond|club|ace|king|queen|jack/i.test(html)) {
    characteristics.push('card');
  }
  
  // Check for dice elements
  if (/dice|roll|d\d+|die/i.test(html)) {
    characteristics.push('dice');
  }
  
  // Check for word/text game elements
  if (/word|letter|alphabet|spell|vocabulary/i.test(html)) {
    characteristics.push('word');
  }
  
  // Check for puzzle elements
  if (/puzzle|piece|solve|match|pattern/i.test(html)) {
    characteristics.push('puzzle');
  }
  
  // Check for quiz/trivia elements
  if (/question|answer|quiz|trivia|correct|wrong|score/i.test(html)) {
    characteristics.push('quiz');
  }
  
  // Check for action game elements
  if (/shoot|fire|bullet|enemy|laser|weapon|attack/i.test(html)) {
    characteristics.push('shooter');
  } else if (/jump|platform|gravity|fall|climb/i.test(html)) {
    characteristics.push('platformer');
  } else if (/race|speed|track|lap|finish/i.test(html)) {
    characteristics.push('racing');
  }
  
  // Check for turn-based mechanics
  if (/turn|player\s*[12]|current\s*player|whose\s*turn/i.test(html)) {
    characteristics.push('turn-based');
  }
  
  // Check for real-time mechanics
  if (/requestAnimationFrame|setInterval\s*\([^,]+,\s*\d{1,2}\d?\)/i.test(html)) {
    characteristics.push('realtime');
  }
  
  // Check for canvas usage
  if (/<canvas/i.test(html)) {
    characteristics.push('canvas');
  }
  
  // Check for strategy elements
  if (/strategy|tactic|plan|resource|build|defend/i.test(html)) {
    characteristics.push('strategy');
  }
  
  // Check for RPG elements
  if (/health|hp|mana|mp|level|exp|quest|inventory|skill/i.test(html)) {
    characteristics.push('rpg');
  }
  
  // Build dynamic game type from characteristics
  if (characteristics.length > 0) {
    // Sort characteristics by priority (more specific first)
    const priority = ['shooter', 'platformer', 'racing', 'rpg', 'card', 'dice', 
                     'word', 'quiz', 'puzzle', 'strategy', 'board', 'turn-based', 
                     'realtime', 'canvas'];
    
    characteristics.sort((a, b) => {
      const aIndex = priority.indexOf(a);
      const bIndex = priority.indexOf(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
    
    // Take the most relevant characteristics
    const gameType = characteristics.slice(0, 2).join('-');
    console.log(`Dynamically detected game type: ${gameType} (from characteristics: ${characteristics.join(', ')})`);
    return gameType;
  }
  
  // Final fallback - try to extract from game function names or variables
  const functionMatch = html.match(/function\s+(\w*[Gg]ame\w*)/);
  const classMatch = html.match(/class\s+(\w*[Gg]ame\w*)/);
  const varMatch = html.match(/(?:const|let|var)\s+(\w*[Gg]ame\w*)/);
  
  if (functionMatch || classMatch || varMatch) {
    const gameName = (functionMatch || classMatch || varMatch)[1]
      .replace(/Game/gi, '')
      .toLowerCase();
    if (gameName && gameName.length > 2) {
      console.log(`Detected game type from code structure: ${gameName}`);
      return gameName;
    }
  }
  
  // Ultimate fallback
  console.log('Could not determine specific game type, using generic classification');
  return 'custom-game';
}

/**
 * Deep analysis of game structure for intelligent conversion
 * @param {string} html - The HTML content to analyze
 * @returns {Object} Comprehensive analysis results
 */
function analyzeGameStructure(html) {
  console.log('Performing deep game structure analysis');
  
  const analysis = {
    gameType: detectGameType(html),
    mechanics: {
      hasTurns: false,
      hasBoard: false,
      hasScore: false,
      hasTimer: false,
      hasLevels: false,
      hasLives: false,
      isRealtime: false,
      hasMultipleRounds: false,
      hasWinCondition: false,
      hasPhysics: false
    },
    elements: {
      buttons: [],
      forms: [],
      canvas: false,
      board: {
        exists: false,
        dimensions: null,
        cellCount: 0
      },
      scoreElements: [],
      statusElements: []
    },
    interactions: {
      clickable: [],
      draggable: [],
      keyboard: false,
      touch: false,
      gamepad: false
    },
    stateManagement: {
      hasGlobalState: false,
      stateVariables: [],
      localStorage: false,
      sessionStorage: false
    },
    networking: {
      hasWebSocket: false,
      hasHTTP: false,
      hasWebRTC: false
    },
    complexity: {
      score: 0,
      level: 'simple' // simple, moderate, complex
    }
  };
  
  // Analyze mechanics
  analysis.mechanics.hasTurns = /turn|player\s*\d|current.*player|whose.*turn/i.test(html);
  analysis.mechanics.hasBoard = /board|grid|cell|tile|square/i.test(html);
  analysis.mechanics.hasScore = /score|points|pts/i.test(html);
  analysis.mechanics.hasTimer = /timer|time|countdown|clock/i.test(html);
  analysis.mechanics.hasLevels = /level|stage|round|wave/i.test(html);
  analysis.mechanics.hasLives = /lives|life|health|hp/i.test(html);
  analysis.mechanics.isRealtime = /requestAnimationFrame|setInterval.*\d{1,2}\d/i.test(html);
  analysis.mechanics.hasMultipleRounds = /round|match|game\s*\d/i.test(html);
  analysis.mechanics.hasWinCondition = /win|lose|game.*over|victory|defeat/i.test(html);
  analysis.mechanics.hasPhysics = /velocity|gravity|collision|bounce|friction/i.test(html);
  
  // Analyze elements
  const buttonMatches = html.match(/<button[^>]*>([^<]+)<\/button>/gi) || [];
  analysis.elements.buttons = buttonMatches.map(btn => {
    const text = btn.match(/>([^<]+)</)?.[1] || '';
    const id = btn.match(/id=["']([^"']+)/)?.[1] || '';
    return { text: text.trim(), id };
  });
  
  const formMatches = html.match(/<form[^>]*>/gi) || [];
  analysis.elements.forms = formMatches.length > 0;
  
  analysis.elements.canvas = /<canvas/i.test(html);
  
  // Check for board/grid
  if (analysis.mechanics.hasBoard) {
    const gridMatch = html.match(/grid[^>]*(\d+)[x×](\d+)/i);
    if (gridMatch) {
      analysis.elements.board.exists = true;
      analysis.elements.board.dimensions = `${gridMatch[1]}x${gridMatch[2]}`;
      analysis.elements.board.cellCount = parseInt(gridMatch[1]) * parseInt(gridMatch[2]);
    } else {
      // Try to count cells/tiles
      const cellCount = (html.match(/class=["'][^"']*cell[^"']*["']/gi) || []).length;
      if (cellCount > 0) {
        analysis.elements.board.exists = true;
        analysis.elements.board.cellCount = cellCount;
        // Try to guess dimensions
        if (cellCount === 9) analysis.elements.board.dimensions = '3x3';
        else if (cellCount === 64) analysis.elements.board.dimensions = '8x8';
        else if (cellCount === 16) analysis.elements.board.dimensions = '4x4';
      }
    }
  }
  
  // Analyze interactions
  analysis.interactions.clickable = (html.match(/onclick|addEventListener\(['"]click/gi) || []).length;
  analysis.interactions.draggable = /draggable|ondrag|dragstart|dragend/i.test(html);
  analysis.interactions.keyboard = /keydown|keyup|keypress|addEventListener\(['"]key/i.test(html);
  analysis.interactions.touch = /touchstart|touchend|touchmove|ontouchstart/i.test(html);
  analysis.interactions.gamepad = /gamepad|controller/i.test(html);
  
  // Analyze state management
  analysis.stateManagement.hasGlobalState = /window\.\w+\s*=|var\s+\w+\s*=|let\s+\w+\s*=|const\s+\w+\s*=/i.test(html);
  
  // Extract likely state variable names
  const stateVarMatches = html.match(/(?:var|let|const)\s+(\w+(?:State|Score|Board|Grid|Player|Turn|Game))/gi) || [];
  analysis.stateManagement.stateVariables = stateVarMatches.map(match => {
    return match.replace(/(?:var|let|const)\s+/, '');
  });
  
  analysis.stateManagement.localStorage = /localStorage/i.test(html);
  analysis.stateManagement.sessionStorage = /sessionStorage/i.test(html);
  
  // Check for existing networking
  analysis.networking.hasWebSocket = /websocket|ws:|wss:/i.test(html);
  analysis.networking.hasHTTP = /fetch|xhr|xmlhttprequest|ajax/i.test(html);
  analysis.networking.hasWebRTC = /webrtc|rtcpeerconnection|getusermedia/i.test(html);
  
  // Calculate complexity score
  let complexityScore = 0;
  
  // Add points for mechanics
  Object.values(analysis.mechanics).forEach(value => {
    if (value === true) complexityScore += 2;
  });
  
  // Add points for elements
  complexityScore += analysis.elements.buttons.length;
  if (analysis.elements.canvas) complexityScore += 5;
  if (analysis.elements.board.exists) complexityScore += 3;
  
  // Add points for interactions
  complexityScore += analysis.interactions.clickable;
  if (analysis.interactions.draggable) complexityScore += 3;
  if (analysis.interactions.keyboard) complexityScore += 2;
  if (analysis.interactions.touch) complexityScore += 2;
  
  // Add points for state management
  complexityScore += analysis.stateManagement.stateVariables.length * 2;
  
  // Determine complexity level
  analysis.complexity.score = complexityScore;
  if (complexityScore < 10) {
    analysis.complexity.level = 'simple';
  } else if (complexityScore < 25) {
    analysis.complexity.level = 'moderate';
  } else {
    analysis.complexity.level = 'complex';
  }
  
  console.log('Game structure analysis complete:', analysis);
  return analysis;
}

/**
 * Injects data attributes into HTML for event tracking
 * @param {string} html - The HTML content
 * @param {Object} analysis - Results from analyzeGameElements
 * @returns {string} HTML with injected data attributes
 */
function injectDataAttributes(html, analysis) {
  console.log('Injecting data attributes into HTML');
  
  let modifiedHtml = html;
  
  // Add data-game-action to buttons
  modifiedHtml = modifiedHtml.replace(/<button([^>]*)>/gi, (match, attrs) => {
    if (attrs.includes('data-game-action')) return match;
    
    // Try to determine action from button text or id/class
    let action = 'button';
    if (attrs.match(/id=["']([^"']+)/)) {
      action = attrs.match(/id=["']([^"']+)/)[1];
    } else if (attrs.match(/class=["'][^"']*\b(\w+)/)) {
      action = attrs.match(/class=["'][^"']*\b(\w+)/)[1];
    }
    
    return `<button${attrs} data-game-action="${action}">`;
  });
  
  // Add data-game-state to score/status elements
  analysis.statePatterns.forEach(pattern => {
    const regex = new RegExp(`(<(?:div|span|p)[^>]*(?:id|class)=["'][^"']*${pattern}[^"']*["'][^>]*)>`, 'gi');
    modifiedHtml = modifiedHtml.replace(regex, (match, tag) => {
      if (tag.includes('data-game-state')) return match;
      return `${tag} data-game-state="${pattern}">`;
    });
  });
  
  // Add data-game-action to board cells/tiles
  if (analysis.hasBoard) {
    modifiedHtml = modifiedHtml.replace(/(<(?:div|td)[^>]*(?:class=["'][^"']*(?:cell|tile|square)[^"']*["'])[^>]*)>/gi,
      (match, tag) => {
        if (tag.includes('data-game-action')) return match;
        return `${tag} data-game-action="cell">`;
      });
  }
  
  // Add data-game-touch to touch areas
  if (analysis.hasCanvas) {
    modifiedHtml = modifiedHtml.replace(/(<canvas[^>]*)>/gi, (match, tag) => {
      if (tag.includes('data-game-touch')) return match;
      return `${tag} data-game-touch="canvas">`;
    });
  }
  
  return modifiedHtml;
}

/**
 * Generates server-side validation code for the game
 * @param {Object} analysis - Results from analyzeGameStructure
 * @returns {string} Lambda function code for validation
 */
function generateServerValidator(analysis) {
  console.log('Generating server-side validator for game type:', analysis.gameType);
  
  // Base validator template with game-specific logic
  let validatorCode = `
// Auto-generated server-side validator for ${analysis.gameType} game
// Generated at: ${new Date().toISOString()}
// Complexity: ${analysis.complexity.level}

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
        ${analysis.mechanics.hasBoard ? "board: createEmptyBoard()," : ""}
        ${analysis.mechanics.hasScore ? "scores: {}," : ""}
        ${analysis.mechanics.hasTurns ? "currentTurn: null," : ""}
        ${analysis.mechanics.hasLives ? "lives: {}," : ""}
        ${analysis.mechanics.hasTimer ? "timer: { start: null, elapsed: 0 }," : ""}
        gameType: '${analysis.gameType}'
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
  const maxPlayers = ${analysis.mechanics.hasTurns ? 2 : 8};
  
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
        ${analysis.mechanics.hasScore ? "score: 0," : ""}
        ${analysis.mechanics.hasLives ? "lives: 3," : ""}
        active: true,
        ...data
      }
    }
  };
  
  ${analysis.mechanics.hasTurns ? `
  // Set first player as current turn
  if (!state.currentTurn && Object.keys(updatedState.players).length === 1) {
    updatedState.currentTurn = playerId;
  }` : ""}
  
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
  if (playerCount < ${analysis.mechanics.hasTurns ? 2 : 1}) {
    return { valid: false, reason: 'Not enough players' };
  }
  
  const updatedState = {
    ...state,
    gameActive: true,
    startedAt: Date.now(),
    ${analysis.mechanics.hasTimer ? "timer: { start: Date.now(), elapsed: 0 }," : ""}
    ${analysis.mechanics.hasBoard ? "board: createEmptyBoard()," : ""}
    ${analysis.mechanics.hasTurns ? "currentTurn: Object.keys(state.players)[0]," : ""}
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
  
  ${analysis.mechanics.hasTurns ? `
  // Validate turn
  if (state.currentTurn !== playerId) {
    return { valid: false, reason: 'Not your turn' };
  }` : ""}
  
  ${analysis.mechanics.hasBoard ? `
  // Validate board move
  if (data.position !== undefined) {
    if (!isValidBoardMove(state.board, data.position, playerId)) {
      return { valid: false, reason: 'Invalid board position' };
    }
  }` : ""}
  
  // Apply move
  const updatedState = {
    ...state,
    lastMove: {
      playerId,
      data,
      timestamp: Date.now()
    },
    ${analysis.mechanics.hasBoard ? "board: applyBoardMove(state.board, data.position, playerId)," : ""}
    ${analysis.mechanics.hasTurns ? "currentTurn: getNextPlayer(state.players, playerId)," : ""}
    moveCount: (state.moveCount || 0) + 1
  };
  
  // Check win condition
  ${analysis.mechanics.hasWinCondition ? `
  const winner = checkWinCondition(updatedState);
  if (winner) {
    updatedState.gameActive = false;
    updatedState.winner = winner;
    updatedState.endedAt = Date.now();
  }` : ""}
  
  return {
    valid: true,
    updatedState,
    broadcast: {
      type: 'MOVE_MADE',
      playerId,
      move: data,
      ${analysis.mechanics.hasTurns ? "nextTurn: updatedState.currentTurn," : ""}
      ${analysis.mechanics.hasWinCondition ? "winner: updatedState.winner," : ""}
    }
  };
}

// Handle state updates
function handleUpdate(state, playerId, data) {
  if (!state.players || !state.players[playerId]) {
    return { valid: false, reason: 'Player not in game' };
  }
  
  const updatedState = { ...state };
  
  ${analysis.mechanics.hasScore ? `
  // Handle score update
  if (data.score !== undefined) {
    updatedState.players = {
      ...updatedState.players,
      [playerId]: {
        ...updatedState.players[playerId],
        score: Math.max(0, data.score)
      }
    };
  }` : ""}
  
  ${analysis.mechanics.hasLives ? `
  // Handle lives update
  if (data.lives !== undefined) {
    updatedState.players = {
      ...updatedState.players,
      [playerId]: {
        ...updatedState.players[playerId],
        lives: Math.max(0, data.lives)
      }
    };
    
    // Check if player is out
    if (updatedState.players[playerId].lives <= 0) {
      updatedState.players[playerId].eliminated = true;
    }
  }` : ""}
  
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

${analysis.mechanics.hasBoard ? `
function createEmptyBoard() {
  // Create appropriate board based on game type
  ${analysis.elements.board.dimensions === '3x3' ? 
    "return Array(3).fill(null).map(() => Array(3).fill(null));" :
    analysis.elements.board.dimensions === '8x8' ?
    "return Array(8).fill(null).map(() => Array(8).fill(null));" :
    "return {}; // Dynamic board"
  }
}

function isValidBoardMove(board, position, playerId) {
  // Implement board validation logic
  if (!board || !position) return false;
  
  ${analysis.elements.board.dimensions ? `
  const [row, col] = position.split(',').map(Number);
  if (!board[row] || board[row][col] === undefined) return false;
  return board[row][col] === null;` : `
  return board[position] === null || board[position] === undefined;`
  }
}

function applyBoardMove(board, position, playerId) {
  const newBoard = JSON.parse(JSON.stringify(board));
  ${analysis.elements.board.dimensions ? `
  const [row, col] = position.split(',').map(Number);
  newBoard[row][col] = playerId;` : `
  newBoard[position] = playerId;`
  }
  return newBoard;
}` : ""}

${analysis.mechanics.hasWinCondition ? `
function checkWinCondition(state) {
  // Implement win condition checking
  ${analysis.gameType === 'tictactoe' ? `
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
  return isDraw ? 'draw' : null;` : `
  // Generic win condition - implement based on game rules
  return null;`
  }
}` : ""}
`;
  
  console.log('Generated validator code length:', validatorCode.length);
  return validatorCode;
}

/**
 * Builds an intelligent conversion prompt based on game analysis
 * @param {string} html - The original HTML
 * @param {Object} analysis - Results from analyzeGameStructure
 * @returns {string} The conversion prompt
 */
function buildConversionPrompt(html, analysis) {
  console.log('Building intelligent conversion prompt based on analysis');
  
  let prompt = `Convert this ${analysis.gameType} game to multiplayer with the following specific requirements:\n\n`;
  
  // Add game-specific requirements based on analysis
  if (analysis.mechanics.hasTurns) {
    prompt += `TURN MANAGEMENT:
- Implement strict turn-based controls where only the current player can make moves
- Add visual indicators showing whose turn it is
- Prevent any actions from non-active players
- Add turn timer with automatic switch if player is inactive\n\n`;
  }
  
  if (analysis.mechanics.hasBoard) {
    prompt += `BOARD SYNCHRONIZATION:
- Ensure board state is synchronized across all players in real-time
- Add move validation to prevent illegal moves
- Highlight the last move made by opponents
- Board dimensions: ${analysis.elements.board.dimensions || 'dynamic'}\n\n`;
  }
  
  if (analysis.mechanics.hasScore) {
    prompt += `SCORE TRACKING:
- Track individual player scores separately
- Display a leaderboard showing all players' scores
- Ensure score updates are validated server-side
- Add score animations for better feedback\n\n`;
  }
  
  if (analysis.mechanics.isRealtime) {
    prompt += `REAL-TIME SYNCHRONIZATION:
- Implement frame-rate independent game logic
- Use interpolation for smooth opponent movement
- Add lag compensation for better responsiveness
- Implement state reconciliation for consistency\n\n`;
  }
  
  if (analysis.complexity.level === 'complex') {
    prompt += `ADVANCED FEATURES:
- Implement spectator mode for additional players
- Add replay functionality for reviewing games
- Include chat system for player communication
- Add matchmaking based on skill level\n\n`;
  }
  
  // Add universal requirements
  prompt += `CORE MULTIPLAYER REQUIREMENTS:
1. Parent Frame Communication:
   - Use postMessage to communicate with parent window
   - Send game events to parent via GameEventBridge
   - Listen for state updates from parent frame
   - NO WebSockets or direct server connections

2. Player Management:
   - Support 2-8 players based on game type
   - Generate unique player IDs
   - Show player list with online/offline status
   - Handle player joining/leaving mid-game

3. State Synchronization:
   - Receive state updates from parent window (polling-based)
   - Apply state updates to game UI immediately
   - Send action events to parent for server processing
   - No direct API calls - parent handles all server communication
   - Implement message handler: window.addEventListener('message', handleParentMessage)
   - Update game state when receiving 'STATE_UPDATE' messages
   - Sync player list, turn indicators, and game board from server state

4. Data Attributes (PRESERVE EXISTING):
   - Keep all existing data-game-action attributes
   - Keep all existing data-game-state attributes
   - Add new ones where needed for multiplayer features
   - Ensure all interactive elements have proper attributes

5. Event System:
   - Emit TRANSITION events for game state changes
   - Emit INTERACTION events for player actions
   - Emit UPDATE events for state updates
   - Emit ERROR events for validation failures

6. Visual Feedback:
   - Player-specific colors or avatars
   - Action animations for better UX
   - Loading states during server communication
   - Error messages for failed actions

7. Game Flow:
   - Display game ID prominently for sharing
   - Show connection status (connected/disconnected from parent)
   - Handle game start when enough players join
   - Show waiting for players message

ARCHITECTURE NOTES:
- This game will be loaded in an iframe inside a parent multiplayer application
- The parent handles ALL API calls to the game server
- Use GameEventBridge (automatically available) to send events: gameEvents.emit('INTERACTION', {...})
- Listen for parent messages: window.addEventListener('message', handleParentMessage)

GAME ID SHARING (REQUIRED):
- Add a prominent "Game ID" display at the top: <div id="game-id-display">Game ID: <span id="game-id-value">Loading...</span> <button onclick="copyGameId()">Copy</button></div>
- Get game ID from window.GAME_CONFIG.gameId when available
- Add copy-to-clipboard functionality for easy sharing
- Show "Share this Game ID with other players to join" message
- Include JavaScript functions: updateGameId() to get ID from window.GAME_CONFIG.gameId, copyGameId() for clipboard copy, and call updateGameId() every second

JOIN GAME UI (REQUIRED):
- Add a "Join Game" section: <div id="join-game-section"><input type="text" id="join-game-input" placeholder="Enter Game ID to join..." /><button onclick="joinGame()">Join Game</button></div>
- Add joinGame() function that calls parent.postMessage({source: 'GameEventBridge', action: 'JOIN_GAME', gameId: document.getElementById('join-game-input').value}, '*')
- Hide join section when game starts, show game ID section instead
- Style join UI to be prominent and easy to use

STATE UPDATE HANDLER (REQUIRED):
- Add message listener: window.addEventListener('message', handleParentMessage)
- Check if event.data.target === 'GameEventBridge' and event.data.type === 'STATE_UPDATE'
- Apply incoming state to game board, turn indicators, player list, and scores
- Update UI elements to reflect current server state
- Handle player join/leave by updating player displays

ORIGINAL HTML:
${html}

Return ONLY the complete modified HTML file with all JavaScript and CSS inline. Ensure the game is fully functional and playable in multiplayer mode with the parent-iframe architecture described above.`;
  
  return prompt;
}

/**
 * Injects the multiplayer library and configuration into HTML
 * @param {string} html - The HTML content
 * @param {string} gameId - The game ID
 * @returns {string} HTML with multiplayer library injected
 */
function injectMultiplayerLibrary(html, gameId) {
  console.log('Injecting multiplayer library into HTML');
  
  const libraryUrl = process.env.CF_DOMAIN
    ? `https://${process.env.CF_DOMAIN}/multiplayer-lib.js`
    : '/multiplayer-lib.js';
  
  // Create the script tags to inject
  const multiplayerScripts = `
    <!-- Multiplayer Event Bridge Library -->
    <script src="${libraryUrl}"></script>
    <script>
      // Game configuration for multiplayer
      window.GAME_CONFIG = {
        gameId: '${gameId}',
        playerId: 'player-' + Math.random().toString(36).substring(2, 11),
        sessionId: 'session-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11),
        batchEvents: true,
        batchInterval: 100,
        autoIntercept: true
      };
      
      // Enable debug mode in development
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        window.DEBUG_MULTIPLAYER = true;
      }
      
      // Initialize the GameEventBridge when DOM is ready
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
          if (!window.gameEvents && window.GameEventBridge) {
            window.gameEvents = new GameEventBridge(window.GAME_CONFIG);
            console.log('GameEventBridge initialized:', window.gameEvents);
          }
        });
      } else {
        // DOM already loaded
        if (!window.gameEvents && window.GameEventBridge) {
          window.gameEvents = new GameEventBridge(window.GAME_CONFIG);
          console.log('GameEventBridge initialized:', window.gameEvents);
        }
      }
    </script>
  `;
  
  // Try to inject before closing </head> tag
  if (html.includes('</head>')) {
    return html.replace('</head>', multiplayerScripts + '\n</head>');
  }
  // Otherwise inject before closing </body> tag
  else if (html.includes('</body>')) {
    return html.replace('</body>', multiplayerScripts + '\n</body>');
  }
  // As last resort, append to the end
  else {
    return html + multiplayerScripts;
  }
}

/**
 * Deploys server validation code as a Lambda function
 * @param {string} gameId - Unique game identifier
 * @param {string} serverCode - Lambda function code
 * @returns {string} ARN of deployed Lambda function
 */
async function deployServerCode(gameId, serverCode) {
  console.log('Deploying server validation Lambda for game:', gameId);
  
  try {
    const functionName = `game-validator-${gameId}-${Date.now()}`;
    
    // Create a proper zip file with index.js
    const AdmZip = require('adm-zip');
    const zip = new AdmZip();
    
    // Add the validator code as index.js
    zip.addFile('index.js', Buffer.from(serverCode, 'utf8'));
    
    // Get the zip buffer
    const zipBuffer = zip.toBuffer();
    
    // Create Lambda function
    const createFunctionParams = {
      FunctionName: functionName,
      Runtime: 'nodejs20.x',
      Role: process.env.LAMBDA_ROLE_ARN || 'arn:aws:iam::YOUR_ACCOUNT:role/lambda-execution-role',
      Handler: 'index.handler',
      Code: {
        ZipFile: zipBuffer
      },
      Description: `Game validator for ${gameId}`,
      Timeout: 10,
      MemorySize: 256,
      Environment: {
        Variables: {
          GAME_ID: gameId,
          REGION: process.env.AWS_REGION || 'us-east-2'
        }
      },
      Tags: {
        GameId: gameId,
        Type: 'game-validator',
        CreatedBy: 'ai-convert'
      }
    };
    
    console.log('Creating Lambda function:', functionName);
    
    try {
      const createResponse = await lambdaClient.send(new CreateFunctionCommand(createFunctionParams));
      console.log('Lambda function created successfully:', createResponse.FunctionArn);
      return createResponse.FunctionArn;
    } catch (error) {
      if (error.name === 'InvalidParameterValueException' && error.message.includes('role')) {
        console.warn('Lambda deployment failed due to IAM role. Using mock ARN for development.');
        // Return a mock ARN for development/testing
        return `arn:aws:lambda:${process.env.AWS_REGION || 'us-east-2'}:ACCOUNT:function:${functionName}`;
      } else if (error.name === 'ResourceConflictException') {
        console.warn('Lambda function already exists, returning existing ARN');
        // Try to get the existing function
        try {
          const getResponse = await lambdaClient.send(new GetFunctionCommand({ FunctionName: functionName }));
          return getResponse.Configuration.FunctionArn;
        } catch (getError) {
          console.error('Could not retrieve existing function:', getError);
          throw getError;
        }
      }
      throw error;
    }
    
  } catch (error) {
    console.error('Error deploying Lambda function:', error);
    // For now, return a placeholder ARN to allow the system to continue
    console.warn('Using placeholder Lambda ARN due to deployment error');
    return `arn:aws:lambda:${process.env.AWS_REGION || 'us-east-2'}:placeholder:function:game-validator-${gameId}`;
  }
}

async function handleConvertToMultiplayer(event, context) {
  const { gameId, gameHtml } = event.arguments || event;
  
  console.log('Starting async conversion for game:', gameId);
  
  try {
    // Step 1: Create initial Game record with PENDING status
    const now = new Date().toISOString();
    const gameRecord = {
      gameId: gameId,
      gameType: 'multiplayer-conversion',
      gameHtml: gameHtml,
      gameState: JSON.stringify({
        initialized: false,
        conversionInProgress: true
      }),
      players: JSON.stringify({}),
      metadata: JSON.stringify({
        originalHtmlLength: gameHtml.length,
        conversionStartedAt: now,
        conversionStatus: 'PENDING'
      }),
      serverLogicUrl: '',
      conversionStatus: 'PENDING',
      createdAt: now,
      updatedAt: now
    };
    
    // Store initial record in DynamoDB if we have table name
    if (process.env.GAME_TABLE_NAME) {
      console.log('Storing initial game record in DynamoDB');
      const putCommand = new PutItemCommand({
        TableName: process.env.GAME_TABLE_NAME,
        Item: {
          gameId: { S: gameId },
          gameType: { S: gameRecord.gameType },
          gameHtml: { S: gameRecord.gameHtml },
          gameState: { S: gameRecord.gameState },
          players: { S: gameRecord.players },
          metadata: { S: gameRecord.metadata },
          serverLogicUrl: { S: gameRecord.serverLogicUrl },
          conversionStatus: { S: gameRecord.conversionStatus },
          createdAt: { S: gameRecord.createdAt },
          updatedAt: { S: gameRecord.updatedAt }
        }
      });
      
      await dynamoClient.send(putCommand);
      console.log('Initial game record stored successfully');
    }
    
    // Step 2: Trigger async processing via Lambda self-invocation
    console.log('Triggering async conversion processing');
    const asyncPayload = {
      isAsyncProcessing: true,
      gameId: gameId,
      gameHtml: gameHtml,
      tableName: process.env.GAME_TABLE_NAME
    };
    
    // Use context to get the current function name
    const functionName = context?.functionName || process.env.AWS_LAMBDA_FUNCTION_NAME;
    
    const invokeCommand = new InvokeCommand({
      FunctionName: functionName,
      InvocationType: 'Event', // Async invocation
      Payload: JSON.stringify(asyncPayload)
    });
    
    try {
      await lambdaClient.send(invokeCommand);
      console.log('Async processing triggered successfully');
    } catch (invokeError) {
      console.error('Failed to trigger async processing:', invokeError);
      // Continue anyway - the record is created
    }
    
    // Step 3: Return immediately with the Game record
    console.log('Returning PENDING game record to client');
    return gameRecord;
    
  } catch (error) {
    console.error('Error in handleConvertToMultiplayer:', error);
    
    // Return error status game record
    const errorRecord = {
      gameId: gameId,
      gameType: 'multiplayer-conversion',
      gameHtml: gameHtml || '',
      gameState: JSON.stringify({ error: error.message }),
      players: JSON.stringify({}),
      metadata: JSON.stringify({
        error: error.message,
        conversionStatus: 'FAILED'
      }),
      serverLogicUrl: '',
      conversionStatus: 'FAILED',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    return errorRecord;
  }
}

async function handleAsyncConversion(event) {
  const { gameId, gameHtml, tableName } = event;
  
  console.log('Processing async conversion for game:', gameId);
  
  try {
    // Update status to PROCESSING
    if (tableName) {
      await updateConversionStatus(tableName, gameId, 'PROCESSING', {
        processingStartedAt: new Date().toISOString()
      });
    }
    
    // Step 1: Deep analysis of game structure
    const structureAnalysis = analyzeGameStructure(gameHtml);
    console.log('Game type detected:', structureAnalysis.gameType);
    console.log('Complexity level:', structureAnalysis.complexity.level);
    
    // Step 2: Analyze game elements
    const elementAnalysis = analyzeGameElements(gameHtml);
    console.log('Elements detected for tracking:', {
      buttons: elementAnalysis.buttonPatterns.length,
      states: elementAnalysis.statePatterns.length,
      interactions: elementAnalysis.interactionPatterns.length
    });
    
    // Step 3: Add data attributes
    let enhancedHtml = injectDataAttributes(gameHtml, elementAnalysis);
    
    // Step 4: Build conversion prompt
    const conversionPrompt = buildConversionPrompt(enhancedHtml, structureAnalysis);
    
    // Step 5: Convert to multiplayer using AI
    console.log('Calling AI for multiplayer conversion...');
    const multiplayerHtml = await callOpenAI(conversionPrompt, true); // Pass true for async mode
    
    // Step 6: Generate server-side validator
    console.log('Generating server-side validation code...');
    const serverCode = generateServerValidator(structureAnalysis);
    
    // Step 7: Deploy server validation Lambda
    console.log('Deploying server validation Lambda...');
    const serverArn = await deployServerCode(gameId, serverCode);
    
    // Step 8: Inject multiplayer library
    const finalHtml = injectMultiplayerLibrary(multiplayerHtml, gameId);
    
    // Step 9: Store to S3
    const s3Key = `games/${gameId}/index.html`;
    const putCommand = new PutObjectCommand({
      Bucket: process.env.WEBSITE_BUCKET,
      Key: s3Key,
      Body: finalHtml,
      ContentType: 'text/html',
      Metadata: {
        'game-type': structureAnalysis.gameType,
        'complexity': structureAnalysis.complexity.level,
        'converted-at': new Date().toISOString(),
        'has-server-validator': 'true',
        'server-arn': serverArn
      }
    });
    
    await s3Client.send(putCommand);
    console.log('Multiplayer game uploaded to S3:', s3Key);
    
    // Step 10: Store validator code as backup
    const validatorKey = `games/${gameId}/validator.js`;
    const validatorCommand = new PutObjectCommand({
      Bucket: process.env.WEBSITE_BUCKET,
      Key: validatorKey,
      Body: serverCode,
      ContentType: 'application/javascript',
      Metadata: {
        'game-id': gameId,
        'function-arn': serverArn
      }
    });
    
    await s3Client.send(validatorCommand);
    console.log('Server validator code backed up to S3:', validatorKey);
    
    // Step 11: Update final status to COMPLETE
    const gameUrl = `https://${process.env.CF_DOMAIN}/${s3Key}`;
    
    if (tableName) {
      await updateConversionStatus(tableName, gameId, 'COMPLETE', {
        gameUrl: gameUrl,
        serverEndpoint: serverArn,
        gameType: structureAnalysis.gameType,
        complexity: structureAnalysis.complexity.level,
        completedAt: new Date().toISOString()
      });
    }
    
    console.log('Async conversion completed successfully');
    return {
      success: true,
      gameId: gameId,
      gameUrl: gameUrl
    };
    
  } catch (error) {
    console.error('Error in async conversion:', error);
    
    // Update status to FAILED
    if (tableName) {
      await updateConversionStatus(tableName, gameId, 'FAILED', {
        error: error.message,
        failedAt: new Date().toISOString()
      });
    }
    
    throw error;
  }
}

async function updateConversionStatus(tableName, gameId, status, additionalMetadata = {}) {
  console.log(`Updating conversion status for ${gameId} to ${status}`);
  
  try {
    // First get the current record to preserve existing metadata
    const getCommand = new GetItemCommand({
      TableName: tableName,
      Key: {
        gameId: { S: gameId }
      }
    });
    
    const getResult = await dynamoClient.send(getCommand);
    const currentMetadata = getResult.Item?.metadata?.S ? JSON.parse(getResult.Item.metadata.S) : {};
    
    // Merge metadata
    const updatedMetadata = {
      ...currentMetadata,
      ...additionalMetadata,
      conversionStatus: status,
      lastUpdated: new Date().toISOString()
    };
    
    // Update the record
    const updateCommand = new UpdateItemCommand({
      TableName: tableName,
      Key: {
        gameId: { S: gameId }
      },
      UpdateExpression: 'SET conversionStatus = :status, metadata = :metadata, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':status': { S: status },
        ':metadata': { S: JSON.stringify(updatedMetadata) },
        ':updatedAt': { S: new Date().toISOString() }
      }
    });
    
    await dynamoClient.send(updateCommand);
    console.log(`Status updated to ${status} for game ${gameId}`);
  } catch (error) {
    console.error(`Failed to update status for ${gameId}:`, error);
    // Don't throw - this is a best-effort update
  }
}

async function handleGenerateGame(event) {
  const { gameType, requirements } = event.arguments || event;
  const gameId = `game-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  
  console.log('Generating game:', { gameId, gameType, requirements });
  
  // Build a comprehensive prompt for game generation with data attributes
  const prompt = `Create a complete, playable HTML5 ${gameType} game with the following specifications:

Game Type: ${gameType}
Requirements: ${JSON.stringify(requirements, null, 2)}

The game MUST include:
1. Complete HTML structure with embedded CSS and JavaScript
2. Clear game title and instructions
3. Interactive gameplay elements with data-game-action attributes
4. Visual feedback for player actions
5. Score or progress tracking elements with data-game-state attributes
6. Win/lose conditions
7. Restart functionality
8. Mobile-responsive design
9. Smooth animations and transitions
10. Data attributes for event tracking:
    - data-game-action="[action_name]" on ALL interactive elements (buttons, clickable cells, etc.)
    - data-game-state="[state_name]" on ALL state display elements (score, level, turn indicator, etc.)
    - data-game-touch="[area_name]" on touch-sensitive areas
    - data-game-form="[form_name]" on any forms
    - data-game-input="[input_name]" on input fields

IMPORTANT: Every button must have data-game-action, every score/status display must have data-game-state.

For turn-based games, include:
- Clear turn indicators with data-game-state="turn"
- Player identification system
- Turn validation logic

Technical requirements:
- All code must be in a single HTML file
- Use modern JavaScript (ES6+)
- Include CSS animations for better UX
- Add comments explaining game logic
- Emit custom events for game state changes
- Structure the game to be easily convertible to multiplayer

Example button: <button data-game-action="start">Start Game</button>
Example score: <div data-game-state="score">Score: <span>0</span></div>
Example cell: <div class="cell" data-game-action="cell" data-position="0,0"></div>

Return ONLY the complete HTML code without any markdown formatting or explanations.`;

  try {
    console.log('Calling OpenAI for game generation...');
    const generatedHtml = await callOpenAI(prompt);
    console.log('Generated HTML length:', generatedHtml.length);
    
    // Validate the generated HTML
    if (!generatedHtml || generatedHtml.length < 100) {
      throw new Error('Generated HTML is too short or empty');
    }
    
    if (!generatedHtml.includes('<html') || !generatedHtml.includes('</html>')) {
      throw new Error('Generated content is not valid HTML');
    }
    
    // Analyze and enhance the generated HTML with data attributes if needed
    const analysis = analyzeGameElements(generatedHtml);
    let enhancedHtml = generatedHtml;
    
    // Only inject data attributes if they're missing
    if (!generatedHtml.includes('data-game-')) {
      console.log('Generated HTML missing data attributes, injecting them');
      enhancedHtml = injectDataAttributes(generatedHtml, analysis);
    }
    
    // Inject the multiplayer library
    const finalHtml = injectMultiplayerLibrary(enhancedHtml, gameId);
    
    // Upload to S3
    const s3Key = `games/${gameId}/index.html`;
    console.log('Uploading to S3:', s3Key);
    
    const putCommand = new PutObjectCommand({
      Bucket: process.env.WEBSITE_BUCKET,
      Key: s3Key,
      Body: finalHtml,
      ContentType: 'text/html',
      Metadata: {
        'game-type': gameType,
        'generated-at': new Date().toISOString(),
        'has-multiplayer-lib': 'true'
      }
    });
    
    await s3Client.send(putCommand);
    console.log('Successfully uploaded to S3 with multiplayer library');
    
    // Return Game object matching GraphQL schema
    const gameData = {
      gameId: gameId,
      gameType: gameType,
      gameHtml: finalHtml,
      gameState: JSON.stringify(requirements.initialState || {
        initialized: true,
        players: {},
        turnCount: 0,
        multiplayerReady: true
      }),
      players: JSON.stringify({}),
      metadata: JSON.stringify({
        ...requirements,
        generatedAt: new Date().toISOString(),
        version: '1.0.0',
        hasMultiplayerLib: true,
        hasDataAttributes: true
      }),
      serverLogicUrl: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    console.log('Returning game data with multiplayer capabilities');
    return gameData;
    
  } catch (error) {
    console.error('Error generating game:', error);
    throw new Error(`Failed to generate game: ${error.message}`);
  }
}

// Export functions for testing
exports.analyzeGameStructure = analyzeGameStructure;
exports.analyzeGameElements = analyzeGameElements;
exports.detectGameType = detectGameType;
exports.injectDataAttributes = injectDataAttributes;
exports.generateServerValidator = generateServerValidator;
exports.buildConversionPrompt = buildConversionPrompt;
exports.injectMultiplayerLibrary = injectMultiplayerLibrary;
exports.deployServerCode = deployServerCode;

async function callOpenAI(prompt, isAsync = false) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  
  // Use longer timeout for async processing, shorter for synchronous
  const timeoutSeconds = isAsync ? 120 : 25; // 2 minutes for async, 25s for sync
  
  // Initialize OpenAI client with appropriate timeout
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: timeoutSeconds * 1000,
    maxRetries: isAsync ? 2 : 1  // More retries for async mode
  });

  try {
    console.log(`Making OpenAI API request (${timeoutSeconds}s timeout${isAsync ? ' in async mode' : ' for AppSync'})...`);
    const startTime = Date.now();
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert game developer who creates complete, playable HTML5 games. You write clean, well-commented code that follows best practices. Always return ONLY the HTML code without any markdown formatting. Keep the code concise.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: isAsync ? 12000 : 8000  // More tokens for async mode
    });
    
    const elapsed = Date.now() - startTime;
    console.log(`OpenAI API call completed in ${elapsed}ms`);

    if (!response.choices || !response.choices[0] || !response.choices[0].message) {
      console.error('Invalid OpenAI response structure:', response);
      throw new Error('Invalid response from OpenAI - no content returned');
    }

    const content = response.choices[0].message.content;
    console.log('OpenAI response received, content length:', content.length);
    
    // Clean up the response - remove any markdown code blocks if present
    let cleanedContent = content;
    if (content.includes('```html')) {
      cleanedContent = content.replace(/```html\n?/g, '').replace(/```\n?/g, '');
    } else if (content.includes('```')) {
      cleanedContent = content.replace(/```\n?/g, '');
    }
    
    return cleanedContent.trim();
  } catch (error) {
    console.error('OpenAI API error:', error);
    
    // Check for timeout error
    if (error.message?.includes('timeout') || error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
      console.error('OpenAI request timed out after 25 seconds');
      throw new Error('OpenAI request timed out. Please try again with simpler requirements or a smaller game.');
    }
    
    if (error.response) {
      console.error('Error response:', error.response.data);
      throw new Error(`OpenAI API error: ${error.response.data?.error?.message || error.message}`);
    } else if (error.request) {
      console.error('Request error:', error.request);
      throw new Error(`Network error calling OpenAI: ${error.message}`);
    } else {
      throw new Error(`OpenAI error: ${error.message}`);
    }
  }
}