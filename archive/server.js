import express from 'express';
import { WebSocketServer } from 'ws';
import { streamText } from 'ai';
import { openai } from "@ai-sdk/openai";
import path from 'path';
import { fileURLToPath } from 'url';

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(__dirname)); // Serve index.html directly

// AI SDK setup - openai instance is imported directly and uses OPENAI_API_KEY from environment

// Convert single-player HTML to multiplayer HTML
app.post('/api/convert', async (req, res) => {
  const { gameHtml } = req.body;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');

  const result = await streamText({
    model: openai("gpt-4o-mini"),
    messages: [
      { role: "system", content: "You are a helpful assistant that converts single-player games to multiplayer with proper player assignment and turn validation." },
      { 
        role: "user", 
        content: `Convert this single-player HTML+JS turn-based counter game into a sophisticated multiplayer game using vanilla JS and WebSockets.

CRITICAL REQUIREMENTS:
- Keep it all in one HTML file.
- Add WebSocket connection code that connects to ws://localhost:3001.
- Implement proper player assignment: 1st browser = Player 1, 2nd browser = Player 2.
- Display "You are Player: X" prominently in each browser.
- Only allow the current player to take turns (disable button when not your turn).
- Show turn status: "🟢 It's YOUR turn!" vs "🔴 Wait for Player X's turn".
- Add comprehensive logging with player IDs: "[Player X] message".
- Handle server messages with this format: {currentPlayer: 1, counter: 0, target: 5, yourPlayerId: 1, type: 'gameState'}.
- Send moves as: {type: 'takeTurn'} to server.
- Style disabled buttons gray and enabled buttons green.
- No external dependencies.
- Make UI feedback very clear about whose turn it is.

SERVER PROTOCOL:
- Server assigns yourPlayerId on connection
- Server validates turns (rejects moves from wrong player)
- Server broadcasts updated gameState to all clients
- Server handles win conditions and game reset

Game HTML:
${gameHtml}` 
      },
    ],
  });

  for await (const chunk of result.textStream) {
    res.write(chunk);
  }
  res.end();
});

// Start HTTP server
const httpServer = app.listen(3000, () => {
  console.log('HTTP server running at http://localhost:3000');
});

// WebSocket multiplayer server
const wss = new WebSocketServer({ port: 3001 });
let gameState = { currentPlayer: 1, counter: 0, target: 5 };
let playerCount = 0;
let players = new Map(); // Track which client is which player

function broadcast(state) {
  const message = JSON.stringify(state);
  wss.clients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

wss.on('connection', ws => {
  // Assign player ID (max 2 players)
  playerCount++;
  const playerId = Math.min(playerCount, 2);
  players.set(ws, playerId);
  
  console.log(`Client connected to multiplayer server - assigned Player ${playerId}`);
  
  // Send initial game state with player assignment
  const initialMessage = {
    ...gameState,
    yourPlayerId: playerId,
    type: 'gameState'
  };
  ws.send(JSON.stringify(initialMessage));

  ws.on('message', msg => {
    const data = JSON.parse(msg);
    const clientPlayerId = players.get(ws);
    
    if (data.type === 'takeTurn') {
      console.log(`Player ${clientPlayerId} attempted to take turn. Current player: ${gameState.currentPlayer}`);
      
      // Only allow current player to take turn
      if (clientPlayerId === gameState.currentPlayer) {
        gameState.counter++;
        if (gameState.counter >= gameState.target) {
          const winner = gameState.currentPlayer;
          console.log(`Player ${winner} wins!`);
          
          // Broadcast win message
          broadcast({...gameState, winner: winner, type: 'gameState'});
          
          // Reset game state (without winner property)
          gameState.counter = 0;
          gameState.currentPlayer = 1;
          delete gameState.winner; // Clear winner property
        } else {
          gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
          // Broadcast normal game state update
          broadcast({...gameState, type: 'gameState'});
        }
      } else {
        console.log(`Rejected: Not Player ${clientPlayerId}'s turn`);
      }
    }
  });

  ws.on('close', () => {
    const playerId = players.get(ws);
    players.delete(ws);
    playerCount = Math.max(0, playerCount - 1);
    console.log(`Player ${playerId} disconnected`);
  });
});