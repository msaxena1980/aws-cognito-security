import * as cdk from 'aws-cdk-lib';

/**
 * Minimal infra stack. Resources (Cognito, Lambda, API Gateway, DynamoDB)
 * will be added step by step in later changes.
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
      advancedSecurityMode: cdk.aws_cognito.AdvancedSecurityMode.ESSENTIALS,
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

    // 3. DynamoDB Table
    const table = new cdk.aws_dynamodb.Table(this, 'DataTable', {
      partitionKey: { name: 'pk', type: cdk.aws_dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY, // For demo
      billingMode: cdk.aws_dynamodb.BillingMode.PAY_PER_REQUEST,
    });

    // 4. Lambda Function
    const helloLambda = new cdk.aws_lambda.Function(this, 'HelloHandler', {
      runtime: cdk.aws_lambda.Runtime.NODEJS_20_X,
      code: cdk.aws_lambda.Code.fromAsset('lambda'),
      handler: 'hello.handler',
      environment: {
        TABLE_NAME: table.tableName,
      },
    });

    table.grantReadWriteData(helloLambda);

    // 5. API Gateway with Cognito Authorizer
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

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
      description: 'The URL of the API Gateway',
    });
  }
}
