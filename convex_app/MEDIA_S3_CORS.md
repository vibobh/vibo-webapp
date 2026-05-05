# S3 CORS for browser uploads (posts, messages, stories)

Presigned PUT URLs are created by the Convex **`generateUploadUrl`** action in [`media.ts`](./media.ts) (`PutObjectCommand` + `getSignedUrl`). The **browser** then `PUT`s the file to `https://<bucket>.s3.<region>.amazonaws.com/...`.

Cross-origin `PUT` triggers a CORS **preflight** (`OPTIONS`). If the bucket has no CORS rule for your site’s origin, the browser shows:

> No `Access-Control-Allow-Origin` header is present on the requested resource.

That is **not** a Convex bug — the S3 bucket must allow your web app’s origin (and the methods/headers you use).

## Required CORS configuration

Apply the **same** CORS JSON to **every** upload bucket you use (dev EU, dev US, prod EU, prod US — see [`mediaS3Config.ts`](./mediaS3Config.ts)).

In AWS Console: **S3** → bucket → **Permissions** → **Cross-origin resource sharing (CORS)** → Edit. Example:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      "https://joinvibo.com",
      "https://www.joinvibo.com"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

- Add each **real** web origin you use (preview deploys, staging, etc.).
- **`PUT`** is required for presigned uploads.
- **`AllowedHeaders: ["*"]`** avoids mismatches when the client sends `Content-Type` (and any extra headers).

After saving, wait a minute and retry the upload from the browser.

## Local dev without changing AWS

The Next.js app can relay uploads server-side (no browser→S3 CORS):

- **Default:** `localhost` / `127.0.0.1` use `/api/media/s3-put` automatically (see `src/lib/media/dualRegionPut.ts`).
- **Override:** `NEXT_PUBLIC_S3_UPLOAD_USE_PROXY=true` (force proxy) or `=false` (force direct PUT even on localhost).

**Limits:** the proxy buffers the file on the Node server. Hosted platforms (e.g. Vercel) impose a **small max body size** (~4.5MB on Hobby). Large videos should use **direct PUT + S3 CORS** instead.

## Security note

Presigned URLs are time-limited and scoped to one object key. Do not log full presigned URLs in client-visible analytics.
