import { execSync } from 'child_process';

export function recreateS3(arn, region, infraRoot) {
  const bucket = arn.split(':::')[1];
  console.log(`[S3 Module] Starting recreation of bucket: ${bucket} in ${region}...`);
  try {
    execSync(`aws s3 mb s3://${bucket} --region ${region}`, { stdio: 'inherit', cwd: infraRoot });
    console.log(`[S3 Module] Successfully recreated bucket: ${bucket}`);
  } catch (e) {
    console.error(`[S3 Module] Error recreating bucket ${bucket}: ${e.message}`);
    throw e;
  }
}
