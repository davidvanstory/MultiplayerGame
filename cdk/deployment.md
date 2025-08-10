# Deployment Summary - Multiplayer Game Infrastructure

## Date: 2025-08-09

## Overview
Successfully deployed a serverless multiplayer turn-based counter game using AWS CDK with AppSync (GraphQL), DynamoDB, S3, CloudFront, and Lambda.

## Architecture Components

### Frontend
- **Hosting**: S3 bucket + CloudFront CDN
- **URL**: https://d17uiucy3a9bfl.cloudfront.net
- **Files**: 
  - `index.html` - Production game interface
  - `index-debug.html` - Debug version with verbose logging

### Backend
- **API**: AWS AppSync GraphQL
- **Endpoint**: https://wdmfu2wflrhxbi3hhvaqmk64re.appsync-api.us-east-2.amazonaws.com/graphql
- **Database**: DynamoDB (single table: `GameTable`)
- **Compute**: Lambda function for AI conversion
- **Authentication**: API Key

## Key Issues Resolved

### 1. Missing JoinGame Resolver
**Problem**: Join game button did nothing - no backend resolver existed  
**Solution**: Created `JoinGameResolver` with proper UpdateItem operation and validation

### 2. GameId Mismatch
**Problem**: Frontend displayed one gameId, but backend stored a different one (using `$util.autoId()`)  
**Solution**: 
- Updated GraphQL schema to accept `gameId` in `CreateGameInput`
- Modified resolver to use frontend-provided gameId instead of auto-generating
- Frontend now generates UUID and sends it with createGame mutation

### 3. DynamoDB PutItem Error - Initial Attempt
**Problem**: "Unable to parse JSON document" error when creating games  
**Initial Solution (INCORRECT)**: Changed to `item` format thinking it was a DynamoDB structure issue  
**Result**: New error "Unsupported element '$[item]'"

### 4. AppSync VTL Format Confusion
**Problem**: "Unsupported element '$[item]'" error after attempted fix  
**Root Cause**: AppSync VTL uses different format than direct DynamoDB API  
**Learning**: AppSync requires `key` + `attributeValues`, NOT `item` structure  
**Solution**: 
- Reverted to `key` + `attributeValues` format
- **Critical**: gameId must appear in BOTH `key` AND `attributeValues` for PutItem
- This is unique to AppSync's VTL implementation

### 5. Schema Update Issues
**Problem**: AppSync wasn't recognizing schema changes from CDK deployments  
**Solution**: Used AWS CLI to directly update AppSync schema and resolvers

## Final Resolver Configurations

### CreateGameResolver (CORRECTED)
```vtl
{
  "version": "2017-02-28",
  "operation": "PutItem",
  "key": {
    "gameId": $util.dynamodb.toDynamoDBJson($ctx.args.input.gameId)
  },
  "attributeValues": {
    "gameId": $util.dynamodb.toDynamoDBJson($ctx.args.input.gameId),
    "player1": $util.dynamodb.toDynamoDBJson($ctx.args.input.player1),
    "player2": $util.dynamodb.toDynamoDBJson(null),
    "gameState": $util.dynamodb.toDynamoDBJson($ctx.args.input.gameState),
    "currentPlayer": $util.dynamodb.toDynamoDBJson(1),
    "createdAt": $util.dynamodb.toDynamoDBJson($util.time.nowISO8601()),
    "lastMove": $util.dynamodb.toDynamoDBJson($util.time.nowISO8601()),
    "winner": $util.dynamodb.toDynamoDBJson(null)
  }
}
```
**Note**: gameId appears in BOTH `key` and `attributeValues` - this is required for AppSync PutItem operations!

### JoinGameResolver
```vtl
{
  "version": "2017-02-28",
  "operation": "UpdateItem",
  "key": {
    "gameId": $util.dynamodb.toDynamoDBJson($ctx.args.gameId)
  },
  "update": {
    "expression": "SET player2 = :player2, lastMove = :time",
    "expressionValues": {
      ":player2": $util.dynamodb.toDynamoDBJson($ctx.args.player2),
      ":time": $util.dynamodb.toDynamoDBJson($util.time.nowISO8601())
    }
  },
  "condition": "attribute_exists(gameId) AND attribute_not_exists(player2)",
  "returnValues": "ALL_NEW"
}
```

## Development Workflow

### Local Development
```bash
cd cdk
npm run dev                    # Start local server on port 3000
# Edit frontend files
# Changes reflect immediately on refresh
```

### Deployment Commands
```bash
npm run build                  # Compile TypeScript
npm run deploy                 # Deploy infrastructure (5 minutes)
npm run upload                 # Upload frontend only (30 seconds)
npm run logs                   # Watch Lambda logs
```

### Testing URLs
- **Local**: http://localhost:3000
- **Local Debug**: http://localhost:3000/index-debug.html
- **Production**: https://d17uiucy3a9bfl.cloudfront.net

## Game Flow

1. **Player 1**: Creates game → Gets unique gameId → Shares with Player 2
2. **Player 2**: Enters gameId → Joins game
3. **Both Players**: Take turns incrementing counter
4. **Win Condition**: First to reach 5 wins

## Key Learnings - AppSync VTL Resolver Format

### Important Distinction: AppSync VTL vs Direct DynamoDB API

**Direct DynamoDB API** uses:
```json
{
  "Item": {
    "gameId": {"S": "abc-123"},
    "player1": {"S": "player-1"}
  }
}
```

**AppSync VTL** uses:
```vtl
{
  "key": {
    "gameId": $util.dynamodb.toDynamoDBJson("abc-123")
  },
  "attributeValues": {
    "gameId": $util.dynamodb.toDynamoDBJson("abc-123"),
    "player1": $util.dynamodb.toDynamoDBJson("player-1")
  }
}
```

### Critical Rules for AppSync Resolvers:
1. **PutItem operations**: Use `key` + `attributeValues`, NOT `item`
2. **Primary key duplication**: The primary key (gameId) must appear in BOTH `key` AND `attributeValues`
3. **UpdateItem operations**: Use `key` + `update` with expression syntax
4. **GetItem operations**: Use only `key` field

### Debugging Tips:
- "Unable to parse JSON document" → Usually means malformed VTL syntax
- "Unsupported element '$[item]'" → Using wrong structure for AppSync (using direct DynamoDB format)
- "Cannot return null for non-nullable type" → Item doesn't exist or resolver isn't returning data

## Technical Decisions

### Why AppSync Instead of WebSockets
- **Managed Infrastructure**: No servers to maintain
- **Auto-scaling**: Handles any number of players automatically
- **Built-in Persistence**: DynamoDB integration without custom code
- **Cost**: Pay-per-use instead of 24/7 server costs

### Current Implementation Trade-offs
- Using polling (2-second intervals) instead of true GraphQL subscriptions for simplicity
- No authentication beyond API key (simplified for demo)
- No game history or persistence beyond active games

## Future Improvements
- Implement true GraphQL subscriptions for real-time updates
- Add player authentication and profiles
- Store game history and statistics
- Add matchmaking functionality
- Implement reconnection logic for dropped connections

## Resources
- **AWS Account**: 971422717446
- **Region**: us-east-2
- **Stack Name**: MultiplayerGameStack
- **S3 Bucket**: multiplayergamestack-gamewebsitebucket2c6eecab-065imhplkkku
- **CloudFront Distribution**: E169RHOJSVF6H7
- **AppSync API ID**: g4rwifgmjzgplohq2tz5urx6gm