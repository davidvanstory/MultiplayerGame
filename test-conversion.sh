#!/bin/bash

GAME_HTML=$(cat simple-tictactoe.html | sed 's/"/\\"/g' | tr -d '\n')
GAME_ID="test-fix1-$(date +%s)"

echo "Testing conversion with fixed prompt..."
echo "Game ID: $GAME_ID"

curl -s -X POST https://wdmfu2wflrhxbi3hhvaqmk64re.appsync-api.us-east-2.amazonaws.com/graphql \
  -H "x-api-key: da2-4kwhajemrzbojl4vs7j7bjih5a" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { convertToMultiplayer(gameId: \\\"$GAME_ID\\\", gameHtml: \\\"$GAME_HTML\\\") { gameId gameType conversionStatus } }\"}" | python3 -c "
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

echo ""
echo "Game will be available at: https://d17uiucy3a9bfl.cloudfront.net/games/$GAME_ID/index.html"