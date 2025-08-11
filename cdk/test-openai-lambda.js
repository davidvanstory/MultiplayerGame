#!/usr/bin/env node

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function testLambda() {
  console.log('Testing Lambda function with OpenAI...\n');
  
  // Create a simple test payload
  const payload = {
    info: {
      fieldName: 'generateGame'
    },
    arguments: {
      gameType: 'tictactoe',
      requirements: JSON.stringify({
        description: 'Simple tic-tac-toe game',
        features: [],
        difficulty: 'easy',
        initialState: {
          players: {},
          score: 0,
          level: 1
        }
      })
    }
  };
  
  const payloadString = JSON.stringify(payload).replace(/"/g, '\\"');
  
  try {
    console.log('Invoking Lambda function...');
    const command = `aws lambda invoke \
      --function-name MultiplayerGameStack-AIConvertFunctionE59FD05C-oNpALj0qkBpU \
      --payload "${payloadString}" \
      --cli-binary-format raw-in-base64-out \
      /tmp/lambda-response.json`;
    
    const { stdout, stderr } = await execPromise(command);
    
    if (stderr) {
      console.error('Command stderr:', stderr);
    }
    
    // Read the response
    const { readFileSync } = require('fs');
    const response = JSON.parse(readFileSync('/tmp/lambda-response.json', 'utf8'));
    
    console.log('\n✅ Lambda invocation successful!\n');
    console.log('Response summary:');
    console.log('- Game ID:', response.gameId);
    console.log('- Game Type:', response.gameType);
    console.log('- HTML Length:', response.gameHtml ? response.gameHtml.length : 0);
    console.log('- Created At:', response.createdAt);
    
    if (response.gameHtml) {
      console.log('\n✨ OpenAI successfully generated a game!');
      console.log('First 200 characters of HTML:');
      console.log(response.gameHtml.substring(0, 200) + '...');
    } else {
      console.log('\n❌ No HTML generated');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    // Try to read any error response
    try {
      const { readFileSync } = require('fs');
      const errorResponse = readFileSync('/tmp/lambda-response.json', 'utf8');
      console.log('\nLambda error response:', errorResponse);
    } catch (e) {
      // Ignore if file doesn't exist
    }
  }
}

// Run the test
testLambda();