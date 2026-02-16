import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import crypto from "crypto";

const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb);
const ses = new SESClient({});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,POST"
};

// Helper to get user info from JWT claims
function getUserInfo(event) {
  const claims = event.requestContext?.authorizer?.claims || event.requestContext?.authorizer?.jwt?.claims || {};
  return {
    sub: claims?.sub,
    email: claims?.email
  };
}

// Generate 6-digit OTP
function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send OTP email
async function sendOtpEmail(email, otp) {
  const senderEmail = process.env.SES_SENDER_EMAIL || 'noreply@example.com';
  const devMode = process.env.DEV_EMAIL_MODE === 'inline';

  const params = {
    Source: senderEmail,
    Destination: { ToAddresses: [email] },
    Message: {
      Subject: { Data: 'Your Verification Code - CryptoJogi' },
      Body: {
        Text: {
          Data: `Your verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.`
        },
        Html: {
          Data: `
            <html>
              <body style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>Your Verification Code</h2>
                <p>Use this code to verify your email:</p>
                <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; font-size: 24px; font-weight: bold; text-align: center; margin: 20px 0;">
                  ${otp}
                </div>
                <p>This code will expire in 10 minutes.</p>
                <p style="color: #666; font-size: 12px;">If you didn't request this code, please ignore this email.</p>
              </body>
            </html>
          `
        }
      }
    }
  };

  if (devMode) {
    console.log('DEV MODE: Email OTP:', otp);
    console.log('DEV MODE: Would send to:', email);
    return { devMode: true, otp };
  }

  try {
    await ses.send(new SendEmailCommand(params));
    return { sent: true };
  } catch (error) {
    console.error('Error sending email:', error);
    throw error;
  }
}

export const handler = async (event) => {
  try {
    const method = event.httpMethod || event.requestContext?.http?.method || "POST";
    const path = event.resource || event.rawPath || "";
    const tableName = process.env.TABLE_NAME;

    if (method === "OPTIONS") {
      return { statusCode: 200, headers: CORS, body: "" };
    }

    const { sub, email } = getUserInfo(event);
    if (!sub || !email) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ message: "Unauthorized" }) };
    }

    // POST /profile/email/send-otp - Send OTP to current email
    if (method === "POST" && path.includes("/send-otp")) {
      const otp = generateOtp();
      const otpKey = `OTP#${sub}#${Date.now()}`;
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      // Store OTP in DynamoDB
      await doc.send(new PutCommand({
        TableName: tableName,
        Item: {
          pk: `USER#${sub}`,
          sk: otpKey,
          otp,
          email,
          purpose: 'email_verification',
          expiresAt,
          createdAt: new Date().toISOString()
        }
      }));

      // Send OTP email
      const emailResult = await sendOtpEmail(email, otp);

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          success: true,
          message: 'Verification code sent to your email',
          ...(emailResult.devMode ? { devOtp: otp } : {})
        })
      };
    }

    // POST /profile/email/verify-otp - Verify OTP
    if (method === "POST" && path.includes("/verify-otp")) {
      const body = JSON.parse(event.body || "{}");
      const { code } = body;

      if (!code) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ message: "Verification code is required" })
        };
      }

      // Get all OTPs for this user
      const { DynamoDBDocumentClient, QueryCommand } = await import("@aws-sdk/lib-dynamodb");
      const queryResult = await doc.send(new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :sk)",
        ExpressionAttributeValues: {
          ":pk": `USER#${sub}`,
          ":sk": "OTP#"
        }
      }));

      if (!queryResult.Items || queryResult.Items.length === 0) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ message: "No verification code found. Please request a new one." })
        };
      }

      // Find matching OTP
      const now = Date.now();
      const validOtp = queryResult.Items.find(item => 
        item.otp === code && 
        item.expiresAt > now &&
        item.purpose === 'email_verification'
      );

      if (!validOtp) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ message: "Invalid or expired verification code" })
        };
      }

      // Delete used OTP
      await doc.send(new DeleteCommand({
        TableName: tableName,
        Key: {
          pk: validOtp.pk,
          sk: validOtp.sk
        }
      }));

      // Clean up other expired OTPs
      for (const item of queryResult.Items) {
        if (item.sk !== validOtp.sk) {
          await doc.send(new DeleteCommand({
            TableName: tableName,
            Key: { pk: item.pk, sk: item.sk }
          })).catch(err => console.warn('Failed to delete old OTP:', err));
        }
      }

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          success: true,
          message: 'Email verified successfully'
        })
      };
    }

    return {
      statusCode: 404,
      headers: CORS,
      body: JSON.stringify({ message: "Not found" })
    };

  } catch (error) {
    console.error("Email OTP handler error:", error);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ message: "Internal server error", error: error.message })
    };
  }
};
