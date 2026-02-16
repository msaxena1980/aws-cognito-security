/**
 * Verify Auth Challenge Lambda
 * Verifies the user's response to the custom challenge
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";

const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb);

export const handler = async (event) => {
  console.log('Verify Auth Challenge Event:', JSON.stringify(event, null, 2));

  const { request, response } = event;
  const passkeysTable = process.env.PASSKEYS_TABLE;
  const email = request.userAttributes?.email;

  // For passkey auth, verify the token from DynamoDB
  if (request.challengeAnswer && email) {
    const verificationKey = `PASSKEY_VERIFIED#${email}#${request.challengeAnswer}`;
    
    try {
      const result = await doc.send(new GetCommand({
        TableName: passkeysTable,
        Key: { userSub: verificationKey, credentialId: "TEMP" }
      }));

      if (result.Item && result.Item.verified === true) {
        // Valid verification token
        response.answerCorrect = true;
        
        // Clean up the verification token
        await doc.send(new DeleteCommand({
          TableName: passkeysTable,
          Key: { userSub: verificationKey, credentialId: "TEMP" }
        }));
      } else {
        response.answerCorrect = false;
      }
    } catch (error) {
      console.error('Error verifying passkey token:', error);
      response.answerCorrect = false;
    }
  } else {
    response.answerCorrect = false;
  }

  console.log('Verify Auth Challenge Response:', JSON.stringify(response, null, 2));
  return event;
};
