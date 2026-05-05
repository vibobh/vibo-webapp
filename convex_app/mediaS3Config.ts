/**
 * Centralized dual-region S3 + CDN resolution (strict dev / prod isolation).
 *
 * Environment switch (CRITICAL for Convex):
 *   `APP_ENV=development` | `production`  (defaults to `development` when unset)
 * Backwards compatible: `VIBO_MEDIA_ENV`, `MEDIA_ENV`, or `CONVEX_DEPLOYMENT=dev:*`
 *
 * Buckets:
 *   development → `S3_BUCKET_DEV` + `S3_BUCKET_DEV_US` (fallback: vibo-media-dev-eu-1 / vibo-media-dev-us-1)
 *   production    → ALWAYS vibo-media-backup-eu + vibo-media-backup-us (no legacy vibo-media-prod-2 here)
 *
 * Reads: only CloudFront — see `mediaUrl.resolvePublicMediaUrl` (never raw S3 URLs).
 */

export type MediaTier = "development" | "production";

export type UploadBucketTarget = {
  bucket: string;
  region: string;
};

export type DualRegionRole = "eu" | "us";

export type DualRegionTarget = UploadBucketTarget & { role: DualRegionRole };

/** Default dev bucket names if `S3_BUCKET_DEV` / `S3_BUCKET_DEV_US` are unset. */
export const DEV_DUAL_REGION_DEFAULTS = {
  bucketEU: "vibo-media-dev-eu-1",
  regionEU: "eu-west-1",
  bucketUS: "vibo-media-dev-us-1",
  regionUS: "us-east-1",
} as const;

/** Production upload targets (fixed; do not swap for S3_BUCKET_DEV or old prod buckets). */
export const PROD_DUAL_REGION_BACKUP = {
  bucketEU: "vibo-media-backup-eu",
  regionEU: "eu-west-1",
  bucketUS: "vibo-media-backup-us",
  regionUS: "us-east-1",
} as const;

function optionalEnv(name: string): string | undefined {
  const value = (process.env[name] ?? "").trim();
  return value || undefined;
}

/** Middle East AWS regions are not supported for this project. */
export function isMiddleEastAwsRegion(region: string): boolean {
  return region.trim().toLowerCase().startsWith("me-");
}

/**
 * Raw `APP_ENV` when set; otherwise `"development"` as the safe default (never infer
 * production from `NODE_ENV` alone — that breaks Convex dev).
 */
export function resolveAppEnvRaw(): string {
  const v = (process.env.APP_ENV ?? "").trim();
  if (v) return v.toLowerCase();
  return "development";
}

export function resolveMediaTier(): MediaTier {
  const explicitApp = (process.env.APP_ENV ?? "").trim();
  if (explicitApp) {
    const a = explicitApp.toLowerCase();
    if (a === "production" || a === "prod") return "production";
    return "development";
  }

  const legacy = (process.env.VIBO_MEDIA_ENV ?? process.env.MEDIA_ENV ?? "")
    .trim()
    .toLowerCase();
  if (legacy === "production" || legacy === "prod") return "production";
  if (legacy === "development" || legacy === "dev") return "development";

  const deployment = (process.env.CONVEX_DEPLOYMENT ?? "").trim().toLowerCase();
  if (deployment.startsWith("dev:")) return "development";

  const nodeEnv = (process.env.NODE_ENV ?? "").trim().toLowerCase();
  if (nodeEnv === "development" || nodeEnv === "test") return "development";

  return "development";
}

export const isDev = (): boolean => resolveMediaTier() === "development";
export const isProd = (): boolean => resolveMediaTier() === "production";

/** @deprecated Use `resolveMediaTier` / `APP_ENV` — kept for older imports. */
export const MEDIA_S3_TIER_CONFIG = {
  development: DEV_DUAL_REGION_DEFAULTS,
  production: PROD_DUAL_REGION_BACKUP,
} as const;

/**
 * Resolved dual-region row for the current tier.
 * Production: only `PROD_DUAL_REGION_BACKUP` (ignores `S3_BUCKET_DEV*` and legacy `S3_BUCKET`).
 * Development: `S3_BUCKET_DEV` / `S3_BUCKET_DEV_US` with optional region overrides.
 */
export function getResolvedMediaS3TierRow() {
  const tier = resolveMediaTier();
  if (tier === "production") {
    return {
      tier,
      regionEU: PROD_DUAL_REGION_BACKUP.regionEU,
      regionUS: PROD_DUAL_REGION_BACKUP.regionUS,
      bucketEU: PROD_DUAL_REGION_BACKUP.bucketEU,
      bucketUS: PROD_DUAL_REGION_BACKUP.bucketUS,
    };
  }
  const bucketEU =
    optionalEnv("S3_BUCKET_DEV") ?? DEV_DUAL_REGION_DEFAULTS.bucketEU;
  const bucketUS =
    optionalEnv("S3_BUCKET_DEV_US") ?? DEV_DUAL_REGION_DEFAULTS.bucketUS;
  const regionEU =
    optionalEnv("AWS_S3_REGION_DEV_EU") ??
    optionalEnv("AWS_S3_REGION_EU") ??
    DEV_DUAL_REGION_DEFAULTS.regionEU;
  const regionUS =
    optionalEnv("AWS_S3_REGION_DEV_US") ??
    optionalEnv("AWS_S3_REGION_US") ??
    DEV_DUAL_REGION_DEFAULTS.regionUS;
  return { tier, regionEU, regionUS, bucketEU, bucketUS };
}

/**
 * Exactly two PUT targets: EU first, then US. Same object key in both buckets.
 */
export function getDualRegionUploadTargets(): DualRegionTarget[] {
  const row = getResolvedMediaS3TierRow();
  const eu = { bucket: row.bucketEU.trim(), region: row.regionEU.trim(), role: "eu" as const };
  const us = { bucket: row.bucketUS.trim(), region: row.regionUS.trim(), role: "us" as const };

  for (const t of [eu, us]) {
    if (!t.bucket) throw new Error(`Missing S3 bucket for ${t.role} (tier: ${row.tier})`);
    if (!t.region) throw new Error(`Missing AWS region for ${t.role} (tier: ${row.tier})`);
    if (isMiddleEastAwsRegion(t.region)) {
      throw new Error(
        `S3 region for ${t.role} must not be a Middle East (me-*) region. Use eu-west-1 or us-east-1.`,
      );
    }
  }

  if (eu.bucket === us.bucket && eu.region === us.region) {
    throw new Error(
      "Dual-region S3: EU and US targets must differ. Check S3_BUCKET_DEV / S3_BUCKET_DEV_US (dev) or backup bucket config (prod).",
    );
  }

  return [eu, us];
}

export function getUploadTargets(): UploadBucketTarget[] {
  return getDualRegionUploadTargets().map(({ bucket, region }) => ({ bucket, region }));
}

/**
 * Legacy “primary” bucket name: dev → EU dev bucket; prod → EU backup bucket.
 * Does not promote old `S3_BUCKET` / `vibo-media-prod-2` in production.
 */
export function resolvePrimaryS3BucketName(): string {
  const row = getResolvedMediaS3TierRow();
  return row.bucketEU;
}
