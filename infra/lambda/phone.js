import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { CognitoIdentityProviderClient, AdminUpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";

const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb);
const ses = new SESClient({});
const sns = new SNSClient({});
const cognito = new CognitoIdentityProviderClient({});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,POST"
};

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Send SMS via SNS with cost optimization
async function sendSms(phoneNumber, message) {
  const devMode = (process.env.DEV_SMS_MODE || 'inline').toLowerCase();
  
  // Development mode: return code inline (no SMS sent)
  if (devMode === 'inline') {
    console.log('DEV MODE: SMS not sent. Code:', message);
    return { devMode: true, sent: false };
  }
  
  // Email fallback mode (for testing without SMS costs)
  if (devMode === 'email') {
    return { devMode: true, sent: false, useEmail: true };
  }
  
  // Production mode: Send real SMS via SNS
  try {
    await sns.send(new PublishCommand({
      PhoneNumber: phoneNumber,
      Message: message,
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional'  // Higher priority, better deliverability
        },
        'AWS.SNS.SMS.SenderID': {
          DataType: 'String',
          StringValue: 'CryptoJogi'  // Custom sender ID (not available in all countries)
        }
      }
    }));
    
    console.log('SMS sent successfully to:', phoneNumber);
    return { sent: true, devMode: false };
  } catch (error) {
    console.error('SNS SMS send failed:', error);
    throw error;
  }
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

    // Start phone change: store new phone, send code to old phone (SMS or fallback)
    if (path.endsWith('/profile/phone/start') || path.includes('/profile/phone/start')) {
      const body = JSON.parse(event.body || '{}');
      const newPhone = String(body.newPhone || body.phone || '').trim();
      
      // Validate E.164 phone format
      if (!newPhone || !/^\+[1-9]\d{1,14}$/.test(newPhone)) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ 
          message: "Valid phone number in E.164 format required (e.g., +14155552671)" 
        }) };
      }
      
      const codeOld = genCode();
      const ttl = Math.floor((Date.now() + 10 * 60 * 1000) / 1000);
      
      // Store phone change request
      await doc.send(new PutCommand({
        TableName: tableName,
        Item: { 
          pk, 
          sk: 'PHONE_CHANGE', 
          newPhone, 
          codeOld, 
          attempts: 0,
          createdAt: new Date().toISOString(), 
          ttl 
        }
      }));
      
      // Send verification code
      const smsMessage = `Your CryptoJogi verification code is: ${codeOld}. Valid for 10 minutes.`;
      const smsResult = await sendSms(currentPhone || email, smsMessage);
      
      // Fallback to email if SMS not available or in dev mode
      if (smsResult.useEmail || (!currentPhone && devMode === 'email')) {
        if (sender && email) {
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
      }
      
      const resp = { ok: true, hasCurrentPhone: !!currentPhone };
      if (devMode === 'inline') resp.codeOld = codeOld;
      return { statusCode: 200, headers: CORS, body: JSON.stringify(resp) };
    }

    // Verify old phone code, then send code to new phone (SMS or fallback)
    if (path.endsWith('/profile/phone/verify-old') || path.includes('/profile/phone/verify-old')) {
      const body = JSON.parse(event.body || '{}');
      const code = String(body.code || '').trim();
      if (!code) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'code is required' }) };
      }
      
      const rec = await doc.send(new GetCommand({ TableName: tableName, Key: { pk, sk: 'PHONE_CHANGE' } }));
      
      // Check if code exists and is valid
      if (!rec.Item) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'No verification request found' }) };
      }
      
      // Check attempts limit (prevent brute force)
      if (rec.Item.attempts >= 3) {
        await doc.send(new DeleteCommand({ TableName: tableName, Key: { pk, sk: 'PHONE_CHANGE' } }));
        return { statusCode: 429, headers: CORS, body: JSON.stringify({ message: 'Too many failed attempts. Please start over.' }) };
      }
      
      // Verify code
      if (rec.Item.codeOld !== code) {
        // Increment failed attempts
        await doc.send(new PutCommand({
          TableName: tableName,
          Item: { ...rec.Item, attempts: (rec.Item.attempts || 0) + 1 }
        }));
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'Invalid code' }) };
      }
      
      const codeNew = genCode();
      const newPhone = rec.Item.newPhone;
      
      // Store new code
      await doc.send(new PutCommand({
        TableName: tableName,
        Item: { 
          pk, 
          sk: 'PHONE_CHANGE', 
          newPhone, 
          codeNew, 
          attempts: 0,
          createdAt: new Date().toISOString(), 
          ttl: Math.floor((Date.now() + 10 * 60 * 1000) / 1000) 
        }
      }));
      
      // Send SMS to new phone number
      const smsMessage = `Your CryptoJogi verification code is: ${codeNew}. Valid for 10 minutes.`;
      const smsResult = await sendSms(newPhone, smsMessage);
      
      // Fallback to email if needed
      if (smsResult.useEmail && sender && email) {
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
      
      if (!rec.Item) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'No verification request found' }) };
      }
      
      // Check attempts limit
      if (rec.Item.attempts >= 3) {
        await doc.send(new DeleteCommand({ TableName: tableName, Key: { pk, sk: 'PHONE_CHANGE' } }));
        return { statusCode: 429, headers: CORS, body: JSON.stringify({ message: 'Too many failed attempts. Please start over.' }) };
      }
      
      // Verify code
      if (rec.Item.codeNew !== code) {
        await doc.send(new PutCommand({
          TableName: tableName,
          Item: { ...rec.Item, attempts: (rec.Item.attempts || 0) + 1 }
        }));
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: 'Invalid code' }) };
      }
      
      const newPhone = rec.Item.newPhone;
      
      // Update Cognito user attributes
      await cognito.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: username,
        UserAttributes: [
          { Name: 'phone_number', Value: newPhone },
          { Name: 'phone_number_verified', Value: 'true' }
        ]
      }));
      
      // Clean up verification record
      await doc.send(new DeleteCommand({ TableName: tableName, Key: { pk, sk: 'PHONE_CHANGE' } }));
      
      return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, message: 'Phone number updated successfully' }) };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ message: 'Method Not Allowed' }) };
  } catch (e) {
    console.error('Phone change error:', e);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: 'Internal server error' }) };
  }
};
