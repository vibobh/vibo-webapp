/**
 * S3 upload bucket selection by `APP_ENV`.
 *
 * Required in .env / Convex dashboard:
 *
 *   APP_ENV=production | development
 *
 *   # Production buckets (APP_ENV=production)
 *   S3_BUCKET=...          EU primary
 *   S3_BUCKET_US=...       US secondary
 *
 *   # Development buckets (APP_ENV=development or unset)
 *   S3_BUCKET_DEV=...      EU primary
 *   S3_BUCKET_DEV_US=...   US secondary
 *
 * No bucket name is hardcoded here. If a required variable is missing the
 * function throws immediately so the problem is obvious at deploy / run time.
 */

export function isS3UploadAppProduction(): boolean {
  return process.env.APP_ENV === "production";
}

function trimEnv(name: string): string | undefined {
  const v = process.env[name];
  if (v == null) return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function requireBucketEnv(name: string): string {
  const v = trimEnv(name);
  if (!v) {
    throw new Error(
      `Missing required S3 bucket env variable: ${name}. Set it in .env.local (dev) or the Convex dashboard (prod).`,
    );
  }
  return v;
}

/** Primary (EU) upload bucket for the current APP_ENV. */
export function resolveUploadBucketEu(): string {
  return isS3UploadAppProduction()
    ? requireBucketEnv("S3_BUCKET")
    : requireBucketEnv("S3_BUCKET_DEV");
}

/** US secondary upload bucket for the current APP_ENV. */
export function resolveUploadBucketUs(): string {
  return isS3UploadAppProduction()
    ? requireBucketEnv("S3_BUCKET_US")
    : requireBucketEnv("S3_BUCKET_DEV_US");
}
