/**
 * Sets browser-upload CORS policy on every Vibo S3 bucket.
 * Run once: node scripts/set-s3-cors.mjs
 */
import {
  S3Client,
  PutBucketCorsCommand,
  GetBucketCorsCommand,
} from "@aws-sdk/client-s3";

const CORS_RULE = {
  ID: "vibo-browser-upload",
  AllowedOrigins: ["*"],
  AllowedMethods: ["PUT", "POST", "GET", "HEAD", "DELETE"],
  AllowedHeaders: ["*"],
  ExposeHeaders: ["ETag"],
  MaxAgeSeconds: 3600,
};

const BUCKETS = [
  // primary
  { bucket: process.env.S3_BUCKET ?? "vibo-media-prod-2", region: process.env.AWS_S3_REGION ?? "eu-west-1" },
  // us replica
  ...(process.env.S3_BUCKET_US
    ? [{ bucket: process.env.S3_BUCKET_US, region: process.env.AWS_S3_REGION_US ?? "us-east-1" }]
    : []),
  // eu replica (if separate)
  ...(process.env.S3_BUCKET_EU
    ? [{ bucket: process.env.S3_BUCKET_EU, region: process.env.AWS_S3_REGION_EU ?? "eu-west-1" }]
    : []),
  // hard-code the backup bucket names seen in error logs (from Convex dashboard env)
  { bucket: "vibo-media-backup-eu", region: "eu-west-1" },
  { bucket: "vibo-media-backup-us", region: "us-east-1" },
];

const KEY = process.env.AWS_ACCESS_KEY_ID;
const SECRET = process.env.AWS_SECRET_ACCESS_KEY;

if (!KEY || !SECRET) {
  console.error("❌  AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set.");
  process.exit(1);
}

// Deduplicate by bucket name
const seen = new Set();
const targets = BUCKETS.filter(({ bucket }) => {
  if (seen.has(bucket)) return false;
  seen.add(bucket);
  return true;
});

for (const { bucket, region } of targets) {
  const client = new S3Client({
    region,
    credentials: { accessKeyId: KEY, secretAccessKey: SECRET },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  try {
    await client.send(
      new PutBucketCorsCommand({
        Bucket: bucket,
        CORSConfiguration: { CORSRules: [CORS_RULE] },
      }),
    );
    console.log(`✅  CORS set on  ${bucket}  (${region})`);
  } catch (err) {
    if (err?.name === "NoSuchBucket" || err?.$metadata?.httpStatusCode === 404) {
      console.warn(`⚠️   Bucket not found: ${bucket} — skipping`);
    } else {
      console.error(`❌  Failed for ${bucket}: ${err.message ?? err}`);
    }
  }
}

console.log("\nDone. Re-test the upload in the browser.");
