import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddb = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(ddb);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
  "Access-Control-Allow-Methods": "OPTIONS,GET,PUT"
};

export const handler = async (event) => {
  try {
    const tableName = process.env.TABLE_NAME;
    const method = event.httpMethod || event.requestContext?.http?.method || "GET";
    const path = event.resource || event.rawPath || "";

    if (method === "OPTIONS") {
      return { statusCode: 200, headers: CORS, body: "" };
    }

    const claims = event.requestContext?.authorizer?.claims || event.requestContext?.authorizer?.jwt?.claims || {};
    const sub = claims?.sub;
    if (!sub) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ message: "Unauthorized" }) };
    }

    const pk = `USER#${sub}`;
    const sk = "PROFILE";

    if (method === "GET" && path.includes("/profile")) {
      const resp = await doc.send(new GetCommand({
        TableName: tableName,
        Key: { pk, sk }
      }));

      if (!resp.Item) {
        return {
          statusCode: 200,
          headers: CORS,
          body: JSON.stringify({
            name: claims.name || "",
            email: claims.email || "",
            phone: claims.phone_number || "",
            updatedAt: null,
            createdAt: null
          })
        };
      }

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({
          name: resp.Item.name || "",
          email: resp.Item.email || "",
          phone: resp.Item.phone || "",
          updatedAt: resp.Item.updatedAt || null,
          createdAt: resp.Item.createdAt || null
        })
      };
    }

    if (method === "PUT" && path.includes("/profile")) {
      if (!event.body) {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: "Missing body" }) };
      }
      let payload;
      try {
        payload = JSON.parse(event.body);
      } catch {
        return { statusCode: 400, headers: CORS, body: JSON.stringify({ message: "Invalid JSON" }) };
      }
      const name = (payload?.name || "").toString();
      const email = (payload?.email || "").toString();
      const phone = (payload?.phone || "").toString();

      const now = new Date().toISOString();
      const item = {
        pk,
        sk,
        name,
        email,
        phone,
        updatedAt: now,
        createdAt: now
      };

      await doc.send(new PutCommand({
        TableName: tableName,
        Item: item
      }));

      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ ok: true, updatedAt: now })
      };
    }

    return { statusCode: 405, headers: CORS, body: JSON.stringify({ message: "Method Not Allowed" }) };
  } catch (e) {
    console.error("Profile handler error:", e);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ message: "Internal server error" }) };
  }
};
