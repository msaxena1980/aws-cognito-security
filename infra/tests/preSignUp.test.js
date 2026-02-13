import { handler } from '../lambda/preSignUp.js';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const ddbMock = mockClient(DynamoDBDocumentClient);

describe('preSignUp handler', () => {
    beforeEach(() => {
        ddbMock.reset();
        process.env.TABLE_NAME = 'TestTable';
    });

    it('should return the event without side effects', async () => {
        const event = {
            request: {
                userAttributes: {
                    email: 'test@example.com'
                }
            }
        };

        const result = await handler(event);

        expect(result).toEqual(event);
        expect(ddbMock.calls()).toHaveLength(0);
    });
});
