/**
 * Single resolver for public media URLs — CloudFront only, never raw S3.
 * No Node-only imports: safe in Convex queries and actions.
 *
 * DB stores keys like `posts/{postId}/file.jpg`, not full URLs.
 * `CLOUDFRONT_DOMAIN` must match the environment (e.g. dev-cdn vs prod cdn).
 */

function optionalCloudFrontDomain(): string | undefined {
  const domain = (
    process.env.CLOUDFRONT_DOMAIN ??
    process.env.AWS_CLOUDFRONT_DOMAIN ??
    ""
  ).trim();
  return domain || undefined;
}

/** Strip scheme/path so callers can set `https://cdn.example.com` or `cdn.example.com`. */
export function normalizeCloudFrontHost(domain: string): string {
  let d = domain.trim();
  if (d.startsWith("https://")) d = d.slice(8);
  else if (d.startsWith("http://")) d = d.slice(7);
  const slash = d.indexOf("/");
  if (slash >= 0) d = d.slice(0, slash);
  return d;
}

export function encodeMediaKeyForUrl(key: string): string {
  return key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

/**
 * Public read URL: **only** `https://{CLOUDFRONT_DOMAIN}/{key}`.
 * - Empty key → `""`
 * - Key already absolute (`http`…) → returned as-is (no double CDN wrap)
 * - Otherwise requires `CLOUDFRONT_DOMAIN` (throws if missing)
 *
 * `storageRegion` is ignored — kept for stable call sites / DB field compatibility.
 */
export function resolvePublicMediaUrl(
  key: string,
  cacheBust?: string,
  _storageRegion?: string | null,
): string {
  const k = key.trim();
  if (!k) return "";
  if (k.startsWith("http")) return k;

  const rawDomain = optionalCloudFrontDomain();
  if (!rawDomain) {
    throw new Error(
      "Missing CLOUDFRONT_DOMAIN (or AWS_CLOUDFRONT_DOMAIN). Set dev-cdn… for APP_ENV=development and cdn… for production.",
    );
  }
  const host = normalizeCloudFrontHost(rawDomain);
  if (!host) {
    throw new Error("CLOUDFRONT_DOMAIN is empty after normalization.");
  }

  const encodedKey = encodeMediaKeyForUrl(k);
  const cacheBustParam = cacheBust ? `?v=${cacheBust}` : "";
  return `https://${host}/${encodedKey}${cacheBustParam}`;
}

export function buildPublicMediaUrl(
  key: string,
  cacheBust?: string,
  storageRegion?: string | null,
): string {
  return resolvePublicMediaUrl(key, cacheBust, storageRegion);
}
