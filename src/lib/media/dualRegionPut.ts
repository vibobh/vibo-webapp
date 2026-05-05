/**
 * Client-side dual-region S3 PUT: uploads the same bytes to every presigned URL
 * returned by `api.media.generateUploadUrl` (see `convex_app/media.ts`) / draft uploads.
 *
 * Security: only presigned URLs are used — no AWS credentials on the client.
 *
 * **CORS:** Browser `PUT` to `*.amazonaws.com` requires S3 bucket CORS allowing your web
 * origin. If preflight fails, localhost defaults to same-origin relay `/api/media/s3-put`
 * (cookie auth). Override with `NEXT_PUBLIC_S3_UPLOAD_USE_PROXY=true|false`. See
 * `convex_app/MEDIA_S3_CORS.md`.
 */

export type PresignedUploadPack = {
  uploadUrl: string;
  fallbackUploadUrls?: string[];
  uploadRegions: string[];
  dualRegionWrite?: boolean;
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** When true, uploads go through same-origin `/api/media/s3-put` (no S3 CORS on browser). */
export function shouldUseS3UploadProxy(): boolean {
  if (typeof window === "undefined") return false;
  const flag = process.env.NEXT_PUBLIC_S3_UPLOAD_USE_PROXY?.trim().toLowerCase();
  if (flag === "true" || flag === "1") return true;
  if (flag === "false" || flag === "0") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

async function putViaNextProxy(
  presignedUrl: string,
  contentType: string,
  body: Blob,
  opts?: { signal?: AbortSignal },
): Promise<void> {
  const form = new FormData();
  form.append("url", presignedUrl);
  form.append("contentType", contentType);
  form.append("file", body, "upload");
  const res = await fetch("/api/media/s3-put", {
    method: "POST",
    body: form,
    credentials: "include",
    signal: opts?.signal,
  });
  if (!res.ok) {
    let msg = `Upload proxy failed (${res.status})`;
    try {
      const j = (await res.json()) as { error?: string; detail?: string };
      if (j.error) msg = j.error;
      if (j.detail) msg += `: ${j.detail}`;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
}

/**
 * PUT `body` to a single presigned URL with retries and basic logging.
 */
async function putOnceWithRetry(
  url: string,
  contentType: string,
  body: Blob,
  opts?: { maxAttempts?: number; baseDelayMs?: number; signal?: AbortSignal },
): Promise<void> {
  const maxAttempts = Math.max(1, opts?.maxAttempts ?? 3);
  const baseDelayMs = opts?.baseDelayMs ?? 400;
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      if (shouldUseS3UploadProxy()) {
        await putViaNextProxy(url, contentType, body, { signal: opts?.signal });
      } else {
        const res = await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body,
          signal: opts?.signal,
        });
        if (!res.ok) {
          throw new Error(`S3 PUT failed (${res.status})`);
        }
      }
      return;
    } catch (e) {
      lastErr = e;
      if (attempt < maxAttempts - 1) {
        const wait = baseDelayMs * (attempt + 1);
        if (typeof console !== "undefined" && console.warn) {
          console.warn(`[dualRegionPut] retry ${attempt + 1}/${maxAttempts - 1} in ${wait}ms`, e);
        }
        await sleep(wait);
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("S3 upload failed");
}

/**
 * Writes to **all** presigned targets in parallel (typically EU + US).
 * If any target fails after retries, the whole call rejects (caller can surface UI error).
 *
 * @returns Canonical `storageRegion` for DB (first region = EU primary).
 */
export async function putFileToAllDualRegionTargets(
  file: Blob,
  contentType: string,
  pack: PresignedUploadPack,
  opts?: { maxAttemptsPerUrl?: number; signal?: AbortSignal },
): Promise<{ storageRegion: string }> {
  const urls = [pack.uploadUrl, ...(pack.fallbackUploadUrls ?? [])].filter(Boolean);
  if (urls.length === 0) {
    throw new Error("No presigned upload URLs");
  }

  const perUrl = opts?.maxAttemptsPerUrl ?? 3;

  await Promise.all(
    urls.map((url) =>
      putOnceWithRetry(url, contentType, file, {
        maxAttempts: perUrl,
        signal: opts?.signal,
      }),
    ),
  );

  const storageRegion =
    pack.uploadRegions[0] ?? pack.uploadRegions.at(0) ?? "eu-west-1";
  return { storageRegion };
}
