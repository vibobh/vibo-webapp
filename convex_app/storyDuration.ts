/** Story video max length (matches client `lib/story-duration.ts`). */
const STORY_VIDEO_MAX_DURATION_SEC = 60;

/**
 * Convex may receive seconds or mistaken milliseconds from clients.
 * Normalize to seconds in (0, 60] for storage.
 */
export function sanitizeStoryVideoDurationSeconds(
  raw: number | undefined,
): number | undefined {
  if (raw === undefined) return undefined;
  if (!Number.isFinite(raw) || raw <= 0) return undefined;
  let sec = raw;
  if (raw > 90) sec = raw / 1000;
  const capped = Math.min(sec, STORY_VIDEO_MAX_DURATION_SEC);
  if (capped < 0.05) return undefined;
  return capped;
}
