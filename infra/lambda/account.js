import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand, GetCommand } from "@aws-sdk/lib-dynamodb";
import { CognitoIdentityProviderClient, AdminDeleteUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { KMSClient, DecryptCommand } from "@aws-sdk/client-kms";

const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb);
const cognito = new CognitoIdentityProviderClient({});
const kms = new KMSClient({});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,POST"
};

function norm(s) {
  return (s || "").toLowerCase().trim().split(/\s+/).join(" ");
}

export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: CORS, body: "" };
  }
  const tableName = process.env.TABLE_NAME;
  const userPoolId = process.env.USER_POOL_ID;
  const kmsKeyId = process.env.KMS_KEY_ID;
  const path = event.resource || event.rawPath || "";
  const method = event.httpMethod || event.requestContext?.http?.method || "POST";
  const claims = event.requestContext?.authorizer?.claims || event.requestContext?.authorizer?.jwt?.claims || {};
  const sub = claims.sub;
  const username = claims["cognito:username"];
  const email = claims.email;
  if (!sub || !username) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ message: "Unauthorized" }) };
  }
  const pk = `USER#${sub}`;

  try {
    if (method === "POST" && path.includes("/account/delete/start")) {
      return { statusCode: 410, headers: CORS, body: JSON.stringify({ message: "OTP flow disabled" }) };
    }

    if (method === "POST" && path.includes("/account/delete/verify")) {
      return { statusCode: 410, headers: CORS, body: JSON.stringify({ message: "OTP flow disabled" }) };
    }

    if (method === "POST" && path.includes("/account/delete/complete")) {
      if (!event.body) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: "Missing body" }) };
      }
      let payload;
      try {
        payload = JSON.parse(event.body);
      } catch {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: "Invalid JSON" }) };
      }
      const passphrase = payload?.passphrase;
      
      // Check if passphrase is stored
      const passphraseRecord = await doc.send(new GetCommand({ 
        TableName: tableName, 
        Key: { pk, sk: "PASSPHRASE" }, 
        ProjectionExpression: "ciphertext" 
      }));
      
      const hasPassphrase = !!passphraseRecord.Item?.ciphertext;
      
      // If passphrase is set up, verify it
      if (hasPassphrase) {
        if (!passphrase) {
          return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: "Passphrase is required" }) };
        }
        if (!kmsKeyId) {
          return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: "KMS key not configured" }) };
        }
        const blob = Buffer.from(passphraseRecord.Item.ciphertext, "base64");
        const dec = await kms.send(new DecryptCommand({ CiphertextBlob: blob, EncryptionContext: { user: sub } }));
        const plain = Buffer.from(dec.Plaintext).toString("utf-8");
        if (norm(plain) !== norm(passphrase)) {
          return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: "Passphrase incorrect" }) };
        }
      }
      
      // Delete all user data
      let lastKey = undefined;
      while (true) {
        const q = await doc.send(new QueryCommand({
          TableName: tableName,
          KeyConditionExpression: "pk = :pk",
          ExpressionAttributeValues: { ":pk": pk },
          ExclusiveStartKey: lastKey
        }));
        for (const item of q.Items || []) {
          await doc.send(new DeleteCommand({ TableName: tableName, Key: { pk: item.pk, sk: item.sk } }));
        }
        if (!q.LastEvaluatedKey) break;
        lastKey = q.LastEvaluatedKey;
      }
      await cognito.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: username }));
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ message: "Method Not Allowed" }) };
  } catch (e) {
    console.error("Account handler error:", e);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: "Internal server error" }) };
  }
};
