# AWS Cognito Security Demo

A production-ready authentication system built with AWS Cognito, featuring passwordless authentication with WebAuthn passkeys, TOTP 2FA, device tracking, and encrypted vault storage.

## ✨ Key Features

- 🔐 **Email/password authentication** with Cognito
- 👆 **Passwordless authentication** with WebAuthn passkeys (Face ID, Touch ID, Windows Hello)
- 🔒 **TOTP 2FA** (authenticator app) with enable/disable flows
- 📧 **Email OTP verification** for sensitive operations (passkey deletion)
- 📱 **Device fingerprinting** and tracking with security alerts
- 🔐 **KMS-encrypted vault** and passphrase storage
- 👤 **Complete account management** (profile, phone, email, password changes)
- 🗑️ **Account deletion** with passphrase confirmation
- ✅ **Dual verification methods** for passkey deletion (Email OTP or Password + 2FA)

## 🚀 Quick Start

```bash
# 1. Install dependencies
cd infra && npm install && cd ..

# 2. Deploy AWS infrastructure
./infra/create.js

# 3. Start the app
npm run dev
```

Visit http://localhost:5173 and test the application!

## 📚 Complete Documentation

**All detailed documentation is in [`requirements.md`](requirements.md)**

This includes:
- Complete architecture overview
- AWS resource details and configuration
- Lambda function documentation
- API endpoint reference
- Security considerations and best practices
- Testing guide and troubleshooting
- Recent improvements and bug fixes
- Future work and optimizations
- Email OTP configuration guide
- Dual verification method implementation

## 🧪 Testing Passkeys

1. Sign up for an account
2. Navigate to Admin → Passkeys
3. Click "Add Passkey"
4. Complete biometric authentication
5. Sign out
6. Sign in with passkey (one click!)
7. ✅ Authenticated with Cognito tokens

## 💰 Cost

**$0/month** - Optimized for AWS Free Tier:
- Cognito: 50,000 MAUs free
- DynamoDB: 4 tables @ 1 RCU/WCU each
- Lambda: 16 functions @ 128MB
- API Gateway: 1M requests free (first 12 months)
- KMS: 20,000 requests free

**Production estimate:** $5-10/month for low-moderate traffic

## 🛠️ Tech Stack

**Frontend:** Vue 3, Vue Router, AWS Amplify, WebAuthn API  
**Backend:** AWS CDK, Cognito, Lambda (Node.js 20.x), DynamoDB, API Gateway, KMS, SES

## 📁 Project Structure

```
aws-cognito-security/
├── src/                    # Vue 3 frontend
│   ├── views/             # Login, Admin, Passkey views
│   ├── services/          # Auth, passkey, profile services
│   └── components/        # Reusable UI components
├── infra/                 # AWS infrastructure
│   ├── stack.js          # Complete CDK stack
│   ├── create.js         # Deployment script
│   ├── lambda/           # 16 Lambda functions
│   └── tests/            # Lambda tests
├── requirements.md        # Complete documentation
└── README.md             # This file
```

## 🔧 Useful Commands

```bash
./infra/create.js          # Deploy infrastructure
./infra/destroy.js         # Destroy infrastructure
cd infra && npm test       # Run tests
npm run dev                # Start frontend
npm run build              # Build frontend
```

## 🐛 Troubleshooting

See [`requirements.md`](requirements.md) for:
- Deployment troubleshooting
- Email OTP configuration (CloudWatch logs or SES setup)
- Passkey issues
- AWS CLI commands
- Common issues and solutions

## 📝 Recent Improvements

- ✅ Full Cognito integration for passkeys (JWT tokens)
- ✅ Dual verification for passkey deletion (Email OTP or Password + 2FA)
- ✅ One-click passkey authentication
- ✅ LocalStorage state tracking
- ✅ Fixed passkey naming convention
- ✅ Comprehensive bug fixes

See [`requirements.md`](requirements.md) for complete details.

## 🔒 Security

- WebAuthn for passwordless authentication
- TOTP 2FA with authenticator apps
- Email OTP for sensitive operations
- KMS encryption for vault data
- Device tracking and anomaly detection
- Security alerts for new devices

## 📄 License

This is a demo project for educational purposes.

---

**Built with ❤️ using AWS Cognito and Vue 3**
