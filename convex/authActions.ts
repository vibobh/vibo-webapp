"use node";

import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const scryptAsync = promisify(scrypt);
const SALT_LEN = 16;
const KEY_LEN = 64;

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const derived = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = (await scryptAsync(password, salt, KEY_LEN)) as Buffer;
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

const INVALID_CREDENTIALS = "Invalid email or password";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizePhone(input: string): string {
  return input.replace(/[^\d+]/g, "");
}

function validateUsername(username: string): string | null {
  const u = username.trim();
  if (u.length < 3 || u.length > 32) return "Username must be 3–32 characters";
  if (!/^[a-zA-Z0-9_]+$/.test(u)) return "Username may only contain letters, numbers, and underscores";
  return null;
}

export const registerWithEmail = action({
  args: {
    email: v.string(),
    username: v.string(),
    password: v.string(),
    fullName: v.string(),
    phone: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    dob: v.optional(v.string()),
    gender: v.optional(v.string()),
    country: v.optional(v.string()),
    preferredLang: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ userId: string }> => {
    const email = normalizeEmail(args.email);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Invalid email address");
    }
    const userErr = validateUsername(args.username);
    if (userErr) throw new Error(userErr);
    if (args.password.length < 8) throw new Error("Password must be at least 8 characters");
    if (!args.fullName.trim()) throw new Error("Full name is required");

    const existingEmail: any = await ctx.runQuery(internal.users.getByEmailInternal, { email });
    if (existingEmail) throw new Error("Email already registered");

    const uname = args.username.trim();
    const existingUsername: any = await ctx.runQuery(internal.users.getByUsernameInternal, {
      username: uname,
    });
    if (existingUsername) throw new Error("Username already taken");

    const passwordHash = await hashPassword(args.password);
    const userId: Id<"users"> = await ctx.runMutation(internal.users.insertUser, {
      email,
      username: uname,
      passwordHash,
      provider: "email",
      fullName: args.fullName.trim(),
      phone: args.phone,
      countryCode: args.countryCode,
      dob: args.dob,
      gender: args.gender,
      country: args.country,
      preferredLang: args.preferredLang,
      createdAt: Date.now(),
    });

    return { userId };
  },
});

export const loginWithEmail = action({
  args: {
    identifier: v.string(),
    password: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ userId: string; email: string; username: string; onboardingCompleted: boolean }> => {
    const identifier = args.identifier.trim();
    const email = normalizeEmail(identifier);
    const username = identifier.toLowerCase();
    const phone = normalizePhone(identifier);

    let user: any = null;
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier)) {
      user = await ctx.runQuery(internal.users.getByEmailInternal, { email });
    } else if (/^[+\d\s()-]{7,}$/.test(identifier)) {
      user = await ctx.runQuery(internal.users.getByPhoneInternal, { phone });
    } else {
      user = await ctx.runQuery(internal.users.getByUsernameInternal, { username });
    }

    if (!user || user.provider !== "email" || !user.passwordHash) {
      throw new Error(INVALID_CREDENTIALS);
    }

    if (user.accountModerationStatus === "banned") {
      throw new Error("This account has been banned.");
    }
    if (user.accountModerationStatus === "suspended") {
      const end = user.suspensionEnd;
      if (end && Date.now() < end) {
        throw new Error("This account is temporarily suspended.");
      }
    }

    const ok = await verifyPassword(args.password, user.passwordHash!);
    if (!ok) throw new Error(INVALID_CREDENTIALS);

    return {
      userId: user._id,
      email: user.email,
      username: user.username ?? "",
      onboardingCompleted: user.onboardingCompleted === true,
    };
  },
});
