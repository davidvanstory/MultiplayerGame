import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

// This is an example of how to use AWS Secrets Manager for production
// It shows the secure way to handle API keys in AWS

export class SecureGameStackExample extends Construct {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // Option 1: Create a new secret (run this once)
    const openAISecret = new secretsmanager.Secret(this, 'OpenAIApiKey', {
      description: 'OpenAI API Key for game generation',
      secretName: 'multiplayer-game/openai-api-key',
    });

    // Option 2: Reference an existing secret (if you already created it)
    // const openAISecret = secretsmanager.Secret.fromSecretNameV2(
    //   this,
    //   'OpenAIApiKey',
    //   'multiplayer-game/openai-api-key'
    // );

    // Grant the Lambda function permission to read the secret
    // In your main stack, you would add:
    // openAISecret.grantRead(aiConvertLambda);

    // Then in the Lambda environment variables, reference the secret:
    // environment: {
    //   OPENAI_SECRET_ARN: openAISecret.secretArn,
    //   // ... other variables
    // }
  }
}

// Lambda code to retrieve the secret:
export const lambdaSecretRetrieval = `
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

async function getOpenAIKey() {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
  try {
    const response = await client.send(
      new GetSecretValueCommand({
        SecretId: process.env.OPENAI_SECRET_ARN,
      })
    );
    return response.SecretString;
  } catch (error) {
    console.error('Error retrieving secret:', error);
    throw error;
  }
}

// Use in your handler:
const openAIKey = await getOpenAIKey();
`;