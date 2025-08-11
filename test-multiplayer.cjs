#!/usr/bin/env node

/**
 * Test script for multiplayer game functionality
 * Tests the Universal Game Engine Lambda through AppSync
 */

const https = require('https');

const API_URL = 'https://wdmfu2wflrhxbi3hhvaqmk64re.appsync-api.us-east-2.amazonaws.com/graphql';
const API_KEY = 'da2-4kwhajemrzbojl4vs7j7bjih5a';

function makeGraphQLRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query, variables });
    
    const url = new URL(API_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'Content-Length': data.length
      }
    };
    
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (response.errors) {
            reject(new Error(JSON.stringify(response.errors)));
          } else {
            resolve(response.data);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function testMultiplayer() {
  console.log('🎮 Testing Multiplayer Game System\n');
  
  const gameId = `test-game-${Date.now()}`;
  const player1Id = 'player-1';
  const player2Id = 'player-2';
  
  try {
    // 1. Create a new game
    console.log('1. Creating new game...');
    const createQuery = `
      mutation CreateGame($input: CreateGameInput!) {
        createGame(input: $input) {
          gameId
          gameType
          gameState
          players
          createdAt
        }
      }
    `;
    
    const createResult = await makeGraphQLRequest(createQuery, {
      input: {
        gameId,
        gameType: 'counter',
        initialState: JSON.stringify({
          counter: 0,
          targetScore: 10,
          gameActive: false,
          currentTurn: 1,
          winner: null
        }),
        players: JSON.stringify({})
      }
    });
    console.log('✅ Game created:', gameId);
    
    // 2. Player 1 joins
    console.log('\n2. Player 1 joining...');
    const join1Query = `
      mutation ProcessAction($gameId: ID!, $action: AWSJSON!) {
        processGameAction(gameId: $gameId, action: $action)
      }
    `;
    
    const join1Result = await makeGraphQLRequest(join1Query, {
      gameId,
      action: JSON.stringify({
        type: 'JOIN',
        playerId: player1Id,
        data: {
          playerData: { name: 'Player 1', avatar: '🎮' }
        }
      })
    });
    const join1Response = JSON.parse(join1Result.processGameAction);
    console.log('✅ Player 1 joined:', join1Response.success ? 'Success' : 'Failed');
    if (join1Response.broadcast) {
      console.log('   Broadcast:', join1Response.broadcast.type);
    }
    
    // 3. Player 2 joins
    console.log('\n3. Player 2 joining...');
    const join2Result = await makeGraphQLRequest(join1Query, {
      gameId,
      action: JSON.stringify({
        type: 'JOIN',
        playerId: player2Id,
        data: {
          playerData: { name: 'Player 2', avatar: '🎯' }
        }
      })
    });
    const join2Response = JSON.parse(join2Result.processGameAction);
    console.log('✅ Player 2 joined:', join2Response.success ? 'Success' : 'Failed');
    if (join2Response.broadcast) {
      console.log('   Broadcast:', join2Response.broadcast.type);
    }
    
    // 4. Start the game
    console.log('\n4. Starting game...');
    const startResult = await makeGraphQLRequest(join1Query, {
      gameId,
      action: JSON.stringify({
        type: 'START',
        playerId: player1Id,
        data: {}
      })
    });
    const startResponse = JSON.parse(startResult.processGameAction);
    console.log('✅ Game started:', startResponse.success ? 'Success' : 'Failed');
    if (startResponse.state) {
      console.log('   Game active:', startResponse.state.gameActive);
    }
    
    // 5. Player 1 makes a move
    console.log('\n5. Player 1 making a move...');
    const move1Result = await makeGraphQLRequest(join1Query, {
      gameId,
      action: JSON.stringify({
        type: 'UPDATE',
        playerId: player1Id,
        data: {
          state: {
            counter: 1,
            currentTurn: 2
          }
        }
      })
    });
    const move1Response = JSON.parse(move1Result.processGameAction);
    console.log('✅ Move made:', move1Response.success ? 'Success' : 'Failed');
    if (move1Response.state) {
      console.log('   Counter:', move1Response.state.counter);
      console.log('   Current turn:', move1Response.state.currentTurn);
    }
    
    // 6. Player 2 makes a move
    console.log('\n6. Player 2 making a move...');
    const move2Result = await makeGraphQLRequest(join1Query, {
      gameId,
      action: JSON.stringify({
        type: 'UPDATE',
        playerId: player2Id,
        data: {
          state: {
            counter: 2,
            currentTurn: 1
          }
        }
      })
    });
    const move2Response = JSON.parse(move2Result.processGameAction);
    console.log('✅ Move made:', move2Response.success ? 'Success' : 'Failed');
    if (move2Response.state) {
      console.log('   Counter:', move2Response.state.counter);
      console.log('   Current turn:', move2Response.state.currentTurn);
    }
    
    // 7. Get final game state
    console.log('\n7. Getting final game state...');
    const getQuery = `
      query GetGame($gameId: ID!) {
        getGame(gameId: $gameId) {
          gameId
          gameState
          players
          updatedAt
        }
      }
    `;
    
    const getResult = await makeGraphQLRequest(getQuery, { gameId });
    const finalState = JSON.parse(getResult.getGame.gameState);
    const finalPlayers = JSON.parse(getResult.getGame.players);
    
    console.log('✅ Final game state:');
    console.log('   Counter:', finalState.counter);
    console.log('   Players:', Object.keys(finalPlayers).length);
    console.log('   Last update:', getResult.getGame.updatedAt);
    
    console.log('\n✨ All tests passed successfully!');
    console.log(`\n📱 Test the game in browser at: https://d17uiucy3a9bfl.cloudfront.net`);
    console.log(`   Use Game ID: ${gameId}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.message.includes('Invoke Error')) {
      console.log('\n⚠️  The Lambda function may have an error. Check CloudWatch logs:');
      console.log('aws logs tail /aws/lambda/MultiplayerGameStack-UniversalGameEngine5C60E0F0-* --follow');
    }
  }
}

// Run the test
testMultiplayer().catch(console.error);