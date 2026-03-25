import { action } from "./_generated/server";
import { v } from "convex/values";

/** Consumer / free email domains — business inquiries must use a company domain. */
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

const ADMIN_TO = "joinvibo@gmail.com";
const TEAM_TO = "businesses@joinvibo.com";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isCompanyEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase();
  const m = /^[^\s@]+@([^\s@]+)$/.exec(trimmed);
  if (!m) return false;
  const domain = m[1];
  if (BLOCKED_EMAIL_DOMAINS.has(domain)) return false;
  return true;
}

async function sendResendEmail(args: {
  apiKey: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<void> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${args.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: args.from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      ...(args.replyTo ? { reply_to: args.replyTo } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error ${res.status}: ${text.slice(0, 500)}`);
  }
}

export const submitBusinessInquiry = action({
  args: {
    firstName: v.string(),
    lastName: v.string(),
    companyName: v.string(),
    companyEmail: v.string(),
    message: v.string(),
  },
  handler: async (_ctx, args) => {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("Email is not configured (missing RESEND_API_KEY in Convex).");
    }

    const from =
      process.env.RESEND_FROM_EMAIL?.trim() || "Vibo Business <onboarding@resend.dev>";

    const firstName = args.firstName.trim().slice(0, 80);
    const lastName = args.lastName.trim().slice(0, 80);
    const companyName = args.companyName.trim().slice(0, 120);
    const companyEmail = args.companyEmail.trim().toLowerCase().slice(0, 120);
    const message = args.message.trim().slice(0, 8000);

    if (!firstName || !lastName || !companyName || !companyEmail || !message) {
      throw new Error("Please fill in all fields.");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(companyEmail)) {
      throw new Error("Please enter a valid email address.");
    }

    if (!isCompanyEmail(companyEmail)) {
      throw new Error(
        "Please use your company email address (personal inboxes like Gmail are not accepted).",
      );
    }

    const safe = {
      firstName: escapeHtml(firstName),
      lastName: escapeHtml(lastName),
      companyName: escapeHtml(companyName),
      companyEmail: escapeHtml(companyEmail),
      message: escapeHtml(message).replace(/\n/g, "<br/>"),
    };

    const internalSubject = `[Vibo Business] Inquiry from ${firstName} ${lastName} — ${companyName}`;
    const internalHtml = `
      <h2>New business contact</h2>
      <table style="border-collapse:collapse;font-family:system-ui,sans-serif;font-size:14px;">
        <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Name</td><td>${safe.firstName} ${safe.lastName}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Company</td><td>${safe.companyName}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;font-weight:600;">Email</td><td><a href="mailto:${companyEmail}">${safe.companyEmail}</a></td></tr>
      </table>
      <p style="margin-top:16px;font-weight:600;font-family:system-ui,sans-serif;">Message</p>
      <p style="font-family:system-ui,sans-serif;line-height:1.5;color:#333;">${safe.message}</p>
    `;

    await sendResendEmail({
      apiKey,
      from,
      to: [ADMIN_TO, TEAM_TO],
      subject: internalSubject,
      html: internalHtml,
      replyTo: companyEmail,
    });

    const logoUrl = "https://joinvibo.com/Vibo%20App%20icon%20version-01.png";
    const confirmSubject = "We received your message — Vibo for Business";
    const confirmHtml = `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;color:#111;">
        <div style="text-align:center;margin-bottom:20px;">
          <img src="${logoUrl}" alt="Vibo" width="64" height="64" style="display:inline-block;border-radius:14px;" />
        </div>
        <h1 style="font-size:20px;margin:0 0 12px;text-align:center;">Thank you, ${safe.firstName}</h1>
        <p style="font-size:15px;line-height:1.6;color:#444;margin:0 0 16px;text-align:center;">
          Your message has been sent to our team. We’ll get back to you at <strong>${safe.companyEmail}</strong> when we can.
        </p>
        <div style="background:#fdf2f4;border:1px solid rgba(75,4,21,0.12);border-radius:12px;padding:16px 18px;margin-top:8px;">
          <p style="margin:0 0 8px;font-size:13px;color:#4b0415;font-weight:600;">Summary</p>
          <p style="margin:0;font-size:13px;line-height:1.6;color:#333;">
            <strong>Company:</strong> ${safe.companyName}<br/>
            <strong>Name:</strong> ${safe.firstName} ${safe.lastName}
          </p>
        </div>
        <p style="font-size:12px;color:#777;margin-top:24px;text-align:center;">Vibo · <a href="https://joinvibo.com" style="color:#4b0415;">joinvibo.com</a></p>
      </div>
    `;

    try {
      await sendResendEmail({
        apiKey,
        from,
        to: [companyEmail],
        subject: confirmSubject,
        html: confirmHtml,
      });
    } catch {
      /** Confirmation is best-effort; inquiry already reached the team. */
    }

    return { ok: true as const };
  },
});
