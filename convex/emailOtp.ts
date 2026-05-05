import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

export const getSignupOtpByEmail = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const rows = await ctx.db
      .query("emailOtps")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    return rows.find((r) => r.purpose === "signup") ?? null;
  },
});

export const upsertSignupOtp = internalMutation({
  args: {
    email: v.string(),
    codeHash: v.string(),
    expiresAt: v.number(),
    lastSentAt: v.number(),
    attempts: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("emailOtps")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .collect()
      .then((rows) => rows.find((r) => r.purpose === "signup") ?? null);

    const base = {
      email: args.email,
      purpose: "signup" as const,
      codeHash: args.codeHash,
      expiresAt: args.expiresAt,
      attempts: args.attempts,
      lastSentAt: args.lastSentAt,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, base);
      return existing._id;
    }
    return await ctx.db.insert("emailOtps", {
      ...base,
      createdAt: now,
    });
  },
});

export const patchSignupOtpAttempts = internalMutation({
  args: {
    id: v.id("emailOtps"),
    attempts: v.number(),
    updatedAt: v.number(),
  },
  handler: async (ctx, { id, attempts, updatedAt }) => {
    await ctx.db.patch(id, { attempts, updatedAt });
  },
});

export const deleteSignupOtpById = internalMutation({
  args: { id: v.id("emailOtps") },
  handler: async (ctx, { id }) => {
    await ctx.db.delete(id);
  },
});
