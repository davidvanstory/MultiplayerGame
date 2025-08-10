#!/bin/bash

# Automated API Key Setup Script
# This version automatically uses the key from .env without prompting

echo "==================================="
echo "OpenAI API Key Setup for Lambda"
echo "==================================="
echo ""

# Get the Lambda function name
LAMBDA_NAME=$(aws lambda list-functions --query "Functions[?starts_with(FunctionName, 'MultiplayerGameStack-AIConvertFunction')].FunctionName" --output text)

if [ -z "$LAMBDA_NAME" ]; then
    echo "Error: Lambda function not found. Make sure the stack is deployed."
    exit 1
fi

echo "Found Lambda function: $LAMBDA_NAME"

# Load the API key from .env file
if [ -f ../.env ]; then
    source ../.env
elif [ -f .env ]; then
    source .env
else
    echo "Error: .env file not found"
    exit 1
fi

if [ -z "$OPENAI_API_KEY" ]; then
    echo "Error: OPENAI_API_KEY not found in .env file"
    exit 1
fi

echo "Found OpenAI API key in .env file"

# Get current environment variables
echo "Fetching current Lambda configuration..."
CURRENT_ENV=$(aws lambda get-function-configuration --function-name $LAMBDA_NAME --query 'Environment.Variables' --output json)

# Extract individual variables
WEBSITE_BUCKET=$(echo $CURRENT_ENV | jq -r '.WEBSITE_BUCKET')
CF_DOMAIN=$(echo $CURRENT_ENV | jq -r '.CF_DOMAIN')
API_ENDPOINT=$(echo $CURRENT_ENV | jq -r '.API_ENDPOINT')
API_KEY=$(echo $CURRENT_ENV | jq -r '.API_KEY')

echo "Updating Lambda environment variables..."

# Create JSON string properly
ENV_JSON=$(cat <<EOF
{
    "OPENAI_API_KEY": "$OPENAI_API_KEY",
    "WEBSITE_BUCKET": "$WEBSITE_BUCKET",
    "CF_DOMAIN": "$CF_DOMAIN",
    "API_ENDPOINT": "$API_ENDPOINT",
    "API_KEY": "$API_KEY"
}
EOF
)

# Update with new OpenAI key while preserving other variables
aws lambda update-function-configuration \
    --function-name $LAMBDA_NAME \
    --environment "Variables=$ENV_JSON" \
    --output text > /dev/null

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Success! OpenAI API key has been securely set."
    echo ""
    echo "The key is now stored in the Lambda function's environment variables."
    echo ""
    echo "Test the AI features now:"
    echo "1. Go to: https://d17uiucy3a9bfl.cloudfront.net"
    echo "2. Click on 'Create with AI' tab"
    echo "3. Select a game template and click 'Generate Game'"
    echo ""
else
    echo "❌ Error: Failed to update Lambda configuration."
    exit 1
fi