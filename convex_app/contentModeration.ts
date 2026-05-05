"use node";

/**
 * Server-side AI content moderation pipeline (Convex Node.js actions).
 *
 * Improvements over v1:
 *   - Pre-moderation throttle: posts start at "pending" / 0.2x multiplier
 *   - Configurable thresholds from DB (no redeploy to tune)
 *   - Percentile-based video scoring (P90 instead of MAX)
 *   - Provider fallback: Gemini failure → "unverified" state
 *   - Velocity intelligence: burst detection + cross-user hash matching
 *   - Structured MODERATION_RUN / DISTRIBUTION_CHANGE events
 */

import {
  DetectModerationLabelsCommand,
  RekognitionClient,
  type ModerationLabel,
} from "@aws-sdk/client-rekognition";
import { v } from "convex/values";
import { createHash } from "node:crypto";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { analyzeVisualSafetyHeuristic } from "./moderationImageHeuristic";
import { friendlyModerationReason } from "./postModeration";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const STRICT_MODE = true;

interface ModerationScores {
  nudity: number;
  sexual: number;
  suggestive: number;
  violence: number;
  hate: number;
  spam: number;
  safe: number;
}

interface ModerationConfig {
  nudityBlock: number;
  sexualBlock: number;
  suggestiveFlag: number;
  sexualSuggestiveCompositeFlag: number;
  violenceSensitive: number;
  hateBlock: number;
  spamFlag: number;
  ratePostsPerHour: number;
  preModThrottle: number;
  safeLowFlag: number;
}

type ModerationDecision = "allow" | "block" | "flag_sensitive" | "flag_spam";

const EMPTY_SCORES: ModerationScores = {
  nudity: 0,
  sexual: 0,
  suggestive: 0,
  violence: 0,
  hate: 0,
  spam: 0,
  safe: 0.5,
};

/** Malformed Gemini JSON ⇒ fail closed (composite + low safe always apply). */
const FAIL_CLOSED_PARSER_SCORES: ModerationScores = {
  nudity: 0.5,
  sexual: 0.45,
  suggestive: 0.45,
  violence: 0,
  hate: 0,
  spam: 0,
  safe: 0.05,
};

const FAIL_CLOSED_PROVIDER_SCORES: ModerationScores = {
  ...FAIL_CLOSED_PARSER_SCORES,
};

/** Hard skin/body heuristic before AI — deterministic block signal. */
const HEURISTIC_HARD_BLOCK_SCORES: ModerationScores = {
  nudity: 0.92,
  sexual: 0.95,
  suggestive: 0.92,
  violence: 0,
  hate: 0,
  spam: 0,
  safe: 0.02,
};

// Thresholds were intentionally relaxed ~20% from the initial bring-up
// values after multiple false positives on benign content (food, abstract
// images, neutral portraits). Strict mode is still strict — just less
// jumpy. Hate is bumped less because the cost of missing it is high.
const DEFAULT_CONFIG: ModerationConfig = STRICT_MODE
  ? {
    nudityBlock: 0.36,
    sexualBlock: 0.48,
    suggestiveFlag: 0.6,
    sexualSuggestiveCompositeFlag: 0.72,
    violenceSensitive: 0.72,
    hateBlock: 0.78,
    spamFlag: 0.85,
    ratePostsPerHour: 10,
    preModThrottle: 0.2,
    safeLowFlag: 0.32,
  }
  : {
    nudityBlock: 0.9,
    sexualBlock: 0.8,
    suggestiveFlag: 0.8,
    sexualSuggestiveCompositeFlag: 1.2,
    violenceSensitive: 0.8,
    hateBlock: 0.9,
    spamFlag: 0.9,
    ratePostsPerHour: 10,
    preModThrottle: 0.2,
    safeLowFlag: 0.2,
  };

/** Keep in sync with `lib/moderation/gemini-parse.ts`. */
type ParsedModeration = ModerationScores & {
  bodyPartFocus?: boolean;
  highSkinRatio?: boolean;
};

function clampModerationDimension(n: unknown): number {
  if (typeof n === "number" && Number.isFinite(n)) {
    return Math.max(0, Math.min(1, n));
  }
  if (typeof n === "string") {
    const v = parseFloat(n.trim());
    if (Number.isFinite(v)) return Math.max(0, Math.min(1, v));
  }
  return 0;
}

function moderationScoreFieldPresent(parsed: Record<string, unknown>, k: string): boolean {
  const v = parsed[k];
  if (typeof v === "number" && Number.isFinite(v)) return true;
  if (typeof v === "string") {
    return Number.isFinite(Number(v.trim()));
  }
  return false;
}

type GeminiResponseShape = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string | undefined;
        thought?: boolean;
      }>;
    };
    finishReason?: string | undefined;
    safetyRatings?: Array<{
      category?: string;
      probability?: string;
      blocked?: boolean;
    }>;
  }>;
  promptFeedback?: {
    blockReason?: string | undefined;
    blockReasonMessage?: string | undefined;
    safetyRatings?: Array<{
      category?: string;
      probability?: string;
      blocked?: boolean;
    }>;
  };
};

/**
 * Detect Gemini's own safety-filter refusal. When Gemini blocks our prompt
 * or refuses to emit a response, that is itself the strongest possible
 * adverse signal — far more reliable than any score the model might have
 * returned. We treat this as a hard block decision (see `evaluatePolicy`).
 */
function geminiSafetyBlock(data: unknown): {
  blocked: boolean;
  reason?: string;
  category?: string;
} {
  const d = data as GeminiResponseShape;
  const pf = d?.promptFeedback;
  if (pf?.blockReason) {
    const cat = pf.safetyRatings?.find((r) => r?.blocked)?.category;
    return {
      blocked: true,
      reason: pf.blockReason,
      category: cat,
    };
  }
  const cand = d?.candidates?.[0];
  const fr = cand?.finishReason;
  if (fr === "SAFETY" || fr === "RECITATION" || fr === "PROHIBITED_CONTENT") {
    const cat = cand?.safetyRatings?.find((r) => r?.blocked)?.category;
    return {
      blocked: true,
      reason: fr,
      category: cat,
    };
  }
  return { blocked: false };
}

function extractGeminiCandidateText(data: unknown): string {
  const d = data as GeminiResponseShape;
  const cand = d?.candidates?.[0];
  if (!cand) {
    const pf = d?.promptFeedback;
    if (pf?.blockReason ?? pf?.blockReasonMessage) {
      console.warn(
        "[ContentModeration] Gemini no candidates:",
        pf?.blockReason,
        pf?.blockReasonMessage ?? "",
      );
    }
    return "";
  }
  const parts = cand.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return "";

  const textFrom = (list: typeof parts) =>
    list
      .map((p) => (typeof p?.text === "string" ? p.text : ""))
      .join("")
      .trim();

  const sansThought = parts.filter((p) => p?.thought !== true);
  const primary = sansThought.length > 0 ? textFrom(sansThought) : "";
  if (primary.length > 0) return primary;
  return textFrom(parts);
}

function scoresFromParsedRecord(
  parsed: Record<string, unknown>,
): ParsedModeration {
  return {
    nudity: clampModerationDimension(parsed.nudity),
    sexual: clampModerationDimension(parsed.sexual),
    suggestive: clampModerationDimension(parsed.suggestive),
    violence: clampModerationDimension(parsed.violence),
    hate: clampModerationDimension(parsed.hate),
    spam: clampModerationDimension(parsed.spam),
    safe: clampModerationDimension(parsed.safe),
    bodyPartFocus: parsed.bodyPartFocus === true,
    highSkinRatio: parsed.highSkinRatio === true,
  };
}

function parseModerationScoresFromGeminiText(
  rawText: string,
  fallback: ModerationScores,
): { scores: ParsedModeration; classificationFailed: boolean } {
  const buildFail = (): {
    scores: ParsedModeration;
    classificationFailed: boolean;
  } => ({
    scores: { ...fallback },
    classificationFailed: true,
  });

  const s = typeof rawText === "string" ? rawText.trim() : "";
  if (!s) return buildFail();

  const cleaned = s
    .replace(/^\uFEFF/, "")
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  let jsonCandidate: string | null = null;
  if (cleaned.startsWith("{")) {
    try {
      JSON.parse(cleaned);
      jsonCandidate = cleaned;
    } catch {
      const m = cleaned.match(/\{[\s\S]*\}/);
      if (m?.[0]) jsonCandidate = m[0];
    }
  } else {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m?.[0]) jsonCandidate = m[0];
  }

  if (!jsonCandidate) return buildFail();

  try {
    const parsedUnknown = JSON.parse(jsonCandidate);
    if (
      parsedUnknown == null ||
      typeof parsedUnknown !== "object" ||
      Array.isArray(parsedUnknown)
    ) {
      return buildFail();
    }

    const parsed = parsedUnknown as Record<string, unknown>;
    const hasNumericSignal = [
      "nudity",
      "sexual",
      "suggestive",
      "violence",
      "hate",
      "spam",
      "safe",
    ].some((k) => moderationScoreFieldPresent(parsed, k));

    if (!hasNumericSignal) return buildFail();

    return {
      scores: scoresFromParsedRecord(parsed),
      classificationFailed: false,
    };
  } catch {
    return buildFail();
  }
}

// ---------------------------------------------------------------------------
// Gemini API client
// ---------------------------------------------------------------------------

const GEMINI_MODEL = "gemini-2.5-flash";

const IMAGE_MODERATION_PROMPT = `You are a STRICT content moderation classifier for a conservative social media platform.
Your job is to protect users from ALL sexual, suggestive, and inappropriate content. Err on the side of caution.

Analyze the provided content and return ONLY a JSON object with these exact numeric scores (0.0 to 1.0):

- nudity: likelihood of any nudity or near-nudity (exposed skin beyond face/arms/lower legs, swimwear, underwear, lingerie, implied nudity covered by text/emoji/blur) (0=none, 1=explicit)
- sexual: likelihood of sexual content (focus on buttocks/chest/groin, zoomed/cropped body parts, erotic posing, sexual acts) (0=none, 1=explicit)
- suggestive: likelihood of suggestive or provocative content (revealing clothing, seductive poses, thirst-trap framing, bedroom/intimate setting, body-focused angles) (0=none, 1=extremely suggestive)
- violence: likelihood of violent/gory content (0=none, 1=extreme)
- hate: likelihood of hate speech, slurs, or abusive language (0=none, 1=severe)
- spam: likelihood of spam, scam, or repetitive low-quality content (0=none, 1=definite spam)
- safe: MUST equal 1 - max(nudity, sexual, suggestive, violence, hate). Do NOT use this field for personal/aesthetic judgments — it is a strict derived value.
- bodyPartFocus: true if image is primarily focused on a body part (torso, buttocks, chest, thighs) without full face visible
- highSkinRatio: true if image has high proportion of visible skin relative to clothing

Rules:
- Be STRICT: ZERO tolerance for sexual or suggestive content.
- Visible buttocks (even partially covered) → nudity ≥ 0.6, sexual ≥ 0.5
- Lingerie, underwear, bikini close-ups → nudity ≥ 0.5, suggestive ≥ 0.6
- Implied nudity (covered by text, emoji, blur, hands) → nudity ≥ 0.5, sexual ≥ 0.4
- Erotic posing, arched back, seductive expression → suggestive ≥ 0.5
- Zoomed/cropped body parts without face → sexual ≥ 0.5, bodyPartFocus: true
- Normal content (selfies with face, food, ice cream, drinks, travel, memes, pets, fashion, art, scenery) → ALL violation scores 0.0 and safe 1.0.
- Mildly upsetting but non-sexual content (blood, injuries, scary imagery) → use violence score; safe is still 1 - max(violations).
- safe is NEVER a "vibes" score. If every violation is 0.0, safe MUST be 1.0.
- Return ONLY the JSON object.

Example outputs:
Safe selfie / food / pet:    {"nudity":0.0,"sexual":0.0,"suggestive":0.0,"violence":0.0,"hate":0.0,"spam":0.0,"safe":1.0,"bodyPartFocus":false,"highSkinRatio":false}
Bikini close-up:             {"nudity":0.55,"sexual":0.5,"suggestive":0.65,"violence":0.0,"hate":0.0,"spam":0.0,"safe":0.35,"bodyPartFocus":true,"highSkinRatio":true}
Bloody injury photo:         {"nudity":0.0,"sexual":0.0,"suggestive":0.0,"violence":0.55,"hate":0.0,"spam":0.0,"safe":0.45,"bodyPartFocus":false,"highSkinRatio":false}`;

const TEXT_MODERATION_PROMPT = `You are a STRICT content moderation classifier for a conservative social media platform.

Analyze the following text and return ONLY a JSON object with these exact numeric scores (0.0 to 1.0):

- nudity: likelihood of sexually explicit text (0=none, 1=explicit)
- sexual: likelihood of sexual references, innuendo, or descriptions of sexual acts/body parts (0=none, 1=explicit)
- suggestive: likelihood of flirtatious, provocative, or thirst-trap captions (0=none, 1=extremely suggestive)
- violence: likelihood of violent/threatening language (0=none, 1=extreme)
- hate: likelihood of hate speech, slurs, or abusive language (0=none, 1=severe)
- spam: likelihood of spam, scam, or repetitive low-quality content (0=none, 1=definite spam)
- safe: MUST equal 1 - max(nudity, sexual, suggestive, violence, hate). Strict derived value, not a vibes score.

Rules:
- Be STRICT: err on the side of flagging genuinely problematic text.
- Sexual innuendo, body-focused language → sexual ≥ 0.4, suggestive ≥ 0.4
- Normal conversation and captions → ALL violation scores 0.0, safe 1.0.
- Return ONLY the JSON object. No explanations.

Text to analyze:
`;

interface GeminiCallResult {
  scores: ParsedModeration;
  classificationFailed: boolean;
  /** True when Gemini's own safety filters refused to classify the input. */
  safetyBlocked: boolean;
  /** Human-readable safety-block reason from Gemini (`SAFETY`, `RECITATION`, etc.). */
  safetyBlockReason?: string;
  /** Triggering safety category, if reported. */
  safetyBlockCategory?: string;
}

async function callGemini(
  apiKey: string,
  parts: Array<Record<string, unknown>>,
): Promise<GeminiCallResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const geminiFinishReason = (data: unknown): string | undefined => {
    const d = data as { candidates?: Array<{ finishReason?: string }> };
    return d?.candidates?.[0]?.finishReason;
  };

  const BASE_GEN = {
    temperature: 0.1,
    maxOutputTokens: 2048,
    responseMimeType: "application/json",
    thinkingConfig: { thinkingBudget: 0 },
  } satisfies Record<string, unknown>;

  // We are a moderation *classifier* — the input is expected to include
  // borderline/unsafe content. Relax Gemini's own safety filters to the
  // most permissive setting (BLOCK_NONE) so it actually scores the input
  // instead of refusing to respond. A `finishReason: "SAFETY"` after this
  // means the content is genuinely past Google's hardest-block tier
  // (CSAM-class), which we then treat as a hard block in policy.
  const SAFETY_SETTINGS = [
    { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" },
    { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_NONE" },
  ];

  const runAttempt = async (
    generationConfig: Record<string, unknown>,
    attemptLabel: string,
  ): Promise<GeminiCallResult> => {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig,
        safetySettings: SAFETY_SETTINGS,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "unknown");
      throw new Error(`Gemini API ${resp.status}: ${errText}`);
    }

    const data = await resp.json();
    const safety = geminiSafetyBlock(data);
    const raw = extractGeminiCandidateText(data);
    const parsed = parseModerationScoresFromGeminiText(raw, FAIL_CLOSED_PARSER_SCORES);

    if (safety.blocked) {
      console.warn("[ContentModeration] Gemini safety-blocked input", {
        attempt: attemptLabel,
        reason: safety.reason,
        category: safety.category,
        finishReason: geminiFinishReason(data),
      });
    } else if (parsed.classificationFailed) {
      console.warn("[ContentModeration] Gemini moderation parse incomplete", {
        attempt: attemptLabel,
        finishReason: geminiFinishReason(data),
        rawLength: raw.length,
        preview: raw.slice(0, 420),
      });
    }

    return {
      scores: parsed.scores,
      classificationFailed: parsed.classificationFailed,
      safetyBlocked: safety.blocked,
      safetyBlockReason: safety.reason,
      safetyBlockCategory: safety.category,
    };
  };

  let result = await runAttempt(BASE_GEN, "thinking_off_2048");

  // Safety blocks are deterministic — retrying with bigger budget will not
  // unblock the input. Skip the retry to avoid wasted latency / quota.
  if (result.safetyBlocked) return result;
  if (!result.classificationFailed) return result;

  result = await runAttempt(
    {
      ...BASE_GEN,
      maxOutputTokens: 8192,
    },
    "thinking_off_8192",
  );

  return result;
}

async function moderateImageBase64(
  apiKey: string,
  base64: string,
  mime = "image/jpeg",
): Promise<GeminiCallResult> {
  return callGemini(apiKey, [
    { text: IMAGE_MODERATION_PROMPT },
    { inlineData: { mimeType: mime, data: base64 } },
  ]);
}

async function moderateText(
  apiKey: string,
  text: string,
): Promise<{
  scores: ModerationScores;
  classificationFailed: boolean;
  safetyBlocked: boolean;
  safetyBlockReason?: string;
  safetyBlockCategory?: string;
}> {
  if (!text.trim()) {
    return {
      scores: { ...EMPTY_SCORES },
      classificationFailed: false,
      safetyBlocked: false,
    };
  }
  const r = await callGemini(apiKey, [{ text: TEXT_MODERATION_PROMPT + text }]);
  const { bodyPartFocus: _bpf, highSkinRatio: _hsk, ...rest } = r.scores;
  return {
    scores: rest,
    classificationFailed: r.classificationFailed,
    safetyBlocked: r.safetyBlocked,
    safetyBlockReason: r.safetyBlockReason,
    safetyBlockCategory: r.safetyBlockCategory,
  };
}


// ---------------------------------------------------------------------------
// Percentile-based video frame aggregation
// ---------------------------------------------------------------------------

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function aggregateFrameScores(frameScores: ModerationScores[]): ModerationScores {
  if (frameScores.length === 0) return { ...EMPTY_SCORES };
  if (frameScores.length === 1) return frameScores[0];

  const nudities = frameScores.map((s) => s.nudity);
  const sexuals = frameScores.map((s) => s.sexual);
  const suggestives = frameScores.map((s) => s.suggestive);
  const violences = frameScores.map((s) => s.violence);
  const hates = frameScores.map((s) => s.hate);
  const spams = frameScores.map((s) => s.spam);
  const safes = frameScores.map((s) => s.safe);

  const badFrameThreshold = 0.4;
  const nudityBadRatio = nudities.filter((v) => v > badFrameThreshold).length / nudities.length;
  const sexualBadRatio = sexuals.filter((v) => v > badFrameThreshold).length / sexuals.length;
  const violenceBadRatio = violences.filter((v) => v > badFrameThreshold).length / violences.length;

  let nudityScore = percentile(nudities, 90);
  let sexualScore = percentile(sexuals, 90);
  let violenceScore = percentile(violences, 90);

  if (nudityBadRatio > 0.15) nudityScore = Math.max(nudityScore, Math.max(...nudities) * 0.95);
  if (sexualBadRatio > 0.15) sexualScore = Math.max(sexualScore, Math.max(...sexuals) * 0.95);
  if (violenceBadRatio > 0.2) violenceScore = Math.max(violenceScore, Math.max(...violences) * 0.95);

  return {
    nudity: nudityScore,
    sexual: sexualScore,
    suggestive: percentile(suggestives, 90),
    violence: violenceScore,
    hate: percentile(hates, 90),
    spam: percentile(spams, 90),
    safe: percentile(safes, 10),
  };
}

// ---------------------------------------------------------------------------
// Rekognition fallback (deterministic vision-only second opinion)
// ---------------------------------------------------------------------------

/**
 * Rekognition is the fail-closed fallback for Gemini. It's a vision-only,
 * deterministic classifier that's much harder to "fool" with social-context
 * arguments than an LLM — when Gemini misses, returns weak scores, refuses
 * to classify, or flags `bodyPartFocus`/`highSkinRatio`, we re-check the
 * bytes here and merge by taking MAX of every violation score.
 *
 * Region resolution: AWS_REKOGNITION_REGION → AWS_DEFAULT_REGION →
 * `us-east-1`. We intentionally do NOT consult `AWS_REGION` because it
 * tracks the primary S3 region (e.g. eu-west-1), where Rekognition may not
 * exist.
 */
const REKOGNITION_SUPPORTED_REGIONS = new Set([
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ap-south-1",
  "ap-northeast-1",
  "ap-northeast-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ca-central-1",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-north-1",
]);

function resolveRekognitionRegion(): string {
  const explicit = process.env.AWS_REKOGNITION_REGION;
  if (explicit && REKOGNITION_SUPPORTED_REGIONS.has(explicit)) return explicit;
  const def = process.env.AWS_DEFAULT_REGION;
  if (def && REKOGNITION_SUPPORTED_REGIONS.has(def)) return def;
  return "us-east-1";
}

let cachedRekognitionClient: RekognitionClient | null = null;
function getRekognitionClient(): RekognitionClient | null {
  const id = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  if (!id || !secret) return null;
  if (cachedRekognitionClient) return cachedRekognitionClient;
  cachedRekognitionClient = new RekognitionClient({
    region: resolveRekognitionRegion(),
    credentials: { accessKeyId: id, secretAccessKey: secret },
  });
  return cachedRekognitionClient;
}

/**
 * Map Rekognition's hierarchical taxonomy onto our `ModerationScores`
 * vector. Always returns a complete score object — never partial.
 */
function mapRekognitionToScores(labels: ModerationLabel[]): ModerationScores {
  let nudity = 0;
  let sexual = 0;
  let suggestive = 0;
  let violence = 0;
  let hate = 0;

  for (const lbl of labels ?? []) {
    const conf = (lbl.Confidence ?? 0) / 100;
    if (!Number.isFinite(conf) || conf <= 0) continue;
    const name = (lbl.Name ?? "").toLowerCase();
    const parent = (lbl.ParentName ?? "").toLowerCase();

    if (
      name === "explicit nudity" ||
      name === "graphic male nudity" ||
      name === "graphic female nudity" ||
      name === "exposed male genitalia" ||
      name === "exposed female genitalia" ||
      name === "exposed buttocks" ||
      name === "exposed breast" ||
      name === "explicit"
    ) {
      nudity = Math.max(nudity, conf);
      sexual = Math.max(sexual, conf * 0.9);
    }

    if (
      name === "sexual activity" ||
      name === "sex toys" ||
      name === "explicit sexual activity" ||
      parent === "sexual activity"
    ) {
      sexual = Math.max(sexual, conf);
      nudity = Math.max(nudity, conf * 0.7);
    }

    if (
      name === "non-explicit nudity" ||
      name === "non-explicit nudity of intimate parts and kissing" ||
      name === "partial nudity" ||
      name === "implied nudity" ||
      name === "obstructed intimate parts" ||
      name === "kissing on the lips" ||
      name === "revealing clothes" ||
      name === "swimwear or underwear" ||
      name === "lingerie" ||
      name === "bare back" ||
      parent === "suggestive"
    ) {
      suggestive = Math.max(suggestive, conf);
      if (
        name === "lingerie" ||
        name === "swimwear or underwear" ||
        name === "non-explicit nudity"
      ) {
        nudity = Math.max(nudity, conf * 0.6);
      }
    }

    if (
      parent === "violence" ||
      name === "violence" ||
      name === "graphic violence or gore" ||
      name === "physical violence" ||
      name === "weapon violence" ||
      name === "weapons" ||
      name === "self injury" ||
      name === "corpses"
    ) {
      violence = Math.max(violence, conf);
    }

    if (
      parent === "hate symbols" ||
      name === "nazi party" ||
      name === "white supremacy" ||
      name === "extremist"
    ) {
      hate = Math.max(hate, conf);
    }
  }

  const safe = 1 - Math.max(nudity, sexual, suggestive, violence, hate);
  return { nudity, sexual, suggestive, violence, hate, spam: 0, safe };
}

interface RekognitionCallResult {
  scores: ModerationScores;
  /** Raw Rekognition labels for diagnostic logging. */
  labels: Array<{ name?: string; parent?: string; confidence?: number }>;
  /** True when Rekognition itself failed (network, perms, region). */
  failed: boolean;
  failureReason?: string;
}

async function moderateImageWithRekognition(
  bytes: Buffer,
): Promise<RekognitionCallResult> {
  const client = getRekognitionClient();
  if (!client) {
    return {
      scores: { ...EMPTY_SCORES },
      labels: [],
      failed: true,
      failureReason: "AWS credentials missing",
    };
  }
  try {
    const res = await client.send(
      new DetectModerationLabelsCommand({
        Image: { Bytes: bytes },
        MinConfidence: 50,
      }),
    );
    const labels = res.ModerationLabels ?? [];
    return {
      scores: mapRekognitionToScores(labels),
      labels: labels.map((l) => ({
        name: l.Name,
        parent: l.ParentName,
        confidence: l.Confidence,
      })),
      failed: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[ContentModeration] Rekognition call failed:", msg);
    return {
      scores: { ...EMPTY_SCORES },
      labels: [],
      failed: true,
      failureReason: msg,
    };
  }
}

/**
 * Decide whether to consult Rekognition for a given Gemini result on a
 * single frame. Triggers on:
 *   - Gemini classification failed / safety-blocked / threw
 *   - Borderline suggestive scores (suggestive > 0.4 but sexual < 0.5)
 *   - Body-part focus / high skin signals (Gemini often misses these)
 *   - Heuristic-derived scores (no AI ran at all on this frame)
 *
 * Returns false only when Gemini gave clean, confident scores AND no
 * structural reason to second-guess them.
 */
function shouldRekognitionFallback(args: {
  geminiFailed: boolean;
  scores: ModerationScores;
  bodyPartFocus: boolean;
  highSkinRatio: boolean;
  source: "ai" | "fallback" | "heuristic";
}): boolean {
  if (args.geminiFailed) return true;
  if (args.source === "fallback") return true;
  if (args.bodyPartFocus || args.highSkinRatio) return true;
  // Borderline suggestive that didn't quite trip composite (might be missed nudity).
  if (args.scores.suggestive > 0.4 && args.scores.sexual < 0.5) return true;
  // Mid-range "safe" that wasn't blocked but also isn't confidently safe.
  if (args.scores.safe < 0.7) return true;
  return false;
}

/** Merge two moderation vectors with worst-case rules (fail-closed). */
function mergeScoresWorstCase(
  a: ModerationScores,
  b: ModerationScores,
): ModerationScores {
  return {
    nudity: Math.max(a.nudity, b.nudity),
    sexual: Math.max(a.sexual, b.sexual),
    suggestive: Math.max(a.suggestive, b.suggestive),
    violence: Math.max(a.violence, b.violence),
    hate: Math.max(a.hate, b.hate),
    // `spam` is text-only / behaviour-only — Rekognition has no signal here.
    spam: Math.max(a.spam, b.spam),
    safe: Math.min(a.safe, b.safe),
  };
}

// ---------------------------------------------------------------------------
// Policy engine (configurable thresholds)
// ---------------------------------------------------------------------------

/**
 * Maximum violation score across the dimensions that drive moderation
 * decisions. `spam` is intentionally excluded — it has its own rule and a
 * benign post can spike spam without being "unsafe".
 */
function maxViolationScore(s: ModerationScores): number {
  return Math.max(s.nudity, s.sexual, s.suggestive, s.violence, s.hate);
}

/**
 * Reconcile the model's standalone `safe` score with the actual violation
 * scores it returned. Gemini frequently returns inconsistent outputs like
 * `{nudity:0, sexual:0, suggestive:0, violence:0, hate:0, safe:0.15}` for
 * benign content (food, blood, etc.), which would otherwise trip the
 * safe-low rule with no corroborating signal.
 *
 * We floor `safe` at `1 - maxViolation` so the model can never claim less
 * safety than its own violation scores justify.
 */
function reconcileSafeScore(s: ModerationScores): number {
  const derivedSafe = 1 - maxViolationScore(s);
  return Math.max(s.safe, derivedSafe);
}

function evaluatePolicy(
  scores: ModerationScores,
  spamBoost: number,
  config: ModerationConfig,
  heuristics?: { bodyPartFocus?: boolean; highSkinRatio?: boolean },
  meta?: {
    classificationFailed?: boolean;
    safetyBlocked?: boolean;
    safetyBlockReason?: string;
    safetyBlockCategory?: string;
  },
): { decision: ModerationDecision; reason: string; adjusted: ModerationScores } {
  const adj = { ...scores };
  if (spamBoost > 0) {
    adj.spam = Math.min(1, adj.spam + spamBoost);
    adj.safe = Math.max(0, adj.safe - spamBoost * 0.5);
  }

  // Gemini's own safety filters refused to classify this content. That
  // refusal is itself the strongest possible adverse signal (Google has
  // independently determined the input is unsafe), so we hard-block.
  // We also force `safe` to 0 so the persisted score vector reflects this.
  if (meta?.safetyBlocked) {
    adj.safe = 0;
    const cat = meta.safetyBlockCategory
      ? ` (${meta.safetyBlockCategory.replace(/^HARM_CATEGORY_/, "")})`
      : "";
    return {
      decision: "block",
      reason: `Blocked by automated safety filter${cat}`,
      adjusted: adj,
    };
  }

  if (meta?.classificationFailed) {
    return {
      decision: "flag_sensitive",
      reason:
        "We could not read the automated review output for this post, so it was queued for manual review.",
      adjusted: adj,
    };
  }

  // Body-part heuristic boost (AI-independent strict rule): when AI detects
  // body-focus + high skin, force sexual/suggestive past the composite
  // flag threshold. This is a deliberate fail-closed guardrail — it fires
  // even when individual scores look low, because LLMs systematically
  // under-rate "thirst trap" framing.
  if (heuristics?.bodyPartFocus && heuristics?.highSkinRatio) {
    adj.sexual = Math.max(adj.sexual, 0.5);
    adj.suggestive = Math.max(adj.suggestive, 0.5);
    adj.safe = Math.min(adj.safe, 0.4);
  } else if (heuristics?.bodyPartFocus) {
    adj.sexual = Math.max(adj.sexual, 0.32);
    adj.suggestive = Math.max(adj.suggestive, 0.32);
  }

  // Reconcile the model's `safe` field against its own violation scores.
  // Persist the reconciled value so downstream consumers (DB, audit log) get
  // a self-consistent vector — no more "all violations 0, safe 0.15".
  adj.safe = reconcileSafeScore(adj);

  const sexSugComposite = adj.sexual + adj.suggestive;
  if (sexSugComposite > config.sexualSuggestiveCompositeFlag)
    return {
      decision: "flag_sensitive",
      reason: `Sexual+Suggestive composite ${sexSugComposite.toFixed(2)} > ${config.sexualSuggestiveCompositeFlag}`,
      adjusted: adj,
    };

  if (adj.nudity > config.nudityBlock)
    return { decision: "block", reason: `Nudity ${adj.nudity.toFixed(2)} > ${config.nudityBlock}`, adjusted: adj };
  if (adj.sexual > config.sexualBlock)
    return { decision: "block", reason: `Sexual ${adj.sexual.toFixed(2)} > ${config.sexualBlock}`, adjusted: adj };
  if (adj.hate > config.hateBlock)
    return { decision: "block", reason: `Hate ${adj.hate.toFixed(2)} > ${config.hateBlock}`, adjusted: adj };


  if (adj.suggestive > config.suggestiveFlag)
    return { decision: STRICT_MODE ? "block" : "flag_sensitive", reason: `Suggestive ${adj.suggestive.toFixed(2)} > ${config.suggestiveFlag}`, adjusted: adj };

  // Safe-low rule requires corroboration: at least one real violation score
  // must also be elevated. A standalone low `safe` from the model with all
  // violations near 0 is treated as model noise, not a moderation signal.
  // (See `reconcileSafeScore` — `adj.safe` is already floored at
  // `1 - maxViolation`, so this rule can only fire when violations are real.)
  if (adj.safe < config.safeLowFlag) {
    const maxViol = maxViolationScore(adj);
    if (maxViol >= 0.25) {
      return {
        decision: "flag_sensitive",
        reason: `Safe ${adj.safe.toFixed(2)} < ${config.safeLowFlag} (corroborated by maxViolation ${maxViol.toFixed(2)})`,
        adjusted: adj,
      };
    }
  }

  if (adj.spam > config.spamFlag)
    return { decision: "flag_spam", reason: `Spam ${adj.spam.toFixed(2)} > ${config.spamFlag}`, adjusted: adj };
  if (adj.violence > config.violenceSensitive)
    return { decision: "flag_sensitive", reason: `Violence ${adj.violence.toFixed(2)} > ${config.violenceSensitive}`, adjusted: adj };

  return { decision: "allow", reason: "Content passes all policy checks", adjusted: adj };
}

function decisionToDbStatus(decision: ModerationDecision): {
  moderationStatus: "active" | "flagged" | "restricted" | "removed";
  moderationVisibilityStatus: "public" | "hidden" | "shadow_hidden";
} {
  switch (decision) {
    case "allow":
      return { moderationStatus: "active", moderationVisibilityStatus: "public" };
    case "block":
      return { moderationStatus: "removed", moderationVisibilityStatus: "hidden" };
    case "flag_sensitive":
      return { moderationStatus: "flagged", moderationVisibilityStatus: "hidden" };
    case "flag_spam":
      return { moderationStatus: "flagged", moderationVisibilityStatus: "hidden" };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mime: string } | null> {
  try {
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const buf = Buffer.from(await resp.arrayBuffer());
    const mime = resp.headers.get("content-type") ?? "image/jpeg";
    return { base64: buf.toString("base64"), mime };
  } catch {
    return null;
  }
}

function sha256(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

// ---------------------------------------------------------------------------
// Spam signals action (with velocity intelligence)
// ---------------------------------------------------------------------------

export const getSpamSignals = internalAction({
  args: {
    userId: v.id("users"),
    caption: v.string(),
    mediaHash: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    isDuplicate: boolean;
    recentPostCount: number;
    captionRepeated: boolean;
    burstCount: number;
    crossUserHashCount: number;
    spamBoost: number;
  }> => {
    let isDuplicate = false;
    let crossUserHashCount = 0;

    if (args.mediaHash) {
      const hashRows = await ctx.runQuery(
        internal.contentModerationQueries.findHashByUser,
        { userId: args.userId, hash: args.mediaHash },
      );
      isDuplicate = (hashRows as unknown[]).length > 0;

      // Cross-user hash check: coordinated spam
      const globalHits = (await ctx.runQuery(
        internal.contentModerationQueries.countGlobalHashUploads,
        { hash: args.mediaHash },
      )) as { count: number; uniqueUsers: number };
      crossUserHashCount = globalHits.uniqueUsers;
    }

    const rateInfo = (await ctx.runQuery(
      internal.contentModerationQueries.getUserPostRate,
      { userId: args.userId },
    )) as { count: number; timestamps: number[] };
    const recentPostCount = rateInfo?.count ?? 0;
    const rateLimited = recentPostCount >= 10;

    // Burst detection: posts in last 10 minutes
    const burstInfo = (await ctx.runQuery(
      internal.contentModerationQueries.getUserBurstRate,
      { userId: args.userId, windowMinutes: 10 },
    )) as { count: number };
    const burstCount = burstInfo.count;

    const recentCaptions = (await ctx.runQuery(
      internal.contentModerationQueries.getRecentCaptions,
      { userId: args.userId, limit: 20 },
    )) as string[];
    const captionNorm = args.caption.trim().toLowerCase();
    const captionRepeated =
      captionNorm.length > 0 &&
      recentCaptions.some((c) => c.trim().toLowerCase() === captionNorm);

    let spamBoost =
      (isDuplicate ? 0.3 : 0) +
      (captionRepeated ? 0.2 : 0) +
      (rateLimited ? 0.15 : 0);

    // Velocity boosts
    if (burstCount >= 4) spamBoost += 0.25;
    else if (burstCount >= 3) spamBoost += 0.1;

    // 5+ distinct users posting same content hash → massive spam signal
    if (crossUserHashCount >= 5) spamBoost += 0.4;
    else if (crossUserHashCount >= 3) spamBoost += 0.2;

    return {
      isDuplicate,
      recentPostCount,
      captionRepeated,
      burstCount,
      crossUserHashCount,
      spamBoost,
    };
  },
});

// ---------------------------------------------------------------------------
// Main moderation action
// ---------------------------------------------------------------------------

export const moderatePublishedPost = internalAction({
  args: {
    postId: v.id("posts"),
    trigger: v.union(v.literal("publish"), v.literal("report")),
  },
  handler: async (ctx, args) => {
    const start = Date.now();
    const apiKey = process.env.GEMINI_API_KEY;

    const post = await ctx.runQuery(
      internal.contentModerationQueries.getPost,
      { postId: args.postId },
    );
    if (!post) return;
    const userId = (post as { userId: Id<"users"> }).userId;
    const caption = (post as { caption?: string }).caption;

    // Load configurable thresholds from DB (merge so missing columns keep strict defaults).
    const cfgRow = await ctx.runQuery(
      internal.contentModerationQueries.getModerationConfig,
      { key: "default" },
    );
    const config: ModerationConfig = {
      ...DEFAULT_CONFIG,
      ...(cfgRow as Partial<ModerationConfig> | null),
    };

    // No API key: moderation cannot run; posts stay `pending` but remain `public` in feeds
    // (legacy rows used `hidden` — use `internal/posts/backfillPublishedPendingHiddenToPublic`).
    if (!apiKey) {
      console.warn("[ContentModeration] GEMINI_API_KEY not set — skipping moderation run");
      await ctx.runMutation(
        internal.contentModerationQueries.logModerationEvent,
        {
          eventType: "MODERATION_RUN",
          postId: args.postId,
          userId,
          payload: {
            provider: "none",
            decision: "fail_closed",
            reason: "GEMINI_API_KEY unset — moderation cannot run",
            durationMs: Date.now() - start,
            trigger: args.trigger,
          },
        },
      );
      return;
    }

    const media = (await ctx.runQuery(
      internal.contentModerationQueries.getPostMedia,
      { postId: args.postId },
    )) as Array<{
      type: string;
      displayUrl: string;
      thumbnailUrl?: string;
    }>;

    const bootstrapMs = Date.now() - start;

    // 1) Moderate caption text
    let textScores: ModerationScores = { ...EMPTY_SCORES };
    let captionModerated = false;
    let anyClassificationFailed = false;
    let anySafetyBlocked = false;
    let firstSafetyBlockReason: string | undefined;
    let firstSafetyBlockCategory: string | undefined;
    const noteSafetyBlock = (reason?: string, category?: string) => {
      anySafetyBlocked = true;
      if (firstSafetyBlockReason == null) firstSafetyBlockReason = reason;
      if (firstSafetyBlockCategory == null) firstSafetyBlockCategory = category;
    };
    let captionGeminiMs = 0;
    if (caption?.trim()) {
      captionModerated = true;
      const tCaption = Date.now();
      try {
        const mr = await moderateText(apiKey, caption);
        textScores = mr.scores;
        if (mr.safetyBlocked) {
          noteSafetyBlock(mr.safetyBlockReason, mr.safetyBlockCategory);
        } else if (mr.classificationFailed) {
          anyClassificationFailed = true;
        }
      } catch (err) {
        console.error("[ContentModeration] text moderation failed:", err);
        textScores = { ...FAIL_CLOSED_PROVIDER_SCORES };
        anyClassificationFailed = true;
      }
      captionGeminiMs = Date.now() - tCaption;
    }

    // 2) Moderate each media item:
    //    a) deterministic skin/body heuristic (instant block on obvious cases)
    //    b) Gemini classification (context-aware, handles non-visual signals)
    //    c) Rekognition fallback when Gemini fails OR returns weak/borderline
    //       scores OR flags body-focus signals (vision-only second opinion)
    //    Frame scores are merged worst-case (MAX violations / MIN safe) so a
    //    single source declaring "unsafe" wins.
    const allFrameScores: ModerationScores[] = [];
    const frameScoreSources: Array<"ai" | "fallback" | "heuristic"> = [];
    /** Sources that *contributed* to the merged frame score. */
    const frameContributingSources: Array<"gemini" | "rekognition" | "heuristic" | "fail_closed"> = [];
    const rekognitionLabelDiagnostics: Array<{
      mediaIndex: number;
      labels: Array<{ name?: string; parent?: string; confidence?: number }>;
      failureReason?: string;
    }> = [];
    let firstMediaHash: string | undefined;
    let anyRekognitionFailed = false;

    let mediaDownloadMs = 0;
    let mediaFramePipelineMs = 0;

    /**
     * Run the per-frame moderation pipeline on raw image bytes.
     * Returns a complete `ModerationScores` (never partial), plus the
     * heuristic flags we use later in the policy engine.
     */
    const moderateFrame = async (
      mediaIndex: number,
      buf: Buffer,
      base64: string,
      mime: string,
    ): Promise<
      ModerationScores & { bodyPartFocus?: boolean; highSkinRatio?: boolean }
    > => {
      const vis = await analyzeVisualSafetyHeuristic(buf);

      // (a) Deterministic heuristic — instant block, skip both AI calls.
      if (vis.hardSkinBodyBlock) {
        frameScoreSources.push("heuristic");
        frameContributingSources.push("heuristic");
        return {
          ...HEURISTIC_HARD_BLOCK_SCORES,
          highSkinRatio: vis.skinRatio > 0.35,
          bodyPartFocus: true,
        };
      }

      // (b) Gemini.
      let geminiScores: ModerationScores = { ...EMPTY_SCORES };
      let geminiBodyPartFocus = false;
      let geminiHighSkinRatio = false;
      let geminiFailed = false;
      try {
        const mr = await moderateImageBase64(apiKey, base64, mime);
        geminiScores = mr.scores;
        geminiBodyPartFocus = mr.scores.bodyPartFocus === true;
        geminiHighSkinRatio = mr.scores.highSkinRatio === true;
        if (mr.safetyBlocked) {
          noteSafetyBlock(mr.safetyBlockReason, mr.safetyBlockCategory);
          // Safety-blocked is a strong adverse signal — boost scores so
          // even if Rekognition disagrees, the merged result is hostile.
          geminiScores = { ...FAIL_CLOSED_PROVIDER_SCORES };
          geminiFailed = true;
        } else if (mr.classificationFailed) {
          anyClassificationFailed = true;
          geminiScores = { ...FAIL_CLOSED_PROVIDER_SCORES };
          geminiFailed = true;
        }
        frameScoreSources.push("ai");
      } catch (err) {
        console.warn("[ContentModeration] Gemini frame call threw:", err);
        anyClassificationFailed = true;
        geminiScores = { ...FAIL_CLOSED_PROVIDER_SCORES };
        geminiFailed = true;
        frameScoreSources.push("fallback");
      }

      // (c) Rekognition fallback when warranted.
      const wantFallback = shouldRekognitionFallback({
        geminiFailed,
        scores: geminiScores,
        bodyPartFocus: geminiBodyPartFocus,
        highSkinRatio: geminiHighSkinRatio,
        source: geminiFailed ? "fallback" : "ai",
      });

      let merged: ModerationScores = geminiScores;
      let usedRekognition = false;

      if (wantFallback) {
        const rek = await moderateImageWithRekognition(buf);
        rekognitionLabelDiagnostics.push({
          mediaIndex,
          labels: rek.labels,
          failureReason: rek.failureReason,
        });
        if (rek.failed) {
          anyRekognitionFailed = true;
          // Gemini already failed AND Rekognition failed → hard fail-closed.
          if (geminiFailed) {
            merged = { ...FAIL_CLOSED_PROVIDER_SCORES };
          }
        } else {
          merged = mergeScoresWorstCase(geminiScores, rek.scores);
          usedRekognition = true;
        }
      }

      // Track contributing source for diagnostics.
      if (geminiFailed && !usedRekognition) {
        frameContributingSources.push("fail_closed");
      } else if (usedRekognition && geminiFailed) {
        frameContributingSources.push("rekognition");
      } else if (usedRekognition) {
        frameContributingSources.push(geminiFailed ? "rekognition" : "gemini");
        if (!geminiFailed) frameContributingSources.push("rekognition");
      } else {
        frameContributingSources.push("gemini");
      }

      return {
        ...merged,
        bodyPartFocus: geminiBodyPartFocus,
        highSkinRatio: geminiHighSkinRatio,
      };
    };

    for (const [mediaIndex, m] of media.entries()) {
      try {
        const sourceUrl =
          m.type === "image" ? m.displayUrl : m.thumbnailUrl;
        if (!sourceUrl) continue;
        const tDl = Date.now();
        const img = await fetchImageAsBase64(sourceUrl);
        mediaDownloadMs += Date.now() - tDl;
        if (!img) continue;
        if (!firstMediaHash) {
          firstMediaHash = sha256(
            img.base64.slice(0, 2048) + ":" + img.base64.length,
          );
        }
        const buf = Buffer.from(img.base64, "base64");
        const tFrame = Date.now();
        const scores = await moderateFrame(mediaIndex, buf, img.base64, img.mime);
        mediaFramePipelineMs += Date.now() - tFrame;
        allFrameScores.push(scores);
      } catch (err) {
        console.error("[ContentModeration] media moderation failed:", err);
        // Hard fail-closed: never let a thrown exception fall through to
        // an "active/public" decision via empty scores.
        allFrameScores.push({ ...FAIL_CLOSED_PROVIDER_SCORES });
        frameScoreSources.push("fallback");
        frameContributingSources.push("fail_closed");
        anyClassificationFailed = true;
      }
    }

    const hadMediaWork = captionModerated || allFrameScores.length > 0;
    if (!hadMediaWork) {
      console.warn(
        "[MODERATION_PERF]",
        JSON.stringify({
          postId: String(args.postId),
          trigger: args.trigger,
          skipped: true,
          reason: "no_caption_and_no_media_scores",
          bootstrapMs,
          captionGeminiMs,
          mediaDownloadMs,
          mediaFramePipelineMs,
          totalMs: Date.now() - start,
        }),
      );
      return;
    }
    // 3) Merge scores: percentile-based for frames, then MAX with text.
    //    Also collect body-part heuristic flags from individual frame results.
    const mediaScores = aggregateFrameScores(allFrameScores);
    let anyBodyPartFocus = false;
    let anyHighSkinRatio = false;
    for (const fs of allFrameScores) {
      const ext = fs as ModerationScores & { bodyPartFocus?: boolean; highSkinRatio?: boolean };
      if (ext.bodyPartFocus) anyBodyPartFocus = true;
      if (ext.highSkinRatio) anyHighSkinRatio = true;
    }

    const merged: ModerationScores = {
      nudity: Math.max(textScores.nudity, mediaScores.nudity),
      sexual: Math.max(textScores.sexual, mediaScores.sexual),
      suggestive: Math.max(textScores.suggestive, mediaScores.suggestive),
      violence: Math.max(textScores.violence, mediaScores.violence),
      hate: Math.max(textScores.hate, mediaScores.hate),
      spam: Math.max(textScores.spam, mediaScores.spam),
      safe: Math.min(textScores.safe, mediaScores.safe),
    };

    const scoresSourceDiagnostic: "ai" | "fallback" | "heuristic" =
      frameScoreSources.length === 0
        ? captionModerated
          ? "ai"
          : "fallback"
        : frameScoreSources.every((s) => s === "ai")
          ? "ai"
          : frameScoreSources.every((s) => s === "heuristic")
            ? "heuristic"
            : frameScoreSources.some((s) => s === "fallback")
              ? "fallback"
              : "heuristic"; // heuristic+ai carousel → deterministic layer fired

    /** Compact summary of which providers contributed to the merged score. */
    const usedRekognition = frameContributingSources.some((s) => s === "rekognition");
    const usedHeuristic = frameContributingSources.some((s) => s === "heuristic");
    const usedFailClosed = frameContributingSources.some((s) => s === "fail_closed");
    const pipelineSource: string = [
      "gemini",
      usedRekognition ? "rekognition" : null,
      usedHeuristic ? "heuristic" : null,
      usedFailClosed ? "fail_closed" : null,
    ]
      .filter(Boolean)
      .join("+");

    // 4) Spam signals with velocity intelligence
    let spamBoost = 0;
    let spamDetail: Record<string, unknown> = {};
    let spamSignalsMs = 0;
    try {
      const tSpam = Date.now();
      const signals = await ctx.runAction(
        internal.contentModeration.getSpamSignals,
        { userId, caption: caption ?? "", mediaHash: firstMediaHash },
      );
      spamSignalsMs = Date.now() - tSpam;
      spamBoost = signals.spamBoost;
      spamDetail = {
        isDuplicate: signals.isDuplicate,
        recentPostCount: signals.recentPostCount,
        captionRepeated: signals.captionRepeated,
        burstCount: signals.burstCount,
        crossUserHashCount: signals.crossUserHashCount,
      };
    } catch (err) {
      console.error("[ContentModeration] spam signals failed:", err);
    }

    // 5) Policy decision (configurable thresholds + body-part heuristics)
    const { decision, reason, adjusted } = evaluatePolicy(
      merged,
      spamBoost,
      config,
      {
        bodyPartFocus: anyBodyPartFocus,
        highSkinRatio: anyHighSkinRatio,
      },
      {
        classificationFailed: anyClassificationFailed,
        safetyBlocked: anySafetyBlocked,
        safetyBlockReason: firstSafetyBlockReason,
        safetyBlockCategory: firstSafetyBlockCategory,
      },
    );
    const durationMs = Date.now() - start;

    console.warn(
      "[MOD_PIPELINE_DEBUG]",
      JSON.stringify({
        id: String(args.postId),
        nudity: adjusted.nudity,
        sexual: adjusted.sexual,
        suggestive: adjusted.suggestive,
        violence: adjusted.violence,
        hate: adjusted.hate,
        spam: adjusted.spam,
        safeRaw: merged.safe,
        safeReconciled: adjusted.safe,
        decision,
        reason,
        source: scoresSourceDiagnostic,
        pipelineSource,
        usedRekognition,
        rekognitionFailed: anyRekognitionFailed,
        classificationFailed: anyClassificationFailed,
        safetyBlocked: anySafetyBlocked,
        safetyBlockReason: firstSafetyBlockReason,
        safetyBlockCategory: firstSafetyBlockCategory,
        bodyPartFocus: anyBodyPartFocus,
        highSkinRatio: anyHighSkinRatio,
        rekognitionLabels: rekognitionLabelDiagnostics
          .flatMap((d) => d.labels)
          .filter((l) => (l.confidence ?? 0) >= 50)
          .map((l) => `${l.name}:${(l.confidence ?? 0).toFixed(0)}`),
      }),
    );

    console.warn(
      "[MODERATION_PERF]",
      JSON.stringify({
        postId: String(args.postId),
        trigger: args.trigger,
        totalMs: durationMs,
        bootstrapMs,
        captionGeminiMs,
        mediaCount: media.length,
        mediaDownloadMs,
        mediaFramePipelineMs,
        spamSignalsMs,
        pipelineSource,
        usedRekognition,
        rekognitionFailed: anyRekognitionFailed,
        note:
          "Runs asynchronously after publish on Convex; does not block the client publish mutation.",
      }),
    );

    // 6) Store moderation result
    await ctx.runMutation(
      internal.contentModerationQueries.storeModerationResult,
      {
        postId: args.postId,
        provider: "gemini",
        nudity: adjusted.nudity,
        sexual: adjusted.sexual,
        suggestive: adjusted.suggestive,
        violence: adjusted.violence,
        hate: adjusted.hate,
        spam: adjusted.spam,
        safe: adjusted.safe,
        decision,
        reason,
        durationMs,
        trigger: args.trigger,
      },
    );

    // 7) Apply moderation status (lifts pre-moderation throttle for safe content)
    const dbStatus = decisionToDbStatus(decision);
    // Persist a *user-facing* reason. The raw debug string is preserved in
    // the MODERATION_RUN event payload below for admin / audit use.
    const userFacingReason =
      decision !== "allow" ? friendlyModerationReason(decision, reason) : undefined;
    await ctx.runMutation(
      internal.contentModerationQueries.applyModerationDecision,
      {
        postId: args.postId,
        moderationStatus: dbStatus.moderationStatus,
        moderationVisibilityStatus: dbStatus.moderationVisibilityStatus,
        moderationReason: userFacingReason,
      },
    );

    // 8) Store content hashes (per-user + global cross-user index)
    if (firstMediaHash) {
      await ctx.runMutation(
        internal.contentModerationQueries.storeContentHash,
        { userId, postId: args.postId, hash: firstMediaHash, hashType: "media" as const },
      );
    }
    if (caption?.trim()) {
      await ctx.runMutation(
        internal.contentModerationQueries.storeContentHash,
        { userId, postId: args.postId, hash: sha256(caption.trim().toLowerCase()), hashType: "caption" as const },
      );
    }

    // 9) Update rate limiter
    await ctx.runMutation(
      internal.contentModerationQueries.updateUserPostRate,
      { userId, timestamp: Date.now() },
    );

    // 10) Structured logging: MODERATION_RUN event
    await ctx.runMutation(
      internal.contentModerationQueries.logModerationEvent,
      {
        eventType: "MODERATION_RUN",
        postId: args.postId,
        userId,
        payload: {
          provider: usedRekognition ? "gemini+rekognition" : "gemini",
          scores: adjusted,
          rawScores: merged,
          decision,
          reason,
          durationMs,
          trigger: args.trigger,
          source: scoresSourceDiagnostic,
          pipelineSource,
          usedRekognition,
          rekognitionFailed: anyRekognitionFailed,
          rekognitionLabels: rekognitionLabelDiagnostics,
          spamSignals: spamDetail,
          mediaCount: media.length,
          framesAnalyzed: allFrameScores.length,
          configUsed: config,
        },
      },
    );

    // 11) Structured logging: DISTRIBUTION_CHANGE event
    const prevStatus = (post as { moderationStatus?: string }).moderationStatus ?? "pending";
    if (prevStatus !== dbStatus.moderationStatus) {
      await ctx.runMutation(
        internal.contentModerationQueries.logModerationEvent,
        {
          eventType: "DISTRIBUTION_CHANGE",
          postId: args.postId,
          userId,
          payload: {
            oldStatus: prevStatus,
            newStatus: dbStatus.moderationStatus,
            oldVisibility: (post as { moderationVisibilityStatus?: string }).moderationVisibilityStatus ?? "public",
            newVisibility: dbStatus.moderationVisibilityStatus,
            reason,
            decision,
          },
        },
      );
    }
  },
});
