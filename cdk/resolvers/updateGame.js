import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const now = util.time.nowISO8601();
  return {
    operation: 'UpdateItem',
    key: {
      gameId: util.dynamodb.toDynamoDB(ctx.args.gameId)
    },
    update: {
      expression: 'SET gameState = :state, currentPlayer = :player, lastMove = :time',
      expressionValues: {
        ':state': util.dynamodb.toDynamoDB(ctx.args.state),
        ':player': util.dynamodb.toDynamoDB(ctx.args.currentPlayer),
        ':time': util.dynamodb.toDynamoDB(now)
      }
    }
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
}