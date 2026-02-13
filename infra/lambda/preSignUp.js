import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

export const handler = async (event) => {
    console.log("PreSignUp Event:", JSON.stringify(event, null, 2));

    // We no longer initialize the profile here because the PK should be the Cognito 'sub',
    // which is only available after the user is created (e.g. in PostConfirmation).
    // This allows users to change their email without losing their profile data.

    return event;
};
