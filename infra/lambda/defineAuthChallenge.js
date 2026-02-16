/**
 * Define Auth Challenge Lambda
 * Determines which challenge to present to the user during custom authentication
 */

export const handler = async (event) => {
  console.log('Define Auth Challenge Event:', JSON.stringify(event, null, 2));

  const { request, response } = event;

  // Check if this is a passkey authentication attempt
  // Check clientMetadata first as it's more reliable for passkey auth
  const isPasskeyAuth = request.clientMetadata?.authMethod === 'passkey' ||
                        request.userAttributes?.['custom:passkeyEnabled'] === 'true';

  console.log('Is Passkey Auth:', isPasskeyAuth);
  console.log('Client Metadata:', request.clientMetadata);
  console.log('Session Length:', request.session.length);

  if (isPasskeyAuth) {
    // For passkey auth, we skip the password challenge
    if (request.session.length === 0) {
      // First attempt - issue custom challenge
      response.issueTokens = false;
      response.failAuthentication = false;
      response.challengeName = 'CUSTOM_CHALLENGE';
    } else if (request.session.length === 1 && request.session[0].challengeName === 'CUSTOM_CHALLENGE') {
      // Second attempt - check if challenge was answered correctly
      if (request.session[0].challengeResult === true) {
        response.issueTokens = true;
        response.failAuthentication = false;
      } else {
        response.issueTokens = false;
        response.failAuthentication = true;
      }
    } else {
      // Too many attempts
      response.issueTokens = false;
      response.failAuthentication = true;
    }
  } else {
    // Standard authentication flow - not passkey
    response.issueTokens = false;
    response.failAuthentication = true;
  }

  console.log('Define Auth Challenge Response:', JSON.stringify(response, null, 2));
  return event;
};
