import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const now = util.time.nowISO8601();
  const playerInfo = ctx.args.playerInfo;
  
  // Since players is stored as AWSJSON (string), we need to update it as a string
  // The playerInfo should be a JSON string that we'll merge with existing players
  return {
    operation: 'UpdateItem',
    key: {
      gameId: util.dynamodb.toDynamoDB(ctx.args.gameId)
    },
    update: {
      expression: 'SET players = :playerInfo, updatedAt = :time',
      expressionValues: {
        ':playerInfo': util.dynamodb.toDynamoDB(playerInfo),
        ':time': util.dynamodb.toDynamoDB(now)
      }
    },
    condition: {
      expression: 'attribute_exists(gameId)'
    }
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
}