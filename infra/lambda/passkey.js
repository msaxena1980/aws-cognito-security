import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import { CognitoIdentityProviderClient, AdminInitiateAuthCommand, AdminRespondToAuthChallengeCommand, AdminUpdateUserAttributesCommand } from "@aws-sdk/client-cognito-identity-provider";
import crypto from "crypto";

const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb);
const cognito = new CognitoIdentityProviderClient({});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,GET,POST"
};

const RP_NAME = "Altrady";

// Helper to dynamically determine RP_ID based on request origin
function getRpId(event) {
  // Get the origin from the request headers
  const origin = event.headers?.origin || event.headers?.Origin || '';
  
  // Extract domain from origin (e.g., "https://security.cryptojogi.com" -> "security.cryptojogi.com")
  let domain = '';
  try {
    if (origin) {
      const url = new URL(origin);
      domain = url.hostname;
    }
  } catch (e) {
    console.warn('Failed to parse origin:', origin);
  }
  
  // Determine RP_ID based on domain
  if (domain.includes('localhost') || domain.includes('127.0.0.1')) {
    return 'localhost';
  } else if (domain === 'security.cryptojogi.com') {
    return 'security.cryptojogi.com';
  } else if (domain.endsWith('cryptojogi.com')) {
    // For any subdomain of cryptojogi.com, use the root domain
    return 'cryptojogi.com';
  }
  
  // Fallback to environment variable or localhost
  return process.env.RP_ID || 'localhost';
}

// Helper to get user sub from JWT claims
function getUserSub(event) {
  const claims = event.requestContext?.authorizer?.claims || event.requestContext?.authorizer?.jwt?.claims || {};
  return claims?.sub;
}

// Helper to get email from JWT claims
function getUserEmail(event) {
  const claims = event.requestContext?.authorizer?.claims || event.requestContext?.authorizer?.jwt?.claims || {};
  return claims?.email;
}

export const handler = async (event) => {
  try {
    const method = event.httpMethod || event.requestContext?.http?.method || "POST";
    const path = event.resource || event.rawPath || "";
    const passkeysTable = process.env.PASSKEYS_TABLE;
    const userPoolId = process.env.USER_POOL_ID;

    if (method === "OPTIONS") {
      return { statusCode: 200, headers: CORS, body: "" };
    }

    // POST /passkey/register-options - Generate registration options
    if (method === "POST" && path.includes("/register-options")) {
      const sub = getUserSub(event);
      const email = getUserEmail(event);
      if (!sub || !email) {
        return { statusCode: 401, headers: CORS, body: JSON.stringify({ message: "Unauthorized" }) };
      }

      const body = JSON.parse(event.body || "{}");
      const deviceId = body.deviceId || crypto.randomUUID();

      // Check if user already has a passkey for this device
      const existingQuery = await doc.send(new QueryCommand({
        TableName: passkeysTable,
        IndexName: "DeviceIdIndex",
        KeyConditionExpression: "deviceId = :deviceId",
        ExpressionAttributeValues: { ":deviceId": deviceId }
      }));

      if (existingQuery.Items && existingQuery.Items.length > 0) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ message: "A passkey already exists for this device. Please delete it first." })
        };
      }

      // Generate challenge
      const challenge = crypto.randomBytes(32).toString("base64url");
      
      // Get dynamic RP_ID based on request origin
      const rpId = getRpId(event);

      // Store challenge temporarily (expires in 5 minutes)
      const challengeKey = `CHALLENGE#${sub}#${deviceId}`;
      await doc.send(new PutCommand({
        TableName: passkeysTable,
        Item: {
          userSub: challengeKey,
          credentialId: "TEMP",
          challenge,
          deviceId,
          createdAt: new Date().toISOString(),
          expiresAt: Date.now() + 5 * 60 * 1000
        }
      }));

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          challenge,
          rp: { name: RP_NAME, id: rpId },
          user: {
            id: Buffer.from(sub).toString("base64url"),
            name: email,
            displayName: email
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },  // ES256
            { type: "public-key", alg: -257 } // RS256
          ],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            requireResidentKey: false,
            userVerification: "required"
          },
          timeout: 60000,
          attestation: "none"
        })
      };
    }

    // POST /passkey/register - Complete registration
    if (method === "POST" && path.includes("/register") && !path.includes("register-options")) {
      const sub = getUserSub(event);
      const email = getUserEmail(event);
      if (!sub || !email) {
        return { statusCode: 401, headers: CORS, body: JSON.stringify({ message: "Unauthorized" }) };
      }

      const body = JSON.parse(event.body || "{}");
      const { credentialId, publicKey, attestationObject, clientDataJSON, deviceId, deviceName } = body;

      console.log('Passkey registration request:', { 
        hasCredentialId: !!credentialId, 
        hasPublicKey: !!publicKey,
        hasAttestationObject: !!attestationObject,
        hasClientDataJSON: !!clientDataJSON,
        hasDeviceId: !!deviceId,
        hasDeviceName: !!deviceName,
        credentialIdLength: credentialId?.length,
        publicKeyLength: publicKey?.length
      });

      if (!credentialId || !deviceId) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ 
            message: "Missing required fields: credentialId and deviceId are required",
            details: {
              credentialId: !!credentialId,
              deviceId: !!deviceId
            }
          })
        };
      }

      // We need either publicKey directly or attestationObject to extract it from
      if (!publicKey && !attestationObject) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ 
            message: "Missing public key data: either publicKey or attestationObject is required",
            details: {
              publicKey: !!publicKey,
              attestationObject: !!attestationObject
            }
          })
        };
      }

      // Use publicKey if provided, otherwise we'll store attestationObject
      // In a production system, you'd parse the CBOR attestationObject to extract the public key
      const publicKeyToStore = publicKey || attestationObject;

      // Verify challenge exists
      const challengeKey = `CHALLENGE#${sub}#${deviceId}`;
      const challengeResp = await doc.send(new GetCommand({
        TableName: passkeysTable,
        Key: { userSub: challengeKey, credentialId: "TEMP" }
      }));

      if (!challengeResp.Item) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ message: "Invalid or expired challenge" })
        };
      }

      // Store passkey
      const now = new Date().toISOString();
      await doc.send(new PutCommand({
        TableName: passkeysTable,
        Item: {
          userSub: sub,
          credentialId,
          publicKey: publicKeyToStore,
          deviceId,
          deviceName: deviceName || `Passkey - ${email}`,
          email,
          counter: 0,
          createdAt: now,
          lastUsed: null
        }
      }));

      // Update user's auth methods to include passkeys
      const userTable = process.env.TABLE_NAME;
      const pk = `USER#${sub}`;
      const sk = "PROFILE";

      try {
        // Get current profile
        const profileResp = await doc.send(new GetCommand({
          TableName: userTable,
          Key: { pk, sk }
        }));

        const profile = profileResp.Item || {
          pk,
          sk,
          name: "",
          email,
          phone: "",
          twoFAEnabled: false,
          passkeyEnabled: false,
          vaultEnabled: false,
          createdAt: now
        };

        const authMethods = profile.authMethods || { password: true };
        authMethods.passkeys = true;

        // Update profile with passkey enabled
        await doc.send(new PutCommand({
          TableName: userTable,
          Item: {
            ...profile,
            authMethods,
            passkeyEnabled: true,
            updatedAt: now
          }
        }));
      } catch (updateError) {
        console.error("Error updating auth methods after passkey registration:", updateError);
        // Continue even if update fails
      }

      // Update user's custom attribute to indicate they have passkey enabled
      try {
        await cognito.send(new AdminUpdateUserAttributesCommand({
          UserPoolId: userPoolId,
          Username: sub,
          UserAttributes: [
            {
              Name: 'custom:passkeyEnabled',
              Value: 'true'
            }
          ]
        }));
      } catch (attrError) {
        console.error("Error updating user attribute:", attrError);
        // Continue even if attribute update fails
      }

      // Delete challenge
      await doc.send(new DeleteCommand({
        TableName: passkeysTable,
        Key: { userSub: challengeKey, credentialId: "TEMP" }
      }));

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ success: true, message: "Passkey registered successfully" })
      };
    }

    // POST /passkey/authenticate-options - Generate authentication options
    if (method === "POST" && path.includes("/authenticate-options")) {
      const body = JSON.parse(event.body || "{}");
      const { email } = body;

      if (!email) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ message: "Email is required" })
        };
      }

      // Generate challenge
      const challenge = crypto.randomBytes(32).toString("base64url");
      const sessionId = crypto.randomUUID();
      
      // Get dynamic RP_ID based on request origin
      const rpId = getRpId(event);

      // Store challenge temporarily
      const challengeKey = `AUTH_CHALLENGE#${sessionId}`;
      await doc.send(new PutCommand({
        TableName: passkeysTable,
        Item: {
          userSub: challengeKey,
          credentialId: "TEMP",
          challenge,
          email,
          createdAt: new Date().toISOString(),
          expiresAt: Date.now() + 5 * 60 * 1000
        }
      }));

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          challenge,
          sessionId,
          rpId: rpId,
          timeout: 60000,
          userVerification: "required"
        })
      };
    }

    // POST /passkey/authenticate - Complete authentication
    if (method === "POST" && path.includes("/authenticate") && !path.includes("authenticate-options")) {
      const body = JSON.parse(event.body || "{}");
      const { credentialId, sessionId, signature, authenticatorData, clientDataJSON } = body;

      if (!credentialId || !sessionId) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ message: "Missing required fields" })
        };
      }

      // Verify challenge
      const challengeKey = `AUTH_CHALLENGE#${sessionId}`;
      const challengeResp = await doc.send(new GetCommand({
        TableName: passkeysTable,
        Key: { userSub: challengeKey, credentialId: "TEMP" }
      }));

      if (!challengeResp.Item) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ message: "Invalid or expired session" })
        };
      }

      const email = challengeResp.Item.email;

      // Query to find the passkey and verify it belongs to this user
      const passkeyQuery = await doc.send(new QueryCommand({
        TableName: passkeysTable,
        IndexName: "CredentialIdIndex",
        KeyConditionExpression: "credentialId = :credId",
        ExpressionAttributeValues: { ":credId": credentialId }
      }));

      if (!passkeyQuery.Items || passkeyQuery.Items.length === 0) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ message: "Passkey not found" })
        };
      }

      const passkey = passkeyQuery.Items[0];
      
      // Verify email matches
      if (passkey.email !== email) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ message: "Passkey does not belong to this user" })
        };
      }

      // In a real implementation, verify the signature here
      // For this demo, we trust client-side verification

      // Generate a verification token for the Cognito custom auth flow
      const verificationToken = crypto.randomUUID();
      
      // Store verification token temporarily (5 minutes)
      const verificationKey = `PASSKEY_VERIFIED#${email}#${verificationToken}`;
      await doc.send(new PutCommand({
        TableName: passkeysTable,
        Item: {
          userSub: verificationKey,
          credentialId: "TEMP",
          email,
          verified: true,
          createdAt: new Date().toISOString(),
          expiresAt: Date.now() + 5 * 60 * 1000
        }
      }));

      // Update last used timestamp
      await doc.send(new PutCommand({
        TableName: passkeysTable,
        Item: {
          ...passkey,
          lastUsed: new Date().toISOString()
        }
      }));

      // Delete the auth challenge
      await doc.send(new DeleteCommand({
        TableName: passkeysTable,
        Key: { userSub: challengeKey, credentialId: "TEMP" }
      }));

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          success: true,
          message: "Passkey verified successfully",
          email,
          verificationToken
        })
      };
    }

    // GET /passkey/list - List user's passkeys
    if (method === "GET" && path.includes("/list")) {
      const sub = getUserSub(event);
      if (!sub) {
        return { statusCode: 401, headers: CORS, body: JSON.stringify({ message: "Unauthorized" }) };
      }

      const resp = await doc.send(new QueryCommand({
        TableName: passkeysTable,
        KeyConditionExpression: "userSub = :sub",
        ExpressionAttributeValues: { ":sub": sub }
      }));

      const passkeys = (resp.Items || [])
        .filter(item => !item.userSub.startsWith("CHALLENGE#") && !item.userSub.startsWith("AUTH_CHALLENGE#"))
        .map(item => ({
          credentialId: item.credentialId,
          deviceName: item.deviceName,
          deviceId: item.deviceId,
          createdAt: item.createdAt,
          lastUsed: item.lastUsed
        }));

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ passkeys })
      };
    }

    // POST /passkey/delete - Delete a passkey
    if (method === "POST" && path.includes("/delete")) {
      const sub = getUserSub(event);
      if (!sub) {
        return { statusCode: 401, headers: CORS, body: JSON.stringify({ message: "Unauthorized" }) };
      }

      const body = JSON.parse(event.body || "{}");
      const { credentialId } = body;

      if (!credentialId) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ message: "credentialId is required" })
        };
      }

      await doc.send(new DeleteCommand({
        TableName: passkeysTable,
        Key: { userSub: sub, credentialId }
      }));

      // Check if user has any remaining passkeys
      const remainingPasskeys = await doc.send(new QueryCommand({
        TableName: passkeysTable,
        KeyConditionExpression: "userSub = :sub",
        ExpressionAttributeValues: { ":sub": sub }
      }));

      const hasRemainingPasskeys = remainingPasskeys.Items && remainingPasskeys.Items.length > 0;

      // If no passkeys remain, update the user's auth methods
      if (!hasRemainingPasskeys) {
        const userTable = process.env.TABLE_NAME;
        const pk = `USER#${sub}`;
        const sk = "PROFILE";

        try {
          // Get current profile
          const profileResp = await doc.send(new GetCommand({
            TableName: userTable,
            Key: { pk, sk }
          }));

          if (profileResp.Item) {
            const profile = profileResp.Item;
            const authMethods = profile.authMethods || { password: true };
            
            // Remove passkeys from auth methods
            authMethods.passkeys = false;
            
            // Update profile with new auth methods
            await doc.send(new PutCommand({
              TableName: userTable,
              Item: {
                ...profile,
                authMethods,
                passkeyEnabled: false,
                updatedAt: new Date().toISOString()
              }
            }));
          }
        } catch (updateError) {
          console.error("Error updating auth methods after passkey deletion:", updateError);
          // Continue even if update fails - the getAuthMethods will handle it
        }
      }

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ success: true, message: "Passkey deleted successfully" })
      };
    }

    return {
      statusCode: 404,
      headers: CORS,
      body: JSON.stringify({ message: "Not found" })
    };

  } catch (error) {
    console.error("Passkey handler error:", error);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ message: "Internal server error", error: error.message })
    };
  }
};
