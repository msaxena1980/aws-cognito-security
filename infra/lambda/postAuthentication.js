import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const dbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(dbClient);
const sesClient = new SESClient({});

const TABLE_NAME = process.env.TABLE_NAME;

export const handler = async (event) => {
    console.log("PostAuthentication Event:", JSON.stringify(event, null, 2));

    const { email, sub } = event.request.userAttributes;
    const clientMetadata = event.request.clientMetadata || {};
    const deviceId = clientMetadata.deviceId || "unknown-device";
    const deviceType = clientMetadata.deviceType || "web";
    const imei = clientMetadata.imei || "N/A";
    
    // Use 'sub' instead of 'email' for the Partition Key (PK)
    const userPk = `USER#${sub}`;
    
    // Extract IP and Geo from Cognito's internal tracking (if available)
    const ipAddress = event.request.userContextData ? "extracted-from-context" : "unknown-ip"; 
    
    const timestamp = new Date().toISOString();

    try {
        // 1. Check if device is known
        const deviceRecord = await docClient.send(new GetCommand({
            TableName: TABLE_NAME,
            Key: {
                pk: userPk,
                sk: `DEVICE#${deviceId}`
            }
        }));

        let isAnomaly = false;
        if (!deviceRecord.Item) {
            console.log(`New device detected: ${deviceId} for sub ${sub}`);
            isAnomaly = true;
            
            // Create new device record
            await docClient.send(new PutCommand({
                TableName: TABLE_NAME,
                Item: {
                    pk: userPk,
                    sk: `DEVICE#${deviceId}`,
                    deviceType,
                    imei,
                    firstSeen: timestamp,
                    lastLogin: timestamp,
                    lastIp: ipAddress,
                    isTrusted: false
                }
            }));
        } else {
            // Update existing device record
            await docClient.send(new UpdateCommand({
                TableName: TABLE_NAME,
                Key: {
                    pk: userPk,
                    sk: `DEVICE#${deviceId}`
                },
                UpdateExpression: "set lastLogin = :t, lastIp = :ip",
                ExpressionAttributeValues: {
                    ":t": timestamp,
                    ":ip": ipAddress
                }
            }));
        }

        // 2. Update global last login in PROFILE and sync email if it changed
        await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: {
                pk: userPk,
                sk: "PROFILE"
            },
            UpdateExpression: "set lastGlobalLogin = :t, email = :email, updatedAt = :t",
            ExpressionAttributeValues: {
                ":t": timestamp,
                ":email": email
            }
        }));

        // 3. Send Security Alert if anomaly detected
        if (isAnomaly) {
            await sendSecurityEmail(email, deviceType, ipAddress);
        }

    } catch (error) {
        console.error("Error in PostAuthentication tracking:", error);
    }

    return event;
};

async function sendSecurityEmail(email, deviceType, ip) {
    const sender = process.env.SES_SENDER_EMAIL || "security-alerts@yourdomain.com";
    
    // Note: In sandbox mode, the destination email must also be verified.
    const params = {
        Source: sender,
        Destination: { ToAddresses: [email] },
        Message: {
            Subject: { Data: "Security Alert: New Login Detected" },
            Body: {
                Html: {
                    Data: `
                        <h3>New Login Detected</h3>
                        <p>We noticed a login to your account from a new <b>${deviceType}</b> device.</p>
                        <p><b>IP Address:</b> ${ip}</p>
                        <p>If this was you, you can safely ignore this email. If not, please change your password immediately.</p>
                    `
                }
            }
        }
    };

    try {
        // Only attempt to send if we have a sender email configured (or just try and catch)
        await sesClient.send(new SendEmailCommand(params));
        console.log(`Security email sent to ${email}`);
    } catch (error) {
        console.warn("Failed to send security email (SES might not be configured/verified):", error.message);
    }
}
