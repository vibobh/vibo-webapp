/**
 * Blog admin login: env-based accounts + optional JSON list.
 * Normalizes email/password to avoid common copy-paste / Gmail issues.
 */

/** Remove invisible chars and normalize Gmail local part (dots / +alias). */
export function normalizeEmailForLogin(raw: string): string {
  let e = String(raw)
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
  const at = e.lastIndexOf("@");
  if (at <= 0) return e;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (domain === "gmail.com" || domain === "googlemail.com") {
    let l = local.replace(/\./g, "");
    const plus = l.indexOf("+");
    if (plus !== -1) l = l.slice(0, plus);
    return `${l}@${domain}`;
  }
  return e;
}

/** Trim accidental whitespace / BOM from pasted passwords (keeps internal spaces). */
export function normalizePasswordForLogin(raw: string): string {
  return String(raw).replace(/^[\s\uFEFF]+|[\s\uFEFF]+$/g, "");
}

export type BlogAdminAccount = { email: string; password: string };

/**
 * Reads BLOG_ADMIN_EMAIL + BLOG_ADMIN_PASSWORD, optional _2…_10 pairs,
 * and optional BLOG_ADMIN_USERS JSON array.
 */
export function getBlogAdminAccounts(): BlogAdminAccount[] {
  const accounts: BlogAdminAccount[] = [];
  const seen = new Set<string>();

  const add = (emailRaw: string | undefined, passRaw: string | undefined) => {
    const email = normalizeEmailForLogin(String(emailRaw ?? ""));
    const password = normalizePasswordForLogin(String(passRaw ?? ""));
    if (!email || !password) return;
    if (seen.has(email)) return;
    seen.add(email);
    accounts.push({ email, password });
  };

  add(process.env.BLOG_ADMIN_EMAIL, process.env.BLOG_ADMIN_PASSWORD);
  for (let i = 2; i <= 10; i++) {
    add(
      process.env[`BLOG_ADMIN_EMAIL_${i}`],
      process.env[`BLOG_ADMIN_PASSWORD_${i}`],
    );
  }

  const jsonRaw = process.env.BLOG_ADMIN_USERS?.trim();
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw) as unknown;
      if (Array.isArray(parsed)) {
        for (const row of parsed) {
          if (row && typeof row === "object") {
            const o = row as Record<string, unknown>;
            if (typeof o.email === "string" && typeof o.password === "string") {
              add(o.email, o.password);
            }
          }
        }
      }
    } catch {
      // invalid JSON — ignore; env pairs still apply
    }
  }

  return accounts;
}

export function credentialsMatch(
  accounts: BlogAdminAccount[],
  email: string,
  password: string,
): boolean {
  const e = normalizeEmailForLogin(email);
  const p = normalizePasswordForLogin(password);
  return accounts.some((a) => a.email === e && a.password === p);
}
