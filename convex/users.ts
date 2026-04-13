import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

export const getByEmailInternal = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    return await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
  },
});

export const getByUsernameInternal = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const u = username.trim().toLowerCase();
    const all = await ctx.db.query("users").collect();
    return all.find((x) => (x.username ?? "").toLowerCase() === u) ?? null;
  },
});

function normalizePhone(input: string): string {
  return input.replace(/[^\d+]/g, "");
}

export const getByPhoneInternal = internalQuery({
  args: { phone: v.string() },
  handler: async (ctx, { phone }) => {
    const p = normalizePhone(phone.trim());
    const all = await ctx.db.query("users").collect();
    return all.find((x) => normalizePhone(x.phone ?? "") === p) ?? null;
  },
});

export const insertUser = internalMutation({
  args: {
    email: v.string(),
    username: v.string(),
    passwordHash: v.string(),
    provider: v.string(),
    fullName: v.optional(v.string()),
    phone: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    dob: v.optional(v.string()),
    gender: v.optional(v.string()),
    country: v.optional(v.string()),
    preferredLang: v.optional(v.string()),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("users", {
      email: args.email,
      username: args.username.trim(),
      provider: args.provider,
      passwordHash: args.passwordHash,
      fullName: args.fullName,
      phone: args.phone,
      countryCode: args.countryCode,
      dob: args.dob,
      gender: args.gender,
      country: args.country,
      preferredLang: args.preferredLang,
      createdAt: args.createdAt,
      accountModerationStatus: "active",
      onboardingCompleted: false,
    });
  },
});

/** Authenticated user row (no password hash). */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject as Id<"users">;
    const user = await ctx.db.get(userId);
    if (!user) return null;
    const { passwordHash: _p, ...safe } = user;
    return safe;
  },
});

export const completeOnboarding = mutation({
  args: {
    userId: v.id("users"),
    interests: v.optional(v.array(v.string())),
    bio: v.optional(v.string()),
    bioLink: v.optional(v.string()),
    isPrivate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(args.userId, {
      interests: args.interests ?? [],
      bio: args.bio,
      bioLink: args.bioLink,
      isPrivate: args.isPrivate,
      onboardingCompleted: true,
    });
  },
});
