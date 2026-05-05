"use node";

import { randomBytes, randomInt, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const scryptAsync = promisify(scrypt);
const SALT_LEN = 16;
const KEY_LEN = 32;
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function otpPepper(): string {
  const p = process.env.SIGNUP_OTP_PEPPER?.trim();
  if (p && p.length >= 16) return p;
  const fallback = process.env.AUTH_PRIVATE_KEY?.trim().slice(0, 48);
  if (fallback && fallback.length >= 16) return fallback;
  throw new Error(
    "Set SIGNUP_OTP_PEPPER (16+ chars) in Convex environment variables for signup email verification.",
  );
}

async function hashOtpCode(email: string, code: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const material = `${otpPepper()}|${normalizeEmail(email)}|${code}`;
  const derived = (await scryptAsync(material, salt, KEY_LEN)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

async function verifyOtpCode(email: string, code: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const material = `${otpPepper()}|${normalizeEmail(email)}|${code}`;
  const derived = (await scryptAsync(material, salt, KEY_LEN)) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

function validateUsername(username: string): string | null {
  const u = username.trim();
  if (u.length < 3 || u.length > 32) return "Username must be 3–32 characters";
  if (!/^[a-zA-Z0-9_]+$/.test(u)) return "Username may only contain letters, numbers, and underscores";
  return null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendResendEmail(args: {
  apiKey: string;
  from: string;
  to: string[];
  subject: string;
  html: string;
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
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend error ${res.status}: ${text.slice(0, 500)}`);
  }
}

function buildVerificationEmailHtml(code: string): string {
  const c = escapeHtml(code);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Verify your email</title>
</head>
<body style="margin:0;padding:0;background:#f6f3ee;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f3ee;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 12px 40px rgba(75,4,21,0.08);">
          <tr>
            <td style="padding:28px 28px 8px 28px;text-align:center;">
              <div style="display:inline-block;padding:10px 14px;border-radius:12px;background:rgba(75,4,21,0.06);color:#4b0415;font-weight:700;font-size:15px;letter-spacing:0.02em;">Vibo</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 4px 28px;text-align:center;">
              <h1 style="margin:0;font-size:22px;line-height:1.25;color:#111827;font-weight:700;">Verify your email</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 24px 28px;text-align:center;color:#6b7280;font-size:15px;line-height:1.55;">
              Use this code to finish creating your Vibo account. It expires in 10 minutes.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 28px 28px 28px;">
              <div style="display:inline-block;padding:18px 32px;border-radius:14px;background:linear-gradient(135deg,#4b0415,#6d0a24);color:#ffffff;font-size:28px;font-weight:800;letter-spacing:0.35em;text-indent:0.35em;font-variant-numeric:tabular-nums;">
                ${c}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px 28px;text-align:center;color:#9ca3af;font-size:12px;line-height:1.5;">
              If you didn’t request this, you can ignore this email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export const sendSignupVerificationEmail = action({
  args: {
    email: v.string(),
    username: v.string(),
    fullName: v.string(),
    phone: v.string(),
    countryCode: v.optional(v.string()),
    preferredLang: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ ok: true; cooldownSeconds?: number }> => {
    const email = normalizeEmail(args.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Invalid email address");
    }
    const userErr = validateUsername(args.username);
    if (userErr) throw new Error(userErr);
    if (!args.fullName.trim()) throw new Error("Full name is required");
    const phoneTrim = args.phone.trim();
    const digits = phoneTrim.replace(/\D/g, "");
    if (!phoneTrim || digits.length < 6) {
      throw new Error("Enter a valid phone number with country code (too few digits).");
    }

    const existingEmail: unknown = await ctx.runQuery(internal.users.getByEmailInternal, { email });
    if (existingEmail) throw new Error("Email already registered");

    const uname = args.username.trim();
    const existingUsername: unknown = await ctx.runQuery(internal.users.getByUsernameInternal, {
      username: uname,
    });
    if (existingUsername) throw new Error("Username already taken");

    const existingPhone: unknown = await ctx.runQuery(internal.users.getByPhoneInternal, {
      phone: phoneTrim,
    });
    if (existingPhone) throw new Error("This phone number is already registered");

    const now = Date.now();
    const row = await ctx.runQuery(internal.emailOtp.getSignupOtpByEmail, { email });
    if (row && now - row.lastSentAt < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil((RESEND_COOLDOWN_MS - (now - row.lastSentAt)) / 1000);
      return { ok: true, cooldownSeconds: wait };
    }

    const code = String(randomInt(0, 10000)).padStart(4, "0");
    const codeHash = await hashOtpCode(email, code);
    const expiresAt = now + OTP_TTL_MS;

    await ctx.runMutation(internal.emailOtp.upsertSignupOtp, {
      email,
      codeHash,
      expiresAt,
      lastSentAt: now,
      attempts: 0,
    });

    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("Email is not configured (missing RESEND_API_KEY in Convex).");
    }
    const from =
      process.env.RESEND_SIGNUP_FROM?.trim() ||
      process.env.RESEND_FROM_EMAIL?.trim() ||
      "Vibo <no-reply@joinvibo.com>";

    await sendResendEmail({
      apiKey,
      from,
      to: [email],
      subject: "Your Vibo verification code",
      html: buildVerificationEmailHtml(code),
    });

    return { ok: true };
  },
});

export const verifySignupEmailAndRegister = action({
  args: {
    email: v.string(),
    code: v.string(),
    username: v.string(),
    password: v.string(),
    fullName: v.string(),
    phone: v.string(),
    countryCode: v.optional(v.string()),
    preferredLang: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ userId: string }> => {
    const email = normalizeEmail(args.email);
    const code = args.code.trim().replace(/\s/g, "");
    if (!/^\d{4}$/.test(code)) {
      throw new Error("Enter the 4-digit code from your email.");
    }
    if (args.password.length < 8) throw new Error("Password must be at least 8 characters");
    const userErr = validateUsername(args.username);
    if (userErr) throw new Error(userErr);
    if (!args.fullName.trim()) throw new Error("Full name is required");
    const phoneTrim = args.phone.trim();
    const digits = phoneTrim.replace(/\D/g, "");
    if (!phoneTrim || digits.length < 6) {
      throw new Error("Enter a valid phone number with country code (too few digits).");
    }

    const row = await ctx.runQuery(internal.emailOtp.getSignupOtpByEmail, { email });
    if (!row || row.purpose !== "signup") {
      throw new Error("No verification code found. Request a new code.");
    }
    const now = Date.now();
    if (row.expiresAt < now) {
      await ctx.runMutation(internal.emailOtp.deleteSignupOtpById, { id: row._id });
      throw new Error("This code has expired. Request a new one.");
    }
    if (row.attempts >= MAX_OTP_ATTEMPTS) {
      await ctx.runMutation(internal.emailOtp.deleteSignupOtpById, { id: row._id });
      throw new Error("Too many incorrect attempts. Request a new code.");
    }

    const ok = await verifyOtpCode(email, code, row.codeHash);
    if (!ok) {
      await ctx.runMutation(internal.emailOtp.patchSignupOtpAttempts, {
        id: row._id,
        attempts: row.attempts + 1,
        updatedAt: now,
      });
      throw new Error("Incorrect verification code.");
    }

    const existingEmail: unknown = await ctx.runQuery(internal.users.getByEmailInternal, { email });
    if (existingEmail) {
      await ctx.runMutation(internal.emailOtp.deleteSignupOtpById, { id: row._id });
      throw new Error("Email already registered");
    }
    const uname = args.username.trim();
    const existingUsername: unknown = await ctx.runQuery(internal.users.getByUsernameInternal, {
      username: uname,
    });
    if (existingUsername) {
      await ctx.runMutation(internal.emailOtp.deleteSignupOtpById, { id: row._id });
      throw new Error("Username already taken");
    }
    const existingPhone: unknown = await ctx.runQuery(internal.users.getByPhoneInternal, {
      phone: phoneTrim,
    });
    if (existingPhone) {
      await ctx.runMutation(internal.emailOtp.deleteSignupOtpById, { id: row._id });
      throw new Error("This phone number is already registered");
    }

    await ctx.runMutation(internal.emailOtp.deleteSignupOtpById, { id: row._id });

    const passwordHash = await hashPassword(args.password);
    const userId: Id<"users"> = await ctx.runMutation(internal.users.insertUser, {
      email,
      username: uname,
      passwordHash,
      provider: "email",
      fullName: args.fullName.trim(),
      phone: phoneTrim,
      countryCode: args.countryCode?.trim() || undefined,
      dob: undefined,
      gender: undefined,
      country: undefined,
      preferredLang: args.preferredLang?.trim() || undefined,
      createdAt: now,
    });

    return { userId: userId as unknown as string };
  },
});
