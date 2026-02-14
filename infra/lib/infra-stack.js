import * as cdk from 'aws-cdk-lib';

/**
 * Infra stack including Cognito, Lambda triggers, API Gateway, 
 * and a cost-optimized DynamoDB table.
 */
export class InfraStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // 1. Cognito User Pool
    const userPool = new cdk.aws_cognito.UserPool(this, 'UserPoolV2', {
      userPoolName: 'aws-cognito-security-user-pool',
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
      },
      signInCaseSensitive: false,
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
      },
      autoVerify: {
        email: true,
      },
      mfa: cdk.aws_cognito.Mfa.OPTIONAL,
      mfaMethods: {
        sms: true,
        totp: true,
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cdk.aws_cognito.AccountRecovery.EMAIL_AND_PHONE_WITHOUT_MFA,
      advancedSecurityMode: cdk.aws_cognito.AdvancedSecurityMode.OFF, // Set to OFF for strict Free Tier compliance
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Enable Passkeys (WebAuthn) and Email OTP via escape hatch
    // This requires the "Essentials" plan (advancedSecurityMode: ESSENTIALS)
    const cfnUserPool = userPool.node.defaultChild;
    // Fix: CloudFormation uses different property names for the SignInConfig override
    // Using UserPoolPolicy or direct Authentication configuration might be better
    // but for now let's use the correct CFN structure if possible, or remove the problematic override
    // cfnUserPool.addPropertyOverride('SignInConfig', {
    //   SignInAuthDesignatedFactors: ['PASSWORD', 'EMAIL_OTP', 'WEB_AUTHN']
    // });
    
    // Alternative: Use UserPoolPolicy or other supported properties if needed
    // For now, removing the unsupported property to fix deployment

    // 2. Cognito User Pool Client
    const userPoolClient = new cdk.aws_cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: 'aws-cognito-security-app-client',
      authFlows: {
        adminUserPassword: true,
        custom: true,
        userPassword: true,
        userSrp: true,
      },
      // Supported identity providers (Cognito is default)
      supportedIdentityProviders: [cdk.aws_cognito.UserPoolClientIdentityProvider.COGNITO],
    });

    // Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
      description: 'The ID of the User Pool',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
      description: 'The ID of the User Pool Client',
    });

    new cdk.CfnOutput(this, 'Region', {
      value: this.region,
      description: 'The AWS Region',
    });

    // 3. DynamoDB Table (Single Table Design)
    const table = new cdk.aws_dynamodb.Table(this, 'UserSecurityTable', {
       tableName: 'UserSecurity',
       partitionKey: { name: 'pk', type: cdk.aws_dynamodb.AttributeType.STRING },
       sortKey: { name: 'sk', type: cdk.aws_dynamodb.AttributeType.STRING },
       removalPolicy: cdk.RemovalPolicy.DESTROY, // For demo
       billingMode: cdk.aws_dynamodb.BillingMode.PROVISIONED,
       readCapacity: 5,
       writeCapacity: 5,
     });

    // Add GSI for email lookup
    table.addGlobalSecondaryIndex({
      indexName: 'EmailIndex',
      partitionKey: { name: 'email', type: cdk.aws_dynamodb.AttributeType.STRING },
      projectionType: cdk.aws_dynamodb.ProjectionType.ALL,
    });

    // 4. Lambda Functions for Cognito Triggers
    const preSignUpLambda = new cdk.aws_lambda.Function(this, 'PreSignUpHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      handler: 'preSignUp.handler',
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const postConfirmationLambda = new cdk.aws_lambda.Function(this, 'PostConfirmationHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      handler: 'postConfirmation.handler',
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    const postAuthenticationLambda = new cdk.aws_lambda.Function(this, 'PostAuthenticationHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      handler: 'postAuthentication.handler',
      environment: {
        TABLE_NAME: table.tableName,
        // SES_SENDER_EMAIL: 'your-verified-email@example.com', // Should be set by user or via parameter
      },
    });

    // Grant permissions
     table.grantReadWriteData(preSignUpLambda);
     table.grantReadWriteData(postConfirmationLambda);
     table.grantReadWriteData(postAuthenticationLambda);
     
     // Grant SES permission to PostAuthentication Lambda
     postAuthenticationLambda.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
       actions: ['ses:SendEmail', 'ses:SendRawEmail'],
       resources: ['*'], // In production, restrict to specific verified identities
     }));
 
     // Add triggers to User Pool
     userPool.addTrigger(cdk.aws_cognito.UserPoolOperation.PRE_SIGN_UP, preSignUpLambda);
     userPool.addTrigger(cdk.aws_cognito.UserPoolOperation.POST_CONFIRMATION, postConfirmationLambda);
     userPool.addTrigger(cdk.aws_cognito.UserPoolOperation.POST_AUTHENTICATION, postAuthenticationLambda);

    // 5. Existing Hello Lambda (Updated to use new table)
    const helloLambda = new cdk.aws_lambda.Function(this, 'HelloHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      handler: 'hello.handler',
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    table.grantReadWriteData(helloLambda);

    // 6. Get Auth Methods Lambda
    const getAuthMethodsLambda = new cdk.aws_lambda.Function(this, 'GetAuthMethodsHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      handler: 'getAuthMethods.handler',
      environment: {
        TABLE_NAME: table.tableName,
        USER_POOL_ID: userPool.userPoolId,
      },
    });

    table.grantReadData(getAuthMethodsLambda);
    
    // Grant ListUsers permission to check if user exists in Cognito
    getAuthMethodsLambda.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['cognito-idp:ListUsers'],
      resources: [userPool.userPoolArn],
    }));

    // 7. API Gateway with Cognito Authorizer
    const api = new cdk.aws_apigateway.RestApi(this, 'AuthApi', {
      restApiName: 'Cognito Security Demo API',
      defaultCorsPreflightOptions: {
        allowOrigins: cdk.aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: cdk.aws_apigateway.Cors.ALL_METHODS,
      },
    });

    const authorizer = new cdk.aws_apigateway.CognitoUserPoolsAuthorizer(this, 'ApiAuthorizer', {
      cognitoUserPools: [userPool],
    });

    const helloResource = api.root.addResource('hello');
    helloResource.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(helloLambda), {
      authorizer,
      authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO,
    });

    const authMethodsResource = api.root.addResource('auth-methods');
    authMethodsResource.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(getAuthMethodsLambda)); // Public endpoint

    // Add Gateway Responses to handle CORS for 4xx and 5xx errors
    api.addGatewayResponse('Default4xxResponse', {
      type: cdk.aws_apigateway.ResponseType.DEFAULT_4XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        'Access-Control-Allow-Methods': "'GET,POST,OPTIONS'",
      },
    });

    api.addGatewayResponse('Default5xxResponse', {
      type: cdk.aws_apigateway.ResponseType.DEFAULT_5XX,
      responseHeaders: {
        'Access-Control-Allow-Origin': "'*'",
        'Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        'Access-Control-Allow-Methods': "'GET,POST,OPTIONS'",
      },
    });

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'The URL of the API Gateway',
    });
  }
}
