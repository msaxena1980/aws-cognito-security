import { handler } from '../lambda/postAuthentication.js';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ddbMock = mockClient(DynamoDBDocumentClient);
const sesMock = mockClient(SESClient);

describe('postAuthentication handler', () => {
    beforeEach(() => {
        ddbMock.reset();
        sesMock.reset();
        process.env.TABLE_NAME = 'TestTable';
        process.env.SES_SENDER_EMAIL = 'alerts@test.com';
    });

    it('should track login for a new device and send an alert', async () => {
        const event = {
            request: {
                userAttributes: {
                    email: 'test@example.com',
                    sub: 'user-sub-123'
                },
                clientMetadata: {
                    deviceId: 'new-device-id',
                    deviceType: 'mobile'
                }
            }
        };

        // 1. Device not found
        ddbMock.on(GetCommand).resolves({});
        // 2. Put new device
        ddbMock.on(PutCommand).resolves({});
        // 3. Update profile
        ddbMock.on(UpdateCommand).resolves({});
        // 4. Send SES email
        sesMock.on(SendEmailCommand).resolves({});

        const result = await handler(event);

        expect(result).toEqual(event);
        expect(ddbMock.calls()).toHaveLength(3); // Get, Put (device), Update (profile)
        expect(sesMock.calls()).toHaveLength(1); // Security alert
        
        const putCall = ddbMock.call(1);
        expect(putCall.args[0].input.Item).toMatchObject({
            pk: 'USER#user-sub-123',
            sk: 'DEVICE#new-device-id',
            deviceType: 'mobile'
        });
    });

    it('should update login for an existing device and not send an alert', async () => {
        const event = {
            request: {
                userAttributes: {
                    email: 'test@example.com',
                    sub: 'user-sub-123'
                },
                clientMetadata: {
                    deviceId: 'existing-device-id'
                }
            }
        };

        // 1. Device found
        ddbMock.on(GetCommand).resolves({
            Item: { pk: 'USER#user-sub-123', sk: 'DEVICE#existing-device-id' }
        });
        // 2. Update device
        ddbMock.on(UpdateCommand).resolves({});
        // 3. Update profile is also an UpdateCommand
        
        const result = await handler(event);

        expect(result).toEqual(event);
        expect(ddbMock.calls()).toHaveLength(3); // Get, Update (device), Update (profile)
        expect(sesMock.calls()).toHaveLength(0); // No alert
    });
});
