#!/bin/bash

# Test multiplayer functionality with curl

GAME_ID="manual-test-$(date +%s)"
API_URL="https://wdmfu2wflrhxbi3hhvaqmk64re.appsync-api.us-east-2.amazonaws.com/graphql"
API_KEY="da2-4kwhajemrzbojl4vs7j7bjih5a"

echo "🎮 Testing Multiplayer Game System"
echo "=================================="
echo ""

# 1. Create game
echo "1. Creating game: $GAME_ID"
curl -s -X POST $API_URL \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { createGame(input: { gameId: \\\"$GAME_ID\\\", gameType: \\\"counter\\\", initialState: \\\"{\\\\\\\"counter\\\\\\\":0,\\\\\\\"targetScore\\\\\\\":10,\\\\\\\"gameActive\\\\\\\":false,\\\\\\\"currentTurn\\\\\\\":1}\\\" }) { gameId } }\"}" | python3 -c "import sys, json; print('✅ Game created')" 2>/dev/null || echo "❌ Failed"

echo ""

# 2. Player 1 joins  
echo "2. Player 1 joining..."
RESULT=$(curl -s -X POST $API_URL \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { processGameAction(gameId: \\\"$GAME_ID\\\", action: \\\"{\\\\\\\"type\\\\\\\":\\\\\\\"JOIN\\\\\\\",\\\\\\\"playerId\\\\\\\":\\\\\\\"player1\\\\\\\",\\\\\\\"data\\\\\\\":{\\\\\\\"playerData\\\\\\\":{\\\\\\\"name\\\\\\\":\\\\\\\"Player 1\\\\\\\"}}}\\\") }\"}")

echo "$RESULT" | python3 -c "
import sys, json
data = json.loads(sys.stdin.read())
if 'data' in data and data['data']['processGameAction']:
    response = json.loads(data['data']['processGameAction'])
    if response['success']:
        print('✅ Player 1 joined successfully')
        print(f'   Players count: {response.get(\"players\", {}) and len(response[\"players\"])}')
    else:
        print(f'❌ Failed: {response.get(\"error\", \"Unknown error\")}')
else:
    print('❌ API error')
" 2>/dev/null || echo "❌ Parse error"

echo ""

# 3. Player 2 joins
echo "3. Player 2 joining..."
RESULT=$(curl -s -X POST $API_URL \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { processGameAction(gameId: \\\"$GAME_ID\\\", action: \\\"{\\\\\\\"type\\\\\\\":\\\\\\\"JOIN\\\\\\\",\\\\\\\"playerId\\\\\\\":\\\\\\\"player2\\\\\\\",\\\\\\\"data\\\\\\\":{\\\\\\\"playerData\\\\\\\":{\\\\\\\"name\\\\\\\":\\\\\\\"Player 2\\\\\\\"}}}\\\") }\"}")

echo "$RESULT" | python3 -c "
import sys, json
data = json.loads(sys.stdin.read())
if 'data' in data and data['data']['processGameAction']:
    response = json.loads(data['data']['processGameAction'])
    if response['success']:
        print('✅ Player 2 joined successfully')
        print(f'   Players count: {response.get(\"players\", {}) and len(response[\"players\"])}')
    else:
        print(f'❌ Failed: {response.get(\"error\", \"Unknown error\")}')
" 2>/dev/null || echo "❌ Parse error"

echo ""

# 4. Start game
echo "4. Starting game..."
RESULT=$(curl -s -X POST $API_URL \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { processGameAction(gameId: \\\"$GAME_ID\\\", action: \\\"{\\\\\\\"type\\\\\\\":\\\\\\\"START\\\\\\\",\\\\\\\"playerId\\\\\\\":\\\\\\\"player1\\\\\\\",\\\\\\\"data\\\\\\\":{}}\\\") }\"}")

echo "$RESULT" | python3 -c "
import sys, json
data = json.loads(sys.stdin.read())
if 'data' in data and data['data']['processGameAction']:
    response = json.loads(data['data']['processGameAction'])
    if response['success']:
        print('✅ Game started')
        state = response.get('state', {})
        print(f'   Game active: {state.get(\"gameActive\", False)}')
    else:
        print(f'❌ Failed: {response.get(\"error\", \"Unknown error\")}')
" 2>/dev/null || echo "❌ Parse error"

echo ""

# 5. Player 1 makes a move
echo "5. Player 1 incrementing counter..."
RESULT=$(curl -s -X POST $API_URL \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { processGameAction(gameId: \\\"$GAME_ID\\\", action: \\\"{\\\\\\\"type\\\\\\\":\\\\\\\"UPDATE\\\\\\\",\\\\\\\"playerId\\\\\\\":\\\\\\\"player1\\\\\\\",\\\\\\\"data\\\\\\\":{\\\\\\\"state\\\\\\\":{\\\\\\\"counter\\\\\\\":1,\\\\\\\"currentTurn\\\\\\\":2}}}\\\") }\"}")

echo "$RESULT" | python3 -c "
import sys, json
data = json.loads(sys.stdin.read())
if 'data' in data and data['data']['processGameAction']:
    response = json.loads(data['data']['processGameAction'])
    if response['success']:
        print('✅ Move successful')
        state = response.get('state', {})
        print(f'   Counter: {state.get(\"counter\", 0)}')
        print(f'   Current turn: Player {state.get(\"currentTurn\", \"?\")}')
    else:
        print(f'❌ Failed: {response.get(\"error\", \"Unknown error\")}')
" 2>/dev/null || echo "❌ Parse error"

echo ""
echo "=================================="
echo "✨ Test complete!"
echo ""
echo "📱 Test in browser: https://d17uiucy3a9bfl.cloudfront.net"
echo "   Game ID: $GAME_ID"