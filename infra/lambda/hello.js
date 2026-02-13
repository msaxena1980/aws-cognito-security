export const handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  // The Cognito User Pool authorizer adds user claims to the requestContext
  const claims = event.requestContext?.authorizer?.claims;
  const username = claims?.['cognito:username'] || 'Unknown User';

  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'OPTIONS,GET'
    },
    body: JSON.stringify({
      message: `Hello ${username}! Your JWT has been verified by Cognito.`,
      claims: claims
    }),
  };
};
