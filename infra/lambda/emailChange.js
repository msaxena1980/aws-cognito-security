import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";

const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb);
const ses = new SESClient({});
const cognito = new CognitoIdentityProviderClient({});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,POST"
};

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export const handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers: CORS, body: "" };
    }
    const tableName = process.env.TABLE_NAME;
    const userPoolId = process.env.USER_POOL_ID;
    const devMode = (process.env.DEV_EMAIL_MODE || 'inline').toLowerCase(); // inline | email
    const sender = process.env.SES_SENDER_EMAIL || '';
    const claims = event.requestContext?.authorizer?.claims || event.requestContext?.authorizer?.jwt?.claims || {};
    const sub = claims?.sub;
    const username = claims['cognito:username'];
    const currentEmail = claims?.email || '';
    if (!sub || !username) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ message: "Unauthorized" }) };
    }
    const pk = `USER#${sub}`;
    const path = event.resource || event.rawPath || '';

    // Start: request new email, send code to current email
    if (path.endsWith('/profile/email/start') || path.includes('/profile/email/start')) {
      const body = JSON.parse(event.body || '{}');
      const newEmail = String(body.newEmail || '').trim();
      if (!newEmail) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: "newEmail is required" }) };
      }
      const codeOld = genCode();
      const ttl = Math.floor((Date.now() + 10 * 60 * 1000) / 1000);
      await doc.send(new PutCommand({
        TableName: tableName,
        Item: { pk, sk: 'EMAIL_CHANGE', newEmail, codeOld, createdAt: new Date().toISOString(), ttl }
      }));

      if (devMode === 'email' && sender && currentEmail) {
        try {
          await ses.send(new SendEmailCommand({
            Source: sender,
            Destination: { ToAddresses: [currentEmail] },
            Message: {
              Subject: { Data: 'Confirm your email change (Step 1)' },
              Body: { Text: { Data: `Your code to authorize changing your email to ${newEmail} is: ${codeOld}` } }
            }
          }));
        } catch (e) {
          console.warn('SES send (old email) failed:', e);
        }
      }
      const resp = { ok: true };
      if (devMode === 'inline') resp.codeOld = codeOld;
      return { statusCode: 200, headers: CORS, body: JSON.stringify(resp) };
    }

    // Verify old code, then send code to new email
    if (path.endsWith('/profile/email/verify-old') || path.includes('/profile/email/verify-old')) {
      const body = JSON.parse(event.body || '{}');
      const code = String(body.code || '').trim();
      if (!code) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'code is required' }) };
      }
      const rec = await doc.send(new GetCommand({ TableName: tableName, Key: { pk, sk: 'EMAIL_CHANGE' } }));
      if (!rec.Item || rec.Item.codeOld !== code) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'Invalid code' }) };
      }
      const newEmail = rec.Item.newEmail;
      const codeNew = genCode();
      await doc.send(new PutCommand({
        TableName: tableName,
        Item: { pk, sk: 'EMAIL_CHANGE', newEmail, codeNew, createdAt: new Date().toISOString(), ttl: Math.floor((Date.now() + 10 * 60 * 1000) / 1000) }
      }));
      if (devMode === 'email' && sender && newEmail) {
        try {
          await ses.send(new SendEmailCommand({
            Source: sender,
            Destination: { ToAddresses: [newEmail] },
            Message: {
              Subject: { Data: 'Confirm your new email (Step 2)' },
              Body: { Text: { Data: `Your verification code for ${newEmail} is: ${codeNew}` } }
            }
          }));
        } catch (e) {
          console.warn('SES send (new email) failed:', e);
        }
      }
      const resp = { ok: true };
      if (devMode === 'inline') resp.codeNew = codeNew;
      return { statusCode: 200, headers: CORS, body: JSON.stringify(resp) };
    }

    // Verify new code, then update Cognito email and mark verified
    if (path.endsWith('/profile/email/verify-new') || path.includes('/profile/email/verify-new')) {
      const body = JSON.parse(event.body || '{}');
      const code = String(body.code || '').trim();
      if (!code) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'code is required' }) };
      }
      const rec = await doc.send(new GetCommand({ TableName: tableName, Key: { pk, sk: 'EMAIL_CHANGE' } }));
      if (!rec.Item || rec.Item.codeNew !== code) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'Invalid code' }) };
      }
      const newEmail = rec.Item.newEmail;
      await cognito.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: username,
        UserAttributes: [
          { Name: 'email', Value: newEmail },
          { Name: 'email_verified', Value: 'true' }
        ]
      }));
      await doc.send(new DeleteCommand({ TableName: tableName, Key: { pk, sk: 'EMAIL_CHANGE' } }));
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  } catch (e) {
    console.error('Email change error:', e);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: 'Internal server error' }) };
  }
};
