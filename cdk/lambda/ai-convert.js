const https = require('https');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });

exports.handler = async (event) => {
  console.log('Lambda invoked with event:', JSON.stringify(event, null, 2));
  console.log('Environment Variables Check:');
  console.log('WEBSITE_BUCKET:', process.env.WEBSITE_BUCKET);
  console.log('CF_DOMAIN:', process.env.CF_DOMAIN);
  console.log('API_ENDPOINT:', process.env.API_ENDPOINT);
  console.log('API_KEY:', process.env.API_KEY ? 'Set (hidden)' : 'Not set');
  console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Set (hidden)' : 'Not set');
  
  const operation = event.info ? event.info.fieldName : 'convertToMultiplayer';
  console.log('Operation:', operation);
  
  try {
    if (operation === 'generateGame') {
      return await handleGenerateGame(event);
    } else if (operation === 'convertToMultiplayer') {
      return await handleConvertToMultiplayer(event);
    }
    
    throw new Error(`Unknown operation: ${operation}`);
  } catch (error) {
    console.error('Handler error:', error);
    throw error;
  }
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
  
  console.log('Generating game:', { gameId, gameType, requirements });
  
  // Build a comprehensive prompt for game generation
  const prompt = `Create a complete, playable HTML5 ${gameType} game with the following specifications:

Game Type: ${gameType}
Requirements: ${JSON.stringify(requirements, null, 2)}

The game MUST include:
1. Complete HTML structure with embedded CSS and JavaScript
2. Clear game title and instructions
3. Interactive gameplay elements
4. Visual feedback for player actions
5. Score or progress tracking
6. Win/lose conditions
7. Restart functionality
8. Mobile-responsive design
9. Smooth animations and transitions
10. Data attributes for game state tracking: data-game-state, data-game-action

For turn-based games, include:
- Clear turn indicators
- Player identification system
- Turn validation logic

Technical requirements:
- All code must be in a single HTML file
- Use modern JavaScript (ES6+)
- Include CSS animations for better UX
- Add comments explaining game logic
- Emit custom events for game state changes

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
    
    // Upload to S3
    const s3Key = `games/${gameId}/index.html`;
    console.log('Uploading to S3:', s3Key);
    
    const putCommand = new PutObjectCommand({
      Bucket: process.env.WEBSITE_BUCKET,
      Key: s3Key,
      Body: generatedHtml,
      ContentType: 'text/html',
      Metadata: {
        'game-type': gameType,
        'generated-at': new Date().toISOString()
      }
    });
    
    await s3Client.send(putCommand);
    console.log('Successfully uploaded to S3');
    
    // Return Game object matching GraphQL schema
    const gameData = {
      gameId: gameId,
      gameType: gameType,
      gameHtml: generatedHtml,
      gameState: JSON.stringify(requirements.initialState || {
        initialized: true,
        players: {},
        turnCount: 0
      }),
      players: JSON.stringify({}),
      metadata: JSON.stringify({
        ...requirements,
        generatedAt: new Date().toISOString(),
        version: '1.0.0'
      }),
      serverLogicUrl: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    console.log('Returning game data');
    return gameData;
    
  } catch (error) {
    console.error('Error generating game:', error);
    throw new Error(`Failed to generate game: ${error.message}`);
  }
}

async function callOpenAI(prompt) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  
  const requestBody = JSON.stringify({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are an expert game developer who creates complete, playable HTML5 games. You write clean, well-commented code that follows best practices. Always return ONLY the HTML code without any markdown formatting."
      },
      { role: "user", content: prompt }
    ],
    temperature: 0.7,
    max_tokens: 12000  // Increased for larger games
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
    },
    timeout: 60000  // 60 second timeout
  };

  console.log('Making OpenAI API request...');
  
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          console.log('OpenAI response status:', res.statusCode);
          
          if (res.statusCode !== 200) {
            console.error('OpenAI API error response:', data);
            reject(new Error(`OpenAI API returned status ${res.statusCode}: ${data}`));
            return;
          }
          
          const response = JSON.parse(data);
          
          if (response.error) {
            console.error('OpenAI error:', response.error);
            reject(new Error(`OpenAI error: ${response.error.message}`));
            return;
          }
          
          if (response.choices && response.choices[0] && response.choices[0].message) {
            const content = response.choices[0].message.content;
            console.log('OpenAI response received, content length:', content.length);
            
            // Clean up the response - remove any markdown code blocks if present
            let cleanedContent = content;
            if (content.includes('```html')) {
              cleanedContent = content.replace(/```html\n?/g, '').replace(/```\n?/g, '');
            } else if (content.includes('```')) {
              cleanedContent = content.replace(/```\n?/g, '');
            }
            
            resolve(cleanedContent.trim());
          } else {
            console.error('Invalid OpenAI response structure:', response);
            reject(new Error('Invalid response from OpenAI - no content returned'));
          }
        } catch (error) {
          console.error('Error parsing OpenAI response:', error);
          reject(new Error(`Failed to parse OpenAI response: ${error.message}`));
        }
      });
    });
    
    req.on('error', (error) => {
      console.error('Request error:', error);
      reject(new Error(`Network error calling OpenAI: ${error.message}`));
    });
    
    req.on('timeout', () => {
      console.error('Request timeout');
      req.destroy();
      reject(new Error('OpenAI request timed out'));
    });
    
    req.write(requestBody);
    req.end();
  });
}