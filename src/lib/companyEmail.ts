/** Domains we reject for “company email” (consumer / free inboxes). Keep in sync with `convex/contact.ts`. */
const BLOCKED_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "ymail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "gmx.com",
  "gmx.net",
  "mail.com",
  "zohomail.com",
  "yandex.com",
  "yandex.ru",
  "duck.com",
  "tutanota.com",
  "tuta.io",
  "hey.com",
  "fastmail.com",
  "qq.com",
  "163.com",
  "126.com",
  "mail.ru",
  "inbox.com",
]);

export function isCompanyEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  const m = /^[^\s@]+@([^\s@]+)$/.exec(trimmed);
  if (!m) return false;
  const domain = m[1];
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) return false;
  return true;
}

export function companyEmailHint(): string {
  return "Use your work email (Gmail/Yahoo/Hotmail, etc. are not accepted).";
}
