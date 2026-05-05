"use node";

import { v } from "convex/values";
import { createHash, pbkdf2, randomBytes } from "node:crypto";
import { promisify } from "node:util";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import {
  assertConvexTransactionalEmailReady,
  getEmailProvider,
  sendEmailWithProvider,
} from "./emailProvider";

const pbkdf2Async = promisify(pbkdf2);
const ITERATIONS = 100000;
const KEY_LEN = 32;
const SALT_BYTES = 16;
const OTP_EXPIRES_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const RESET_OTP_LENGTH = 4;
const EMAIL_VERIFICATION_TOKEN_MS = 20 * 60 * 1000;
const PASSWORD_RESET_TOKEN_MS = 10 * 60 * 1000;
const PASSWORD_MIN_LENGTH = 8;

function saltToHex(salt: Buffer): string {
  return salt.toString("hex");
}

/**
 * Hash password with PBKDF2 (server-side only). Returns hex string.
 */
async function hashPassword(
  password: string,
  saltHex: string,
): Promise<string> {
  const hash = await pbkdf2Async(
    password,
    Buffer.from(saltHex, "hex"),
    ITERATIONS,
    KEY_LEN,
    "sha256",
  );
  return hash.toString("hex");
}

async function sha256Hex(value: string): Promise<string> {
  return createHash("sha256").update(value).digest("hex");
}

function makeOtpCode(length = 4): string {
  if (length <= 0) return "";
  const min = 10 ** (length - 1);
  const max = 10 ** length;
  return String(Math.floor(min + Math.random() * (max - min)));
}

function assertStrongPassword(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error("Password must be at least 8 characters");
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error("Password must contain at least one uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    throw new Error("Password must contain at least one lowercase letter");
  }
  if (!/\d/.test(password)) {
    throw new Error("Password must contain at least one number");
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new Error("Password must contain at least one special character");
  }
}

function getOtpEmailTemplate(
  code: string,
  purpose: "signup" | "password_reset" = "signup",
  lang: "en" | "ar" = "en",
): { subject: string; html: string; text: string } {
  const isAr = lang === "ar";
  const primaryColor = "#4a0315";
  const secondaryColor = "#e0d9c7";
  const isPasswordReset = purpose === "password_reset";

  if (isAr) {
    return {
      subject: isPasswordReset
        ? `رمز إعادة تعيين كلمة مرور Vibo: ${code}`
        : `رمز Vibo: ${code}`,
      html: `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>رمز التحقق من Vibo</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@400;500;600;700&display=swap');
    body { margin: 0; padding: 0; font-family: 'Noto Sans Arabic', -apple-system, BlinkMacSystemFont, sans-serif; background: #fafafa; }
    .container { max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: ${primaryColor}; padding: 32px; text-align: center; }
    .logo { color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
    .content { padding: 40px 32px; text-align: center; }
    .title { color: #262626; font-size: 22px; font-weight: 600; margin-bottom: 16px; }
    .subtitle { color: #8e8e8e; font-size: 16px; line-height: 1.6; margin-bottom: 32px; }
    .code-box { background: ${secondaryColor}; border-radius: 12px; padding: 24px; margin: 24px 0; }
    .code { color: ${primaryColor}; font-size: 36px; font-weight: 700; letter-spacing: 8px; font-family: 'SF Mono', Monaco, monospace; }
    .expiry { color: #a8a8a8; font-size: 14px; margin-top: 24px; }
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
      <div class="title">${isPasswordReset ? "إعادة تعيين كلمة المرور" : "تأكيد بريدك الإلكتروني"}</div>
      <div class="subtitle">${isPasswordReset ? "استخدم رمز التحقق التالي لإكمال إعادة تعيين كلمة المرور" : "استخدم رمز التحقق التالي لإكمال عملية التسجيل"}</div>
      <div class="code-box">
        <div class="code">${code}</div>
      </div>
      <div class="expiry">ينتهي الرمز خلال 10 دقائق</div>
    </div>
    <div class="footer">
      <div class="footer-text">إذا لم تطلب هذا الرمز، يمكنك تجاهل هذا البريد بأمان.<br>© 2026 Vibo. جميع الحقوق محفوظة.</div>
    </div>
  </div>
</body>
</html>`,
      text: isPasswordReset
        ? `${code} هو رمز إعادة تعيين كلمة المرور في Vibo.\nينتهي خلال 10 دقائق.`
        : `${code} هو رمز التحقق الخاص بك في Vibo.\nينتهي خلال 10 دقائق.`,
    };
  }

  return {
    subject: isPasswordReset
      ? `Vibo password reset code: ${code}`
      : `Vibo code: ${code}`,
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Vibo Verification Code</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #fafafa; }
    .container { max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: ${primaryColor}; padding: 32px; text-align: center; }
    .logo { color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
    .content { padding: 40px 32px; text-align: center; }
    .title { color: #262626; font-size: 22px; font-weight: 600; margin-bottom: 16px; }
    .subtitle { color: #8e8e8e; font-size: 16px; line-height: 1.6; margin-bottom: 32px; }
    .code-box { background: ${secondaryColor}; border-radius: 12px; padding: 24px; margin: 24px 0; }
    .code { color: ${primaryColor}; font-size: 36px; font-weight: 700; letter-spacing: 8px; font-family: 'SF Mono', Monaco, monospace; }
    .expiry { color: #a8a8a8; font-size: 14px; margin-top: 24px; }
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
      <div class="title">${isPasswordReset ? "Reset your password" : "Verify Your Email"}</div>
      <div class="subtitle">${isPasswordReset ? "Use the code below to continue resetting your password" : "Use the verification code below to complete your signup"}</div>
      <div class="code-box">
        <div class="code">${code}</div>
      </div>
      <div class="expiry">This code expires in 10 minutes</div>
    </div>
    <div class="footer">
      <div class="footer-text">If you didn't request this code, you can safely ignore this email.<br>© 2026 Vibo. All rights reserved.</div>
    </div>
  </div>
</body>
</html>`,
    text: isPasswordReset
      ? `${code} is your Vibo password reset code.\nExpires in 10 minutes.`
      : `${code} is your Vibo verification code.\nExpires in 10 minutes.`,
  };
}

/** Number + label rows — tables + nested badge cell (Gmail/Outlook strip flexbox). */
function welcomeFeatureRowsHtml(
  rows: { n: string; text: string }[],
  textAlign: "right" | "left",
): string {
  const badgeBg = "rgba(74, 3, 21, 0.1)";
  const badgeColor = "#4a0315";
  const textColor = "#262626";
  return rows
    .map(
      ({ n, text }) => `
  <tr>
    <td width="44" valign="top" align="center" style="padding:10px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:32px;height:32px;background-color:${badgeBg};border-radius:8px;">
        <tr>
          <td align="center" valign="middle" style="height:32px;width:32px;color:${badgeColor};font-weight:700;font-size:15px;font-family:Arial,Helvetica,sans-serif;line-height:32px;">${n}</td>
        </tr>
      </table>
    </td>
    <td width="12" style="font-size:0;line-height:0;">&nbsp;</td>
    <td valign="middle" style="padding:10px 0;color:${textColor};font-size:15px;line-height:1.5;font-family:Arial,Helvetica,sans-serif;text-align:${textAlign};">${text}</td>
  </tr>`,
    )
    .join("");
}

function getWelcomeEmailTemplate(
  username: string,
  lang: "en" | "ar" = "en",
): { subject: string; html: string; text: string } {
  const isAr = lang === "ar";
  const primaryColor = "#4a0315";

  if (isAr) {
    const featureRows = welcomeFeatureRowsHtml(
      [
        { n: "1", text: "اكتشف محتوى مذهلاً من منشئين رائعين" },
        { n: "2", text: "تابع المواضيع التي تحبها" },
        { n: "3", text: "تواصل مع أصدقائك" },
      ],
      "right",
    );
    return {
      subject: "مرحباً بك في Vibo!",
      html: `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>مرحباً بك في Vibo</title>
  <style>
    body { margin: 0; padding: 0; font-family: Arial, Helvetica, 'Segoe UI', sans-serif; background: #fafafa; }
    .container { max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: ${primaryColor}; padding: 32px; text-align: center; }
    .logo { color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
    .content { padding: 40px 32px; text-align: center; }
    .title { color: #262626; font-size: 24px; font-weight: 700; margin-bottom: 16px; }
    .subtitle { color: #8e8e8e; font-size: 16px; line-height: 1.6; margin-bottom: 24px; }
    .cta { background: ${primaryColor}; color: #ffffff; padding: 16px 32px; border-radius: 12px; text-decoration: none; display: inline-block; font-weight: 600; font-size: 16px; margin-top: 24px; }
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
      <div class="title">أهلاً وسهلاً، ${username}! 🎉</div>
      <div class="subtitle">نحن سعداء بانضمامك إلى مجتمع Vibo. إليك ما يمكنك فعله:</div>
      <table role="presentation" dir="rtl" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 24px 0;">
        <tbody>${featureRows}
        </tbody>
      </table>
      <a href="https://joinvibo.com" class="cta">ابدأ الاستكشاف</a>
    </div>
    <div class="footer">
      <div class="footer-text">© 2026 Vibo. جميع الحقوق محفوظة.</div>
    </div>
  </div>
</body>
</html>`,
      text: `أهلاً بك في Vibo، ${username}! نحن سعداء بانضمامك. ابدأ استكشاف المحتوى الرائع على https://joinvibo.com`,
    };
  }

  const featureRowsEn = welcomeFeatureRowsHtml(
    [
      { n: "1", text: "Discover amazing content from creators" },
      { n: "2", text: "Follow topics you love" },
      { n: "3", text: "Connect with friends" },
    ],
    "left",
  );

  return {
    subject: "Welcome to Vibo!",
    html: `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Vibo</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #fafafa; }
    .container { max-width: 480px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .header { background: ${primaryColor}; padding: 32px; text-align: center; }
    .logo { color: #ffffff; font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
    .content { padding: 40px 32px; text-align: center; }
    .title { color: #262626; font-size: 24px; font-weight: 700; margin-bottom: 16px; }
    .subtitle { color: #8e8e8e; font-size: 16px; line-height: 1.6; margin-bottom: 24px; }
    .cta { background: ${primaryColor}; color: #ffffff; padding: 16px 32px; border-radius: 12px; text-decoration: none; display: inline-block; font-weight: 600; font-size: 16px; margin-top: 24px; }
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
      <div class="title">Welcome, ${username}! 🎉</div>
      <div class="subtitle">We're thrilled to have you join the Vibo community. Here's what you can do:</div>
      <table role="presentation" dir="ltr" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 24px 0;">
        <tbody>${featureRowsEn}
        </tbody>
      </table>
      <a href="https://joinvibo.com" class="cta">Start Exploring</a>
    </div>
    <div class="footer">
      <div class="footer-text">© 2026 Vibo. All rights reserved.</div>
    </div>
  </div>
</body>
</html>`,
    text: `Welcome to Vibo, ${username}! We're thrilled to have you join. Start exploring at https://joinvibo.com`,
  };
}

async function sendOtpEmail(
  email: string,
  code: string,
  purpose: "signup" | "password_reset" = "signup",
  lang: "en" | "ar" = "en",
): Promise<void> {
  const template = getOtpEmailTemplate(code, purpose, lang);
  const provider = getEmailProvider();
  try {
    await sendEmailWithProvider({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  } catch (error) {
    const rawMessage =
      error instanceof Error
        ? error.message
        : "Failed to send verification email";

    // Surface the actual provider error so we can diagnose
    throw new Error(`${provider}: ${rawMessage}`);
  }
}

async function sendWelcomeEmail(
  email: string,
  username: string,
  lang: "en" | "ar" = "en",
): Promise<void> {
  const template = getWelcomeEmailTemplate(username, lang);
  try {
    await sendEmailWithProvider({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  } catch {
    // Silently fail for welcome emails - don't block user flow
  }
}

const USERNAME_MIN = 3;
const USERNAME_MAX = 30;
// Instagram-style: letters/numbers/underscore, optional period-separated segments.
// Examples: yousif, yousif2, yousif_sabba, yousif.sabba, _yousif
const USERNAME_REGEX = /^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/;

function normalizeUsername(input: string): string {
  // 1) Trim + lowercase for consistent uniqueness.
  // 2) Strip disallowed characters.
  // 3) Make dots "clean": collapse repeats, and remove leading/trailing dots.
  let cleaned = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, "");
  cleaned = cleaned.replace(/\.+/g, ".");
  cleaned = cleaned.replace(/^\./, "").replace(/\.$/, "");
  cleaned = cleaned.slice(0, USERNAME_MAX);
  // Slicing can reintroduce leading/trailing dots, so re-clean after truncation.
  cleaned = cleaned.replace(/^\./, "").replace(/\.$/, "");
  return cleaned;
}

function isValidISODate(value: string): boolean {
  // Expect YYYY-MM-DD
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const dt = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(dt.getTime())) return false;
  // Guard against invalid dates like 2026-02-31
  return (
    dt.getUTCFullYear() === year &&
    dt.getUTCMonth() + 1 === month &&
    dt.getUTCDate() === day
  );
}

/**
 * Sign up with username, email, password. Hashes password and creates user.
 */
export const signUpEmail = action({
  args: {
    username: v.string(),
    email: v.string(),
    password: v.string(),
    fullName: v.string(),
    /** Collected on onboarding after email signup (gender → DOB). */
    dob: v.optional(v.string()),
    phone: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    emailVerificationToken: v.string(),
    lang: v.optional(v.string()),
  },
  handler: async (
    ctx,
    {
      username,
      email,
      password,
      fullName,
      dob,
      phone,
      countryCode,
      emailVerificationToken,
      lang,
    },
  ): Promise<{ userId: Id<"users"> }> => {
    const normalizedUsername = normalizeUsername(username);
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedFullName = fullName.trim();
    const normalizedDob = dob?.trim() ?? "";
    const normalizedLang = lang === "ar" ? "ar" : "en";
    if (!normalizedUsername) {
      throw new Error("Username is required");
    }
    if (
      normalizedUsername.length < USERNAME_MIN ||
      normalizedUsername.length > USERNAME_MAX
    ) {
      throw new Error(
        `Username must be ${USERNAME_MIN}-${USERNAME_MAX} characters`,
      );
    }
    if (!USERNAME_REGEX.test(normalizedUsername)) {
      throw new Error(
        "Username can only contain letters, numbers, underscores, and periods",
      );
    }
    const existingByUsername = await ctx.runQuery(api.users.getByUsername, {
      username: normalizedUsername,
    });
    if (existingByUsername) {
      throw new Error("Username is already taken");
    }
    if (!normalizedEmail) {
      throw new Error("Email is required");
    }
    const verificationTokenHash = await sha256Hex(
      emailVerificationToken.trim(),
    );
    const consumed = await ctx.runMutation(api.emailOtp.consumeVerification, {
      email: normalizedEmail,
      verifyTokenHash: verificationTokenHash,
      purpose: "signup",
    });
    if (!consumed) {
      throw new Error("Email verification required");
    }
    if (!normalizedFullName) {
      throw new Error("Full name is required");
    }
    if (normalizedDob.length > 0 && !isValidISODate(normalizedDob)) {
      throw new Error("Date of birth must be in YYYY-MM-DD format");
    }
    assertStrongPassword(password);
    const salt = randomBytes(SALT_BYTES);
    const saltHex = saltToHex(salt);
    const hash = await hashPassword(password, saltHex);
    const stored = `${saltHex}:${hash}`;
    const userId = (await ctx.runMutation(api.users.createOrUpdateFromAuth, {
      email: normalizedEmail,
      username: normalizedUsername,
      provider: "email",
      passwordHash: stored,
      fullName: normalizedFullName,
      ...(normalizedDob.length > 0 ? { dob: normalizedDob } : {}),
      preferredLang: normalizedLang,
      ...(phone && { phone }),
      ...(countryCode && { countryCode }),
    })) as Id<"users">;

    // Validate user ID to catch data corruption
    if (!isValidUsersId(userId)) {
      console.error(
        `[Auth] Data corruption detected: signup created invalid ID ${userId.substring(0, 10)}...`,
      );
      throw new Error("Account creation failed. Please contact support.");
    }

    // Welcome email is sent once from sendWelcomeAfterOnboarding (after onboarding),
    // not here — avoids duplicate "Welcome" messages for email signups.

    return { userId };
  },
});

export const sendEmailOtp = action({
  args: { email: v.string(), lang: v.optional(v.string()) },
  handler: async (
    ctx,
    { email, lang },
  ): Promise<{ resendInSeconds: number; emailSent: boolean }> => {
    const normalizedEmail = email.trim().toLowerCase();
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new Error("Please enter a valid email address");
    }

    const existingEmail = await ctx.runQuery(api.users.getByEmailAndProvider, {
      email: normalizedEmail,
      provider: "email",
    });
    if (existingEmail) {
      throw new Error("This email is already registered");
    }

    const now = Date.now();
    const existingOtp = await ctx.runQuery(api.emailOtp.getByEmail, {
      email: normalizedEmail,
      purpose: "signup",
    });
    if (existingOtp && existingOtp.lastSentAt + OTP_RESEND_MS > now) {
      const waitMs = existingOtp.lastSentAt + OTP_RESEND_MS - now;
      return {
        resendInSeconds: Math.ceil(waitMs / 1000),
        emailSent: false,
      };
    }

    assertConvexTransactionalEmailReady();

    const code = makeOtpCode();
    const normalizedLang = lang === "ar" ? "ar" : "en";
    console.log(
      `[auth.sendEmailOtp] sending OTP via ${getEmailProvider()} to=${normalizedEmail}`,
    );
    await sendOtpEmail(normalizedEmail, code, "signup", normalizedLang);
    console.log(`[auth.sendEmailOtp] OTP email dispatched to=${normalizedEmail}`);

    const codeHash = await sha256Hex(code);
    await ctx.runMutation(api.emailOtp.upsertOtp, {
      email: normalizedEmail,
      purpose: "signup",
      codeHash,
      expiresAt: now + OTP_EXPIRES_MS,
      lastSentAt: now,
    });

    return {
      resendInSeconds: Math.ceil(OTP_RESEND_MS / 1000),
      emailSent: true,
    };
  },
});

export const verifyEmailOtp = action({
  args: { email: v.string(), code: v.string() },
  handler: async (
    ctx,
    { email, code },
  ): Promise<{ verificationToken: string }> => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim();
    if (!/^\d{4}$/.test(normalizedCode)) {
      throw new Error("Enter a valid 4-digit code");
    }

    const otp = await ctx.runQuery(api.emailOtp.getByEmail, {
      email: normalizedEmail,
      purpose: "signup",
    });
    if (!otp)
      throw new Error("Verification code not found. Request a new code.");

    const now = Date.now();
    if (otp.expiresAt < now) {
      throw new Error("Code expired. Request a new one.");
    }
    if ((otp.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
      throw new Error("Too many attempts. Request a new code.");
    }

    const codeHash = await sha256Hex(normalizedCode);
    if (codeHash !== otp.codeHash) {
      await ctx.runMutation(api.emailOtp.incrementAttempts, { id: otp._id });
      throw new Error("Incorrect verification code");
    }

    const verificationToken = randomBytes(24).toString("hex");
    const tokenHash = await sha256Hex(verificationToken);
    await ctx.runMutation(api.emailOtp.markVerified, {
      id: otp._id,
      verifyTokenHash: tokenHash,
      verifyTokenExpiresAt: now + EMAIL_VERIFICATION_TOKEN_MS,
    });
    return { verificationToken };
  },
});

export const requestPasswordResetOtp = action({
  args: { email: v.string(), lang: v.optional(v.string()) },
  handler: async (
    ctx,
    { email, lang },
  ): Promise<{ resendInSeconds: number }> => {
    const normalizedEmail = email.trim().toLowerCase();
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      throw new Error("Please enter a valid email address");
    }

    const emailUser = await ctx.runQuery(api.users.getByEmailAndProvider, {
      email: normalizedEmail,
      provider: "email",
    });
    if (!emailUser) {
      throw new Error("No account found for this email");
    }

    const now = Date.now();
    const existingOtp = await ctx.runQuery(api.emailOtp.getByEmail, {
      email: normalizedEmail,
      purpose: "password_reset",
    });
    if (existingOtp && existingOtp.lastSentAt + OTP_RESEND_MS > now) {
      const waitMs = existingOtp.lastSentAt + OTP_RESEND_MS - now;
      return { resendInSeconds: Math.ceil(waitMs / 1000) };
    }

    const code = makeOtpCode(RESET_OTP_LENGTH);
    const normalizedLang = lang === "ar" ? "ar" : "en";
    await sendOtpEmail(normalizedEmail, code, "password_reset", normalizedLang);

    const codeHash = await sha256Hex(code);
    await ctx.runMutation(api.emailOtp.upsertOtp, {
      email: normalizedEmail,
      purpose: "password_reset",
      codeHash,
      expiresAt: now + OTP_EXPIRES_MS,
      lastSentAt: now,
    });

    return { resendInSeconds: Math.ceil(OTP_RESEND_MS / 1000) };
  },
});

export const verifyPasswordResetOtp = action({
  args: { email: v.string(), code: v.string() },
  handler: async (
    ctx,
    { email, code },
  ): Promise<{ resetToken: string; expiresInSeconds: number }> => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedCode = code.trim();
    if (!new RegExp(`^\\d{${RESET_OTP_LENGTH}}$`).test(normalizedCode)) {
      throw new Error(`Enter a valid ${RESET_OTP_LENGTH}-digit code`);
    }

    const otp = await ctx.runQuery(api.emailOtp.getByEmail, {
      email: normalizedEmail,
      purpose: "password_reset",
    });
    if (!otp)
      throw new Error("Reset code not found. Request a new code.");

    const now = Date.now();
    if (otp.expiresAt < now) {
      throw new Error("Code expired. Request a new one.");
    }
    if ((otp.attempts ?? 0) >= OTP_MAX_ATTEMPTS) {
      throw new Error("Too many attempts. Request a new code.");
    }

    const codeHash = await sha256Hex(normalizedCode);
    if (codeHash !== otp.codeHash) {
      await ctx.runMutation(api.emailOtp.incrementAttempts, { id: otp._id });
      throw new Error("Incorrect verification code");
    }

    const resetToken = randomBytes(24).toString("hex");
    const tokenHash = await sha256Hex(resetToken);
    await ctx.runMutation(api.emailOtp.markVerified, {
      id: otp._id,
      verifyTokenHash: tokenHash,
      verifyTokenExpiresAt: now + PASSWORD_RESET_TOKEN_MS,
    });

    return {
      resetToken,
      expiresInSeconds: Math.ceil(PASSWORD_RESET_TOKEN_MS / 1000),
    };
  },
});

export const resetPasswordWithToken = action({
  args: {
    email: v.string(),
    resetToken: v.string(),
    newPassword: v.string(),
  },
  handler: async (
    ctx,
    { email, resetToken, newPassword },
  ): Promise<{ userId: Id<"users"> }> => {
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedToken = resetToken.trim();
    if (!normalizedToken) {
      throw new Error("Reset session expired. Start again.");
    }
    assertStrongPassword(newPassword);

    const tokenHash = await sha256Hex(normalizedToken);
    const consumed = await ctx.runMutation(api.emailOtp.consumeVerification, {
      email: normalizedEmail,
      verifyTokenHash: tokenHash,
      purpose: "password_reset",
    });
    if (!consumed) {
      throw new Error("Reset session expired. Start again.");
    }

    const salt = randomBytes(SALT_BYTES);
    const saltHex = saltToHex(salt);
    const hash = await hashPassword(newPassword, saltHex);
    const stored = `${saltHex}:${hash}`;
    const updated = await ctx.runMutation(api.users.updatePasswordHashByEmail, {
      email: normalizedEmail,
      passwordHash: stored,
    });

    return { userId: updated.userId as Id<"users"> };
  },
});

/**
 * Validates that an ID is a legitimate users table ID.
 * Used to detect data corruption.
 */
function isValidUsersId(id: string): boolean {
  // Convex IDs are base62 strings - check basic format
  // IDs should be non-empty and contain only alphanumeric characters
  if (!id || id.length < 3) return false;

  // Check for valid base62 characters (0-9, a-z, A-Z)
  const base62Pattern = /^[a-zA-Z0-9]+$/;
  return base62Pattern.test(id);
}

/**
 * Sign in with email/password. Verifies hash and returns userId.
 */
export const signInEmail = action({
  args: { email: v.string(), password: v.string() },
  handler: async (
    ctx,
    { email, password },
  ): Promise<{ userId: Id<"users"> }> => {
    const identifier = email.trim();
    const normalizedIdentifier = identifier.toLowerCase();
    const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Password auth only applies to users created via email provider.
    if (EMAIL_REGEX.test(normalizedIdentifier)) {
      const user = (await ctx.runQuery(api.users.getByEmailAndProvider, {
        email: normalizedIdentifier,
        provider: "email",
      })) as { _id: Id<"users">; passwordHash?: string } | null;

      if (!user?.passwordHash) throw new Error("Invalid email or password");

      // Validate user ID to catch data corruption
      if (!isValidUsersId(user._id)) {
        console.error(
          `[Auth] Data corruption detected: user with email ${normalizedIdentifier} has invalid ID ${user._id.substring(0, 10)}...`,
        );
        throw new Error("Account data corrupted. Please contact support.");
      }

      const [salt, storedHash] = user.passwordHash.split(":");
      if (!salt || !storedHash) throw new Error("Invalid email or password");
      const computedHash = await hashPassword(password, salt);
      if (computedHash !== storedHash)
        throw new Error("Invalid email or password");
      return { userId: user._id };
    }

    // Treat as username.
    const normalizedUsername = normalizeUsername(identifier);
    const user = (await ctx.runQuery(api.users.getByUsername, {
      username: normalizedUsername,
    })) as {
      _id: Id<"users">;
      passwordHash?: string;
      provider?: string;
    } | null;

    if (!user?.passwordHash || user.provider !== "email")
      throw new Error("Invalid email or password");

    // Validate user ID to catch data corruption
    if (!isValidUsersId(user._id)) {
      console.error(
        `[Auth] Data corruption detected: user with username ${normalizedUsername} has invalid ID ${user._id.substring(0, 10)}...`,
      );
      throw new Error("Account data corrupted. Please contact support.");
    }

    const [salt, storedHash] = user.passwordHash.split(":");
    if (!salt || !storedHash) throw new Error("Invalid email or password");
    const computedHash = await hashPassword(password, salt);
    if (computedHash !== storedHash)
      throw new Error("Invalid email or password");
    return { userId: user._id };
  },
});

/**
 * Verify Google ID token and create/update user. Returns userId.
 * Client sends idToken from expo-auth-session Google response.
 */
export const verifyGoogleToken = action({
  args: { idToken: v.string() },
  handler: async (ctx, { idToken }): Promise<{ userId: Id<"users"> }> => {
    const res = await fetch(
      "https://oauth2.googleapis.com/tokeninfo?id_token=" +
        encodeURIComponent(idToken),
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error("Google token invalid: " + text);
    }
    const data = (await res.json()) as {
      email?: string;
      email_verified?: string;
      name?: string;
      picture?: string;
      given_name?: string;
      family_name?: string;
    };
    const email = data.email?.trim().toLowerCase();
    if (!email || data.email_verified !== "true") {
      throw new Error("Invalid Google token: email not verified");
    }
    const fullName = (data.name ?? "").trim();
    const profilePictureUrl = (data.picture ?? "").trim() || undefined;

    // Best-effort username suggestion from email.
    // If it collides, createOrUpdateFromAuth will still work, but onboarding UI can ask later.
    const emailLocalPart = email.split("@")[0] ?? "";
    const usernameCandidate = normalizeUsername(emailLocalPart);
    const usernameOk =
      usernameCandidate.length >= 3 && USERNAME_REGEX.test(usernameCandidate);

    // Don't force username if it might already be taken.
    const existingByUsername =
      usernameOk &&
      (await ctx.runQuery(api.users.getByUsername, {
        username: usernameCandidate,
      }));

    const username =
      usernameOk && !existingByUsername ? usernameCandidate : undefined;

    const userId = (await ctx.runMutation(api.users.createOrUpdateFromAuth, {
      email,
      provider: "google",
      ...(username !== undefined && { username }),
      ...(fullName ? { fullName } : {}),
      profilePictureUrl,
    })) as Id<"users">;

    // Validate user ID to catch data corruption
    if (!isValidUsersId(userId)) {
      console.error(
        `[Auth] Data corruption detected: Google auth created invalid ID ${userId.substring(0, 10)}...`,
      );
      throw new Error("Account creation failed. Please contact support.");
    }

    return { userId };
  },
});

/**
 * Send welcome email after onboarding completion.
 * This supports both email and Google signups.
 */
export const sendWelcomeAfterOnboarding = action({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }): Promise<void> => {
    const user = await ctx.runQuery(internal.users.getUserDocInternal, {
      id: userId,
    });
    if (!user?.email) return;

    const username =
      user.username?.trim() ||
      user.fullName?.trim() ||
      user.email.split("@")[0] ||
      "there";
    const normalizedLang = user.preferredLang === "ar" ? "ar" : "en";

    await sendWelcomeEmail(user.email, username, normalizedLang);
  },
});
