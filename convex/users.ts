import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/** Public read used by Next `/api/auth/me` to backfill onboarding for tokens minted before `obc` claim. */
export const onboardingCompletedById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const u = await ctx.db.get(userId);
    return u?.onboardingCompleted === true;
  },
});

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

/** Public profile by user id; strips password + sensitive fields. */
export const getProfileById = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const u = await ctx.db.get(userId);
    if (!u) return null;
    const { passwordHash: _p, totpSecret: _t, ...safe } = u;
    return safe;
  },
});

/** Public profile by case-insensitive username. */
export const getProfileByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const handle = username.trim().toLowerCase();
    const all = await ctx.db.query("users").collect();
    const u = all.find((x) => (x.username ?? "").toLowerCase() === handle);
    if (!u) return null;
    const { passwordHash: _p, totpSecret: _t, ...safe } = u;
    return safe;
  },
});

/** Owner-only profile editor used by /profile/edit-profile. */
export const updateProfile = mutation({
  args: {
    userId: v.id("users"),
    fullName: v.optional(v.string()),
    username: v.optional(v.string()),
    bio: v.optional(v.string()),
    bioLink: v.optional(v.string()),
    profilePictureUrl: v.optional(v.string()),
    bannerUrl: v.optional(v.string()),
    isPrivate: v.optional(v.boolean()),
    preferredLang: v.optional(v.string()),
  },
  handler: async (ctx, { userId, ...rest }) => {
    const u = await ctx.db.get(userId);
    if (!u) throw new Error("User not found");

    if (rest.username && rest.username.trim() && rest.username !== u.username) {
      const handle = rest.username.trim().toLowerCase();
      const all = await ctx.db.query("users").collect();
      const clash = all.find(
        (x) => x._id !== userId && (x.username ?? "").toLowerCase() === handle,
      );
      if (clash) throw new Error("Username is already taken");
    }

    const patch: Record<string, unknown> = {};
    for (const [k, v2] of Object.entries(rest)) {
      if (v2 !== undefined) patch[k] = v2;
    }
    await ctx.db.patch(userId, patch);
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
    gender: v.optional(v.string()),
    dob: v.optional(v.string()),
    country: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    bio: v.optional(v.string()),
    bioLink: v.optional(v.string()),
    isPrivate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(args.userId, {
      ...(args.gender !== undefined ? { gender: args.gender } : {}),
      ...(args.dob !== undefined ? { dob: args.dob } : {}),
      ...(args.country !== undefined ? { country: args.country } : {}),
      interests: args.interests ?? [],
      bio: args.bio,
      bioLink: args.bioLink,
      isPrivate: args.isPrivate,
      onboardingCompleted: true,
    });
  },
});
