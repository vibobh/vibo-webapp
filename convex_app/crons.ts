import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Instagram-style: rows are already hidden from feed after 24h; this deletes them from the DB.
crons.interval(
  "remove expired stories",
  { hours: 1 },
  internal.stories.removeExpiredScheduled,
);

// Pools feed `getCandidatePosts` (alternate ranking path), not the hot
// `posts.getFeed` query. A few-minute cadence was producing ~480 runs/day
// × ~600 indexed reads = ~290k DB ops/day for marginal freshness.
// 15 minutes keeps trending/fresh pools current without bandwidth blow-up.
crons.interval(
  "refresh feed candidate pools",
  { minutes: 15 },
  internal.feedPools.refreshFeedPools,
);

// Sweep abandoned/expired draft uploads (S3 + DB) — backstop in addition to
// the explicit `cancelDraftUploads` mutation called by the composer.
crons.interval(
  "cleanup expired draft uploads",
  { hours: 1 },
  internal.draftUploads.cleanupExpiredDraftUploads,
);

// Retry any content intelligence jobs stuck in pending (safety net for missed triggers).
crons.interval(
  "process pending content intelligence",
  { minutes: 10 },
  internal.contentIntelligence.processPendingBatch,
  {},
);

// Safety-net for context matching: re-runs matching on recently completed
// intelligence records in case any inline triggers were missed.
crons.interval(
  "context matching safety net",
  { hours: 1 },
  internal.contextMatching.runContextMatchingBatch,
  {},
);

// Roll up postCounterDeltas into posts every 2 minutes.
// This is the sole writer of counter fields on the `posts` document, keeping
// OCC contention to zero for interaction mutations (toggleLike, toggleRepost,
// addComment, trackView, recordShare).
crons.interval(
  "rollup post counter deltas",
  { minutes: 2 },
  internal.postCounterDeltas.rollupPostCounterDeltas,
  {},
);

// Purge processed delta rows older than 7 days to keep the table lean.
crons.interval(
  "purge processed post counter deltas",
  { hours: 6 },
  internal.postCounterDeltas.purgeProcessedDeltas,
  {},
);

export default crons;
