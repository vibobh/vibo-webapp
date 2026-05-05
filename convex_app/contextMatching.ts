"use node";

/**
 * Context Engine Phase 2 — Offline Context Matching.
 *
 * Triggered after a contentIntelligence job completes. Scans existing completed
 * intelligence records for highly relevant content that could serve as contextual
 * follow-up to the newly completed source.
 *
 * Core product rule: no recommendation is better than an inaccurate one.
 *
 * - Only stores candidates with confidenceScore >= 0.85
 * - >= 0.95 → "candidate"; 0.85–0.949 → "needs_review"
 * - Deduplicates: updates only if new score is strictly higher
 * - Sensitive topic matches are always downgraded to "needs_review"
 * - Runs fully asynchronously — zero impact on feed or upload latency
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import {
  CONFIDENCE_MIN_CANDIDATE,
  CONFIDENCE_MIN_STORE,
  CURRENT_MATCHING_VERSION,
} from "./contextCardCandidatesDb";

// ---------------------------------------------------------------------------
// Types (mirror Phase 1 extracted shapes)
// ---------------------------------------------------------------------------

interface Topic {
  label: string;
  confidence: number;
}

interface Entity {
  type: string;
  label: string;
  normalizedLabel: string;
  confidence: number;
  source: string;
}

interface ReferencedItem {
  label: string;
  normalizedLabel: string;
  type: string;
  reason: string;
  confidence: number;
  evidenceText: string;
  startMs?: number;
  endMs?: number;
}

interface IntelligenceRecord {
  _id: Id<"contentIntelligence">;
  sourcePostId: Id<"posts">;
  mediaId?: Id<"postMedia">;
  processingStatus: string;
  confidenceOverall?: number;
  aiSummary?: string;
  visualSummary?: string;
  topics?: Topic[];
  entities?: Entity[];
  referencedItems?: ReferencedItem[];
  embeddingText?: string;
}

type MatchType =
  | "referenced_item"
  | "entity"
  | "topic"
  | "semantic"
  | "combined";
type CandidateStatus = "candidate" | "approved" | "rejected" | "needs_review";

interface EvidenceItem {
  sourceField: string;
  sourceText: string;
  targetField: string;
  targetText: string;
  confidence: number;
}

interface MatchResult {
  matchType: MatchType;
  confidenceScore: number;
  reason: string;
  evidence: EvidenceItem[];
  triggerStartMs?: number;
  triggerEndMs?: number;
}

// ---------------------------------------------------------------------------
// Sensitive topic guard
// ---------------------------------------------------------------------------

const SENSITIVE_CATEGORY_KEYWORDS = [
  "politic",
  "election",
  "government",
  "president",
  "prime minister",
  "news",
  "breaking news",
  "journalist",
  "health",
  "medical",
  "disease",
  "diagnosis",
  "treatment",
  "vaccine",
  "finance",
  "investment",
  "stock",
  "crypto",
  "market",
  "celebrity",
  "public figure",
  "scandal",
  "religion",
  "faith",
  "church",
  "mosque",
  "temple",
  "war",
  "conflict",
  "military",
];

function isSensitiveMatch(
  source: IntelligenceRecord,
  target: IntelligenceRecord,
): boolean {
  const allText = [
    source.aiSummary,
    source.embeddingText,
    target.aiSummary,
    target.embeddingText,
    ...(source.topics ?? []).map((t) => t.label),
    ...(target.topics ?? []).map((t) => t.label),
    ...(source.entities ?? []).map((e) => e.label),
    ...(target.entities ?? []).map((e) => e.label),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return SENSITIVE_CATEGORY_KEYWORDS.some((kw) => allText.includes(kw));
}

// ---------------------------------------------------------------------------
// Matching logic
// ---------------------------------------------------------------------------

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function normalise(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Exact normalizedLabel match between source referencedItems and target
 * entities/topics/summaries. This is the strongest signal.
 */
function matchReferencedItems(
  source: IntelligenceRecord,
  target: IntelligenceRecord,
): MatchResult | null {
  const srcItems = source.referencedItems ?? [];
  if (srcItems.length === 0) return null;

  const targetEntityLabels = new Set(
    (target.entities ?? []).map((e) => normalise(e.normalizedLabel)),
  );
  const targetTopicLabels = new Set(
    (target.topics ?? []).map((t) => normalise(t.label)),
  );
  const targetSummaryWords = normalise(
    [target.aiSummary, target.visualSummary].filter(Boolean).join(" "),
  );

  const evidence: EvidenceItem[] = [];
  let bestRefItem: ReferencedItem | null = null;
  let bestScore = 0;

  for (const ref of srcItems) {
    if (ref.confidence < 0.6) continue;

    const normRef = normalise(ref.normalizedLabel);

    // Entity exact match
    if (targetEntityLabels.has(normRef)) {
      const matchingEntity = target.entities!.find(
        (e) => normalise(e.normalizedLabel) === normRef,
      )!;
      const score = clamp01(ref.confidence * matchingEntity.confidence * 1.0);
      if (score > bestScore) {
        bestScore = score;
        bestRefItem = ref;
      }
      evidence.push({
        sourceField: "referencedItems.normalizedLabel",
        sourceText: ref.label,
        targetField: "entities.normalizedLabel",
        targetText: matchingEntity.label,
        confidence: score,
      });
    }

    // Topic exact match
    if (targetTopicLabels.has(normRef)) {
      const matchingTopic = target.topics!.find(
        (t) => normalise(t.label) === normRef,
      )!;
      const score = clamp01(ref.confidence * matchingTopic.confidence * 0.92);
      if (score > bestScore) {
        bestScore = score;
        bestRefItem = ref;
      }
      evidence.push({
        sourceField: "referencedItems.normalizedLabel",
        sourceText: ref.label,
        targetField: "topics.label",
        targetText: matchingTopic.label,
        confidence: score,
      });
    }

    // Summary containment (high bar — must appear as a meaningful substring)
    if (normRef.length >= 4 && targetSummaryWords.includes(normRef)) {
      const score = clamp01(ref.confidence * 0.85);
      if (score > bestScore) {
        bestScore = score;
        bestRefItem = ref;
      }
      evidence.push({
        sourceField: "referencedItems.normalizedLabel",
        sourceText: ref.label,
        targetField: "aiSummary",
        targetText: target.aiSummary ?? "",
        confidence: score,
      });
    }
  }

  if (evidence.length === 0 || bestScore === 0 || !bestRefItem) return null;

  return {
    matchType: "referenced_item",
    confidenceScore: clamp01(bestScore),
    reason: `Source references "${bestRefItem.label}" which appears in target content`,
    evidence,
    triggerStartMs: bestRefItem.startMs,
    triggerEndMs: bestRefItem.endMs,
  };
}

/**
 * Shared named entities with the same normalizedLabel.
 * Requires overlap of at least 2 distinct entities OR 1 high-confidence entity.
 */
function matchEntities(
  source: IntelligenceRecord,
  target: IntelligenceRecord,
): MatchResult | null {
  const srcEntities = source.entities ?? [];
  const tgtEntities = target.entities ?? [];
  if (srcEntities.length === 0 || tgtEntities.length === 0) return null;

  const targetEntityMap = new Map(
    tgtEntities.map((e) => [normalise(e.normalizedLabel), e]),
  );

  const evidence: EvidenceItem[] = [];
  let weightedSum = 0;

  for (const src of srcEntities) {
    if (src.confidence < 0.6) continue;
    const normSrc = normalise(src.normalizedLabel);
    const tgt = targetEntityMap.get(normSrc);
    if (!tgt || tgt.confidence < 0.6) continue;

    const pairScore = clamp01(src.confidence * tgt.confidence);
    weightedSum += pairScore;
    evidence.push({
      sourceField: "entities.normalizedLabel",
      sourceText: src.label,
      targetField: "entities.normalizedLabel",
      targetText: tgt.label,
      confidence: pairScore,
    });
  }

  if (evidence.length === 0) return null;

  // Require either 2+ matches or 1 match with high per-pair score.
  const topPair = evidence.reduce((a, b) =>
    a.confidence > b.confidence ? a : b,
  );
  if (evidence.length < 2 && topPair.confidence < 0.75) return null;

  // Score: weighted average capped to avoid over-inflation.
  const avgScore = clamp01(weightedSum / evidence.length);
  // Discount for entity-only match (not as strong as referencedItem match).
  const confidenceScore = clamp01(avgScore * 0.9);

  const entityLabels = evidence.map((e) => e.sourceText).join(", ");
  return {
    matchType: evidence.length >= 2 ? "combined" : "entity",
    confidenceScore,
    reason: `Shared named entities: ${entityLabels}`,
    evidence,
  };
}

/**
 * Strong topic overlap combined with at least one shared entity.
 * Pure topic overlap (without entity support) is too noisy.
 */
function matchTopicsWithEntitySupport(
  source: IntelligenceRecord,
  target: IntelligenceRecord,
): MatchResult | null {
  const srcTopics = source.topics ?? [];
  const tgtTopics = target.topics ?? [];
  if (srcTopics.length === 0 || tgtTopics.length === 0) return null;

  const targetTopicMap = new Map(tgtTopics.map((t) => [normalise(t.label), t]));

  const sharedTopics: { src: Topic; tgt: Topic }[] = [];
  for (const src of srcTopics) {
    if (src.confidence < 0.65) continue;
    const tgt = targetTopicMap.get(normalise(src.label));
    if (!tgt || tgt.confidence < 0.65) continue;
    sharedTopics.push({ src, tgt });
  }

  if (sharedTopics.length < 2) return null;

  // Must also share at least one entity — pure topic overlap is too broad.
  const srcEntityLabels = new Set(
    (source.entities ?? [])
      .filter((e) => e.confidence >= 0.6)
      .map((e) => normalise(e.normalizedLabel)),
  );
  const hasEntitySupport = (target.entities ?? [])
    .filter((e) => e.confidence >= 0.6)
    .some((e) => srcEntityLabels.has(normalise(e.normalizedLabel)));

  if (!hasEntitySupport) return null;

  const evidence: EvidenceItem[] = sharedTopics.map(({ src, tgt }) => ({
    sourceField: "topics.label",
    sourceText: src.label,
    targetField: "topics.label",
    targetText: tgt.label,
    confidence: clamp01(src.confidence * tgt.confidence),
  }));

  const avgTopicScore =
    evidence.reduce((s, e) => s + e.confidence, 0) / evidence.length;
  // Discount further — topic+entity is weaker than referencedItem.
  const confidenceScore = clamp01(avgTopicScore * 0.82);

  const topicLabels = sharedTopics.map(({ src }) => src.label).join(", ");
  return {
    matchType: "topic",
    confidenceScore,
    reason: `Strong topic overlap with entity support: ${topicLabels}`,
    evidence,
  };
}

/**
 * Lightweight semantic similarity based on embeddingText word overlap.
 * Used as a tiebreaker or lower-confidence signal, never standalone.
 * Results are always flagged needs_review.
 */
function computeSemanticSimilarity(
  source: IntelligenceRecord,
  target: IntelligenceRecord,
): number {
  const srcText = normalise(source.embeddingText ?? source.aiSummary ?? "");
  const tgtText = normalise(target.embeddingText ?? target.aiSummary ?? "");
  if (!srcText || !tgtText) return 0;

  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "is",
    "it",
    "this",
    "that",
    "was",
    "with",
    "as",
    "by",
    "from",
    "be",
    "are",
    "has",
    "have",
    "had",
    "not",
    "but",
    "so",
    "they",
    "their",
    "there",
    "he",
    "she",
    "his",
    "her",
    "its",
    "we",
    "our",
    "you",
    "your",
    "them",
    "what",
    "which",
    "who",
  ]);

  function tokenize(text: string): Set<string> {
    return new Set(
      text.split(/\W+/).filter((t) => t.length >= 4 && !stopWords.has(t)),
    );
  }

  const srcTokens = tokenize(srcText);
  const tgtTokens = tokenize(tgtText);
  if (srcTokens.size === 0 || tgtTokens.size === 0) return 0;

  let intersection = 0;
  for (const tok of srcTokens) {
    if (tgtTokens.has(tok)) intersection++;
  }

  const union = srcTokens.size + tgtTokens.size - intersection;
  return union === 0 ? 0 : intersection / union; // Jaccard similarity
}

/**
 * Pick the best of all match strategies for a source→target pair.
 * Returns null if no strategy clears the minimum threshold.
 */
function computeBestMatch(
  source: IntelligenceRecord,
  target: IntelligenceRecord,
): MatchResult | null {
  const candidates: MatchResult[] = [];

  const refMatch = matchReferencedItems(source, target);
  if (refMatch) candidates.push(refMatch);

  const entityMatch = matchEntities(source, target);
  if (entityMatch) candidates.push(entityMatch);

  const topicMatch = matchTopicsWithEntitySupport(source, target);
  if (topicMatch) candidates.push(topicMatch);

  // Boost score when multiple signals agree.
  if (candidates.length >= 2) {
    const best = candidates.reduce((a, b) =>
      a.confidenceScore > b.confidenceScore ? a : b,
    );
    const boost = Math.min(0.05, (candidates.length - 1) * 0.025);
    return {
      ...best,
      matchType: "combined",
      confidenceScore: clamp01(best.confidenceScore + boost),
      evidence: candidates.flatMap((c) => c.evidence),
    };
  }

  if (candidates.length === 1) return candidates[0];

  // Semantic-only fallback: apply a heavy penalty and mark always as needs_review.
  const semanticScore = computeSemanticSimilarity(source, target);
  if (semanticScore >= 0.35) {
    return {
      matchType: "semantic",
      // Semantic-only is capped at 0.90 so it can clear the 0.85 bar only when
      // it's very strong, and it never self-promotes to "candidate".
      confidenceScore: clamp01(semanticScore * 0.8),
      reason: `Semantic text similarity (Jaccard=${semanticScore.toFixed(2)})`,
      evidence: [
        {
          sourceField: "embeddingText",
          sourceText: (source.embeddingText ?? source.aiSummary ?? "").slice(
            0,
            120,
          ),
          targetField: "embeddingText",
          targetText: (target.embeddingText ?? target.aiSummary ?? "").slice(
            0,
            120,
          ),
          confidence: semanticScore * 0.8,
        },
      ],
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Title generation
// ---------------------------------------------------------------------------

const TITLE_VERBS: Record<string, string> = {
  place: "Visit",
  product: "See",
  brand: "Check out",
  event: "See",
  person: "See",
  object: "See",
  other: "See",
};

function generateTitle(
  source: IntelligenceRecord,
  target: IntelligenceRecord,
  match: MatchResult,
): string | null {
  // Attempt to derive a meaningful title from the best evidence.
  const topEvidence = [...match.evidence].sort(
    (a, b) => b.confidence - a.confidence,
  )[0];

  if (!topEvidence) return null;

  // For referenced_item matches, use the source item label.
  if (match.matchType === "referenced_item") {
    const refItem = (source.referencedItems ?? []).find((r) =>
      topEvidence.sourceText.toLowerCase().includes(r.label.toLowerCase()),
    );
    if (refItem) {
      const verb = TITLE_VERBS[refItem.type] ?? "See";
      const rawTitle = `${verb} the ${refItem.label}`;
      if (rawTitle.length <= 48) return rawTitle;
      return rawTitle.slice(0, 47) + "…";
    }
  }

  // For entity matches, use the entity label.
  if (match.matchType === "entity" || match.matchType === "combined") {
    const entity = (source.entities ?? []).find((e) =>
      topEvidence.sourceText.toLowerCase().includes(e.label.toLowerCase()),
    );
    if (entity) {
      const verb = TITLE_VERBS[entity.type] ?? "See";
      const rawTitle = `${verb} the ${entity.label}`;
      if (rawTitle.length <= 48) return rawTitle;
      return rawTitle.slice(0, 47) + "…";
    }
  }

  // Generic fallback from target summary.
  if (target.aiSummary) {
    const words = target.aiSummary.trim().split(/\s+/).slice(0, 6).join(" ");
    const rawTitle = `See: ${words}`;
    if (rawTitle.length <= 48) return rawTitle;
    return rawTitle.slice(0, 47) + "…";
  }

  return null;
}

function isTitleSafe(title: string): boolean {
  // Reject titles that are too short, empty, or contain unsafe patterns.
  if (!title || title.trim().length < 4) return false;
  const lower = title.toLowerCase();
  // Reject anything that looks like clickbait trigger words.
  const clickbait = [
    "you won't believe",
    "shocking",
    "exposed",
    "leaked",
    "secret",
  ];
  if (clickbait.some((kw) => lower.includes(kw))) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Main exported actions
// ---------------------------------------------------------------------------

export const runContextMatching = internalAction({
  args: {
    sourceJobId: v.id("contentIntelligence"),
  },
  handler: async (ctx, args) => {
    const sourceRecord = (await ctx.runQuery(
      internal.contextCardCandidatesDb.getJobById,
      { jobId: args.sourceJobId },
    )) as IntelligenceRecord | null;

    if (!sourceRecord) {
      console.warn(
        "[ContextMatching] Source record not found:",
        args.sourceJobId,
      );
      return;
    }

    if (sourceRecord.processingStatus !== "completed") {
      console.log(
        "[ContextMatching] Skipping — source not completed:",
        args.sourceJobId,
        sourceRecord.processingStatus,
      );
      return;
    }

    // Skip sources with very low overall confidence.
    if ((sourceRecord.confidenceOverall ?? 0) < 0.3) {
      console.log(
        "[ContextMatching] Skipping — source confidence too low:",
        sourceRecord.confidenceOverall,
      );
      return;
    }

    // Load candidate pool: all completed records (excluding same post/content).
    const pool = (await ctx.runQuery(
      internal.contextCardCandidatesDb.getCompletedJobs,
      { limit: 300 },
    )) as IntelligenceRecord[];

    const targets = pool.filter(
      (t) =>
        t._id !== sourceRecord._id &&
        t.sourcePostId !== sourceRecord.sourcePostId,
    );

    if (targets.length === 0) {
      console.log("[ContextMatching] No candidate targets available.");
      return;
    }

    let stored = 0;
    let skipped = 0;
    let belowThreshold = 0;

    for (const target of targets) {
      if ((target.confidenceOverall ?? 0) < 0.3) {
        skipped++;
        continue;
      }

      const match = computeBestMatch(sourceRecord, target);
      if (!match) {
        belowThreshold++;
        continue;
      }

      if (match.confidenceScore < CONFIDENCE_MIN_STORE) {
        belowThreshold++;
        continue;
      }

      // Determine status before sensitive check.
      let status: CandidateStatus =
        match.confidenceScore >= CONFIDENCE_MIN_CANDIDATE
          ? "candidate"
          : "needs_review";

      // Downgrade to needs_review for any sensitive content.
      if (isSensitiveMatch(sourceRecord, target)) {
        status = "needs_review";
      }

      // Semantic-only matches are always needs_review.
      if (match.matchType === "semantic") {
        status = "needs_review";
      }

      // Low overall confidence on either record → needs_review.
      if (
        (sourceRecord.confidenceOverall ?? 0) < 0.6 ||
        (target.confidenceOverall ?? 0) < 0.6
      ) {
        status = "needs_review";
      }

      const title = generateTitle(sourceRecord, target, match);
      if (!title || !isTitleSafe(title)) {
        status = "needs_review";
      }

      const subtitle = target.aiSummary?.slice(0, 120) ?? undefined;

      try {
        const candidateId = await ctx.runMutation(
          internal.contextCardCandidatesDb.upsertCandidate,
          {
            sourceContentId: sourceRecord._id,
            sourcePostId: sourceRecord.sourcePostId,
            sourceMediaId: sourceRecord.mediaId,
            targetContentId: target._id,
            targetPostId: target.sourcePostId,
            targetMediaId: target.mediaId,
            title: title ?? "See related content",
            subtitle,
            reason: match.reason,
            matchType: match.matchType,
            confidenceScore: match.confidenceScore,
            evidence: match.evidence.slice(0, 10),
            triggerStartMs: match.triggerStartMs,
            triggerEndMs: match.triggerEndMs,
            status,
            processingVersion: CURRENT_MATCHING_VERSION,
          },
        );

        if (candidateId !== null) stored++;
      } catch (err) {
        console.error(
          "[ContextMatching] Failed to upsert candidate:",
          target._id,
          err instanceof Error ? err.message : err,
        );
      }
    }

    console.log(
      `[ContextMatching] source=${args.sourceJobId} targets=${targets.length} stored=${stored} skipped=${skipped} belowThreshold=${belowThreshold}`,
    );
  },
});

/**
 * Safety-net batch trigger: processes the N most recently completed intelligence
 * records in case any inline triggers were missed. Called from the cron.
 */
export const runContextMatchingBatch = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const recentlyCompleted = (await ctx.runQuery(
      internal.contextCardCandidatesDb.getCandidatesNeedingMatch,
      { limit: args.limit ?? 10 },
    )) as { _id: Id<"contentIntelligence"> }[];

    if (recentlyCompleted.length === 0) return;

    console.log(
      `[ContextMatching] Batch: scheduling matching for ${recentlyCompleted.length} records`,
    );

    for (const record of recentlyCompleted) {
      await ctx.scheduler.runAfter(
        0,
        internal.contextMatching.runContextMatching,
        { sourceJobId: record._id },
      );
    }
  },
});
