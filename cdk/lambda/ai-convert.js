const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const OpenAI = require('openai');
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

async function handleConvertToMultiplayer(event) {
  const { gameId, gameHtml } = event.arguments || event;
  
  console.log('Converting single-player game to multiplayer');
  
  // First analyze the game structure
  const analysis = analyzeGameElements(gameHtml);
  
  // Add data attributes to the HTML
  let enhancedHtml = injectDataAttributes(gameHtml, analysis);
  
  // Now create the conversion prompt with awareness of data attributes
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
9. PRESERVE any existing data-game-action and data-game-state attributes
10. Add data-game-action attributes to interactive elements if missing
11. Add data-game-state attributes to state display elements if missing

Input HTML (with data attributes already added):
${enhancedHtml}

Return ONLY the complete modified HTML file with embedded JavaScript and CSS. Make it a complete, working multiplayer game that emits events through data attributes.`;

  try {
    const convertedHtml = await callOpenAI(prompt);
    
    // Inject the multiplayer library into the converted HTML
    const finalHtml = injectMultiplayerLibrary(convertedHtml, gameId);
    
    // Upload to S3
    const s3Key = `games/${gameId}/index.html`;
    const putCommand = new PutObjectCommand({
      Bucket: process.env.WEBSITE_BUCKET,
      Key: s3Key,
      Body: finalHtml,
      ContentType: 'text/html',
      Metadata: {
        'game-type': 'multiplayer-converted',
        'converted-at': new Date().toISOString()
      }
    });
    await s3Client.send(putCommand);
    
    console.log('Multiplayer game uploaded to S3:', s3Key);
    
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

async function callOpenAI(prompt) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }
  
  // Initialize OpenAI client
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 60 * 1000, // 60 seconds
    maxRetries: 2
  });

  try {
    console.log('Making OpenAI API request using SDK...');
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert game developer who creates complete, playable HTML5 games. You write clean, well-commented code that follows best practices. Always return ONLY the HTML code without any markdown formatting.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 12000  // Increased for larger games
    });

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