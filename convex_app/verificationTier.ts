import type { Doc } from "./_generated/dataModel";
import { getEffectiveAccountStatus } from "./accountModeration";

export type VerificationTier = "blue" | "gold" | "gray";

/**
 * Tier shown in product UI: hidden while pending, or when the account is not
 * effectively active (banned / suspended).
 */
export function publicVerificationTier(
  u: Doc<"users"> | null | undefined,
  now: number = Date.now(),
): VerificationTier | undefined {
  if (!u) return undefined;
  if (u.verificationPending === true) return undefined;
  if (getEffectiveAccountStatus(u, now) !== "active") return undefined;
  const t = u.verificationTier;
  if (t === "blue" || t === "gold" || t === "gray") return t;
  return undefined;
}

export function verificationTierPayload(
  u: Doc<"users"> | null | undefined,
  now?: number,
): { verificationTier: VerificationTier } | Record<string, never> {
  const t = publicVerificationTier(u, now);
  return t ? { verificationTier: t } : {};
}
