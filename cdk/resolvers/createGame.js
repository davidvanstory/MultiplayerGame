import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const now = util.time.nowISO8601();
  return {
    operation: 'PutItem',
    key: {
      gameId: util.dynamodb.toDynamoDB(ctx.args.input.gameId)
    },
    attributeValues: {
      gameId: util.dynamodb.toDynamoDB(ctx.args.input.gameId),
      player1: util.dynamodb.toDynamoDB(ctx.args.input.player1),
      gameState: util.dynamodb.toDynamoDB(ctx.args.input.gameState),
      currentPlayer: util.dynamodb.toDynamoDB(1),
      createdAt: util.dynamodb.toDynamoDB(now),
      lastMove: util.dynamodb.toDynamoDB(now)
    }
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
}