npm run destroy
sleep 30
rm -rf cdk.out
rm -f outputs.json
export SES_SENDER_EMAIL="hello@cryptojogi.com"
export ENCRYPTION_KEY="your-secret-key-for-vault"
npm run create
sleep 30
cd ..
npm run dev
