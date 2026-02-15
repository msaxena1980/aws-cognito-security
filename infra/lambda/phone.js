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
    const devMode = (process.env.DEV_SMS_MODE || 'inline').toLowerCase(); // 'inline' | 'email'
    const sender = process.env.SES_SENDER_EMAIL || '';
    const claims = event.requestContext?.authorizer?.claims || event.requestContext?.authorizer?.jwt?.claims || {};
    const sub = claims?.sub;
    const username = claims['cognito:username'];
    const email = claims?.email || '';
    const currentPhone = claims?.phone_number || '';
    if (!sub || !username) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ message: "Unauthorized" }) };
    }
    const pk = `USER#${sub}`;
    const path = event.resource || event.rawPath || '';

    // Start phone change: store new phone, send code to old phone (or inline)
    if (path.endsWith('/profile/phone/start') || path.includes('/profile/phone/start')) {
      const body = JSON.parse(event.body || '{}');
      const newPhone = String(body.newPhone || body.phone || '').trim();
      if (!newPhone) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: "newPhone is required" }) };
      }
      const codeOld = genCode();
      const ttl = Math.floor((Date.now() + 10 * 60 * 1000) / 1000);
      await doc.send(new PutCommand({
        TableName: tableName,
        Item: { pk, sk: 'PHONE_CHANGE', newPhone, codeOld, createdAt: new Date().toISOString(), ttl }
      }));
      if (devMode === 'email' && sender && email) {
        try {
          await ses.send(new SendEmailCommand({
            Source: sender,
            Destination: { ToAddresses: [email] },
            Message: {
              Subject: { Data: 'Confirm your mobile change (Step 1)' },
              Body: { Text: { Data: `Your code to authorize changing your mobile to ${newPhone} is: ${codeOld}` } }
            }
          }));
        } catch (e) {
          console.warn('SES send (old phone via email) failed:', e);
        }
      }
      const resp = { ok: true, hasCurrentPhone: !!currentPhone };
      if (devMode === 'inline') resp.codeOld = codeOld;
      return { statusCode: 200, headers: CORS, body: JSON.stringify(resp) };
    }

    // Verify old phone code, then send code to new phone (inline/email fallback)
    if (path.endsWith('/profile/phone/verify-old') || path.includes('/profile/phone/verify-old')) {
      const body = JSON.parse(event.body || '{}');
      const code = String(body.code || '').trim();
      if (!code) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'code is required' }) };
      }
      const rec = await doc.send(new GetCommand({ TableName: tableName, Key: { pk, sk: 'PHONE_CHANGE' } }));
      if (!rec.Item || rec.Item.codeOld !== code) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'Invalid code' }) };
      }
      const codeNew = genCode();
      const newPhone = rec.Item.newPhone;
      await doc.send(new PutCommand({
        TableName: tableName,
        Item: { pk, sk: 'PHONE_CHANGE', newPhone, codeNew, createdAt: new Date().toISOString(), ttl: Math.floor((Date.now() + 10 * 60 * 1000) / 1000) }
      }));
      if (devMode === 'email' && sender && email) {
        try {
          await ses.send(new SendEmailCommand({
            Source: sender,
            Destination: { ToAddresses: [email] },
            Message: {
              Subject: { Data: 'Verify your new mobile (Step 2)' },
              Body: { Text: { Data: `Your verification code for ${newPhone} is: ${codeNew}` } }
            }
          }));
        } catch (e) {
          console.warn('SES send (new phone via email) failed:', e);
        }
      }
      const resp = { ok: true };
      if (devMode === 'inline') resp.codeNew = codeNew;
      return { statusCode: 200, headers: CORS, body: JSON.stringify(resp) };
    }

    // Verify new phone code and update Cognito
    if (path.endsWith('/profile/phone/verify-new') || path.includes('/profile/phone/verify-new')) {
      const body = JSON.parse(event.body || '{}');
      const code = String(body.code || '').trim();
      if (!code) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'code is required' }) };
      }
      const rec = await doc.send(new GetCommand({ TableName: tableName, Key: { pk, sk: 'PHONE_CHANGE' } }));
      if (!rec.Item || rec.Item.codeNew !== code) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'Invalid code' }) };
      }
      const newPhone = rec.Item.newPhone;
      await cognito.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: username,
        UserAttributes: [
          { Name: 'phone_number', Value: newPhone },
          { Name: 'phone_number_verified', Value: 'true' }
        ]
      }));
      await doc.send(new DeleteCommand({ TableName: tableName, Key: { pk, sk: 'PHONE_CHANGE' } }));
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  } catch (e) {
    console.error('Phone change error:', e);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: 'Internal server error' }) };
  }
};
