# AWS Cognito Security – Project Brief, Optimizations & Recommendations

## 1. Project Brief

### What It Is
**aws-cognito-security** is a full-stack security demo built around **AWS Cognito**. It provides:

- **Frontend:** Vue 3 SPA (Vite) with AWS Amplify for auth and API calls.
- **Backend:** AWS CDK stack (single `stack.js`) that deploys Cognito, DynamoDB, Lambda, API Gateway, and KMS.
- **Features:** Email/password sign-up and sign-in, optional TOTP 2FA, encrypted vault/passphrase, profile/phone/email management, account deletion with verification, device tracking, and credential verification for flows like “disable 2FA”.

### Tech Stack
| Layer | Technology |
|-------|------------|
| Frontend | Vue 3, Vue Router, Vite 7, AWS Amplify v6 |
| Auth | Cognito User Pool (email sign-in, optional MFA, TOTP) |
| API | API Gateway REST + Cognito authorizer |
| Compute | Lambda (Node 20), 128MB, 3–5s timeout |
| Data | DynamoDB (UserSecurity, EmailMapping, DeviceTracking), KMS for vault/passphrase |
| Infra | AWS CDK v2, single stack, free-tier oriented |

### High-Level Flow
1. User signs up → Cognito + PreSignUp/PostConfirmation Lambdas → DynamoDB (UserSecurity, EmailMapping).
2. Login → `GET /auth-methods` (email) → sign-in (Amplify) → optional MFA → PostAuthentication Lambda (device tracking, optional SES).
3. Authenticated actions (profile, vault, account delete, verify-credentials) go through API Gateway with Cognito JWT.

### Key Files
- **Frontend:** `src/services/auth.js`, `src/views/LoginView.vue`, `src/views/AdminView.vue`, `src/router/index.js`, `src/aws-exports.js`
- **Infra:** `infra/stack.js`, `infra/create.js`, `infra/destroy.js`, `infra/lambda/*.js`
- **Docs:** `docs/aws-cognito-implementation-plan.md`, `INFRASTRUCTURE.md`, `docs/2fa-disable-fix.md`

---

## 2. Optimizations (Already in Place)

- **Single CDK stack** – All resources in `stack.js`; no scattered lib/bin/scripts.
- **Free-tier tuning** – DynamoDB provisioned 1 RCU/WCU, Lambda 128MB, no custom KMS/Secrets Manager in early design (KMS is used for vault now).
- **Deploy automation** – `create.js` deploys and writes User Pool ID, Client ID, API URL into `src/aws-exports.js`.
- **CORS and 4xx/5xx** – API Gateway CORS and gateway responses for errors.
- **2FA disable flow** – Dedicated `verifyCredentials` Lambda + `/verify-credentials` so password/TOTP are verified without creating a new session.
- **Structured Lambda** – Shared `lambda/utils` (validation, logger, errors, secrets) and `lambda/types`.

---

## 3. Recommendations

### 3.1 Code & Consistency

| Item | Recommendation |
|------|----------------|
| **Unused / duplicate code** | `src/services/auth-optimized.js` and `infra/lambda/getAuthMethods-v2.js` are not used (app uses `auth.js` and `getAuthMethods.js`). Either wire the app to the optimized path (e.g. use `getAuthMethodsCached` and `getAuthMethods-v2` in the stack) or remove them to avoid confusion. |
| **Single auth entrypoint** | Prefer one auth module. If keeping `auth-optimized.js`, have `auth.js` re-export or call it for `getAuthMethods` and sign-in so login benefits from caching and fewer calls. |
| **README** | Root `README.md` is generic Vue/Vite. Add 2–3 lines: project name, “Cognito security demo,” and “See INFRASTRUCTURE.md and docs/” for setup and architecture. |

### 3.2 Security

| Item | Recommendation |
|------|----------------|
| **aws-exports.js** | Contains pool ID, client ID, API URL. Ensure it’s in `.gitignore` for real deployments or use env-based config so production values aren’t committed. |
| **CORS** | API uses `allowOrigins: Cors.ALL_ORIGINS`. For production, restrict to your app origin(s). |
| **SES_SENDER_EMAIL** | Stack uses `process.env.SES_SENDER_EMAIL ?? 'noreply@example.com'`. Require this (and document it) for non-dev so emails aren’t sent from a placeholder. |
| **Advanced Security** | Cognito has `advancedSecurityMode: OFF`. For production, consider `AUDIT` or `ENFORCED` for risk-based adaptive auth. |

### 3.3 Frontend

| Item | Recommendation |
|------|----------------|
| **Device metadata on sign-in** | `auth.js` has `getDeviceMetadata()` but `handleSignIn` doesn’t pass `clientMetadata`. PostAuthentication Lambda can use it for device tracking; pass it in `signIn({ ... options: { clientMetadata: getDeviceMetadata() } })`. |
| **Error handling** | `getAuthMethods` falls back to `{ password: true }` on API errors. Consider a clear “Service temporarily unavailable” state instead of silently defaulting to password. |
| **Console logging** | Remove or guard `console.log` in auth flows (e.g. “Attempting sign-in for:”, “Resending signup code to:”) for production. |

### 3.4 Backend / Lambda

| Item | Recommendation |
|------|----------------|
| **Lambda handler** | Stack points to `getAuthMethods.handler`; `getAuthMethods-v2.js` exists but isn’t referenced. Either switch handler to v2 after validation or delete v2. |
| **Lambda bundle** | All Lambdas use `Code.fromAsset('lambda')` (whole directory). Consider per-handler assets or esbuild to reduce cold start and deployment size. |
| **Idempotency** | For critical operations (e.g. account delete, email/phone change), consider idempotency keys or checks to avoid double execution. |
| **Env validation** | Validate required env (e.g. `TABLE_NAME`, `USER_POOL_ID`, `KMS_KEY_ID`) at Lambda init and fail fast with a clear message. |

### 3.5 Infrastructure & Ops

| Item | Recommendation |
|------|----------------|
| **DynamoDB** | Provisioned 1 RCU/WCU is fine for free tier; for production or variable load, consider PAY_PER_REQUEST or higher capacity with scaling. |
| **Region** | Stack is fixed to `us-east-1`. Document or parameterize if you need other regions. |
| **Alarms** | Add CloudWatch alarms for Lambda errors, DynamoDB throttles, and API Gateway 5xx. |
| **Secrets** | INFRASTRUCTURE.md says “Using environment variables”; for production, consider Secrets Manager or SSM for `ENCRYPTION_KEY` and similar. |

### 3.6 Testing & Quality

| Item | Recommendation |
|------|----------------|
| **Frontend tests** | No Vue/Vitest (or similar) tests found. Add a few unit tests for auth service and critical flows (e.g. getAuthMethods, sign-in error handling). |
| **Lambda tests** | `infra/tests/` has preSignUp, postConfirmation, postAuthentication tests. Run them in CI (e.g. `cd infra && npm test`). |
| **E2E** | `.gitignore` references Cypress; no Cypress files in the tree. Add minimal E2E for login → admin and 2FA disable if you rely on these flows. |

### 3.7 Documentation & Repo Hygiene

| Item | Recommendation |
|------|----------------|
| **Implementation plan** | `docs/aws-cognito-implementation-plan.md` is detailed; keep it as the source of truth and trim duplicate info in other docs. |
| **cdk.out** | Already in `.gitignore`; ensure `infra/cdk.out` and `infra/cdk.context.json` are never committed. |
| **outputs.json** | If it contains IDs/URLs, add `infra/outputs.json` to `.gitignore` and generate it only in CI or locally. |

---

## 4. Quick Wins (Priority Order)

1. **Use or remove optimized auth** – Integrate `auth-optimized.js` and optionally `getAuthMethods-v2` in the app and stack, or delete both.
2. **Tighten production config** – Restrict CORS, require `SES_SENDER_EMAIL`, and avoid committing real `aws-exports.js`/outputs.
3. **Pass device metadata on sign-in** – Use `getDeviceMetadata()` in `handleSignIn` so PostAuthentication can record it.
4. **Reduce console noise** – Guard or remove `console.log` in auth and login flows.
5. **Add README line** – One short paragraph describing the project and pointing to INFRASTRUCTURE.md and docs.

---

## 5. Summary

The project is a coherent Cognito-centric security demo with a clear split between Vue frontend and CDK-defined backend. Infra is consolidated and free-tier friendly; the main gaps are unused optimized code paths, production hardening (CORS, secrets, logging), and test coverage. Addressing the quick wins and recommendations above will make the repo easier to maintain and safer for production use.
