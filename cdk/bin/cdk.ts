#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { GameStack } from '../lib/game-stack';

const app = new cdk.App();
new GameStack(app, 'MultiplayerGameStack', {
  env: { 
    account: process.env.CDK_DEFAULT_ACCOUNT, 
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1' 
  },
});