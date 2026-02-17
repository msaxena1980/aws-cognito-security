#!/bin/bash

# SMS-Enabled Deployment Script
# This script deploys your infrastructure with SMS support

set -e

echo "🚀 AWS Cognito Security - SMS Deployment"
echo "========================================"
echo ""

# Check if AWS CLI is configured
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS CLI not configured. Run 'aws configure' first."
    exit 1
fi

echo "✅ AWS CLI configured"
echo ""

# Prompt for deployment mode
echo "Select deployment mode:"
echo "1) Development (inline codes - FREE)"
echo "2) Testing (email codes - FREE)"
echo "3) Production (real SMS - PAID)"
echo ""
read -p "Enter choice [1-3]: " mode_choice

case $mode_choice in
    1)
        export DEV_SMS_MODE=inline
        echo "📝 Mode: Development (inline codes)"
        ;;
    2)
        export DEV_SMS_MODE=email
        echo "📝 Mode: Testing (email codes)"
        read -p "Enter SES sender email: " ses_email
        export SES_SENDER_EMAIL=$ses_email
        ;;
    3)
        export DEV_SMS_MODE=
        echo "📝 Mode: Production (real SMS)"
        echo ""
        echo "⚠️  WARNING: This will incur SMS costs!"
        echo "   - US/Canada: ~$0.00645 per SMS"
        echo "   - Estimated: $6.45 per 1,000 SMS"
        echo ""
        read -p "Have you requested SNS production access? [y/N]: " sns_prod
        if [[ ! $sns_prod =~ ^[Yy]$ ]]; then
            echo "❌ Please request SNS production access first."
            echo "   See: SMS_SETUP_GUIDE.md for instructions"
            exit 1
        fi
        
        read -p "Have you set SNS spending limit? [y/N]: " sns_limit
        if [[ ! $sns_limit =~ ^[Yy]$ ]]; then
            echo "⚠️  Recommended: Set SNS spending limit"
            echo "   aws sns set-sms-attributes --attributes MonthlySpendLimit=10.00"
            read -p "Continue anyway? [y/N]: " continue_anyway
            if [[ ! $continue_anyway =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi
        ;;
    *)
        echo "❌ Invalid choice"
        exit 1
        ;;
esac

echo ""
echo "📦 Installing Lambda dependencies..."
cd lambda
if [ ! -d "node_modules" ]; then
    npm install
fi

# Check if SNS SDK is installed
if ! npm list @aws-sdk/client-sns &> /dev/null; then
    echo "📦 Installing @aws-sdk/client-sns..."
    npm install @aws-sdk/client-sns
fi

cd ..

echo ""
echo "🏗️  Deploying infrastructure..."
npm run deploy

echo ""
echo "✅ Deployment complete!"
echo ""

# Show next steps based on mode
case $mode_choice in
    1)
        echo "📝 Next steps:"
        echo "   1. Test your application"
        echo "   2. SMS codes will appear in API responses"
        echo "   3. Check CloudWatch logs for verification codes"
        ;;
    2)
        echo "📝 Next steps:"
        echo "   1. Verify your SES sender email if not already done"
        echo "   2. Test phone verification flow"
        echo "   3. Check email inbox for verification codes"
        ;;
    3)
        echo "📝 Next steps:"
        echo "   1. Test with a real phone number"
        echo "   2. Monitor SNS costs in AWS Billing Dashboard"
        echo "   3. Set up CloudWatch alarms for cost monitoring"
        echo "   4. Review SMS_SETUP_GUIDE.md for best practices"
        echo ""
        echo "💰 Cost Monitoring:"
        echo "   aws cloudwatch get-metric-statistics \\"
        echo "     --namespace AWS/SNS \\"
        echo "     --metric-name NumberOfMessagesPublished \\"
        echo "     --start-time \$(date -u -d '1 day ago' +%Y-%m-%dT%H:%M:%S) \\"
        echo "     --end-time \$(date -u +%Y-%m-%dT%H:%M:%S) \\"
        echo "     --period 3600 \\"
        echo "     --statistics Sum"
        ;;
esac

echo ""
echo "🎉 Done!"
