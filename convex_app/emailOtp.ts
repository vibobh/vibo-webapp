import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const OTP_PURPOSES = v.union(v.literal("signup"), v.literal("password_reset"));

export const getByEmail = query({
  args: { email: v.string(), purpose: v.optional(OTP_PURPOSES) },
  handler: async (ctx, { email, purpose }) => {
    const normalizedPurpose = purpose ?? "signup";
    return await ctx.db
      .query("emailOtps")
      .withIndex("by_email_purpose", (q) =>
        q.eq("email", email).eq("purpose", normalizedPurpose),
      )
      .unique();
  },
});

export const upsertOtp = mutation({
  args: {
    email: v.string(),
    purpose: v.optional(OTP_PURPOSES),
    codeHash: v.string(),
    expiresAt: v.number(),
    lastSentAt: v.number(),
  },
  handler: async (ctx, { email, purpose, codeHash, expiresAt, lastSentAt }) => {
    const normalizedPurpose = purpose ?? "signup";
    const existing = await ctx.db
      .query("emailOtps")
      .withIndex("by_email_purpose", (q) =>
        q.eq("email", email).eq("purpose", normalizedPurpose),
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        codeHash,
        expiresAt,
        attempts: 0,
        verifiedAt: undefined,
        consumedAt: undefined,
        verifyTokenHash: undefined,
        verifyTokenExpiresAt: undefined,
        lastSentAt,
        updatedAt: now,
      });
      return existing._id;
    }
    return await ctx.db.insert("emailOtps", {
      email,
      purpose: normalizedPurpose,
      codeHash,
      expiresAt,
      attempts: 0,
      lastSentAt,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const incrementAttempts = mutation({
  args: { id: v.id("emailOtps") },
  handler: async (ctx, { id }) => {
    const doc = await ctx.db.get(id);
    if (!doc) return;
    await ctx.db.patch(id, {
      attempts: (doc.attempts ?? 0) + 1,
      updatedAt: Date.now(),
    });
  },
});

export const markVerified = mutation({
  args: {
    id: v.id("emailOtps"),
    verifyTokenHash: v.string(),
    verifyTokenExpiresAt: v.number(),
  },
  handler: async (ctx, { id, verifyTokenHash, verifyTokenExpiresAt }) => {
    await ctx.db.patch(id, {
      verifiedAt: Date.now(),
      verifyTokenHash,
      verifyTokenExpiresAt,
      updatedAt: Date.now(),
    });
  },
});

export const consumeVerification = mutation({
  args: {
    email: v.string(),
    verifyTokenHash: v.string(),
    purpose: v.optional(OTP_PURPOSES),
  },
  handler: async (ctx, { email, verifyTokenHash, purpose }) => {
    const normalizedPurpose = purpose ?? "signup";
    const doc = await ctx.db
      .query("emailOtps")
      .withIndex("by_email_purpose", (q) =>
        q.eq("email", email).eq("purpose", normalizedPurpose),
      )
      .unique();
    if (!doc) return false;
    const now = Date.now();
    if (!doc.verifiedAt || !doc.verifyTokenHash || !doc.verifyTokenExpiresAt) {
      return false;
    }
    if (doc.consumedAt) return false;
    if (doc.verifyTokenExpiresAt < now) return false;
    if (doc.verifyTokenHash !== verifyTokenHash) return false;
    await ctx.db.patch(doc._id, {
      consumedAt: now,
      updatedAt: now,
    });
    return true;
  },
});
