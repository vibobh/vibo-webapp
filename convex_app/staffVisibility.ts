import type { Doc } from "./_generated/dataModel";

/**
 * Staff accounts (admin / moderator) are hidden from public discovery:
 * search, suggested users, feeds, stories rail, share targets, etc.
 * They still authenticate and use internal tools normally.
 */
export function userHiddenFromPublicDiscovery(
  user:
    | Pick<Doc<"users">, "staffRole">
    | null
    | undefined,
): boolean {
  const r = user?.staffRole;
  return r === "admin" || r === "moderator";
}
