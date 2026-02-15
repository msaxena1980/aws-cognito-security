#!/usr/bin/env node

/**
 * AWS Cognito Security Demo - Complete Infrastructure Stack
 * FREE TIER OPTIMIZED - All CDK code in one file
 * 
 * Usage:
 *   node stack.js deploy   - Deploy the stack
 *   node stack.js destroy  - Destroy the stack
 */

import * as cdk from 'aws-cdk-lib';

// ============================================================================
// STACK DEFINITION
// ============================================================================

class InfraStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // 1. COGNITO USER POOL
    const userPool = new cdk.aws_cognito.UserPool(this, 'UserPoolV2', {
      userPoolName: 'aws-cognito-security-user-pool',
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      standardAttributes: {
        email: { required: true, mutable: true },
      },
      autoVerify: { email: true },
      mfa: cdk.aws_cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
      },
      accountRecovery: cdk.aws_cognito.AccountRecovery.EMAIL_AND_PHONE_WITHOUT_MFA,
      advancedSecurityMode: cdk.aws_cognito.AdvancedSecurityMode.OFF,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = new cdk.aws_cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool,
      userPoolClientName: 'aws-cognito-security-app-client',
      authFlows: {
        adminUserPassword: true,
        custom: true,
        userPassword: true,
        userSrp: true,
      },
      supportedIdentityProviders: [cdk.aws_cognito.UserPoolClientIdentityProvider.COGNITO],
    });

    // 2. DYNAMODB TABLES (FREE TIER: Provisioned 1 RCU/WCU)
    const userSecurityTable = new cdk.aws_dynamodb.Table(this, 'UserSecurityTable', {
      tableName: 'UserSecurity',
      partitionKey: { name: 'pk', type: cdk.aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: cdk.aws_dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: cdk.aws_dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
    });

    userSecurityTable.addGlobalSecondaryIndex({
      indexName: 'EmailIndex',
      partitionKey: { name: 'email', type: cdk.aws_dynamodb.AttributeType.STRING },
      projectionType: cdk.aws_dynamodb.ProjectionType.ALL,
      readCapacity: 1,
      writeCapacity: 1,
    });

    const emailMappingTable = new cdk.aws_dynamodb.Table(this, 'EmailMappingTable', {
      tableName: 'EmailMapping',
      partitionKey: { name: 'email', type: cdk.aws_dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: cdk.aws_dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
    });

    emailMappingTable.addGlobalSecondaryIndex({
      indexName: 'SubIndex',
      partitionKey: { name: 'sub', type: cdk.aws_dynamodb.AttributeType.STRING },
      projectionType: cdk.aws_dynamodb.ProjectionType.ALL,
      readCapacity: 1,
      writeCapacity: 1,
    });

    const deviceTrackingTable = new cdk.aws_dynamodb.Table(this, 'DeviceTrackingTable', {
      tableName: 'DeviceTracking',
      partitionKey: { name: 'userSub', type: cdk.aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'deviceId', type: cdk.aws_dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      billingMode: cdk.aws_dynamodb.BillingMode.PROVISIONED,
      readCapacity: 1,
      writeCapacity: 1,
    });

    deviceTrackingTable.addGlobalSecondaryIndex({
      indexName: 'LastLoginIndex',
      partitionKey: { name: 'userSub', type: cdk.aws_dynamodb.AttributeType.STRING },
      sortKey: { name: 'lastLogin', type: cdk.aws_dynamodb.AttributeType.STRING },
      projectionType: cdk.aws_dynamodb.ProjectionType.ALL,
      readCapacity: 1,
      writeCapacity: 1,
    });

    // 2.5. KMS KEY for passphrase encryption
    const kmsKey = new cdk.aws_kms.Key(this, 'PassphraseEncryptionKey', {
      description: 'KMS key for encrypting user passphrases',
      enableKeyRotation: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 3. LAMBDA FUNCTIONS - Cognito Triggers (FREE TIER: 128MB)
    const preSignUpLambda = new cdk.aws_lambda.Function(this, 'PreSignUpHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      handler: 'preSignUp.handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(3),
      environment: { TABLE_NAME: userSecurityTable.tableName },
    });

    const postConfirmationLambda = new cdk.aws_lambda.Function(this, 'PostConfirmationHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      handler: 'postConfirmation.handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(3),
      environment: {
        TABLE_NAME: userSecurityTable.tableName,
        EMAIL_MAPPING_TABLE: emailMappingTable.tableName,
      },
    });

    const postAuthenticationLambda = new cdk.aws_lambda.Function(this, 'PostAuthenticationHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      handler: 'postAuthentication.handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      environment: {
        TABLE_NAME: userSecurityTable.tableName,
        DEVICE_TABLE: deviceTrackingTable.tableName,
        SES_SENDER_EMAIL: process.env.SES_SENDER_EMAIL ?? 'noreply@example.com',
      },
    });

    // Grant permissions and add triggers
    userSecurityTable.grantReadWriteData(preSignUpLambda);
    userSecurityTable.grantReadWriteData(postConfirmationLambda);
    emailMappingTable.grantReadWriteData(postConfirmationLambda);
    userSecurityTable.grantReadWriteData(postAuthenticationLambda);
    deviceTrackingTable.grantReadWriteData(postAuthenticationLambda);

    postAuthenticationLambda.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    }));

    userPool.addTrigger(cdk.aws_cognito.UserPoolOperation.PRE_SIGN_UP, preSignUpLambda);
    userPool.addTrigger(cdk.aws_cognito.UserPoolOperation.POST_CONFIRMATION, postConfirmationLambda);
    userPool.addTrigger(cdk.aws_cognito.UserPoolOperation.POST_AUTHENTICATION, postAuthenticationLambda);

    // 4. LAMBDA FUNCTIONS - API Endpoints
    const helloLambda = new cdk.aws_lambda.Function(this, 'HelloHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      handler: 'hello.handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(3),
      environment: { TABLE_NAME: userSecurityTable.tableName },
    });
    userSecurityTable.grantReadWriteData(helloLambda);

    const getAuthMethodsLambda = new cdk.aws_lambda.Function(this, 'GetAuthMethodsHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      handler: 'getAuthMethods.handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(3),
      environment: {
        TABLE_NAME: userSecurityTable.tableName,
        EMAIL_MAPPING_TABLE: emailMappingTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
      },
    });
    userSecurityTable.grantReadData(getAuthMethodsLambda);
    emailMappingTable.grantReadData(getAuthMethodsLambda);
    getAuthMethodsLambda.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['cognito-idp:ListUsers'],
      resources: [userPool.userPoolArn],
    }));

    const vaultLambda = new cdk.aws_lambda.Function(this, 'UserVaultHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      handler: 'vault.handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      environment: {
        TABLE_NAME: userSecurityTable.tableName,
        KMS_KEY_ID: kmsKey.keyId,
      },
    });
    userSecurityTable.grantReadWriteData(vaultLambda);
    kmsKey.grantEncryptDecrypt(vaultLambda);

    const accountLambda = new cdk.aws_lambda.Function(this, 'AccountHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      handler: 'account.handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      environment: {
        TABLE_NAME: userSecurityTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
        KMS_KEY_ID: kmsKey.keyId,
        SES_SENDER_EMAIL: process.env.SES_SENDER_EMAIL ?? 'noreply@example.com',
      },
    });
    userSecurityTable.grantReadWriteData(accountLambda);
    kmsKey.grantDecrypt(accountLambda);
    accountLambda.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['cognito-idp:AdminDeleteUser'],
      resources: [userPool.userPoolArn],
    }));
    accountLambda.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    }));

    const profileLambda = new cdk.aws_lambda.Function(this, 'ProfileHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      handler: 'profile.handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(3),
      environment: { TABLE_NAME: userSecurityTable.tableName },
    });
    userSecurityTable.grantReadWriteData(profileLambda);

    const phoneLambda = new cdk.aws_lambda.Function(this, 'PhoneVerificationHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      handler: 'phone.handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      environment: {
        TABLE_NAME: userSecurityTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
        DEV_SMS_MODE: process.env.DEV_SMS_MODE ?? 'inline',
        SES_SENDER_EMAIL: process.env.SES_SENDER_EMAIL ?? 'noreply@example.com',
      },
    });
    userSecurityTable.grantReadWriteData(phoneLambda);
    phoneLambda.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['cognito-idp:AdminUpdateUserAttributes'],
      resources: [userPool.userPoolArn],
    }));
    phoneLambda.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    }));

    const emailChangeLambda = new cdk.aws_lambda.Function(this, 'EmailChangeHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      handler: 'emailChange.handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      environment: {
        TABLE_NAME: userSecurityTable.tableName,
        USER_POOL_ID: userPool.userPoolId,
        DEV_EMAIL_MODE: process.env.DEV_EMAIL_MODE ?? 'inline',
        SES_SENDER_EMAIL: process.env.SES_SENDER_EMAIL ?? 'noreply@example.com',
      },
    });
    userSecurityTable.grantReadWriteData(emailChangeLambda);
    emailChangeLambda.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['cognito-idp:AdminUpdateUserAttributes'],
      resources: [userPool.userPoolArn],
    }));
    emailChangeLambda.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    }));

    const verifyCredentialsLambda = new cdk.aws_lambda.Function(this, 'VerifyCredentialsHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      handler: 'verifyCredentials.handler',
      memorySize: 128,
      timeout: cdk.Duration.seconds(5),
      environment: {
        COGNITO_CLIENT_ID: userPoolClient.userPoolClientId,
      },
    });
    verifyCredentialsLambda.addToRolePolicy(new cdk.aws_iam.PolicyStatement({
      actions: ['cognito-idp:InitiateAuth', 'cognito-idp:RespondToAuthChallenge'],
      resources: [userPool.userPoolArn],
    }));

    // 5. API GATEWAY
    const api = new cdk.aws_apigateway.RestApi(this, 'AuthApi', {
      restApiName: 'Cognito Security Demo API',
      defaultCorsPreflightOptions: {
        allowOrigins: cdk.aws_apigateway.Cors.ALL_ORIGINS,
        allowMethods: cdk.aws_apigateway.Cors.ALL_METHODS,
      },
      deployOptions: {
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
      },
    });

    const authorizer = new cdk.aws_apigateway.CognitoUserPoolsAuthorizer(this, 'ApiAuthorizer', {
      cognitoUserPools: [userPool],
    });

    // API Routes
    api.root.addResource('hello').addMethod('GET', 
      new cdk.aws_apigateway.LambdaIntegration(helloLambda), 
      { authorizer, authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO }
    );

    api.root.addResource('auth-methods').addMethod('GET', 
      new cdk.aws_apigateway.LambdaIntegration(getAuthMethodsLambda)
    );

    const vaultResource = api.root.addResource('vault');
    vaultResource.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(vaultLambda), 
      { authorizer, authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO });
    vaultResource.addMethod('PUT', new cdk.aws_apigateway.LambdaIntegration(vaultLambda), 
      { authorizer, authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO });

    const passphraseResource = api.root.addResource('passphrase');
    passphraseResource.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(vaultLambda), 
      { authorizer, authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO });
    passphraseResource.addMethod('POST', new cdk.aws_apigateway.LambdaIntegration(vaultLambda), 
      { authorizer, authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO });
    passphraseResource.addResource('verify').addMethod('POST', 
      new cdk.aws_apigateway.LambdaIntegration(vaultLambda), 
      { authorizer, authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO }
    );

    const accountResource = api.root.addResource('account');
    const deleteResource = accountResource.addResource('delete');
    deleteResource.addResource('start').addMethod('POST', 
      new cdk.aws_apigateway.LambdaIntegration(accountLambda), 
      { authorizer, authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO }
    );
    deleteResource.addResource('verify').addMethod('POST', 
      new cdk.aws_apigateway.LambdaIntegration(accountLambda), 
      { authorizer, authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO }
    );
    deleteResource.addResource('complete').addMethod('POST', 
      new cdk.aws_apigateway.LambdaIntegration(accountLambda), 
      { authorizer, authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO }
    );

    const profileResource = api.root.addResource('profile');
    profileResource.addMethod('GET', new cdk.aws_apigateway.LambdaIntegration(profileLambda), 
      { authorizer, authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO });
    profileResource.addMethod('PUT', new cdk.aws_apigateway.LambdaIntegration(profileLambda), 
      { authorizer, authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO });

    const phoneRes = profileResource.addResource('phone');
    phoneRes.addResource('start').addMethod('POST', 
      new cdk.aws_apigateway.LambdaIntegration(phoneLambda), 
      { authorizer, authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO }
    );
    phoneRes.addResource('verify-old').addMethod('POST', 
      new cdk.aws_apigateway.LambdaIntegration(phoneLambda), 
      { authorizer, authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO }
    );
    phoneRes.addResource('verify-new').addMethod('POST', 
      new cdk.aws_apigateway.LambdaIntegration(phoneLambda), 
      { authorizer, authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO }
    );

    const emailRes = profileResource.addResource('email');
    emailRes.addResource('start').addMethod('POST', 
      new cdk.aws_apigateway.LambdaIntegration(emailChangeLambda), 
      { authorizer, authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO }
    );
    emailRes.addResource('verify-old').addMethod('POST', 
      new cdk.aws_apigateway.LambdaIntegration(emailChangeLambda), 
      { authorizer, authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO }
    );
    emailRes.addResource('verify-new').addMethod('POST', 
      new cdk.aws_apigateway.LambdaIntegration(emailChangeLambda), 
      { authorizer, authorizationType: cdk.aws_apigateway.AuthorizationType.COGNITO }
    );

    const verifyCredsResource = api.root.addResource('verify-credentials');
    verifyCredsResource.addMethod('POST', 
      new cdk.aws_apigateway.LambdaIntegration(verifyCredentialsLambda)
      // No authorizer - we verify credentials in the Lambda itself
    );

    // CORS error handling
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

    // OUTPUTS
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

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'The URL of the API Gateway',
    });
  }
}

// ============================================================================
// CDK APP
// ============================================================================

const app = new cdk.App();

new InfraStack(app, 'InfraStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: 'us-east-1',
  },
  description: 'AWS Cognito Security Demo (Free Tier Optimized)',
});

app.synth();
