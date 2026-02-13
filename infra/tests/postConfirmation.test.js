import { handler } from '../lambda/postConfirmation.js';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('postConfirmation handler', () => {
    beforeEach(() => {
        ddbMock.reset();
        process.env.TABLE_NAME = 'TestTable';
    });

    it('should initialize user profile in DynamoDB using sub', async () => {
        const event = {
            request: {
                userAttributes: {
                    email: 'test@example.com',
                    sub: 'user-sub-123'
                }
            }
        };

        ddbMock.on(PutCommand).resolves({});

        const result = await handler(event);

        expect(result).toEqual(event);
        expect(ddbMock.calls()).toHaveLength(1);
        const putCall = ddbMock.call(0);
        expect(putCall.args[0].input).toMatchObject({
            TableName: 'TestTable',
            Item: {
                pk: 'USER#user-sub-123',
                sk: 'PROFILE',
                email: 'test@example.com',
                cognitoSub: 'user-sub-123',
                isVerified: true
            }
        });
    });
});
