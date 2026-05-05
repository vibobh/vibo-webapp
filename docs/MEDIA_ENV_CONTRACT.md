# Vibo media — strict `APP_ENV` contract (Convex)

Media behavior is **environment-isolated**: dev buckets + dev CDN vs production backup buckets + prod CDN.  
Implementation: `convex_app/mediaS3Config.ts`, `convex_app/media.ts`, `convex_app/mediaUrl.ts`.

---

## 1. Environment switch (CRITICAL)

Use **`APP_ENV`** on **Convex** (not only Next.js `.env.local`).

| `APP_ENV` | Upload buckets | Notes |
|-----------|----------------|--------|
| `development` or `dev` (default when unset) | Dev dual-region | `S3_BUCKET_DEV` + `S3_BUCKET_DEV_US` or built-in defaults |
| `production` or `prod` | **Fixed** `vibo-media-backup-eu` + `vibo-media-backup-us` | Ignores `S3_BUCKET_DEV*` and legacy `S3_BUCKET` / `vibo-media-prod-2` |

**Default when `APP_ENV` is unset:** `development` (safe for Convex — we do **not** infer production from `NODE_ENV`).

**Production Convex** must set:

```env
APP_ENV=production
```

**Backwards compatible:** if `APP_ENV` is unset, `VIBO_MEDIA_ENV` / `MEDIA_ENV` / `CONVEX_DEPLOYMENT=dev:*` still influence tier (see `resolveMediaTier()`).

---

## 2. Bucket resolution

### Development

```env
APP_ENV=development

S3_BUCKET_DEV=vibo-media-dev-eu-1
S3_BUCKET_DEV_US=vibo-media-dev-us-1

# Optional region overrides (defaults: eu-west-1 / us-east-1)
# AWS_S3_REGION_DEV_EU=eu-west-1
# AWS_S3_REGION_DEV_US=us-east-1
```

If `S3_BUCKET_DEV` / `S3_BUCKET_DEV_US` are omitted, defaults are **`vibo-media-dev-eu-1`** and **`vibo-media-dev-us-1`**.

### Production

**Do not set** `S3_BUCKET_DEV` / `S3_BUCKET_DEV_US` for upload routing — production always uses:

- `vibo-media-backup-eu` @ `eu-west-1`
- `vibo-media-backup-us` @ `us-east-1`

```env
APP_ENV=production
```

---

## 3. CDN (must match environment)

Reads are **only** `https://{CLOUDFRONT_DOMAIN}/{key}` — **never** `*.s3.*.amazonaws.com`.

| Environment | Example `CLOUDFRONT_DOMAIN` (hostname only) |
|-------------|---------------------------------------------|
| Development | `dev-cdn.joinvibo.com` |
| Production | `cdn.joinvibo.com` |

Set on **Convex**: `CLOUDFRONT_DOMAIN` or `AWS_CLOUDFRONT_DOMAIN`.  
**Hostname only** — no `https://` (the code strips it if present).  
Also supported: `resolvePublicMediaUrl` returns absolute URLs unchanged if the stored value already starts with `http`.

This repo does **not** use `NEXT_PUBLIC_CLOUDFRONT_DOMAIN` for Convex media resolution.

---

## 4. DB shape

Store **keys**, not full URLs, e.g. `posts/abc/123.jpg`.  
The app resolves: `https://{CLOUDFRONT_DOMAIN}/posts/...`.

---

## 5. Upload flow

- Presigned **PUT** to **EU then US** (same key) — `getDualRegionUploadTargets()`.
- Client: `src/lib/media/dualRegionPut.ts` — parallel PUTs + retries.

---

## 6. Rules (no exceptions)

- Do **not** mix dev EU with prod US (or vice versa) in one deployment.
- Do **not** construct public **S3** URLs for media reads — **CDN only**.
- Do **not** rely on `vibo-media-prod-2` for this dual-region path in production (prod uploads use **backup** buckets above).

---

## 7. Validation checklist

- [ ] `APP_ENV=production` on prod Convex; `APP_ENV=development` (or unset) on dev.
- [ ] Upload → object in **both** EU and US targets for that tier.
- [ ] Browser loads images from **`https://{CLOUDFRONT_DOMAIN}/...`** only.
- [ ] Dev content never served from production CDN (separate `CLOUDFRONT_DOMAIN` per env).
- [ ] AWS keys only in Convex / server — never `NEXT_PUBLIC_*`.

---

## 8. Next.js `.env.local`

Still needs `NEXT_PUBLIC_CONVEX_URL` (etc.) so the app can call Convex.  
**Bucket and `APP_ENV` for uploads** must match what is set on the **Convex** deployment your app talks to.
