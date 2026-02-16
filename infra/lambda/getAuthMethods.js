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
    const emailMappingTable = process.env.EMAIL_MAPPING_TABLE;

    if (!email) {
        return {
            statusCode: 400,
            headers: CORS_HEADERS,
            body: JSON.stringify({ message: "Email is required" })
        };
    }

    try {
        // 1. Check Cognito first to get user status
        console.log(`Checking Cognito for user ${email}...`);
        const cognitoResponse = await cognitoClient.send(new ListUsersCommand({
            UserPoolId: userPoolId,
            Filter: `email = "${email}"`,
            Limit: 1
        }));

        if (!cognitoResponse.Users || cognitoResponse.Users.length === 0) {
            console.log(`User ${email} not found in Cognito.`);
            return {
                statusCode: 404,
                headers: CORS_HEADERS,
                body: JSON.stringify({ 
                    message: "User not found. Please sign up first.",
                    code: "UserNotFoundException"
                })
            };
        }

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

        // 2. Get user sub from email mapping
        const sub = user.Attributes?.find(attr => attr.Name === 'sub')?.Value;
        
        // 3. Check for passkeys (excluding temporary challenge records)
        let hasPasskeys = false;
        if (sub) {
            try {
                const passkeysTable = process.env.PASSKEYS_TABLE || 'Passkeys';
                const passkeysResponse = await docClient.send(new QueryCommand({
                    TableName: passkeysTable,
                    KeyConditionExpression: "userSub = :sub",
                    ExpressionAttributeValues: {
                        ":sub": sub
                    }
                }));
                
                // Filter out temporary challenge records
                const realPasskeys = (passkeysResponse.Items || []).filter(item => 
                    item.userSub === sub && 
                    !item.userSub.startsWith('CHALLENGE#') && 
                    !item.userSub.startsWith('AUTH_CHALLENGE#') &&
                    !item.userSub.startsWith('PASSKEY_VERIFIED#') &&
                    item.credentialId !== 'TEMP'
                );
                
                hasPasskeys = realPasskeys.length > 0;
                console.log(`User ${email} has ${realPasskeys.length} real passkeys`);
            } catch (err) {
                console.warn('Error checking passkeys:', err);
            }
        }

        // 4. Check DynamoDB for profile settings
        const ddbResponse = await docClient.send(new QueryCommand({
            TableName: tableName,
            IndexName: "EmailIndex",
            KeyConditionExpression: "email = :email",
            ExpressionAttributeValues: {
                ":email": email
            }
        }));

        let authMethods = { password: true };
        
        if (ddbResponse.Items && ddbResponse.Items.length > 0) {
            const userProfile = ddbResponse.Items[0];
            authMethods = userProfile.authMethods || { password: true };
        }

        // Override passkeys based on actual database state
        // Only include passkeys if user actually has them
        if (hasPasskeys) {
            authMethods.passkeys = true;
        } else {
            // Explicitly remove passkeys if they don't exist
            authMethods.passkeys = false;
            // Clean up the object - remove false values
            if (!authMethods.passkeys) {
                delete authMethods.passkeys;
            }
        }

        console.log(`Final auth methods for ${email}:`, authMethods);

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify({
                authMethods
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
