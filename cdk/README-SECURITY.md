# API Key Security Guide

## 🔒 Security Levels

### Option 1: Quick Setup (Development) ⚡
**Security Level: ★★★☆☆**

Use the provided setup script to set your API key directly in Lambda environment variables:

```bash
cd cdk
./setup-api-key.sh
```

This script will:
1. Read from your .env file (if exists)
2. Or prompt you to enter the key
3. Set it in the Lambda function's environment
4. Never expose it to the frontend

**Pros:**
- Quick and easy
- Good for development/testing
- Key is encrypted at rest by AWS

**Cons:**
- Key visible in AWS Console to anyone with Lambda access
- Key is in environment variables (less secure than Secrets Manager)

### Option 2: AWS Secrets Manager (Production) 🏆
**Security Level: ★★★★★**

The most secure approach for production:

1. **Store the secret in AWS Secrets Manager:**
```bash
aws secretsmanager create-secret \
  --name multiplayer-game/openai-api-key \
  --description "OpenAI API Key for game generation" \
  --secret-string "sk-your-actual-key-here"
```

2. **Update CDK stack to use Secrets Manager:**
```typescript
// In cdk/lib/game-stack.ts
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

// Reference the secret
const openAISecret = secretsmanager.Secret.fromSecretNameV2(
  this,
  'OpenAIApiKey',
  'multiplayer-game/openai-api-key'
);

// Grant Lambda permission to read it
openAISecret.grantRead(aiConvertLambda);

// Add secret ARN to environment
aiConvertLambda.addEnvironment('OPENAI_SECRET_ARN', openAISecret.secretArn);
```

3. **Update Lambda to retrieve the secret:**
```javascript
// In lambda/ai-convert.js
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

async function getOpenAIKey() {
  const client = new SecretsManagerClient({ region: process.env.AWS_REGION });
  const response = await client.send(
    new GetSecretValueCommand({
      SecretId: process.env.OPENAI_SECRET_ARN,
    })
  );
  return response.SecretString;
}
```

**Pros:**
- Maximum security
- Automatic key rotation support
- Audit trail of access
- Fine-grained access control

**Cons:**
- More complex setup
- Additional AWS costs (~$0.40/month per secret)

### Option 3: Parameter Store (Budget Production) 💰
**Security Level: ★★★★☆**

A free alternative to Secrets Manager:

```bash
aws ssm put-parameter \
  --name "/multiplayer-game/openai-api-key" \
  --value "sk-your-key-here" \
  --type "SecureString"
```

Then grant Lambda permission to read from Parameter Store.

## ❌ What NOT to Do

### Never Put Keys in Frontend
```javascript
// NEVER DO THIS in index.html
const OPENAI_KEY = 'sk-abc123...'; // EXPOSED TO EVERYONE!
```

### Never Commit Keys to Git
```bash
# Always add to .gitignore
.env
*.key
secrets/
```

### Never Log Keys
```javascript
// NEVER DO THIS
console.log('Using key:', process.env.OPENAI_API_KEY); // LOGS EXPOSED!
```

## 🎯 Recommended Approach

For your use case:
1. **Development**: Use Option 1 (setup-api-key.sh script)
2. **Production**: Upgrade to Option 2 (AWS Secrets Manager)

## 🔍 How to Verify Security

Check that your key is NOT exposed:
```bash
# Search your codebase (should return nothing)
grep -r "sk-" --include="*.js" --include="*.html" --include="*.ts" .

# Check git history (should return nothing)
git log -p | grep "sk-"

# Check CloudFront (should return nothing)
curl https://your-site.cloudfront.net | grep "sk-"
```

## 📝 Quick Start

Right now, just run:
```bash
cd cdk
./setup-api-key.sh
```

Your API key from .env will be securely set in Lambda, and the AI features will start working immediately!