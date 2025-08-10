#!/bin/bash

# Safe API Key Setup Script
# This script helps you securely set your OpenAI API key in AWS

echo "==================================="
echo "OpenAI API Key Setup for Lambda"
echo "==================================="
echo ""
echo "This script will securely configure your OpenAI API key."
echo "Your key will be stored in AWS Lambda environment variables."
echo ""

# Get the Lambda function name
LAMBDA_NAME=$(aws lambda list-functions --query "Functions[?starts_with(FunctionName, 'MultiplayerGameStack-AIConvertFunction')].FunctionName" --output text)

if [ -z "$LAMBDA_NAME" ]; then
    echo "Error: Lambda function not found. Make sure the stack is deployed."
    exit 1
fi

echo "Found Lambda function: $LAMBDA_NAME"
echo ""

# Check if .env file exists in current or parent directory
if [ -f .env ]; then
    # Try to read from .env file
    source .env
elif [ -f ../.env ]; then
    # Try parent directory
    source ../.env
fi

if [ ! -z "$OPENAI_API_KEY" ]; then
    echo "Found OPENAI_API_KEY in .env file"
    read -p "Use this key? (y/n): " USE_ENV_KEY
    if [ "$USE_ENV_KEY" != "y" ]; then
        OPENAI_API_KEY=""
    fi
fi

# If no key from .env or user declined, prompt for it
if [ -z "$OPENAI_API_KEY" ]; then
    echo "Please enter your OpenAI API key:"
    read -s OPENAI_API_KEY
    echo ""
fi

# Validate the key format (updated for new format)
if [[ ! "$OPENAI_API_KEY" =~ ^sk-proj-[a-zA-Z0-9_-]+$ ]] && [[ ! "$OPENAI_API_KEY" =~ ^sk-[a-zA-Z0-9]{48}$ ]]; then
    echo "Warning: The API key format looks unusual."
    echo "OpenAI keys typically start with 'sk-' or 'sk-proj-'"
    read -p "Continue anyway? (y/n): " CONTINUE
    if [ "$CONTINUE" != "y" ]; then
        exit 1
    fi
fi

# Get current environment variables
echo "Fetching current Lambda configuration..."
CURRENT_ENV=$(aws lambda get-function-configuration --function-name $LAMBDA_NAME --query 'Environment.Variables' --output json)

# Update with new OpenAI key while preserving other variables
echo "Updating Lambda environment variables..."
aws lambda update-function-configuration \
    --function-name $LAMBDA_NAME \
    --environment Variables="{
        \"OPENAI_API_KEY\":\"$OPENAI_API_KEY\",
        \"WEBSITE_BUCKET\":\"$(echo $CURRENT_ENV | jq -r '.WEBSITE_BUCKET')\",
        \"CF_DOMAIN\":\"$(echo $CURRENT_ENV | jq -r '.CF_DOMAIN')\",
        \"API_ENDPOINT\":\"$(echo $CURRENT_ENV | jq -r '.API_ENDPOINT')\",
        \"API_KEY\":\"$(echo $CURRENT_ENV | jq -r '.API_KEY')\"
    }" \
    --output text > /dev/null

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Success! OpenAI API key has been securely set."
    echo ""
    echo "The key is now stored in the Lambda function's environment variables."
    echo "It will be used for all AI game generation and conversion operations."
    echo ""
    echo "To test the AI features:"
    echo "1. Go to: https://d17uiucy3a9bfl.cloudfront.net"
    echo "2. Click on 'Create with AI' tab"
    echo "3. Select a game template and click 'Generate Game'"
    echo ""
else
    echo "❌ Error: Failed to update Lambda configuration."
    echo "Please check your AWS credentials and try again."
    exit 1
fi