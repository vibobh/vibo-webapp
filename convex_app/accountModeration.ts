import type { Doc, Id } from "./_generated/dataModel";

export type EffectiveAccountStatus = "active" | "suspended" | "banned";

/** Effective status: expired suspensions read as active until a mutation patches the doc. */
export function getEffectiveAccountStatus(
  u: Doc<"users"> | null,
  now: number = Date.now(),
): EffectiveAccountStatus {
  if (!u) return "active";
  const raw = u.accountModerationStatus ?? "active";
  if (raw === "banned") return "banned";
  if (raw === "suspended") {
    if (u.suspensionEnd != null && now >= u.suspensionEnd) return "active";
    return "suspended";
  }
  return "active";
}

export function viewerCannotAccessAppContent(
  u: Doc<"users"> | null,
  now: number = Date.now(),
): boolean {
  const s = getEffectiveAccountStatus(u, now);
  return s === "banned" || s === "suspended";
}

export function isStaffUser(
  user: Doc<"users"> | null | undefined,
): user is Doc<"users"> & { staffRole: "admin" | "moderator" } {
  const r = user?.staffRole;
  return r === "admin" || r === "moderator";
}

/**
 * Whether `viewer` may receive full profile data for `target` from public queries.
 * Staff always see full rows (moderation). Everyone else only when the account is
 * effectively active — including the account owner, so suspended/banned users get
 * the restricted sentinel instead of a "healthy" self profile while the feed is blocked.
 */
export function canViewerSeeTargetUserProfile(
  target: Doc<"users"> | null,
  _viewerUserId: Id<"users"> | null | undefined,
  viewer: Doc<"users"> | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!target) return false;
  if (isStaffUser(viewer)) return true;
  return getEffectiveAccountStatus(target, now) === "active";
}

type DbCtx = {
  db: {
    get: (id: Id<"users">) => Promise<Doc<"users"> | null>;
    patch: (id: Id<"users">, patch: Partial<Doc<"users">>) => Promise<void>;
  };
};

/** Call at the start of mutations: clears expired suspensions in the database. */
export async function maybeReactivateExpiredSuspension(
  ctx: DbCtx,
  userId: Id<"users">,
): Promise<Doc<"users"> | null> {
  const u = await ctx.db.get(userId);
  if (!u) return null;
  if (
    u.accountModerationStatus === "suspended" &&
    u.suspensionEnd != null &&
    Date.now() >= u.suspensionEnd
  ) {
    await ctx.db.patch(userId, {
      accountModerationStatus: "active",
      suspensionEnd: undefined,
      suspensionReason: undefined,
    });
    return await ctx.db.get(userId);
  }
  return u;
}

/**
 * Blocks writes for suspended or banned accounts (after reactivation check).
 * Error codes: ACCOUNT_BANNED, ACCOUNT_SUSPENDED
 */
export async function assertUserCanMutate(
  ctx: DbCtx,
  userId: Id<"users">,
): Promise<void> {
  const u = await maybeReactivateExpiredSuspension(ctx, userId);
  if (!u) throw new Error("Unauthorized");
  const eff = getEffectiveAccountStatus(u);
  if (eff === "banned") throw new Error("ACCOUNT_BANNED");
  if (eff === "suspended") throw new Error("ACCOUNT_SUSPENDED");
}

/** Strike ladder: returns suspension duration ms or "ban" for strike 5+. */
export function strikeEscalation(
  strikeCount: number,
):
  | { kind: "warning" }
  | { kind: "suspend"; durationMs: number }
  | { kind: "ban" } {
  if (strikeCount <= 1) return { kind: "warning" };
  if (strikeCount === 2)
    return { kind: "suspend", durationMs: 24 * 60 * 60 * 1000 };
  if (strikeCount === 3)
    return { kind: "suspend", durationMs: 3 * 24 * 60 * 60 * 1000 };
  if (strikeCount === 4)
    return { kind: "suspend", durationMs: 7 * 24 * 60 * 60 * 1000 };
  return { kind: "ban" };
}

export const SUSPEND_PRESET_MS: Record<"24h" | "3d" | "7d" | "14d", number> = {
  "24h": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "14d": 14 * 24 * 60 * 60 * 1000,
};
