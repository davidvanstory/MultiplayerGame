import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const now = util.time.nowISO8601();
  return {
    operation: 'UpdateItem',
    key: {
      gameId: util.dynamodb.toDynamoDB(ctx.args.gameId)
    },
    update: {
      expression: 'SET player2 = :player2, lastMove = :time',
      expressionValues: {
        ':player2': util.dynamodb.toDynamoDB(ctx.args.player2),
        ':time': util.dynamodb.toDynamoDB(now)
      }
    },
    condition: {
      expression: 'attribute_exists(gameId) AND attribute_not_exists(player2)'
    }
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
}