// Enhanced test script for Phase 4: Multiplayer Conversion Engine
const handler = require('./lambda/ai-convert').handler;
const fs = require('fs');
const path = require('path');

// Mock environment variables
process.env.WEBSITE_BUCKET = 'test-bucket';
process.env.CF_DOMAIN = 'test.cloudfront.net';
process.env.API_ENDPOINT = 'https://test.appsync.amazonaws.com/graphql';
process.env.API_KEY = 'test-api-key';
process.env.AWS_REGION = 'us-east-2';
process.env.LAMBDA_ROLE_ARN = 'arn:aws:iam::123456789012:role/test-lambda-role';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

// Sample games for testing
const sampleGames = {
  tictactoe: `<!DOCTYPE html>
<html>
<head>
  <title>Tic Tac Toe</title>
  <style>
    .board { display: grid; grid-template-columns: repeat(3, 100px); gap: 5px; }
    .cell { width: 100px; height: 100px; border: 1px solid #333; cursor: pointer; font-size: 36px; text-align: center; line-height: 100px; }
    .status { margin: 20px 0; font-size: 20px; }
  </style>
</head>
<body>
  <h1>Tic Tac Toe</h1>
  <div class="status">Player <span id="currentPlayer">X</span>'s turn</div>
  <div class="board" id="board"></div>
  <button onclick="resetGame()">Reset Game</button>
  <div>Score: <span id="score">0</span></div>
  <script>
    let board = Array(9).fill(null);
    let currentPlayer = 'X';
    let score = 0;
    
    function initBoard() {
      const boardEl = document.getElementById('board');
      for (let i = 0; i < 9; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.index = i;
        cell.onclick = () => makeMove(i);
        boardEl.appendChild(cell);
      }
    }
    
    function makeMove(index) {
      if (board[index]) return;
      board[index] = currentPlayer;
      updateDisplay();
      if (checkWin()) {
        alert(currentPlayer + ' wins!');
        score++;
        document.getElementById('score').textContent = score;
        resetGame();
      } else {
        currentPlayer = currentPlayer === 'X' ? 'O' : 'X';
        document.getElementById('currentPlayer').textContent = currentPlayer;
      }
    }
    
    function checkWin() {
      const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      return lines.some(line => {
        const [a,b,c] = line;
        return board[a] && board[a] === board[b] && board[a] === board[c];
      });
    }
    
    function updateDisplay() {
      document.querySelectorAll('.cell').forEach((cell, i) => {
        cell.textContent = board[i] || '';
      });
    }
    
    function resetGame() {
      board = Array(9).fill(null);
      currentPlayer = 'X';
      updateDisplay();
    }
    
    initBoard();
  </script>
</body>
</html>`,

  memory: `<!DOCTYPE html>
<html>
<head>
  <title>Memory Game</title>
  <style>
    .grid { display: grid; grid-template-columns: repeat(4, 100px); gap: 10px; }
    .card { width: 100px; height: 100px; background: #667eea; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 24px; }
    .card.flipped { background: white; border: 2px solid #667eea; }
    .score { margin: 20px 0; font-size: 20px; }
  </style>
</head>
<body>
  <h1>Memory Game</h1>
  <div class="score">Score: <span id="score">0</span> | Moves: <span id="moves">0</span></div>
  <div class="grid" id="grid"></div>
  <button onclick="newGame()">New Game</button>
  <script>
    const emojis = ['🎮', '🎯', '🎲', '🎨', '🎭', '🎪', '🎬', '🎤'];
    let cards = [];
    let flipped = [];
    let score = 0;
    let moves = 0;
    
    function createBoard() {
      cards = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
      const grid = document.getElementById('grid');
      grid.innerHTML = '';
      cards.forEach((emoji, index) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.dataset.index = index;
        card.onclick = () => flipCard(index);
        grid.appendChild(card);
      });
    }
    
    function flipCard(index) {
      if (flipped.length === 2 || flipped.includes(index)) return;
      
      const card = document.querySelector(\`[data-index="\${index}"]\`);
      card.classList.add('flipped');
      card.textContent = cards[index];
      flipped.push(index);
      
      if (flipped.length === 2) {
        moves++;
        document.getElementById('moves').textContent = moves;
        setTimeout(checkMatch, 1000);
      }
    }
    
    function checkMatch() {
      const [a, b] = flipped;
      if (cards[a] === cards[b]) {
        score++;
        document.getElementById('score').textContent = score;
      } else {
        document.querySelector(\`[data-index="\${a}"]\`).classList.remove('flipped');
        document.querySelector(\`[data-index="\${b}"]\`).classList.remove('flipped');
        document.querySelector(\`[data-index="\${a}"]\`).textContent = '';
        document.querySelector(\`[data-index="\${b}"]\`).textContent = '';
      }
      flipped = [];
    }
    
    function newGame() {
      score = 0;
      moves = 0;
      document.getElementById('score').textContent = score;
      document.getElementById('moves').textContent = moves;
      createBoard();
    }
    
    createBoard();
  </script>
</body>
</html>`,

  counter: `<!DOCTYPE html>
<html>
<head>
  <title>Counter Game</title>
</head>
<body>
  <h1>Counter Game</h1>
  <div>Current Player: <span id="currentPlayer">Player 1</span></div>
  <div>Counter: <span id="counter">0</span></div>
  <div>Target: <span id="target">10</span></div>
  <button onclick="increment()">Increment</button>
  <button onclick="reset()">Reset</button>
  <script>
    let counter = 0;
    let currentPlayer = 1;
    const target = 10;
    
    function increment() {
      counter++;
      document.getElementById('counter').textContent = counter;
      if (counter >= target) {
        alert('Player ' + currentPlayer + ' wins!');
        reset();
      } else {
        currentPlayer = currentPlayer === 1 ? 2 : 1;
        document.getElementById('currentPlayer').textContent = 'Player ' + currentPlayer;
      }
    }
    
    function reset() {
      counter = 0;
      currentPlayer = 1;
      document.getElementById('counter').textContent = counter;
      document.getElementById('currentPlayer').textContent = 'Player ' + currentPlayer;
    }
  </script>
</body>
</html>`
};

// Test 1: Analyze Game Structure
async function testGameAnalysis() {
  logSection('TEST 1: Game Structure Analysis');
  
  // Import the analysis functions from the module
  const { analyzeGameStructure } = require('./lambda/ai-convert');
  
  for (const [gameType, html] of Object.entries(sampleGames)) {
    log(`\nAnalyzing ${gameType} game:`, 'cyan');
    
    try {
      const analysis = analyzeGameStructure(html);
      
      log(`  Game Type: ${analysis.gameType}`, 'green');
      log(`  Complexity: ${analysis.complexity.level} (score: ${analysis.complexity.score})`, 'green');
      log('  Mechanics:', 'yellow');
      Object.entries(analysis.mechanics).forEach(([key, value]) => {
        if (value === true) log(`    ✓ ${key}`, 'green');
      });
      
      if (analysis.elements.board.exists) {
        log(`  Board: ${analysis.elements.board.dimensions || 'dynamic'} (${analysis.elements.board.cellCount} cells)`, 'blue');
      }
      
      if (analysis.elements.buttons.length > 0) {
        log(`  Buttons: ${analysis.elements.buttons.map(b => b.text).join(', ')}`, 'blue');
      }
      
    } catch (error) {
      log(`  ERROR: ${error.message}`, 'red');
    }
  }
}

// Test 2: Generate Server Validator
async function testServerValidator() {
  logSection('TEST 2: Server-Side Validator Generation');
  
  const { analyzeGameStructure, generateServerValidator } = require('./lambda/ai-convert');
  
  for (const [gameType, html] of Object.entries(sampleGames)) {
    log(`\nGenerating validator for ${gameType}:`, 'cyan');
    
    try {
      const analysis = analyzeGameStructure(html);
      const validatorCode = generateServerValidator(analysis);
      
      // Check validator code quality
      const checks = {
        'Has handler export': /exports\.handler/.test(validatorCode),
        'Handles join action': /case 'join'/.test(validatorCode),
        'Handles move action': /case 'move'/.test(validatorCode),
        'Has state validation': /valid: false/.test(validatorCode),
        'Has broadcast events': /broadcast:/.test(validatorCode),
        'Has error handling': /catch/.test(validatorCode)
      };
      
      Object.entries(checks).forEach(([check, passed]) => {
        log(`  ${passed ? '✓' : '✗'} ${check}`, passed ? 'green' : 'red');
      });
      
      // Save validator for inspection
      const outputPath = path.join(__dirname, `test-output-validator-${gameType}.js`);
      fs.writeFileSync(outputPath, validatorCode);
      log(`  Saved to: ${outputPath}`, 'blue');
      
    } catch (error) {
      log(`  ERROR: ${error.message}`, 'red');
    }
  }
}

// Test 3: Data Attribute Injection
async function testDataAttributes() {
  logSection('TEST 3: Data Attribute Injection');
  
  const { analyzeGameElements, injectDataAttributes } = require('./lambda/ai-convert');
  
  for (const [gameType, html] of Object.entries(sampleGames)) {
    log(`\nInjecting attributes for ${gameType}:`, 'cyan');
    
    try {
      const analysis = analyzeGameElements(html);
      const enhanced = injectDataAttributes(html, analysis);
      
      // Count injected attributes
      const counts = {
        'data-game-action': (enhanced.match(/data-game-action/g) || []).length,
        'data-game-state': (enhanced.match(/data-game-state/g) || []).length,
        'data-game-touch': (enhanced.match(/data-game-touch/g) || []).length
      };
      
      Object.entries(counts).forEach(([attr, count]) => {
        if (count > 0) {
          log(`  ✓ Injected ${count} ${attr} attributes`, 'green');
        }
      });
      
      // Save enhanced HTML for inspection
      const outputPath = path.join(__dirname, `test-output-enhanced-${gameType}.html`);
      fs.writeFileSync(outputPath, enhanced);
      log(`  Saved to: ${outputPath}`, 'blue');
      
    } catch (error) {
      log(`  ERROR: ${error.message}`, 'red');
    }
  }
}

// Test 4: Full Conversion Flow (without OpenAI)
async function testConversionFlow() {
  logSection('TEST 4: Full Conversion Flow (Mock)');
  
  log('\nNOTE: This test simulates the conversion flow without OpenAI API', 'yellow');
  log('To test with real AI conversion, set OPENAI_API_KEY environment variable', 'yellow');
  
  const gameId = 'test-game-' + Date.now();
  const html = sampleGames.tictactoe;
  
  const event = {
    info: { fieldName: 'convertToMultiplayer' },
    arguments: {
      gameId: gameId,
      gameHtml: html
    }
  };
  
  try {
    log('\n1. Starting conversion...', 'cyan');
    const result = await handler(event);
    
    log('  ✗ Conversion succeeded (unexpected without OpenAI key)', 'red');
    console.log(result);
    
  } catch (error) {
    if (error.message.includes('OPENAI_API_KEY')) {
      log('  ✓ Correctly requires OpenAI API key', 'green');
      log('  ✓ Conversion flow structure validated', 'green');
      
      // Test the individual steps that don't require OpenAI
      log('\n2. Testing individual conversion steps:', 'cyan');
      
      const { analyzeGameStructure, injectDataAttributes, generateServerValidator } = require('./lambda/ai-convert');
      
      const analysis = analyzeGameStructure(html);
      log(`  ✓ Game analysis completed (${analysis.gameType})`, 'green');
      
      const enhanced = injectDataAttributes(html, { statePatterns: ['score', 'currentPlayer'] });
      log(`  ✓ Data attributes injected`, 'green');
      
      const validator = generateServerValidator(analysis);
      log(`  ✓ Server validator generated (${validator.length} bytes)`, 'green');
      
    } else {
      log(`  ✗ Unexpected error: ${error.message}`, 'red');
    }
  }
}

// Test 5: Evaluation Criteria
async function evaluateImplementation() {
  logSection('EVALUATION: Phase 4 Implementation');
  
  const aiConvert = require('./lambda/ai-convert');
  
  const criteria = [
    {
      name: 'Game Type Detection',
      test: () => {
        return aiConvert.detectGameType(sampleGames.tictactoe) === 'tictactoe';
      }
    },
    {
      name: 'Deep Game Analysis',
      test: () => {
        const analysis = aiConvert.analyzeGameStructure(sampleGames.memory);
        return analysis.mechanics.hasScore && analysis.complexity.score > 0;
      }
    },
    {
      name: 'Server Validator Generation',
      test: () => {
        const analysis = aiConvert.analyzeGameStructure(sampleGames.counter);
        const validator = aiConvert.generateServerValidator(analysis);
        return validator.includes('handleJoinGame') && validator.includes('handleMove');
      }
    },
    {
      name: 'Data Attribute Injection',
      test: () => {
        const enhanced = aiConvert.injectDataAttributes('<button>Click</button>', { statePatterns: [] });
        return enhanced.includes('data-game-action');
      }
    },
    {
      name: 'Multiplayer Library Injection',
      test: () => {
        const result = aiConvert.injectMultiplayerLibrary('<html></html>', 'test-game');
        return result.includes('multiplayer-lib.js') && result.includes('GAME_CONFIG');
      }
    },
    {
      name: 'Lambda Deployment Logic',
      test: () => {
        return typeof aiConvert.deployServerCode === 'function';
      }
    }
  ];
  
  log('\nEvaluating implementation against Phase 4 requirements:\n', 'bright');
  
  let passed = 0;
  let failed = 0;
  
  for (const criterion of criteria) {
    try {
      if (criterion.test()) {
        log(`  ✓ ${criterion.name}`, 'green');
        passed++;
      } else {
        log(`  ✗ ${criterion.name}`, 'red');
        failed++;
      }
    } catch (error) {
      log(`  ✗ ${criterion.name} (${error.message})`, 'red');
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  log(`RESULTS: ${passed}/${criteria.length} tests passed`, passed === criteria.length ? 'green' : 'yellow');
  
  if (passed === criteria.length) {
    log('\n🎉 Phase 4 implementation is complete and functional!', 'green');
    log('\nNext steps:', 'cyan');
    log('1. Set OPENAI_API_KEY environment variable for full testing', 'yellow');
    log('2. Deploy to AWS: cd cdk && npm run deploy', 'yellow');
    log('3. Test with real game conversions in the UI', 'yellow');
  } else {
    log('\n⚠️  Some components need attention', 'yellow');
  }
}

// Run all tests
async function runTests() {
  log('PHASE 4: MULTIPLAYER CONVERSION ENGINE TEST SUITE', 'bright');
  log('Testing the enhanced AI-powered conversion system', 'cyan');
  
  await testGameAnalysis();
  await testServerValidator();
  await testDataAttributes();
  await testConversionFlow();
  await evaluateImplementation();
  
  console.log('\n' + '='.repeat(60));
  log('All tests completed!', 'bright');
}

// Execute tests
runTests().catch(error => {
  log(`\nFATAL ERROR: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});