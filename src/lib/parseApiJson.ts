/**
 * Parse JSON from a fetch Response. If the server returned HTML (error pages,
 * Vercel 502, Next error overlay), throw a clear error instead of JSON.parse failing.
 */
export async function parseApiJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const trimmed = text.trim();

  if (!trimmed) {
    if (!response.ok) {
      throw new Error(`Empty response (HTTP ${response.status}). Check Vercel logs and env vars.`);
    }
    return {} as T;
  }

  if (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<HTML")
  ) {
    throw new Error(
      `Server returned HTML instead of JSON (HTTP ${response.status}). ` +
        `On production this usually means: missing or wrong env vars on Vercel (NEXT_PUBLIC_CONVEX_URL, BLOG_ADMIN_SECRET, BLOG_SESSION_SECRET), ` +
        `Convex secret mismatch, or the API route crashed. Redeploy after fixing. See docs/BLOG.md.`,
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Invalid JSON from server (HTTP ${response.status}): ${trimmed.slice(0, 160)}${trimmed.length > 160 ? "…" : ""}`,
    );
  }
}
