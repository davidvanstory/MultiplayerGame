# 🛠️ Debug & Development Guide

## Quick Start

### 1. Local Development
```bash
cd cdk
npm run dev
# Open http://localhost:3000 in browser
# Edit frontend/index.html and refresh browser
```

### 2. Debug Mode
Open http://localhost:3000/index-debug.html for:
- Real-time debug console
- API connection testing
- State inspection
- Detailed error messages

## Available Commands

```bash
# Local development server
npm run dev

# Deploy infrastructure changes
npm run deploy

# Upload frontend changes only (faster)
npm run upload

# Watch Lambda logs in real-time
npm run logs

# Build TypeScript
npm run build
```

## Debugging Methods

### 1. Frontend Debugging
- **Browser DevTools**: F12 → Console tab
- **Debug HTML**: Use index-debug.html for verbose logging
- **Network Tab**: Monitor API calls to AppSync

### 2. Backend Debugging

#### AppSync Queries (Test in Browser Console)
```javascript
// Test API connection
fetch('https://wdmfu2wflrhxbi3hhvaqmk64re.appsync-api.us-east-2.amazonaws.com/graphql', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'da2-4kwhajemrzbojl4vs7j7bjih5a'
  },
  body: JSON.stringify({
    query: '{ __typename }'
  })
}).then(r => r.json()).then(console.log)
```

#### Lambda Logs
```bash
# View recent logs
aws logs tail /aws/lambda/MultiplayerGameStack-AIConvertFunction

# Follow logs in real-time
npm run logs
```

#### DynamoDB
```bash
# View all games
aws dynamodb scan --table-name MultiplayerGameStack-GameTable* --region us-east-2

# Query specific game
aws dynamodb get-item --table-name MultiplayerGameStack-GameTable* \
  --key '{"gameId":{"S":"YOUR_GAME_ID"}}' --region us-east-2
```

## Common Issues & Solutions

### 1. API Connection Failed
- Check API_KEY and API_ENDPOINT in index.html
- Verify CORS is enabled (should be by default)
- Check browser console for detailed errors

### 2. Game State Not Updating
- Open Network tab to see if polling is working
- Check DynamoDB table has the game entry
- Use "Force Refresh" button in debug mode

### 3. Lambda Function Errors
```bash
# Check Lambda logs
npm run logs

# Test Lambda directly
aws lambda invoke --function-name MultiplayerGameStack-AIConvertFunction \
  --payload '{"arguments":{"gameHtml":"<html>test</html>"}}' \
  response.json --region us-east-2
```

## Development Workflow

1. **Make changes locally**
   ```bash
   # Edit frontend/index.html
   # Test at http://localhost:3000
   ```

2. **Deploy when ready**
   ```bash
   # Frontend only (30 seconds)
   npm run upload
   
   # Full stack update (5 minutes)
   npm run deploy
   ```

3. **Monitor in production**
   - CloudWatch Logs: https://console.aws.amazon.com/cloudwatch
   - DynamoDB: https://console.aws.amazon.com/dynamodb
   - AppSync: https://console.aws.amazon.com/appsync

## URLs

- **Production**: https://d17uiucy3a9bfl.cloudfront.net
- **Local Dev**: http://localhost:3000
- **Debug Mode**: http://localhost:3000/index-debug.html
- **GraphQL API**: https://wdmfu2wflrhxbi3hhvaqmk64re.appsync-api.us-east-2.amazonaws.com/graphql