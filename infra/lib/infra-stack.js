import * as cdk from 'aws-cdk-lib';

/**
 * Minimal infra stack. Resources (Cognito, Lambda, API Gateway, DynamoDB)
 * will be added step by step in later changes.
 */
export class InfraStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // No resources yet – step-by-step additions later.
    // This stack will still be created in CloudFormation so we can list/destroy it.
  }
}
