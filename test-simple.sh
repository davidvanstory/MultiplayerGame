#!/bin/bash

GAME_ID="test-$(date +%s)"
echo "Testing conversion..."
echo "Game ID: $GAME_ID"

# Create JSON payload file
cat > payload.json << 'EOF'
{
  "query": "mutation ConvertGame($gameId: ID!, $gameHtml: String!) { convertToMultiplayer(gameId: $gameId, gameHtml: $gameHtml) { gameId gameType conversionStatus } }",
  "variables": {
    "gameId": "GAME_ID_PLACEHOLDER",
    "gameHtml": "GAME_HTML_PLACEHOLDER"
  }
}
EOF

# Read and escape game HTML
GAME_HTML=$(cat simple-tictactoe.html | jq -Rs .)

# Update placeholders
sed -i "s/GAME_ID_PLACEHOLDER/$GAME_ID/" payload.json
sed -i "s/\"GAME_HTML_PLACEHOLDER\"/$GAME_HTML/" payload.json

# Send request
curl -s -X POST https://wdmfu2wflrhxbi3hhvaqmk64re.appsync-api.us-east-2.amazonaws.com/graphql \
  -H "x-api-key: da2-4kwhajemrzbojl4vs7j7bjih5a" \
  -H "Content-Type: application/json" \
  -d @payload.json | python3 -c "
import sys, json
try:
    data = json.loads(sys.stdin.read())
    if 'data' in data:
        result = data['data']['convertToMultiplayer']
        print('Success!')
        print(f'Game ID: {result[\"gameId\"]}')
        print(f'Status: {result[\"conversionStatus\"]}')
    else:
        print('Error:', data.get('errors', 'Unknown error'))
except Exception as e:
    print('Parse error:', e)
"

rm payload.json
echo ""
echo "Game will be available at: https://d17uiucy3a9bfl.cloudfront.net/games/$GAME_ID/index.html"