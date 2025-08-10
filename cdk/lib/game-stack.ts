import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { Construct } from 'constructs';

export class GameStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. S3 Bucket for static hosting (private, accessed via CloudFront only)
    const websiteBucket = new s3.Bucket(this, 'GameWebsiteBucket', {
      cors: [{
        allowedMethods: [s3.HttpMethods.GET],
        allowedOrigins: ['*'],
        allowedHeaders: ['*'],
      }],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // 2. CloudFront Distribution with Origin Access Identity
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'GameOAI', {
      comment: 'OAI for game website',
    });

    const distribution = new cloudfront.Distribution(this, 'GameDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(websiteBucket, {
          originAccessIdentity: originAccessIdentity,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: 'index.html',
    });

    // 3. DynamoDB Table for game state
    const gameTable = new dynamodb.Table(this, 'GameTable', {
      partitionKey: { name: 'gameId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 4. Lambda function for AI conversion
    const aiConvertLambda = new lambda.Function(this, 'AIConvertFunction', {
      runtime: lambda.Runtime.NODEJS_20_X,
      code: lambda.Code.fromAsset(path.join(__dirname, '../lambda')),
      handler: 'ai-convert.handler',
      environment: {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || 'YOUR_API_KEY_HERE',
        WEBSITE_BUCKET: websiteBucket.bucketName,
        CF_DOMAIN: distribution.distributionDomainName,
        API_ENDPOINT: '', // Will be set after API is created
        API_KEY: '', // Will be set after API is created
      },
      timeout: cdk.Duration.minutes(2),
      memorySize: 512,
    });

    // Grant S3 write permissions for games/* path
    websiteBucket.grantWrite(aiConvertLambda, 'games/*');

    // 5. AppSync API - v3.0 with flexible game state support
    const api = new appsync.GraphqlApi(this, 'GameAPI', {
      name: 'multiplayer-game-api-v3',
      definition: appsync.Definition.fromFile(path.join(__dirname, '../schema.graphql')),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
          apiKeyConfig: {
            expires: cdk.Expiration.after(cdk.Duration.days(365)),
            description: 'API Key for flexible multiplayer game system - v3.0',
          },
        },
      },
      xrayEnabled: false,
    });

    // Update Lambda environment variables with API details
    aiConvertLambda.addEnvironment('API_ENDPOINT', api.graphqlUrl);
    aiConvertLambda.addEnvironment('API_KEY', api.apiKey || '');

    // 6. Connect AppSync to DynamoDB
    const gameDataSource = api.addDynamoDbDataSource('GameDataSource', gameTable);

    // Create resolvers for each operation using JavaScript resolvers (not VTL)
    gameDataSource.createResolver('CreateGameResolver', {
      typeName: 'Mutation',
      fieldName: 'createGame',
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      code: appsync.Code.fromInline(`
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
      `),
    });

    gameDataSource.createResolver('GetGameResolver', {
      typeName: 'Query',
      fieldName: 'getGame',
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      code: appsync.Code.fromInline(`
        import { util } from '@aws-appsync/utils';
        
        export function request(ctx) {
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
          return ctx.result;
        }
      `),
    });

    gameDataSource.createResolver('ListGamesResolver', {
      typeName: 'Query',
      fieldName: 'listGames',
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      code: appsync.Code.fromInline(`
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
      `),
    });

    gameDataSource.createResolver('JoinGameResolver', {
      typeName: 'Mutation',
      fieldName: 'joinGame',
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      code: appsync.Code.fromInline(`
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
      `),
    });

    gameDataSource.createResolver('UpdateGameResolver', {
      typeName: 'Mutation',
      fieldName: 'updateGame',
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      code: appsync.Code.fromInline(`
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
      `),
    });

    gameDataSource.createResolver('ProcessGameActionResolver', {
      typeName: 'Mutation',
      fieldName: 'processGameAction',
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      code: appsync.Code.fromInline(`
        import { util } from '@aws-appsync/utils';
        
        export function request(ctx) {
          // For now, just return the action - in Phase 2, this will call Lambda for validation
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
          // Return the action as processed - Phase 2 will add actual processing
          return ctx.args.action;
        }
      `),
    });

    // Connect Lambda to AppSync for AI conversion
    const lambdaDataSource = api.addLambdaDataSource('AIConvertDataSource', aiConvertLambda);
    
    lambdaDataSource.createResolver('ConvertToMultiplayerResolver', {
      typeName: 'Mutation',
      fieldName: 'convertToMultiplayer',
    });

    lambdaDataSource.createResolver('GenerateGameResolver', {
      typeName: 'Mutation',
      fieldName: 'generateGame',
    });

    // Outputs
    new cdk.CfnOutput(this, 'WebsiteURL', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'CloudFront URL for the game',
    });

    new cdk.CfnOutput(this, 'GraphQLEndpoint', {
      value: api.graphqlUrl,
      description: 'AppSync GraphQL endpoint',
    });

    new cdk.CfnOutput(this, 'APIKey', {
      value: api.apiKey || 'No API Key',
      description: 'API Key for AppSync',
    });

    new cdk.CfnOutput(this, 'S3BucketName', {
      value: websiteBucket.bucketName,
      description: 'S3 bucket name for uploading files',
    });
  }
}