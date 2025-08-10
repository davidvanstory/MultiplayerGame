import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const gameType = ctx.args.gameType;
  
  if (gameType) {
    // Filter by gameType using a Query operation
    return {
      operation: 'Query',
      index: 'gameType-index',
      query: {
        expression: 'gameType = :gameType',
        expressionValues: {
          ':gameType': util.dynamodb.toDynamoDB(gameType)
        }
      }
    };
  } else {
    // Scan all games
    return {
      operation: 'Scan'
    };
  }
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result.items || [];
}