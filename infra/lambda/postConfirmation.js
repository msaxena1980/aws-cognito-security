import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
    console.log("PostConfirmation Event:", JSON.stringify(event, null, 2));

    const { email, sub } = event.request.userAttributes;
    const tableName = process.env.TABLE_NAME;

    // Use Cognito 'sub' as the Partition Key (PK) to ensure the profile 
    // remains stable even if the user changes their email.
    const userProfile = {
        pk: `USER#${sub}`,
        sk: "PROFILE",
        email: email,
        cognitoSub: sub,
        userType: "free",
        isVerified: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        authMethods: {
            emailOtp: true,
            mobileOtp: false,
            mfa: false,
            passphrase: false,
            passkeys: false
        }
    };

    try {
        await docClient.send(new PutCommand({
            TableName: tableName,
            Item: userProfile,
            // If the profile already exists (e.g. from a previous signup attempt that failed post-confirmation), 
            // we might want to update or skip. Here we use attribute_not_exists to be safe.
            ConditionExpression: "attribute_not_exists(pk)"
        }));
        console.log(`Successfully initialized user profile for ${email} with sub ${sub}`);
    } catch (error) {
        if (error.name === "ConditionalCheckFailedException") {
            console.log(`User profile already exists for sub ${sub}`);
        } else {
            console.error("Error creating user profile:", error);
        }
    }

    return event;
};
