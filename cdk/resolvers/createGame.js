import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const now = util.time.nowISO8601();
  const input = ctx.args.input;
  
  return {
    operation: 'PutItem',
    key: {
      gameId: util.dynamodb.toDynamoDB(input.gameId)
    },
    attributeValues: {
      gameId: util.dynamodb.toDynamoDB(input.gameId),
      gameType: util.dynamodb.toDynamoDB(input.gameType),
      gameHtml: util.dynamodb.toDynamoDB(input.gameHtml || ''),
      gameState: util.dynamodb.toDynamoDB(input.initialState),
      players: util.dynamodb.toDynamoDB(input.players || {}),
      metadata: util.dynamodb.toDynamoDB(input.metadata || {}),
      serverLogicUrl: util.dynamodb.toDynamoDB(''),
      createdAt: util.dynamodb.toDynamoDB(now),
      updatedAt: util.dynamodb.toDynamoDB(now)
    }
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
}