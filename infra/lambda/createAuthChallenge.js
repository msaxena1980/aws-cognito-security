/**
 * Create Auth Challenge Lambda
 * Creates the challenge to present to the user
 */

export const handler = async (event) => {
  console.log('Create Auth Challenge Event:', JSON.stringify(event, null, 2));

  const { request, response } = event;

  if (request.challengeName === 'CUSTOM_CHALLENGE') {
    // For passkey authentication, we don't need to send anything
    // The challenge was already completed on the client side
    response.publicChallengeParameters = {
      message: 'Passkey authentication'
    };
    response.privateChallengeParameters = {
      answer: 'passkey-verified'
    };
  }

  console.log('Create Auth Challenge Response:', JSON.stringify(response, null, 2));
  return event;
};
