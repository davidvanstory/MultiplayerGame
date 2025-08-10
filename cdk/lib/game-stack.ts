import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as appsync from 'aws-cdk-lib/aws-appsync';
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
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
    });

    // 5. AppSync API - v2.0 with gameId support - Updated 2025-08-09
    const api = new appsync.GraphqlApi(this, 'GameAPI', {
      name: 'multiplayer-game-api-v2',
      definition: appsync.Definition.fromFile(path.join(__dirname, '../schema.graphql')),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
          apiKeyConfig: {
            expires: cdk.Expiration.after(cdk.Duration.days(365)),
            description: 'API Key for multiplayer game - v2.1 schema update',
          },
        },
      },
      xrayEnabled: false,
    });

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

    gameDataSource.createResolver('JoinGameResolver', {
      typeName: 'Mutation',
      fieldName: 'joinGame',
      runtime: appsync.FunctionRuntime.JS_1_0_0,
      code: appsync.Code.fromInline(`
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
      `),
    });

    // Connect Lambda to AppSync for AI conversion
    const lambdaDataSource = api.addLambdaDataSource('AIConvertDataSource', aiConvertLambda);
    
    lambdaDataSource.createResolver('ConvertToMultiplayerResolver', {
      typeName: 'Mutation',
      fieldName: 'convertToMultiplayer',
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