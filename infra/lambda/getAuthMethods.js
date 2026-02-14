import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";
import { CognitoIdentityProviderClient, ListUsersCommand } from "@aws-sdk/client-cognito-identity-provider";

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);
const cognitoClient = new CognitoIdentityProviderClient({});

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "OPTIONS,GET"
};

export const handler = async (event) => {
    console.log("GetAuthMethods Event:", JSON.stringify(event, null, 2));

    const email = event.queryStringParameters?.email;
    const tableName = process.env.TABLE_NAME;
    const userPoolId = process.env.USER_POOL_ID;

    if (!email) {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Email is required" })
        };
    }

    try {
        // 1. Check DynamoDB first
        const ddbResponse = await docClient.send(new QueryCommand({
            TableName: tableName,
            IndexName: "EmailIndex",
            KeyConditionExpression: "email = :email",
            ExpressionAttributeValues: {
                ":email": email
            }
        }));

        if (ddbResponse.Items && ddbResponse.Items.length > 0) {
            const userProfile = ddbResponse.Items[0];
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    authMethods: userProfile.authMethods || { password: true }
                })
            };
        }

        // 2. If not in DynamoDB, check Cognito
        console.log(`User ${email} not found in DynamoDB, checking Cognito...`);
        const cognitoResponse = await cognitoClient.send(new ListUsersCommand({
            UserPoolId: userPoolId,
            Filter: `email = "${email}"`,
            Limit: 1
        }));

        if (cognitoResponse.Users && cognitoResponse.Users.length > 0) {
            const user = cognitoResponse.Users[0];
            console.log(`User ${email} found in Cognito. Status: ${user.UserStatus}`);

            if (user.UserStatus === "UNCONFIRMED") {
                return {
                    statusCode: 200,
                    headers: CORS_HEADERS,
                    body: JSON.stringify({
                        status: "UNCONFIRMED",
                        message: "User is unconfirmed."
                    })
                };
            }

            console.log(`User ${email} found in Cognito but not in DynamoDB. Defaulting to password.`);
            return {
                statusCode: 200,
                headers: CORS_HEADERS,
                body: JSON.stringify({
                    authMethods: { password: true }
                })
            };
        }

        // 3. User not found anywhere
        console.log(`User ${email} not found in DynamoDB or Cognito.`);
        return {
            statusCode: 404,
            headers: CORS_HEADERS,
            body: JSON.stringify({ 
                message: "User not found. Please sign up first.",
                code: "UserNotFoundException"
            })
        };

    } catch (error) {
        console.error("Error fetching auth methods:", error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Internal server error" })
        };
    }
};
