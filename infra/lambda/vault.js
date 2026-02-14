import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { KMSClient, EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms";

const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb);
const kms = new KMSClient({});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,GET,PUT,POST"
};

export const handler = async (event) => {
  try {
    const tableName = process.env.TABLE_NAME;
    const method = event.httpMethod || event.requestContext?.http?.method || "GET";
    const path = event.resource || event.rawPath || "";
    const kmsKeyId = process.env.KMS_KEY_ID;

    const claims = event.requestContext?.authorizer?.claims || event.requestContext?.authorizer?.jwt?.claims;
    const sub = claims?.sub;

    if (!sub) {
      return {
        statusCode: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ message: "Unauthorized" })
      };
    }

    const pk = `USER#${sub}`;
    const sk = "VAULT#CURRENT";

    if (method === "GET" && path.includes('/vault')) {
      const full = event.queryStringParameters?.full === '1';
      const projection = full
        ? "version, updatedAt, createdAt, kdf, vaultCiphertext, vaultNonce, encDek, dekNonce"
        : "version, updatedAt, createdAt, kdf";
      const resp = await doc.send(new GetCommand({
        TableName: tableName,
        Key: { pk, sk },
        ProjectionExpression: projection
      }));

      if (!resp.Item) {
        return {
          statusCode: 404,
          headers: CORS_HEADERS,
          body: JSON.stringify({ exists: false })
        };
      }

      const base = {
        exists: true,
        version: resp.Item.version,
        updatedAt: resp.Item.updatedAt,
        createdAt: resp.Item.createdAt,
        kdf: resp.Item.kdf
      };
      if (full) {
        base.vaultCiphertext = resp.Item.vaultCiphertext;
        base.vaultNonce = resp.Item.vaultNonce;
        base.encDek = resp.Item.encDek;
        base.dekNonce = resp.Item.dekNonce;
      }
      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify(base)
      };
    }

    if (method === "PUT" && path.includes('/vault')) {
      if (!event.body) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: "Missing body" })
        };
      }

      let payload;
      try {
        payload = JSON.parse(event.body);
      } catch {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: "Invalid JSON body" })
        };
      }

      const {
        vaultCiphertext,
        vaultNonce,
        encDek,
        dekNonce,
        kdf,
        version = 1
      } = payload || {};

      if (!vaultCiphertext || !vaultNonce || !encDek || !dekNonce || !kdf?.name || !kdf?.salt) {
        return {
          statusCode: 400,
          headers: CORS_HEADERS,
          body: JSON.stringify({ message: "Missing required fields" })
        };
      }

      const now = new Date().toISOString();
      const item = {
        pk,
        sk,
        version,
        vaultCiphertext,
        vaultNonce,
        encDek,
        dekNonce,
        kdf,
        updatedAt: now,
        createdAt: now
      };

      await doc.send(new PutCommand({
        TableName: tableName,
        Item: item
      }));

      return {
        statusCode: 200,
        headers: CORS_HEADERS,
        body: JSON.stringify({ ok: true, updatedAt: now })
      };
    }

    if (method === "GET" && path.includes('/passphrase')) {
      const resp = await doc.send(new GetCommand({
        TableName: tableName,
        Key: { pk, sk: 'PASSPHRASE' },
        ProjectionExpression: "createdAt"
      }));
      if (!resp.Item) {
        return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ stored: false }) };
      }
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ stored: true, createdAt: resp.Item.createdAt }) };
    }

    if (method === "POST" && (path.endsWith('/passphrase/verify') || path.includes('/passphrase/verify'))) {
      if (!event.body) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Missing body" }) };
      }
      let payload;
      try {
        payload = JSON.parse(event.body);
      } catch {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Invalid JSON body" }) };
      }
      const provided = payload?.passphrase;
      if (!provided) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "passphrase is required" }) };
      }
      const resp = await doc.send(new GetCommand({
        TableName: tableName,
        Key: { pk, sk: 'PASSPHRASE' },
        ProjectionExpression: "ciphertext"
      }));
      if (!resp.Item?.ciphertext) {
        return { statusCode: 404, headers: CORS_HEADERS, body: JSON.stringify({ verified: false, message: "Not found" }) };
      }
      const blob = Buffer.from(resp.Item.ciphertext, 'base64');
      const decResp = await kms.send(new DecryptCommand({
        CiphertextBlob: blob,
        EncryptionContext: { user: sub }
      }));
      const plaintext = Buffer.from(decResp.Plaintext).toString('utf-8');
      const norm = (s) => (s || '').toLowerCase().trim().split(/\s+/).join(' ');
      const ok = norm(plaintext) === norm(provided);
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ verified: ok }) };
    }

    if (method === "POST" && (path.endsWith('/passphrase') || (path.includes('/passphrase') && !path.includes('/passphrase/verify')))) {
      if (!kmsKeyId) {
        return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ message: "KMS key not configured" }) };
      }
      if (!event.body) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Missing body" }) };
      }
      let payload;
      try {
        payload = JSON.parse(event.body);
      } catch {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "Invalid JSON body" }) };
      }
      const passphrase = payload?.passphrase;
      if (!passphrase) {
        return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ message: "passphrase is required" }) };
      }
      const encResp = await kms.send(new EncryptCommand({
        KeyId: kmsKeyId,
        Plaintext: Buffer.from(passphrase, 'utf-8'),
        EncryptionContext: { user: sub }
      }));
      const ciphertextB64 = Buffer.from(encResp.CiphertextBlob).toString('base64');
      const now = new Date().toISOString();
      await doc.send(new PutCommand({
        TableName: tableName,
        Item: { pk, sk: 'PASSPHRASE', ciphertext: ciphertextB64, updatedAt: now, createdAt: now }
      }));
      return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ ok: true, updatedAt: now }) };
    }

    return {
      statusCode: 405,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: "Method Not Allowed" })
    };
  } catch (e) {
    console.error("Vault handler error:", e);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ message: "Internal server error" })
    };
  }
};
