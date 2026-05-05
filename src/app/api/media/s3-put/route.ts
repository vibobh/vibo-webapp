import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifyToken } from "@/lib/auth/jwt";

export const maxDuration = 120;

/** Reject SSRF / abuse: only forward to AWS S3 presigned PUT URLs. */
function isAllowedPresignedS3PutUrl(urlStr: string): boolean {
  let u: URL;
  try {
    u = new URL(urlStr);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (!h.endsWith(".amazonaws.com")) return false;
  // Virtual-hosted: mybucket.s3.eu-west-1.amazonaws.com — path-style: s3.eu-west-1.amazonaws.com
  const looksLikeS3Host =
    h.includes(".s3.") || h.startsWith("s3.") || h.includes(".s3-");
  if (!looksLikeS3Host) return false;
  const sp = u.searchParams;
  if (!sp.get("X-Amz-Algorithm") || !sp.get("X-Amz-Signature")) return false;
  return true;
}

/**
 * Same-origin relay: browser POSTs here (cookie auth), server PUTs to the presigned S3 URL.
 * Avoids S3 CORS preflight failures on localhost / origins not listed on the bucket.
 *
 * Limits: host platform body size (e.g. Vercel ~4.5MB on Hobby). For large video uploads,
 * configure S3 CORS and use direct `fetch(PUT)` from the client instead (see MEDIA_S3_CORS.md).
 */
export async function POST(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  const user = token ? await verifyToken(token) : null;
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ct = request.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Expected multipart/form-data (fields: url, file; optional contentType)" },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
  }

  const urlRaw = form.get("url");
  const file = form.get("file");
  const typeOverride = form.get("contentType");

  if (typeof urlRaw !== "string" || !urlRaw.trim()) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  const presignedUrl = urlRaw.trim();
  if (!isAllowedPresignedS3PutUrl(presignedUrl)) {
    return NextResponse.json({ error: "Invalid presigned URL" }, { status: 400 });
  }

  const contentType =
    (typeof typeOverride === "string" && typeOverride.trim()) ||
    file.type ||
    "application/octet-stream";

  const bodyBuf = Buffer.from(await file.arrayBuffer());

  const upstream = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: bodyBuf,
  });

  if (!upstream.ok) {
    const snippet = await upstream.text().catch(() => "");
    return NextResponse.json(
      {
        error: `S3 rejected upload (${upstream.status})`,
        detail: snippet.slice(0, 500),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
