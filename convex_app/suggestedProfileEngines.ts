/**
 * Pluggable suggestion scoring engines. Add future graph / AI engines here
 * without rewriting the feed/search pipelines.
 */

import type { Doc } from "./_generated/dataModel";
import { publicVerificationTier } from "./verificationTier";

export type SuggestionViewerContext = {
  viewerCountryNorm: string | null;
  viewerLang: string | null;
};

export type SuggestionCandidate = {
  user: Doc<"users">;
  /** Denormalized follower count (DB field, not live recount). */
  followerCount: number;
  hasMinPublishedPosts: boolean;
  interestsOverlap: number;
  /** Count of candidate's followers that the viewer actively follows (capped scan). */
  weakMutualFollowerCount: number;
};

export type EngineContribution = { rawDelta: number };

export type SuggestionEngine = (args: {
  viewer: SuggestionViewerContext;
  candidate: SuggestionCandidate;
}) => EngineContribution;

export function normCountry(country: string | undefined): string | null {
  if (!country) return null;
  const u = country.trim().toUpperCase();
  if (u === "BAHRAIN" || u === "BH") return "BH";
  return u;
}

/** Tier-weighted popularity + completeness (primary signals). */
export function popularityEngine({
  candidate,
}: {
  viewer: SuggestionViewerContext;
  candidate: SuggestionCandidate;
}): EngineContribution {
  const u = candidate.user;
  const tier = publicVerificationTier(u);
  const isConsumerVerified = tier === "blue" || tier === "gold";
  const isGovernmentOrNews = tier === "gray";
  const fc = Math.max(0, candidate.followerCount);
  const logFollowers = Math.log10(fc + 1) * 10;
  const hasPhoto = !!(
    u.profilePictureUrl ||
    u.profilePictureKey ||
    u.profilePictureStorageId
  );
  const hasBio = !!u.bio?.trim();
  const postBonus = candidate.hasMinPublishedPosts ? 10 : 0;
  const rawDelta =
    (isConsumerVerified ? 50 : 0) +
    (isGovernmentOrNews ? 40 : 0) +
    logFollowers +
    (hasPhoto ? 5 : 0) +
    (hasBio ? 5 : 0) +
    postBonus;
  return { rawDelta };
}

/** Geo, language, weak social / interest signals (secondary). */
export function geoLangEngine({
  viewer,
  candidate,
}: {
  viewer: SuggestionViewerContext;
  candidate: SuggestionCandidate;
}): EngineContribution {
  const vc = viewer.viewerCountryNorm;
  const uc = normCountry(candidate.user.country);
  const sameCountry = !!(vc && uc && vc === uc);
  let rawDelta = sameCountry ? 10 : 0;
  if (uc === "BH" && vc === "BH") rawDelta += 5;
  const vLang = viewer.viewerLang;
  const cLang = candidate.user.preferredLang ?? null;
  const languageMatch = vLang && cLang && vLang === cLang ? 5 : 0;
  rawDelta += languageMatch;
  rawDelta += candidate.interestsOverlap * 3;
  rawDelta += Math.min(12, candidate.weakMutualFollowerCount * 4);
  return { rawDelta };
}

/** Reserved: mutual connections, interaction history, etc. */
export const futureSocialGraphEngine: SuggestionEngine = () => ({
  rawDelta: 0,
});

/** Reserved: embedding / content similarity. */
export const futureAIEngine: SuggestionEngine = () => ({ rawDelta: 0 });

export const suggestionSources: SuggestionEngine[] = [
  popularityEngine,
  geoLangEngine,
  futureSocialGraphEngine,
  futureAIEngine,
];

export function computeRawScore(
  viewer: SuggestionViewerContext,
  candidate: SuggestionCandidate,
): number {
  let sum = 0;
  for (const eng of suggestionSources) {
    sum += eng({ viewer, candidate }).rawDelta;
  }
  return sum;
}

export function normalizeScores(
  scores: number[],
): { min: number; max: number; norm: (x: number) => number } {
  if (scores.length === 0) return { min: 0, max: 0, norm: () => 0 };
  let min = scores[0]!;
  let max = scores[0]!;
  for (const s of scores) {
    if (s < min) min = s;
    if (s > max) max = s;
  }
  const span = max - min;
  return {
    min,
    max,
    norm: (x: number) => (span > 0 ? (x - min) / span : 0.5),
  };
}
