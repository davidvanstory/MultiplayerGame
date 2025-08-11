#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs');

async function testLambda() {
  console.log('Testing Lambda function with OpenAI...\n');
  
  // Create a simple test payload
  const payload = {
    info: {
      fieldName: 'generateGame'
    },
    arguments: {
      gameType: 'simple',
      requirements: JSON.stringify({
        description: 'Simple test game',
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
  
  // Write payload to file to avoid escaping issues
  fs.writeFileSync('/tmp/test-payload.json', JSON.stringify(payload));
  
  const command = `aws lambda invoke \
    --function-name MultiplayerGameStack-AIConvertFunctionE59FD05C-oNpALj0qkBpU \
    --payload file:///tmp/test-payload.json \
    --cli-binary-format raw-in-base64-out \
    /tmp/lambda-response.json 2>&1`;
  
  exec(command, (error, stdout, stderr) => {
    console.log('Lambda invocation output:', stdout);
    
    try {
      const response = JSON.parse(fs.readFileSync('/tmp/lambda-response.json', 'utf8'));
      
      if (response.gameHtml) {
        console.log('\n✅ SUCCESS! OpenAI is working!\n');
        console.log('Response summary:');
        console.log('- Game ID:', response.gameId);
        console.log('- Game Type:', response.gameType);
        console.log('- HTML Length:', response.gameHtml.length, 'characters');
        console.log('\nFirst 300 characters of generated HTML:');
        console.log(response.gameHtml.substring(0, 300) + '...\n');
      } else if (response.errorMessage) {
        console.log('\n❌ Lambda error:', response.errorMessage);
      } else {
        console.log('\n⚠️ Unexpected response:', JSON.stringify(response, null, 2));
      }
    } catch (e) {
      console.error('\n❌ Error reading response:', e.message);
    }
  });
}

testLambda();