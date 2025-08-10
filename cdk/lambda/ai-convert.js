/**
 * AI-powered Lambda function for converting single-player games to multiplayer
 * Uses OpenAI SDK for robust API interactions with proper error handling
 */
const { OpenAI } = require('openai');

// Initialize OpenAI client with API key from environment
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Lambda handler function
 * @param {Object} event - Lambda event containing gameHtml in arguments
 * @returns {Promise<string>} - Converted multiplayer game HTML
 */
exports.handler = async (event) => {
  console.log('🚀 AI Convert Lambda started');
  console.log('📨 Event received:', JSON.stringify(event, null, 2));
  
  try {
    // Extract gameHtml from event (supports both AppSync and direct invocation)
    const { gameHtml } = event.arguments || event;
    
    if (!gameHtml) {
      console.error('❌ No gameHtml provided in event');
      throw new Error('gameHtml is required');
    }
    
    console.log('🎮 Game HTML length:', gameHtml.length, 'characters');
    
    // Construct detailed prompt for AI conversion
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

    console.log('🤖 Sending request to OpenAI GPT-4o-mini');
    
    // Make API call using OpenAI SDK with proper configuration
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: "You are a helpful assistant that converts single-player games to multiplayer. Always return complete, functional HTML files with embedded CSS and JavaScript." 
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 8000,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0
    });

    console.log('✅ OpenAI response received');
    console.log('📊 Usage stats:', completion.usage);
    
    // Extract and validate response
    const convertedGame = completion.choices[0]?.message?.content;
    
    if (!convertedGame) {
      console.error('❌ Empty response from OpenAI');
      throw new Error('No content returned from OpenAI');
    }
    
    console.log('🎯 Converted game length:', convertedGame.length, 'characters');
    console.log('🏁 AI Convert Lambda completed successfully');
    
    return convertedGame;
    
  } catch (error) {
    console.error('💥 Error in AI Convert Lambda:', error);
    
    // Provide detailed error information for debugging
    if (error.response) {
      console.error('🔍 OpenAI API Error Response:', error.response.data);
      throw new Error(`OpenAI API Error: ${error.response.data.error?.message || 'Unknown API error'}`);
    } else if (error.request) {
      console.error('🌐 Network Error:', error.request);
      throw new Error('Network error calling OpenAI API');
    } else {
      console.error('⚙️ Configuration Error:', error.message);
      throw new Error(`Configuration error: ${error.message}`);
    }
  }
};