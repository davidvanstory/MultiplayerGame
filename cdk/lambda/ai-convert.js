const https = require('https');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });

exports.handler = async (event) => {
  // Log environment variables for verification (remove after testing)
  console.log('Environment Variables Check:');
  console.log('WEBSITE_BUCKET:', process.env.WEBSITE_BUCKET);
  console.log('CF_DOMAIN:', process.env.CF_DOMAIN);
  console.log('API_ENDPOINT:', process.env.API_ENDPOINT);
  console.log('API_KEY:', process.env.API_KEY ? 'Set (hidden)' : 'Not set');
  console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Set (hidden)' : 'Not set');
  
  const operation = event.info ? event.info.fieldName : 'convertToMultiplayer';
  
  if (operation === 'generateGame') {
    return handleGenerateGame(event);
  } else if (operation === 'convertToMultiplayer') {
    return handleConvertToMultiplayer(event);
  }
  
  throw new Error(`Unknown operation: ${operation}`);
};

async function handleConvertToMultiplayer(event) {
  const { gameId, gameHtml } = event.arguments || event;
  
  const prompt = `Convert this single-player HTML+JS turn-based counter game into a sophisticated multiplayer game using vanilla JS and WebSockets.

Requirements:
1. Two players take turns (Player 1 and Player 2)
2. Add WebSocket connection for real-time multiplayer
3. Show current player's turn
4. Validate turns (players can only play on their turn)
5. Display both players' connection status
6. Add win conditions or game end logic
7. Keep the core game mechanics intact
8. Add visual indicators for whose turn it is

Input HTML:
${gameHtml}

Return ONLY the complete modified HTML file with embedded JavaScript and CSS. Make it a complete, working multiplayer game.`;

  try {
    const convertedHtml = await callOpenAI(prompt);
    
    // Upload to S3
    const s3Key = `games/${gameId}/index.html`;
    const putCommand = new PutObjectCommand({
      Bucket: process.env.WEBSITE_BUCKET,
      Key: s3Key,
      Body: convertedHtml,
      ContentType: 'text/html'
    });
    await s3Client.send(putCommand);
    
    // Return ConversionResult
    return {
      gameUrl: `https://${process.env.CF_DOMAIN}/${s3Key}`,
      gameId: gameId,
      serverEndpoint: process.env.API_ENDPOINT
    };
  } catch (error) {
    console.error('Error converting game:', error);
    throw error;
  }
}

async function handleGenerateGame(event) {
  const { gameType, requirements } = event.arguments || event;
  const gameId = `game-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
  
  const prompt = `Generate a complete HTML5 ${gameType} game with the following requirements:
${JSON.stringify(requirements, null, 2)}

The game should be:
1. Complete and playable
2. Include embedded CSS and JavaScript
3. Be responsive and mobile-friendly
4. Have clear instructions
5. Support multiplayer if specified in requirements

Return ONLY the complete HTML file with all code embedded.`;

  try {
    const generatedHtml = await callOpenAI(prompt);
    
    // Upload to S3
    const s3Key = `games/${gameId}/index.html`;
    const putCommand = new PutObjectCommand({
      Bucket: process.env.WEBSITE_BUCKET,
      Key: s3Key,
      Body: generatedHtml,
      ContentType: 'text/html'
    });
    await s3Client.send(putCommand);
    
    // Return Game object
    return {
      gameId: gameId,
      gameType: gameType,
      gameHtml: generatedHtml,
      gameState: requirements.initialState || {},
      players: {},
      metadata: requirements,
      serverLogicUrl: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error generating game:', error);
    throw error;
  }
}

async function callOpenAI(prompt) {
  const requestBody = JSON.stringify({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a helpful assistant that creates and converts games to multiplayer." },
      { role: "user", content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 8000
  });

  const options = {
    hostname: 'api.openai.com',
    port: 443,
    path: '/v1/chat/completions',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Length': Buffer.byteLength(requestBody)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.choices && response.choices[0]) {
            resolve(response.choices[0].message.content);
          } else {
            reject(new Error('Invalid response from OpenAI'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(requestBody);
    req.end();
  });
}