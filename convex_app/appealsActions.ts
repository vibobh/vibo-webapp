"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action } from "./_generated/server";

/** Internal user row for server actions — avoids incorrect `getById` union on `runQuery` inference. */
function userDocForEmail(
  row: unknown,
): (Doc<"users"> & { email?: string }) | null {
  if (row == null) return null;
  if (
    typeof row === "object" &&
    "restricted" in row &&
    (row as { restricted?: unknown }).restricted === true
  ) {
    return null;
  }
  return row as Doc<"users"> & { email?: string };
}

// ============================================
// EMAIL INFRASTRUCTURE
// ============================================

const PRIMARY_COLOR = "#4a0315";
const SECONDARY_COLOR = "#e0d9c7";

type EmailProvider = "resend" | "aws_ses";

function getEmailProvider(): EmailProvider {
  const raw = (process.env.EMAIL_PROVIDER ?? "resend").trim().toLowerCase();
  if (raw === "aws" || raw === "ses" || raw === "aws_ses") return "aws_ses";
  return "resend";
}

function getFromEmail(provider: EmailProvider): string {
  const providerSpecific =
    provider === "resend"
      ? process.env.RESEND_FROM_EMAIL
      : process.env.AWS_SES_FROM_EMAIL;
  const fallback = process.env.MAIL_FROM_ADDRESS;
  return (providerSpecific ?? fallback ?? "").trim().toLowerCase();
}

function getResendApiKey(): string {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  if (!apiKey) throw new Error("Missing RESEND_API_KEY");
  return apiKey;
}

async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const provider = getEmailProvider();
  const fromEmail = getFromEmail(provider);
  if (!fromEmail) return;

  if (provider === "resend") {
    const apiKey = getResendApiKey();
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
      }),
    });
    if (!response.ok) {
      const txt = await response.text().catch(() => "");
      console.error("Email send failed:", txt);
    }
  }
}

// ============================================
// VIBO EMAIL TEMPLATE WRAPPER
// ============================================

function viboEmailWrapper(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #fafafa; }
    .container { max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: ${PRIMARY_COLOR}; padding: 32px; text-align: center; }
    .logo { color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
    .content { padding: 40px 32px; text-align: center; }
    .title { color: #262626; font-size: 22px; font-weight: 600; margin-bottom: 16px; }
    .subtitle { color: #8e8e8e; font-size: 16px; line-height: 1.6; margin-bottom: 24px; }
    .info-box { background: ${SECONDARY_COLOR}; border-radius: 12px; padding: 20px; margin: 24px 0; text-align: left; }
    .info-label { color: ${PRIMARY_COLOR}; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .info-value { color: #262626; font-size: 15px; line-height: 1.5; }
    .status-badge { display: inline-block; padding: 6px 16px; border-radius: 20px; font-size: 14px; font-weight: 600; margin: 16px 0; }
    .status-success { background: #dcfce7; color: #166534; }
    .status-danger { background: #fee2e2; color: #991b1b; }
    .status-warning { background: #fef3c7; color: #92400e; }
    .status-info { background: #dbeafe; color: #1e40af; }
    .cta { background: ${PRIMARY_COLOR}; color: #ffffff; padding: 14px 28px; border-radius: 12px; text-decoration: none; display: inline-block; font-weight: 600; font-size: 15px; margin-top: 16px; }
    .footer { background: #fafafa; padding: 24px 32px; text-align: center; border-top: 1px solid #dbdbdb; }
    .footer-text { color: #a8a8a8; font-size: 12px; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Vibo</div>
    </div>
    <div class="content">
      ${bodyHtml}
    </div>
    <div class="footer">
      <div class="footer-text">If you have any questions, please contact our support team.<br>&copy; 2026 Vibo. All rights reserved.</div>
    </div>
  </div>
</body>
</html>`;
}

// ============================================
// EMAIL TEMPLATE BUILDERS
// ============================================

function getAppealSubmittedEmail(username: string) {
  const body = `
    <div class="title">Appeal Received</div>
    <div class="subtitle">Hi ${username}, we've received your appeal and it is now under review by our moderation team.</div>
    <div class="status-badge status-info">Under Review</div>
    <div class="subtitle" style="margin-top: 16px;">We'll notify you by email once a decision has been made. This usually takes 1-3 business days.</div>`;
  return {
    subject: "Vibo: Your Appeal Has Been Received",
    html: viboEmailWrapper("Appeal Received", body),
    text: `Hi ${username}, your appeal has been received and is under review. We'll notify you once a decision has been made.`,
  };
}

function getAppealApprovedEmail(username: string) {
  const body = `
    <div class="title">Appeal Approved</div>
    <div class="subtitle">Great news, ${username}! Your appeal has been reviewed and approved.</div>
    <div class="status-badge status-success">Account Restored</div>
    <div class="subtitle" style="margin-top: 16px;">Your account restrictions have been lifted and you now have full access to Vibo again.</div>
    <a href="https://joinvibo.com" class="cta">Open Vibo</a>`;
  return {
    subject: "Vibo: Your Appeal Has Been Approved",
    html: viboEmailWrapper("Appeal Approved", body),
    text: `Hi ${username}, your appeal has been approved. Your account has been restored and you now have full access to Vibo.`,
  };
}

function getAppealRejectedEmail(username: string) {
  const body = `
    <div class="title">Appeal Reviewed</div>
    <div class="subtitle">Hi ${username}, after careful review, your appeal has not been approved.</div>
    <div class="status-badge status-danger">Appeal Rejected</div>
    <div class="subtitle" style="margin-top: 16px;">Your current account restrictions remain in place. If you believe this decision was made in error, you may submit a new appeal with additional information.</div>`;
  return {
    subject: "Vibo: Appeal Update",
    html: viboEmailWrapper("Appeal Reviewed", body),
    text: `Hi ${username}, after careful review, your appeal has not been approved. Your current restrictions remain in place.`,
  };
}

function getAccountBannedEmail(username: string, reason: string) {
  const body = `
    <div class="title">Account Banned</div>
    <div class="subtitle">Hi ${username}, your Vibo account has been banned for violating our community guidelines.</div>
    <div class="status-badge status-danger">Account Banned</div>
    <div class="info-box">
      <div class="info-label">Reason</div>
      <div class="info-value">${reason || "Violation of community guidelines"}</div>
    </div>
    <div class="subtitle">If you believe this was a mistake, you can submit an appeal through the app.</div>`;
  return {
    subject: "Vibo: Account Banned",
    html: viboEmailWrapper("Account Banned", body),
    text: `Hi ${username}, your Vibo account has been banned. Reason: ${reason || "Violation of community guidelines"}. You can submit an appeal through the app.`,
  };
}

function getAccountSuspendedEmail(
  username: string,
  reason: string,
  duration?: string,
) {
  const durationInfo = duration
    ? `<div class="info-box"><div class="info-label">Duration</div><div class="info-value">${duration}</div></div>`
    : "";
  const body = `
    <div class="title">Account Suspended</div>
    <div class="subtitle">Hi ${username}, your Vibo account has been temporarily suspended.</div>
    <div class="status-badge status-warning">Account Suspended</div>
    <div class="info-box">
      <div class="info-label">Reason</div>
      <div class="info-value">${reason || "Violation of community guidelines"}</div>
    </div>
    ${durationInfo}
    <div class="subtitle">If you believe this was a mistake, you can submit an appeal through the app.</div>`;
  return {
    subject: "Vibo: Account Suspended",
    html: viboEmailWrapper("Account Suspended", body),
    text: `Hi ${username}, your Vibo account has been suspended. Reason: ${reason || "Violation of community guidelines"}. You can submit an appeal through the app.`,
  };
}

function getAccountRestoredEmail(
  username: string,
  restoredFrom: "banned" | "suspended",
  adminNote?: string,
) {
  const isBanned = restoredFrom === "banned";
  const title = isBanned ? "You’re Unbanned" : "Suspension Lifted";
  const statusLabel = isBanned ? "Account Restored" : "Access Restored";
  const statusClass = isBanned ? "status-success" : "status-info";

  const body = `
    <div class="title">${title}</div>
    <div class="subtitle">Hi ${username}, good news. Your account restriction has been lifted${adminNote ? ` — ${adminNote}` : ""}.</div>
    <div class="status-badge ${statusClass}">${statusLabel}</div>
    <div class="subtitle" style="margin-top: 16px;">You should regain full access to Vibo immediately.</div>
    <div class="subtitle" style="margin-top: 12px;">If you have any issues logging in, contact our support team.</div>
    <a href="https://joinvibo.com" class="cta">Open Vibo</a>
  `;

  return {
    subject: isBanned ? "Vibo: You’re Unbanned" : "Vibo: Suspension Lifted",
    html: viboEmailWrapper(title, body),
    text: `Hi ${username}, your account restriction has been lifted. You should regain full access to Vibo immediately.`,
  };
}

// ============================================
// ACTIONS (email-sending, runs in Node runtime)
// ============================================

export const sendAppealSubmittedEmail = action({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = userDocForEmail(
      await ctx.runQuery(internal.users.getUserDocInternal, { id: userId }),
    );
    if (!user?.email) return;
    const username =
      user.username ?? user.fullName ?? user.email.split("@")[0] ?? "there";
    const template = getAppealSubmittedEmail(username);
    await sendEmail({ to: user.email, ...template });
  },
});

export const sendAppealApprovedEmail = action({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = userDocForEmail(
      await ctx.runQuery(internal.users.getUserDocInternal, { id: userId }),
    );
    if (!user?.email) return;
    const username =
      user.username ?? user.fullName ?? user.email.split("@")[0] ?? "there";
    const template = getAppealApprovedEmail(username);
    await sendEmail({ to: user.email, ...template });
  },
});

export const sendAppealRejectedEmail = action({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const user = userDocForEmail(
      await ctx.runQuery(internal.users.getUserDocInternal, { id: userId }),
    );
    if (!user?.email) return;
    const username =
      user.username ?? user.fullName ?? user.email.split("@")[0] ?? "there";
    const template = getAppealRejectedEmail(username);
    await sendEmail({ to: user.email, ...template });
  },
});

export const sendAccountBannedEmail = action({
  args: { userId: v.id("users"), reason: v.optional(v.string()) },
  handler: async (ctx, { userId, reason }) => {
    const user = userDocForEmail(
      await ctx.runQuery(internal.users.getUserDocInternal, { id: userId }),
    );
    if (!user?.email) return;
    const username =
      user.username ?? user.fullName ?? user.email.split("@")[0] ?? "there";
    const template = getAccountBannedEmail(username, reason ?? "");
    await sendEmail({ to: user.email, ...template });
  },
});

export const sendAccountSuspendedEmail = action({
  args: {
    userId: v.id("users"),
    reason: v.optional(v.string()),
    duration: v.optional(v.string()),
  },
  handler: async (ctx, { userId, reason, duration }) => {
    const user = userDocForEmail(
      await ctx.runQuery(internal.users.getUserDocInternal, { id: userId }),
    );
    if (!user?.email) return;
    const username =
      user.username ?? user.fullName ?? user.email.split("@")[0] ?? "there";
    const template = getAccountSuspendedEmail(username, reason ?? "", duration);
    await sendEmail({ to: user.email, ...template });
  },
});

export const sendAccountRestoredEmail = action({
  args: {
    userId: v.id("users"),
    restoredFrom: v.union(v.literal("banned"), v.literal("suspended")),
    adminNote: v.optional(v.string()),
  },
  handler: async (ctx, { userId, restoredFrom, adminNote }) => {
    const user = userDocForEmail(
      await ctx.runQuery(internal.users.getUserDocInternal, { id: userId }),
    );
    if (!user?.email) return;
    const username =
      user.username ?? user.fullName ?? user.email.split("@")[0] ?? "there";
    const template = getAccountRestoredEmail(username, restoredFrom, adminNote);
    await sendEmail({ to: user.email, ...template });
  },
});
