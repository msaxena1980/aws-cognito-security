#!/usr/bin/env node

import * as cdk from 'aws-cdk-lib';
import { InfraStack } from '../lib/infra-stack.js';

const app = new cdk.App();

new InfraStack(app, 'InfraStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  description: 'AWS Cognito Security Demo: Cognito User Pool and App Client',
});
