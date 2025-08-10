import { util } from '@aws-appsync/utils';

export function request(ctx) {
  // Phase 1: Just return the action as-is
  // Phase 2 will add Lambda invocation for game-specific validation
  return {
    operation: 'GetItem',
    key: {
      gameId: util.dynamodb.toDynamoDB(ctx.args.gameId)
    }
  };
}

export function response(ctx) {
  if (ctx.error) {
    util.error(ctx.error.message, ctx.error.type);
  }
  
  // For now, just return the action as processed
  // Phase 2 will add actual game logic processing
  return ctx.args.action;
}