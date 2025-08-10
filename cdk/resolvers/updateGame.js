import { util } from '@aws-appsync/utils';

export function request(ctx) {
  const now = util.time.nowISO8601();
  const input = ctx.args.input;
  
  let updateExpression = 'SET gameState = :gameState, updatedAt = :updatedAt';
  let expressionValues = {
    ':gameState': util.dynamodb.toDynamoDB(input.gameState),
    ':updatedAt': util.dynamodb.toDynamoDB(now)
  };
  
  if (input.players) {
    updateExpression += ', players = :players';
    expressionValues[':players'] = util.dynamodb.toDynamoDB(input.players);
  }
  
  if (input.metadata) {
    updateExpression += ', metadata = :metadata';
    expressionValues[':metadata'] = util.dynamodb.toDynamoDB(input.metadata);
  }
  
  return {
    operation: 'UpdateItem',
    key: {
      gameId: util.dynamodb.toDynamoDB(input.gameId)
    },
    update: {
      expression: updateExpression,
      expressionValues: expressionValues
    }
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  return ctx.result;
}