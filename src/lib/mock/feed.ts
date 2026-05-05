import { mockPostsForUser, type MockPost } from "./posts";

/** Curated cast of fake creators that drive the home feed and stories. */
export const FAKE_CREATORS: { username: string; fullName: string; verified?: boolean }[] = [
  { username: "yousif", fullName: "Yousif Al Saad", verified: true },
  { username: "lina", fullName: "Lina Haddad" },
  { username: "kareem_s", fullName: "Kareem Saleh", verified: true },
  { username: "rania.h", fullName: "Rania Hashem" },
  { username: "mohammed", fullName: "Mohammed Al Daqqaq", verified: true },
  { username: "tala", fullName: "Tala Khoury" },
  { username: "ali.k", fullName: "Ali Kazem" },
  { username: "noor", fullName: "Noor Al Sabah" },
  { username: "dimitri", fullName: "Dimitri Khoury" },
  { username: "sara_m", fullName: "Sara Mansour" },
  { username: "edaqqaq", fullName: "Eyad Daqqaq" },
];

/**
 * Builds a deterministic mock home feed by mixing a few posts from each creator
 * and sorting newest-first.
 */
export function mockHomeFeed(opts?: { perCreator?: number }): MockPost[] {
  const per = opts?.perCreator ?? 2;
  const all: MockPost[] = [];
  for (const c of FAKE_CREATORS) {
    const posts = mockPostsForUser(c.username, per).map<MockPost>((p) => ({
      ...p,
      author: {
        ...p.author,
        username: c.username,
        fullName: c.fullName,
        verificationTier: c.verified ? "blue" : undefined,
      },
    }));
    all.push(...posts);
  }
  return all.sort((a, b) => b.createdAt - a.createdAt);
}
