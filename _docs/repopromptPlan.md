Build a system that enables AI generation of single-player HTML games and one-click conversion to multiplayer, with automatic server-side code deployment and a universal event system for game state synchronization.

### What's Working
- ✅ Basic 2-player counter game functional
- ✅ AppSync GraphQL API configured with JavaScript resolvers
- ✅ DynamoDB table for game state
- ✅ CloudFront/S3 infrastructure deployed
- ✅ Lambda function placeholder exists


### Critical Gaps
- ❌ **No S3 write permissions** - Lambda can't store HTML files
- ❌ **Rigid schema** - Only supports counter game
- ❌ **No game generation** - Can't create new games
- ❌ **No event system** - Missing TRANSITION/INTERACTION/UPDATE/ERROR events
- ❌ **No server validation** - Client controls everything


## Phase 1: Foundation - Schema & Infrastructure Refactoring
**Why it's important:** This is the bedrock that determines whether the system can handle ANY game type. Without flexible schema and proper permissions, nothing else works.

Prompt: 
Update the GraphQL schema in cdk/schema.graphql to replace the rigid GameState type with AWSJSON for complete flexibility. Also fix the Lambda permissions in cdk/lib/game-stack.ts by adding the missing environment variables (WEBSITE_BUCKET, CF_DOMAIN) and S3 write permissions.
Test locally by:
1. Run 'npx cdk diff' to see the changes before deploying
2. Add console.log statements in the Lambda to verify environment variables are set
3. Deploy with 'npm run deploy' and check CloudWatch logs show the env vars
4. Test S3 write with: aws s3 cp test.html s3://[bucket]/games/test.html --profile default

### 1.1 Schema Modernization (`cdk/schema.graphql`)
Transform the rigid counter-specific schema into a flexible system:


type Game {
  gameId: ID!
  gameType: String!         # "tictactoe", "chess", "ai-generated"
  gameHtml: String           # Stored HTML content
  gameState: AWSJSON!        # Flexible JSON for ANY game
  players: AWSJSON!          # Support N players
  metadata: AWSJSON!         # Game-specific metadata
  serverLogicUrl: String     # Lambda ARN for validation
  createdAt: String!
  updatedAt: String!
}

input CreateGameInput {
  gameId: ID!
  gameType: String!
  gameHtml: String
  initialState: AWSJSON!
}

type Mutation {
  generateGame(gameType: String!, requirements: AWSJSON!): Game!
  convertToMultiplayer(gameId: ID!, gameHtml: String!): ConversionResult!
  processGameAction(gameId: ID!, action: AWSJSON!): AWSJSON!
}

type ConversionResult {
  gameUrl: String!
  gameId: String!
  serverEndpoint: String!
}

### 1.2 Lambda Permissions Fix (`cdk/lib/game-stack.ts`)
Critical infrastructure updates:


// Add missing environment variables
environment: {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  WEBSITE_BUCKET: websiteBucket.bucketName,       // ← MISSING
  CF_DOMAIN: distribution.distributionDomainName,  // ← MISSING
  API_ENDPOINT: api.graphqlUrl,                   // ← NEW
  API_KEY: api.apiKey                             // ← NEW
}

// Grant S3 permissions
websiteBucket.grantWrite(aiConvertLambda, 'games/*');  // ← MISSING

// Increase timeout for AI processing
timeout: cdk.Duration.minutes(2),  // ← Increase from 30s


## Phase 2: AI Game Generation System
**Priority: HIGH - New core feature**
**Why it's important:** Creating games from scratch demonstrates full control over the game structure, making multiplayer conversion more reliable since we understand the initial state.

Prompt:
Create a new Lambda function at cdk/lambda/game-generator.js that uses OpenAI to generate single-player HTML games. The function should accept a gameType and requirements, generate a complete HTML file with inline CSS/JS, and store it in S3.
Test locally by:
1. Create a test script that calls the Lambda locally: node -e "require('./cdk/lambda/game-generator').handler({arguments: {gameType: 'tictactoe', requirements: {}}})"
2. Add detailed logging: console.log('Generated HTML length:', gameHtml.length)
3. Mock S3 locally first, then test actual S3 writes
4. Verify generated HTML runs standalone by opening in browser

### 2.1 Game Generator Lambda (`cdk/lambda/game-generator.js`)
**New File - Create single-player games from scratch:**
export const handler = async (event) => {
  const { gameType, requirements } = event.arguments;
  
  // Build prompt based on game type
  const prompt = `
    Create a ${gameType} game as a single HTML file.
    Requirements: ${JSON.stringify(requirements)}
    
    Rules:
    1. All CSS and JavaScript must be inline
    2. Use data attributes: data-game-state, data-game-action
    3. Emit events to parent: window.parent.postMessage()
    4. Include these event types: TRANSITION, INTERACTION, UPDATE, ERROR
    
    Return ONLY the complete HTML, no explanations.
  `;
  
  const gameHtml = await generateWithOpenAI(prompt);
  const gameId = generateGameId();
  
  // Store to S3
  await storeGameToS3(gameId, gameHtml);
  
  // Save to DynamoDB
  await saveGameMetadata(gameId, gameType, gameHtml);
  
  return { gameId, gameUrl: getGameUrl(gameId) };
};


### 2.2 Game Creation Interface (`cdk/frontend/game-creator.html`)
**New File - UI for game generation:**

<div id="gameCreator">
  <h2>Create New Game</h2>
  
  <select id="gameType">
    <option value="tictactoe">Tic Tac Toe</option>
    <option value="chess">Chess</option>
    <option value="checkers">Checkers</option>
    <option value="custom">Custom Game</option>
  </select>
  
  <textarea id="requirements" placeholder="Describe your game..."></textarea>
  
  <button onclick="generateGame()">Generate Game</button>
  
  <div id="preview">
    <iframe id="gamePreview"></iframe>
    <button onclick="convertToMultiplayer()">Make it Multiplayer!</button>
  </div>
</div>


## Phase 3: Universal Event System & Client Library
**Priority: CRITICAL - Required for multiplayer**
**Why it's important:** This abstraction layer allows ANY game to communicate with the multiplayer infrastructure without knowing implementation details - critical for handling unpredictable AI-generated code.

Prompt:
Create cdk/frontend/multiplayer-lib.js as a standalone JavaScript library that intercepts game events and provides a clean API. The library should emit four event types (TRANSITION, INTERACTION, UPDATE, ERROR) with metadata, auto-detect game structure from DOM, and handle parent frame communication.
Test locally by:
1. Create a test HTML file that includes the library: <script src="multiplayer-lib.js"></script>
2. Add debug mode: window.DEBUG_MULTIPLAYER = true for verbose console logging
3. Test event emission: gameEvents.emit('INTERACTION', {test: 'data'}) and verify in console
4. Use browser DevTools to verify postMessage events to parent frame
5. Test with the existing counter game before deploying

### 3.1 Event Bridge Library (`cdk/frontend/multiplayer-lib.js`)
**New File - Lightweight client library:**

/**
 * @fileoverview Universal multiplayer event bridge
 * @module GameEventBridge
 */
(function(window) {
  'use strict';
  
  class GameEventBridge {
    /**
     * @param {Object} config
     * @param {string} config.gameId - Unique game identifier
     * @param {string} config.playerId - Current player ID
     */
    constructor(config) {
      this.gameId = config.gameId;
      this.playerId = config.playerId;
      this.eventQueue = [];
      this.sequenceNumber = 0;
      
      this.interceptGameEvents();
      this.startSynchronization();
    }
    
    /**
     * Emit event with metadata
     * @param {string} type - TRANSITION|INTERACTION|UPDATE|ERROR
     * @param {Object} data - Event-specific data
     */
    emit(type, data) {
      const event = {
        type,
        data,
        metadata: {
          gameId: this.gameId,
          playerId: this.playerId,
          timestamp: Date.now(),
          sequenceNumber: this.sequenceNumber++
        }
      };
      
      // Send to parent frame
      window.parent.postMessage(event, '*');
      
      // Queue for batch processing
      this.eventQueue.push(event);
    }
    
    /**
     * Auto-detect and intercept game events
     * @private
     */
    interceptGameEvents() {
      // Intercept clicks on game elements
      document.addEventListener('click', (e) => {
        if (e.target.dataset.gameAction) {
          this.emit('INTERACTION', {
            action: 'click',
            target: e.target.dataset.gameAction,
            position: { x: e.clientX, y: e.clientY }
          });
        }
      }, true);
      
      // Monitor state changes
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.target.dataset.gameState) {
            this.emit('UPDATE', {
              element: mutation.target.dataset.gameState,
              oldValue: mutation.oldValue,
              newValue: mutation.target.textContent
            });
          }
        });
      });
      
      observer.observe(document.body, {
        subtree: true,
        characterData: true,
        attributeOldValue: true
      });
    }
  }
  
  // Auto-initialize if configured
  if (window.GAME_CONFIG) {
    window.gameEvents = new GameEventBridge(window.GAME_CONFIG);
  }
  
  window.GameEventBridge = GameEventBridge;
})(window);


## Phase 4: Multiplayer Conversion Engine
**Priority: CRITICAL - Main deliverable**
**Why it's important:** This is the core differentiator - transforming ANY single-player game into multiplayer with one click, achieving the 95% success rate goal across genres.

Prompt: 
Complete the cdk/lambda/ai-convert.js Lambda to properly convert games. It should: 1) Analyze game structure to detect type, 2) Generate multiplayer version with embedded library, 3) Create server validation code, 4) Store HTML to S3, 5) Return CloudFront URL.
Test locally by:
1. Add extensive logging at each step: console.log('Step 1: Analysis', analysis)
2. Test with a simple HTML game first: const testHtml = '<html><body><button>Click</button></body></html>'
3. Mock OpenAI responses initially to test flow
4. Verify S3 upload: console.log('Uploaded to:', s3Key)
5. Test the returned URL actually serves the game

### 4.1 Enhanced AI Converter (`cdk/lambda/ai-convert.js`)
**Major Refactor Required:**

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { LambdaClient, CreateFunctionCommand } from '@aws-sdk/client-lambda';
import OpenAI from 'openai';

export const handler = async (event) => {
  const { gameId, gameHtml } = event.arguments;
  
  // Step 1: Analyze game structure
  const analysis = analyzeGameStructure(gameHtml);
  
  // Step 2: Generate multiplayer version
  const prompt = buildConversionPrompt(gameHtml, analysis);
  const multiplayerHtml = await convertWithAI(prompt);
  
  // Step 3: Generate server validator
  const serverCode = generateServerValidator(analysis);
  
  // Step 4: Deploy server code
  const serverArn = await deployServerCode(gameId, serverCode);
  
  // Step 5: Store to S3
  const gameUrl = await storeToS3(gameId, multiplayerHtml);
  
  return { gameUrl, gameId, serverEndpoint: serverArn };
};

function analyzeGameStructure(html) {
  return {
    gameType: detectGameType(html),
    hasTurns: html.includes('turn') || html.includes('player'),
    hasBoard: html.includes('board') || html.includes('grid'),
    isRealtime: html.includes('requestAnimationFrame'),
    elements: extractGameElements(html)
  };
}

function generateServerValidator(analysis) {
  return `
    exports.handler = async (event) => {
      const { gameId, action, currentState } = event;
      
      // Validate based on game type
      if (analysis.gameType === 'turn-based') {
        if (currentState.currentPlayer !== action.playerId) {
          throw new Error('Not your turn');
        }
      }
      
      // Apply action
      const newState = applyAction(currentState, action);
      
      // Check win conditions
      const winner = checkWinner(newState);
      
      return { newState, winner };
    };
  `;
}



## Phase 5: State Management & Synchronization
**Why it's important:** Reliable state sync ensures all players see the same game state, preventing desync issues that ruin multiplayer experiences.

Prompt:
Create cdk/lambda/universal-game-engine.js to handle game state for any game type. It should load state from DynamoDB, validate actions based on game type, apply state changes, and return the new state. Use AWSJSON fields for complete flexibility.
Test locally by:
1. Create unit tests for state operations
2. Add logging for every state transition: console.log('State change:', {before, action, after})
3. Test with mock DynamoDB locally using aws-sdk-mock
4. Verify state persistence: save state, retrieve it, confirm it matches
5. Test concurrent updates don't cause race conditions


### 5.1 Universal Game Processor (`cdk/lambda/universal-game-engine.js`)
**New File - Generic state handler:**


export const handler = async (event) => {
  const { gameId, action } = event.arguments;
  
  // Load current state
  const game = await getGameFromDynamoDB(gameId);
  const currentState = JSON.parse(game.gameState || '{}');
  
  // Load game-specific validator if exists
  const validator = game.serverLogicUrl ?
    await loadValidator(game.serverLogicUrl) :
    defaultValidator;
  
  // Validate and apply action
  const validation = await validator.validate(action, currentState);
  if (!validation.valid) {
    throw new Error(validation.reason);
  }
  
  // Apply action to state
  const newState = await validator.apply(action, currentState);
  
  // Save to DynamoDB
  await updateGameState(gameId, newState);
  
  // Return new state
  return newState;
};

Update `cdk/resolver/processGameAction.js`


## Phase 6: Frontend Integration
**Why it's important:** The user interface is where the magic happens - the "Make it Multiplayer" button needs to feel instant and magical for the end users (kids creating games).

Prompt: 
Update cdk/frontend/index.html to add game generation UI and multiplayer conversion interface. Include a textarea for pasting HTML, a "Make it Multiplayer" button, and an iframe for displaying results. Remove counter-specific logic and use AWSJSON for flexible state.
Test locally by:
1. Run local dev server: npm run dev
2. Test with a pre-made single player game HTML
3. Add console.time('conversion') and console.timeEnd('conversion') to measure speed
4. Monitor Network tab for API calls
5. Test the converted game actually works in the iframe
6. Add error handling with user-friendly messages

### 6.1 Updated Main Interface (`cdk/frontend/index.html`)
Key sections to add:

<!-- Game Generation Section -->
<div id="gameGeneration">
  <h2>Create a New Game</h2>
  <button onclick="openGameCreator()">Design Your Game</button>
</div>

<!-- Conversion Section -->
<div id="conversionSection">
  <h2>Convert to Multiplayer</h2>
  <textarea id="singlePlayerHtml" placeholder="Paste your game HTML here..."></textarea>
  <button onclick="convertToMultiplayer()">Make it Multiplayer!</button>
  
  <div id="conversionResult" style="display:none;">
    <h3>Success!</h3>
    <p>Game URL: <a id="gameUrl"></a></p>
    <iframe id="multiplayerGame"></iframe>
  </div>
</div>

<script>
async function convertToMultiplayer() {
  const html = document.getElementById('singlePlayerHtml').value;
  const gameId = generateGameId();
  
  const result = await graphqlRequest(`
    mutation ConvertToMultiplayer($gameId: ID!, $gameHtml: String!) {
      convertToMultiplayer(gameId: $gameId, gameHtml: $gameHtml) {
        gameUrl
        gameId
        serverEndpoint
      }
    }
  `, { gameId, gameHtml: html });
  
  displayConversionResult(result);
}
</script>



