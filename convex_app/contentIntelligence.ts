"use node";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Content Intelligence processing pipeline — Context Engine Phase 1.
 *
 * Runs asynchronously after post publish. Extracts structured intelligence
 * (transcript, summary, topics, entities, referenced items) from video
 * content using Gemini. Never blocks the upload/share flow.
 *
 * Safe to retry: idempotent per job row; failed jobs don't touch the post.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { CURRENT_PROCESSING_VERSION } from "./contentIntelligenceDb";
import { extractFramesFromVideo, fetchVideoBuffer } from "./videoModeration";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Topic {
  label: string;
  confidence: number;
}

interface Entity {
  type:
    | "person"
    | "place"
    | "organization"
    | "brand"
    | "product"
    | "event"
    | "object"
    | "date"
    | "other";
  label: string;
  normalizedLabel: string;
  confidence: number;
  source: "transcript" | "visual" | "caption" | "hashtags" | "combined";
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

interface AiExtractionResult {
  detectedLanguage: string;
  aiSummary: string;
  visualSummary: string;
  topics: Topic[];
  entities: Entity[];
  referencedItems: ReferencedItem[];
  confidenceOverall: number;
}

// ---------------------------------------------------------------------------
// Gemini helpers
// ---------------------------------------------------------------------------

const GEMINI_MODEL = "gemini-2.5-flash";

// ---------------------------------------------------------------------------
// System prompts (video vs image are intentionally separate)
// ---------------------------------------------------------------------------

/**
 * VIDEO extraction prompt — same as before, unchanged.
 * Handles multiple keyframes, transcript, audio cues.
 */
const VIDEO_EXTRACTION_SYSTEM_PROMPT = `You are a content intelligence system for a social media platform. Your job is to analyze video/media content and extract structured metadata.

You will receive:
- A video URL or description of the content
- The post caption (if any)
- Any hashtags from the post

You MUST respond with a single valid JSON object. No markdown, no explanation, no preamble. Just the JSON.

The JSON must have this exact structure:
{
  "detectedLanguage": "<ISO 639-1 code, e.g. 'en', 'ar'>",
  "aiSummary": "<1-2 sentence summary of the content>",
  "visualSummary": "<Brief description of visual elements, setting, objects visible>",
  "topics": [
    { "label": "<topic>", "confidence": <0.0-1.0> }
  ],
  "entities": [
    {
      "type": "<person|place|organization|brand|product|event|object|date|other>",
      "label": "<entity name as mentioned>",
      "normalizedLabel": "<canonical/normalized form>",
      "confidence": <0.0-1.0>,
      "source": "<transcript|visual|caption|hashtags|combined>"
    }
  ],
  "referencedItems": [
    {
      "label": "<item name>",
      "normalizedLabel": "<canonical form>",
      "type": "<object|place|product|brand|event|person|other>",
      "reason": "<Why this is referenced — what evidence supports it>",
      "confidence": <0.0-1.0>,
      "evidenceText": "<exact quote or description from content that references this>",
      "startMs": <optional timestamp in ms>,
      "endMs": <optional timestamp in ms>
    }
  ],
  "confidenceOverall": <0.0-1.0>
}

CRITICAL RULES:
1. NEVER invent or hallucinate entities or references. Every item MUST have clear evidence from the transcript, caption, visual content, or hashtags.
2. If you are not confident about an entity or reference, either lower the confidence score or omit it entirely.
3. Every referencedItem MUST include non-empty evidenceText from the actual content.
4. If the content has minimal extractable information (e.g. music-only, abstract visuals), return fewer items with honest confidence scores rather than guessing.
5. Set confidenceOverall to reflect your genuine certainty about the extraction quality.
6. Topics should be broad content categories (e.g. "cooking", "travel", "fashion", "technology").
7. Entities are specific named things mentioned or shown.
8. ReferencedItems are things the creator is highlighting, recommending, or directing attention to — they need strong evidence.
9. For Arabic or multilingual content, provide labels in the original language and normalizedLabel in English where possible.
10. In aiSummary and visualSummary, be concrete: name the setting (indoor/outdoor + clues), main objects, approximate people count if visible, visible activity, scene type (vlog, tutorial, meme, event, etc.), possible topic/category, temporal clues (day/night/season hints), mood/tone, and any readable on-screen text. If multiple visual samples are provided, merge them into one coherent video-level view.
11. Add a short "why_recommended_later" clause inside aiSummary (second sentence) describing who might enjoy this later — only when justified; otherwise omit by keeping aiSummary to one sentence.
12. Never overclaim: keep confidenceOverall and per-item confidences honest; prefer omission over guesses.`;

/**
 * IMAGE-SPECIFIC extraction prompt.
 *
 * Philosophy: precision over recall. It is better to return an empty
 * referencedItems array than to return fabricated items. The downstream
 * Context Engine relies entirely on accuracy — incorrect data is worse
 * than no data.
 *
 * Key differences from video prompt:
 * - Mandatory evidenceDescription per entity (where exactly it appears)
 * - Explicit hallucination blacklist
 * - OCR / logo-first priority ordering
 * - Forbidden generic fallback labels
 * - confidenceOverall >0.85 requires at least one entity with direct visual evidence
 */
const IMAGE_EXTRACTION_SYSTEM_PROMPT = `You are a precision image-analysis system for a social media context engine. Your ONLY job is to describe what is ACTUALLY, CLEARLY visible in the provided image(s). Accuracy is the only metric that matters. Recall is irrelevant.

═══════════════════════════════════════════════════════════
STRICT OPERATING RULES — VIOLATIONS WILL CORRUPT DOWNSTREAM DATA
═══════════════════════════════════════════════════════════

NEVER do any of the following:
• Do NOT infer objects that are not clearly visible (e.g. do not say "smartphone" because the scene looks digital)
• Do NOT add generic category labels as entities (forbidden: "technology", "device", "navigation", "app", "food", "drink" as standalone entities — these may only appear as TOPICS if strongly supported)
• Do NOT infer what an object MIGHT be; only report what it IS based on direct visual evidence
• Do NOT fabricate brand names or logos unless text is clearly legible
• Do NOT add referencedItems unless the image explicitly highlights, shows, or labels them
• Do NOT include any entity or item that requires inference or assumption

ALWAYS do the following:
• FIRST: scan for readable text, logos, signage, labels, and brand marks — these are your highest-confidence signals
• SECOND: identify concrete visible objects (cup, chair, outdoor seating, building facade, food dish, clothing item)
• THIRD: identify people, setting, mood only if unambiguously present
• FOURTH: use caption/hashtags ONLY to disambiguate already-visible things — never to add new entities not visible in the image
• For EVERY entity: you MUST be able to point to exactly WHERE in the image it appears

You MUST respond with a single valid JSON object. No markdown, no preamble. Just JSON.

{
  "detectedLanguage": "<ISO 639-1 code based on any visible text or caption>",
  "aiSummary": "<1-2 sentence factual description of what is actually shown. Name concrete visible elements. Do NOT describe what the image 'might be about'.>",
  "visualSummary": "<Precise description: setting (indoor/outdoor), lighting, main subjects, visible text or logos, colors, notable objects. State ONLY what is directly observable.>",
  "topics": [
    { "label": "<broad content category supported by clear visual evidence>", "confidence": <0.0-1.0> }
  ],
  "entities": [
    {
      "type": "<person|place|organization|brand|product|event|object|date|other>",
      "label": "<exactly as it appears — readable text, logo name, or clearly identifiable object>",
      "normalizedLabel": "<canonical form>",
      "confidence": <0.0-1.0>,
      "source": "visual",
      "evidenceDescription": "<Precise location/description: e.g. 'text printed on cup bottom-left', 'logo on storefront sign center', 'dish on table in foreground'>",
      "ocrText": "<if this came from reading text in the image, paste the exact characters seen>"
    }
  ],
  "referencedItems": [
    {
      "label": "<specific item — brand, place, product, dish, etc.>",
      "normalizedLabel": "<canonical form>",
      "type": "<object|place|product|brand|event|person|other>",
      "reason": "<One sentence: what specifically makes this visible and notable in the image>",
      "confidence": <0.0-1.0>,
      "evidenceText": "<Exact text seen OR precise visual description of the item's appearance in the image. REQUIRED. Empty string = item is rejected.>"
    }
  ],
  "confidenceOverall": <0.0-1.0 — your confidence that the above data accurately reflects the image. Set BELOW 0.7 if you are uncertain about most items.>
}

FORBIDDEN ENTITY LABELS (never emit these as entity labels):
smartphone, phone, mobile, device, screen, display, technology, app, application, software,
map, navigation, interface, UI, website, internet, social media,
food, drink, beverage, meal, dish (use specific names only: "cappuccino", "shawarma", not "food"),
building, structure, vehicle (use specific names only: "Burj Khalifa", "Toyota Camry")

CONFIDENCE CALIBRATION:
• 0.95–1.0: Text/logo is clearly legible and unambiguous
• 0.80–0.94: Object is clearly identifiable but not labeled
• 0.60–0.79: Reasonable interpretation with some visual ambiguity
• Below 0.60: Too uncertain — OMIT the item entirely instead
• confidenceOverall >0.85 requires at least one entity with evidenceDescription pointing to legible text or a clearly named object

TOPIC RULES:
Topics are broad content categories only. Maximum 4 topics. Each must be supported by clear visual evidence — not inferred from caption alone. Examples of valid topics: "coffee", "street food", "fitness", "travel", "fashion", "art", "architecture".

REFERENCEDITEM RULES:
Only include items a viewer would want to look up or visit. They must be:
• Specific (a named cafe, a labeled product, a readable dish name, an identifiable landmark)
• Visually grounded (visible in the image, not just mentioned in caption)
• Interesting to a viewer (worth recommending or sharing)

If no items meet this bar, return an empty referencedItems array. That is correct behavior.`;

// Keep backward-compat alias used in frame-extraction path
const EXTRACTION_SYSTEM_PROMPT = VIDEO_EXTRACTION_SYSTEM_PROMPT;

type GeminiCandidate = {
  content?: {
    parts?: Array<{ text?: string; thought?: boolean }>;
  };
  finishReason?: string;
};

type GeminiResponse = {
  candidates?: GeminiCandidate[];
  promptFeedback?: {
    blockReason?: string;
  };
};

function extractTextFromGemini(data: GeminiResponse): string {
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts) || parts.length === 0) return "";
  return parts
    .filter((p) => p?.thought !== true)
    .map((p) => (typeof p?.text === "string" ? p.text : ""))
    .join("")
    .trim();
}

function parseGeminiJsonText(rawText: string): unknown {
  const cleaned = rawText
    .replace(/^\uFEFF/, "")
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch?.[0]) {
      return JSON.parse(jsonMatch[0]);
    }
    throw new Error("Failed to parse AI output as JSON");
  }
}

async function finalizeExtraction(
  ctx: {
    runMutation: (ref: any, args: any) => Promise<any>;
  },
  jobId: Id<"contentIntelligence">,
  post: { caption?: string; hashtags?: string[] },
  data: AiExtractionResult,
) {
  const embeddingText = buildEmbeddingText(post.caption, undefined, data);
  await ctx.runMutation(internal.contentIntelligenceDb.markCompleted, {
    jobId,
    detectedLanguage: data.detectedLanguage,
    aiSummary: data.aiSummary,
    visualSummary: data.visualSummary || undefined,
    topics: data.topics.length > 0 ? data.topics : undefined,
    entities: data.entities.length > 0 ? data.entities : undefined,
    referencedItems:
      data.referencedItems.length > 0 ? data.referencedItems : undefined,
    embeddingText: embeddingText || undefined,
    embeddingModel: "gemini-2.5-flash",
    confidenceOverall: data.confidenceOverall,
  });
  console.log(
    `[ContentIntelligence] Completed job ${jobId}: ${data.topics.length} topics, ${data.entities.length} entities, ${data.referencedItems.length} refs, confidence=${data.confidenceOverall}`,
  );
}

async function tryExtractFromVideoFrames(args: {
  apiKey: string;
  displayUrl: string;
  displayStorageRegion?: string;
  durationMs?: number;
  userPrompt: string;
}): Promise<{ valid: true; data: AiExtractionResult } | { valid: false }> {
  const durationSec =
    args.durationMs && args.durationMs > 0 ? args.durationMs / 1000 : 60;
  console.log("[ContentIntelligence] VIDEO_DURATION_DETECTED", {
    durationSec,
    mode: "frame_sampling",
  });
  const workDir = join(tmpdir(), `ci-frames-${Date.now()}-${randomUUID()}`);
  await mkdir(workDir, { recursive: true });
  try {
    console.log("[ContentIntelligence] FRAME_EXTRACTION_START", {
      workDir: workDir.slice(-24),
    });
    const buf = await fetchVideoBuffer(
      args.displayUrl,
      args.displayStorageRegion,
    );
    const videoPath = join(workDir, "source.mp4");
    await writeFile(videoPath, buf);
    const frames = await extractFramesFromVideo({
      videoPath,
      workDir,
      durationSec,
      trustTier: "standard",
    });
    const parts: Array<Record<string, unknown>> = [];
    for (let i = 0; i < frames.length; i++) {
      try {
        const jpeg = await readFile(frames[i].path);
        if (jpeg.length < 2000) {
          console.log("[ContentIntelligence] FRAME_INVALID_RETRY", {
            index: i,
            len: jpeg.length,
          });
          continue;
        }
        console.log("[ContentIntelligence] FRAME_VALID", {
          index: i,
          bytes: jpeg.length,
        });
        parts.push({
          inlineData: {
            mimeType: "image/jpeg",
            data: jpeg.toString("base64"),
          },
        });
      } catch {
        console.log("[ContentIntelligence] FRAME_INVALID_RETRY", { index: i });
      }
    }
    if (parts.length === 0) {
      console.log("[ContentIntelligence] VIDEO_INTELLIGENCE_PARTIAL_FALLBACK", {
        reason: "no_valid_frames",
      });
      return { valid: false };
    }
    parts.push({
      text:
        args.userPrompt +
        "\n\nThe images are keyframe-spaced JPEG samples from the same video. Merge into one JSON object per system instructions.",
    });
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${args.apiKey}`;
    const body = {
      systemInstruction: {
        parts: [{ text: EXTRACTION_SYSTEM_PROMPT }],
      },
      contents: [{ parts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    };
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.log("[ContentIntelligence] GEMINI_FRAME_FAILED", {
        status: response.status,
        body: (await response.text().catch(() => "")).slice(0, 400),
      });
      return { valid: false };
    }
    const geminiData = (await response.json()) as GeminiResponse;
    if (geminiData?.promptFeedback?.blockReason) {
      console.log("[ContentIntelligence] GEMINI_FRAME_FAILED", {
        block: geminiData.promptFeedback.blockReason,
      });
      return { valid: false };
    }
    console.log("[ContentIntelligence] GEMINI_FRAME_SUCCESS", {
      frames: parts.length - 1,
    });
    const rawText = extractTextFromGemini(geminiData);
    if (!rawText) return { valid: false };
    const parsed = parseGeminiJsonText(rawText);
    const validation = validateExtractionResult(parsed);
    if (!validation.valid) return { valid: false };
    return { valid: true, data: validation.data };
  } catch (e) {
    console.log("[ContentIntelligence] GEMINI_FRAME_FAILED", {
      err: e instanceof Error ? e.message : String(e),
    });
    return { valid: false };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const VALID_ENTITY_TYPES = new Set([
  "person",
  "place",
  "organization",
  "brand",
  "product",
  "event",
  "object",
  "date",
  "other",
]);

const VALID_ENTITY_SOURCES = new Set([
  "transcript",
  "visual",
  "caption",
  "hashtags",
  "combined",
]);

/**
 * Generic hallucination terms that models commonly fabricate for image content.
 * Any entity whose normalizedLabel matches one of these (case-insensitive) is
 * removed during image validation.
 */
const IMAGE_HALLUCINATION_BLOCKLIST = new Set([
  "smartphone",
  "phone",
  "mobile",
  "mobile phone",
  "mobile device",
  "device",
  "screen",
  "display",
  "technology",
  "tech",
  "app",
  "application",
  "software",
  "map",
  "navigation",
  "interface",
  "ui",
  "website",
  "internet",
  "social media",
  "food",
  "drink",
  "beverage",
  "meal",
  "dish",
  "building",
  "structure",
  "vehicle",
  "object",
  "other",
]);

/**
 * Generic topic labels that must NOT appear without at least one supporting
 * entity from a non-inferred source.
 */
const GENERIC_TOPIC_LABELS = new Set([
  "technology",
  "navigation",
  "transportation",
  "communication",
  "device",
  "digital",
]);

function clamp01(n: unknown): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeForBlocklist(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "");
}

/**
 * Semantic validation for image outputs.
 *
 * Returns a list of rejection reasons. Empty array = pass.
 * Called AFTER structural validateExtractionResult.
 */
function semanticValidateImageOutput(data: AiExtractionResult): string[] {
  const reasons: string[] = [];

  // 1. Strip entities that are on the hallucination blocklist
  const blockedEntities = data.entities.filter((e) =>
    IMAGE_HALLUCINATION_BLOCKLIST.has(normalizeForBlocklist(e.normalizedLabel)),
  );
  if (blockedEntities.length > 0) {
    reasons.push(
      `Hallucination_entities: ${blockedEntities.map((e) => e.label).join(", ")}`,
    );
  }

  // 2. referencedItems with empty evidenceText (structural validator already
  //    rejects these, but double-check generic labels)
  const weakRefs = data.referencedItems.filter(
    (r) =>
      !r.evidenceText.trim() ||
      IMAGE_HALLUCINATION_BLOCKLIST.has(
        normalizeForBlocklist(r.normalizedLabel),
      ),
  );
  if (weakRefs.length > 0) {
    reasons.push(
      `Weak_referencedItems: ${weakRefs.map((r) => r.label).join(", ")}`,
    );
  }

  // 3. High-confidence claim with no concrete entities (pure hallucination risk)
  const concreteEntities = data.entities.filter(
    (e) =>
      !IMAGE_HALLUCINATION_BLOCKLIST.has(
        normalizeForBlocklist(e.normalizedLabel),
      ),
  );
  if (data.confidenceOverall > 0.85 && concreteEntities.length === 0) {
    reasons.push(
      "High_confidence_but_no_concrete_entities: confidenceOverall clamped",
    );
  }

  // 4. Topics that contain forbidden generic labels without supporting entities
  for (const topic of data.topics) {
    if (GENERIC_TOPIC_LABELS.has(normalizeForBlocklist(topic.label))) {
      const hasMatchingEntity = data.entities.some((e) =>
        e.normalizedLabel
          .toLowerCase()
          .includes(topic.label.toLowerCase().slice(0, 6)),
      );
      if (!hasMatchingEntity) {
        reasons.push(`Unsupported_generic_topic: "${topic.label}"`);
      }
    }
  }

  return reasons;
}

/**
 * Mutates `data` in place to remove hallucinated items identified by
 * semanticValidateImageOutput. Returns the cleaned copy.
 */
function sanitizeImageOutput(data: AiExtractionResult): AiExtractionResult {
  return {
    ...data,
    entities: data.entities.filter(
      (e) =>
        !IMAGE_HALLUCINATION_BLOCKLIST.has(
          normalizeForBlocklist(e.normalizedLabel),
        ),
    ),
    referencedItems: data.referencedItems.filter(
      (r) =>
        r.evidenceText.trim().length > 0 &&
        !IMAGE_HALLUCINATION_BLOCKLIST.has(
          normalizeForBlocklist(r.normalizedLabel),
        ),
    ),
    topics: data.topics.filter(
      (t) =>
        !GENERIC_TOPIC_LABELS.has(normalizeForBlocklist(t.label)) ||
        data.entities.some((e) =>
          e.normalizedLabel
            .toLowerCase()
            .includes(t.label.toLowerCase().slice(0, 6)),
        ),
    ),
    // Cap confidenceOverall when we had to remove items
    confidenceOverall: data.confidenceOverall,
  };
}

function validateExtractionResult(
  raw: unknown,
): { valid: true; data: AiExtractionResult } | { valid: false; error: string } {
  if (typeof raw !== "object" || raw === null) {
    return { valid: false, error: "AI output is not an object" };
  }
  const r = raw as Record<string, unknown>;

  if (typeof r.detectedLanguage !== "string" || !r.detectedLanguage.trim()) {
    return { valid: false, error: "Missing detectedLanguage" };
  }
  if (typeof r.aiSummary !== "string" || !r.aiSummary.trim()) {
    return { valid: false, error: "Missing aiSummary" };
  }

  const topics: Topic[] = [];
  if (Array.isArray(r.topics)) {
    for (const t of r.topics) {
      if (typeof t?.label === "string" && t.label.trim()) {
        topics.push({
          label: t.label.trim(),
          confidence: clamp01(t.confidence),
        });
      }
    }
  }

  const entities: Entity[] = [];
  if (Array.isArray(r.entities)) {
    for (const e of r.entities) {
      if (typeof e?.label !== "string" || !e.label.trim()) continue;
      const type = VALID_ENTITY_TYPES.has(e.type) ? e.type : "other";
      const source = VALID_ENTITY_SOURCES.has(e.source) ? e.source : "combined";
      entities.push({
        type,
        label: e.label.trim(),
        normalizedLabel:
          typeof e.normalizedLabel === "string" && e.normalizedLabel.trim()
            ? e.normalizedLabel.trim()
            : e.label.trim().toLowerCase(),
        confidence: clamp01(e.confidence),
        source,
      });
    }
  }

  const referencedItems: ReferencedItem[] = [];
  if (Array.isArray(r.referencedItems)) {
    for (const item of r.referencedItems) {
      if (typeof item?.label !== "string" || !item.label.trim()) continue;
      if (typeof item.evidenceText !== "string" || !item.evidenceText.trim()) {
        continue;
      }
      if (typeof item.reason !== "string" || !item.reason.trim()) continue;
      referencedItems.push({
        label: item.label.trim(),
        normalizedLabel:
          typeof item.normalizedLabel === "string" &&
          item.normalizedLabel.trim()
            ? item.normalizedLabel.trim()
            : item.label.trim().toLowerCase(),
        type: typeof item.type === "string" ? item.type.trim() : "other",
        reason: item.reason.trim(),
        confidence: clamp01(item.confidence),
        evidenceText: item.evidenceText.trim(),
        ...(typeof item.startMs === "number" ? { startMs: item.startMs } : {}),
        ...(typeof item.endMs === "number" ? { endMs: item.endMs } : {}),
      });
    }
  }

  const confidenceOverall = clamp01(r.confidenceOverall);

  return {
    valid: true,
    data: {
      detectedLanguage: r.detectedLanguage as string,
      aiSummary: (r.aiSummary as string).trim(),
      visualSummary:
        typeof r.visualSummary === "string" ? r.visualSummary.trim() : "",
      topics,
      entities,
      referencedItems,
      confidenceOverall,
    },
  };
}

// ---------------------------------------------------------------------------
// Embedding text builder
// ---------------------------------------------------------------------------

function buildEmbeddingText(
  caption: string | undefined,
  transcript: string | undefined,
  extraction: AiExtractionResult,
): string {
  const parts: string[] = [];
  if (extraction.aiSummary) parts.push(extraction.aiSummary);
  if (caption?.trim()) parts.push(caption.trim());
  if (transcript?.trim()) {
    const truncated = transcript.trim().slice(0, 2000);
    parts.push(truncated);
  }
  if (extraction.topics.length > 0) {
    parts.push("Topics: " + extraction.topics.map((t) => t.label).join(", "));
  }
  if (extraction.entities.length > 0) {
    parts.push(
      "Entities: " + extraction.entities.map((e) => e.label).join(", "),
    );
  }
  return parts.join("\n\n").slice(0, 8000);
}

// ---------------------------------------------------------------------------
// Trigger: enqueue pending job after post publish
// ---------------------------------------------------------------------------

export const enqueueContentIntelligence = internalAction({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    const post = (await ctx.runQuery(internal.contentIntelligenceDb.getPost, {
      postId: args.postId,
    })) as {
      _id: Id<"posts">;
      userId: Id<"users">;
      status: string;
      caption?: string;
      mediaCount: number;
    } | null;
    if (!post || post.status !== "published") return;

    const media = (await ctx.runQuery(
      internal.contentIntelligenceDb.getPostMedia,
      { postId: args.postId },
    )) as Array<{
      _id: Id<"postMedia">;
      type: string;
      displayUrl: string;
      displayStorageRegion?: string;
      durationMs?: number;
      hasAudioTrack?: boolean;
    }>;

    if (media.length === 0) return;

    const videoMedia = media.find((m) => m.type === "video");
    const primaryMedia = videoMedia ?? media[0];

    let contentType: "video" | "image" | "carousel" | "post";
    if (videoMedia) {
      contentType = "video";
    } else if (media.length > 1) {
      contentType = "carousel";
    } else if (media[0]?.type === "image") {
      contentType = "image";
    } else {
      contentType = "post";
    }

    const jobId = await ctx.runMutation(
      internal.contentIntelligenceDb.createPendingJob,
      {
        contentId: args.postId,
        contentType,
        ownerUserId: post.userId,
        sourcePostId: args.postId,
        mediaId: primaryMedia._id,
        processingVersion: CURRENT_PROCESSING_VERSION,
      },
    );

    await ctx.scheduler.runAfter(0, internal.contentIntelligence.processJob, {
      jobId,
    });
  },
});

// ---------------------------------------------------------------------------
// Image processing — dedicated path, strict prompt, inlineData bytes
// ---------------------------------------------------------------------------

/**
 * Fetches the image at `url` and returns it as a base64-encoded string
 * along with a best-guess MIME type.
 */
async function fetchImageAsBase64(
  url: string,
): Promise<{ base64: string; mimeType: string }> {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Image fetch failed: ${resp.status} ${url.slice(0, 200)}`);
  }
  const contentType = resp.headers.get("content-type") ?? "";
  const mimeType = contentType.startsWith("image/")
    ? contentType.split(";")[0].trim()
    : url.match(/\.(png)(\?|$)/i)
      ? "image/png"
      : url.match(/\.(webp)(\?|$)/i)
        ? "image/webp"
        : "image/jpeg";

  const arrayBuf = await resp.arrayBuffer();
  const base64 = Buffer.from(arrayBuf).toString("base64");
  return { base64, mimeType };
}

/**
 * Run Gemini on actual image bytes for a single image or up to 4 carousel images.
 * Uses IMAGE_EXTRACTION_SYSTEM_PROMPT with temperature=0 for maximum determinism.
 * Returns the raw model text on success, or throws.
 */
async function runGeminiOnImages(args: {
  apiKey: string;
  imageUrls: string[];
  userPrompt: string;
}): Promise<string> {
  const parts: Array<Record<string, unknown>> = [];

  for (const url of args.imageUrls.slice(0, 4)) {
    try {
      const { base64, mimeType } = await fetchImageAsBase64(url);
      if (base64.length < 100) {
        console.warn("[ContentIntelligence] IMAGE_FETCH_TOO_SMALL", {
          url: url.slice(0, 120),
        });
        continue;
      }
      parts.push({ inlineData: { mimeType, data: base64 } });
    } catch (err) {
      console.warn("[ContentIntelligence] IMAGE_FETCH_FAILED", {
        url: url.slice(0, 120),
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (parts.length === 0) {
    throw new Error("No image data could be fetched for analysis");
  }

  parts.push({ text: args.userPrompt });

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${args.apiKey}`;
  const body = {
    systemInstruction: { parts: [{ text: IMAGE_EXTRACTION_SYSTEM_PROMPT }] },
    contents: [{ parts }],
    generationConfig: {
      temperature: 0,
      maxOutputTokens: 4096,
      responseMimeType: "application/json",
    },
  };

  const response = await fetch(geminiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `Gemini image API error ${response.status}: ${errText.slice(0, 400)}`,
    );
  }

  const geminiData = (await response.json()) as GeminiResponse;
  if (geminiData?.promptFeedback?.blockReason) {
    throw new Error(
      `Gemini safety block: ${geminiData.promptFeedback.blockReason}`,
    );
  }

  const rawText = extractTextFromGemini(geminiData);
  if (!rawText) throw new Error("Gemini returned empty response for image");
  return rawText;
}

/**
 * Full image intelligence pipeline: fetch → analyze → semantic-validate → sanitize.
 *
 * Returns `{ status: "completed", data }` on clean pass,
 * `{ status: "needs_review", data, reasons }` when hallucinations were found
 * and stripped but enough good data remains,
 * or throws on hard failures.
 */
async function processImageIntelligence(args: {
  apiKey: string;
  imageUrls: string[];
  post: { caption?: string; hashtags?: string[] };
  mediaId: Id<"postMedia">;
  contentType: string;
}): Promise<
  | { status: "completed"; data: AiExtractionResult }
  | { status: "needs_review"; data: AiExtractionResult; reasons: string[] }
> {
  const promptParts: string[] = [
    `Content type: ${args.contentType}`,
    `Image count: ${Math.min(args.imageUrls.length, 4)}`,
  ];
  if (args.post.caption?.trim()) {
    promptParts.push(`Caption: "${args.post.caption.trim()}"`);
  }
  if (args.post.hashtags && args.post.hashtags.length > 0) {
    promptParts.push(`Hashtags: ${args.post.hashtags.join(", ")}`);
  }
  promptParts.push(
    "Analyze the image(s) above and return the structured JSON per your system instructions. Remember: only report what is DIRECTLY VISIBLE. No inference, no hallucination.",
  );

  const rawText = await runGeminiOnImages({
    apiKey: args.apiKey,
    imageUrls: args.imageUrls,
    userPrompt: promptParts.join("\n\n"),
  });

  const parsed = parseGeminiJsonText(rawText);
  const structural = validateExtractionResult(parsed);
  if (!structural.valid) {
    throw new Error(`Image structural validation failed: ${structural.error}`);
  }

  // Semantic / hallucination checks
  const semanticReasons = semanticValidateImageOutput(structural.data);
  const sanitized = sanitizeImageOutput(structural.data);

  // Recalibrate confidenceOverall downward if items were removed
  const removedCount =
    structural.data.entities.length -
    sanitized.entities.length +
    (structural.data.referencedItems.length - sanitized.referencedItems.length);
  const calibratedConfidence =
    removedCount > 0
      ? Math.min(
          sanitized.confidenceOverall,
          Math.max(0.45, sanitized.confidenceOverall - removedCount * 0.12),
        )
      : sanitized.confidenceOverall;

  const finalData: AiExtractionResult = {
    ...sanitized,
    confidenceOverall: calibratedConfidence,
  };

  if (semanticReasons.length > 0) {
    return {
      status: "needs_review",
      data: finalData,
      reasons: semanticReasons,
    };
  }
  return { status: "completed", data: finalData };
}

// ---------------------------------------------------------------------------
// Main processing action
// ---------------------------------------------------------------------------

export const processJob = internalAction({
  args: {
    jobId: v.id("contentIntelligence"),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn(
        "[ContentIntelligence] GEMINI_API_KEY not set — skipping processing",
      );
      await ctx.runMutation(internal.contentIntelligenceDb.markFailed, {
        jobId: args.jobId,
        errorMessage: "GEMINI_API_KEY not configured",
      });
      return;
    }

    const claimed = await ctx.runMutation(
      internal.contentIntelligenceDb.markProcessing,
      { jobId: args.jobId },
    );
    if (!claimed) {
      console.log(
        "[ContentIntelligence] Job already claimed or not pending:",
        args.jobId,
      );
      return;
    }

    try {
      await processJobImpl(ctx, args.jobId, apiKey);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Unknown processing error";
      console.error("[ContentIntelligence] Processing failed:", msg);
      await ctx.runMutation(internal.contentIntelligenceDb.markFailed, {
        jobId: args.jobId,
        errorMessage: msg.slice(0, 2000),
      });
    }
  },
});

async function processJobImpl(
  ctx: {
    runQuery: (ref: any, args: any) => Promise<any>;
    runMutation: (ref: any, args: any) => Promise<any>;
  },
  jobId: Id<"contentIntelligence">,
  apiKey: string,
) {
  const jobRow = (await ctx.runQuery(
    internal.contentIntelligenceDb.getJobById,
    { jobId },
  )) as {
    _id: Id<"contentIntelligence">;
    sourcePostId: Id<"posts">;
    mediaId?: Id<"postMedia">;
    contentType: string;
    processingStatus: string;
  } | null;

  if (!jobRow) {
    await ctx.runMutation(internal.contentIntelligenceDb.markFailed, {
      jobId,
      errorMessage: "Job row not found during processing",
    });
    return;
  }

  const post = (await ctx.runQuery(internal.contentIntelligenceDb.getPost, {
    postId: jobRow.sourcePostId,
  })) as {
    _id: Id<"posts">;
    userId: Id<"users">;
    caption?: string;
    hashtags?: string[];
    status: string;
  } | null;

  if (!post) {
    await ctx.runMutation(internal.contentIntelligenceDb.markFailed, {
      jobId,
      errorMessage: "Source post not found",
    });
    return;
  }

  const media = (await ctx.runQuery(
    internal.contentIntelligenceDb.getPostMedia,
    { postId: jobRow.sourcePostId },
  )) as Array<{
    _id: Id<"postMedia">;
    type: string;
    displayUrl: string;
    displayStorageRegion?: string;
    thumbnailUrl?: string;
    thumbnailStorageRegion?: string;
    durationMs?: number;
    hasAudioTrack?: boolean;
  }>;

  if (media.length === 0) {
    await ctx.runMutation(internal.contentIntelligenceDb.markFailed, {
      jobId,
      errorMessage: "No media found for post",
    });
    return;
  }

  const videoMedia = media.find((m) => m.type === "video");
  const primaryMedia = videoMedia ?? media[0];

  const mediaUrl = primaryMedia.displayUrl;

  // ── Branch: image vs video ───────────────────────────────────────────────
  const isImageJob =
    jobRow.contentType === "image" || jobRow.contentType === "carousel";

  if (isImageJob) {
    // Collect URLs for all image media items (carousel = multiple)
    const imageUrls = media
      .filter((m) => m.type === "image")
      .map((m) => m.displayUrl)
      .filter(Boolean);

    if (imageUrls.length === 0) {
      await ctx.runMutation(internal.contentIntelligenceDb.markFailed, {
        jobId,
        errorMessage: "No image URLs found for image job",
      });
      return;
    }

    try {
      const result = await processImageIntelligence({
        apiKey,
        imageUrls,
        post,
        mediaId: primaryMedia._id,
        contentType: jobRow.contentType,
      });

      if (result.status === "needs_review") {
        console.warn("[ContentIntelligence] IMAGE_SEMANTIC_VALIDATION_FAILED", {
          jobId,
          mediaId: primaryMedia._id,
          reasons: result.reasons,
          originalEntityCount: result.data.entities.length,
          originalRefCount: result.data.referencedItems.length,
        });
        // Still store sanitized data but flag for review
        await ctx.runMutation(internal.contentIntelligenceDb.markNeedsReview, {
          jobId,
          errorMessage: `Semantic validation: ${result.reasons.join("; ")}`,
        });
        // Also write the sanitized extraction so Phase 2 has something usable
        // if a human reviewer promotes it, but don't propagate automatically.
        return;
      }

      await finalizeExtraction(ctx, jobId, post, result.data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[ContentIntelligence] IMAGE_PROCESSING_FAILED", {
        jobId,
        mediaId: primaryMedia._id,
        error: msg.slice(0, 400),
      });
      throw err; // bubble up to outer catch → markFailed
    }
    return;
  }

  // ── Video path (unchanged) ───────────────────────────────────────────────

  // Build user prompt
  const promptParts: string[] = [];
  promptParts.push(`Content type: ${jobRow.contentType}`);

  if (post.caption?.trim()) {
    promptParts.push(`Caption: "${post.caption.trim()}"`);
  }

  if (post.hashtags && post.hashtags.length > 0) {
    promptParts.push(`Hashtags: ${post.hashtags.join(", ")}`);
  }

  if (videoMedia) {
    promptParts.push(
      `This is a video post.${videoMedia.durationMs ? ` Duration: ${Math.round(videoMedia.durationMs / 1000)}s.` : ""}${videoMedia.hasAudioTrack === false ? " No audio track." : ""}`,
    );
    promptParts.push(
      "Please analyze the video content, any spoken audio/transcript, and visual elements.",
    );
  } else {
    promptParts.push(`This is an image post with ${media.length} image(s).`);
    promptParts.push(
      "Please analyze the visual content, text visible in images, and any contextual elements.",
    );
  }

  promptParts.push(
    "Analyze this content and return the structured JSON as specified in your instructions.",
  );

  const userPrompt = promptParts.join("\n\n");

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const runGeminiOnce = async (
    geminiParts: Array<Record<string, unknown>>,
  ): Promise<Response> => {
    const body = {
      systemInstruction: {
        parts: [{ text: EXTRACTION_SYSTEM_PROMPT }],
      },
      contents: [{ parts: geminiParts }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        responseMimeType: "application/json",
      },
    };
    return fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  };

  const handleGeminiSuccess = async (geminiData: GeminiResponse) => {
    if (geminiData?.promptFeedback?.blockReason) {
      throw new Error(
        `Gemini safety block: ${geminiData.promptFeedback.blockReason}`,
      );
    }
    const rawText = extractTextFromGemini(geminiData);
    if (!rawText) {
      throw new Error("Gemini returned empty response");
    }
    const parsed = parseGeminiJsonText(rawText);
    const validation = validateExtractionResult(parsed);
    if (!validation.valid) {
      console.error(
        "[ContentIntelligence] VIDEO_STRUCTURAL_VALIDATION_FAILED",
        {
          jobId,
          mediaId: primaryMedia._id,
          reason: validation.error,
          rawTextSnippet: rawText.slice(0, 600),
        },
      );
      await ctx.runMutation(internal.contentIntelligenceDb.markNeedsReview, {
        jobId,
        errorMessage: `Validation failed: ${validation.error}`,
      });
      return;
    }
    await finalizeExtraction(ctx, jobId, post, validation.data);
  };

  if (videoMedia) {
    const durationMs = videoMedia.durationMs ?? 0;
    console.log("[ContentIntelligence] VIDEO_DURATION_DETECTED", {
      durationMs,
    });
    if (durationMs > 45_000) {
      const frameFirst = await tryExtractFromVideoFrames({
        apiKey,
        displayUrl: videoMedia.displayUrl,
        displayStorageRegion: videoMedia.displayStorageRegion,
        durationMs: videoMedia.durationMs,
        userPrompt,
      });
      if (frameFirst.valid) {
        await finalizeExtraction(ctx, jobId, post, frameFirst.data);
        return;
      }
      console.log("[ContentIntelligence] VIDEO_INTELLIGENCE_PARTIAL_FALLBACK", {
        note: "long_video_frames_failed_try_uri",
      });
    }

    const geminiParts: Array<Record<string, unknown>> = [
      {
        fileData: {
          mimeType: "video/mp4",
          fileUri: mediaUrl,
        },
      },
      { text: userPrompt },
    ];
    const response = await runGeminiOnce(geminiParts);
    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
      console.log("[ContentIntelligence] GEMINI_FRAME_FAILED", {
        phase: "full_video_uri",
        status: response.status,
        snippet: errorText.slice(0, 400),
      });
      const frameRetry = await tryExtractFromVideoFrames({
        apiKey,
        displayUrl: videoMedia.displayUrl,
        displayStorageRegion: videoMedia.displayStorageRegion,
        durationMs: videoMedia.durationMs,
        userPrompt,
      });
      if (frameRetry.valid) {
        await finalizeExtraction(ctx, jobId, post, frameRetry.data);
        return;
      }
      const cap = post.caption?.trim() || "Video post";
      console.log("[ContentIntelligence] VIDEO_INTELLIGENCE_PARTIAL_FALLBACK", {
        note: "caption_metadata_only",
      });
      await finalizeExtraction(ctx, jobId, post, {
        detectedLanguage: "en",
        aiSummary: `${cap.slice(0, 280)} (Automated visual analysis was unavailable for this clip; embedding uses caption and hashtags only.)`,
        visualSummary: "",
        topics: [],
        entities: [],
        referencedItems: [],
        confidenceOverall: 0.32,
      });
      return;
    }
    const geminiData = (await response.json()) as GeminiResponse;
    await handleGeminiSuccess(geminiData);
    return;
  }

  // ── Image/text-only fallback (video URI mode failed, no frames) ─────────
  // Note: image/carousel jobs are handled above via the dedicated image path.
  // This branch is only reached for video jobs that exhausted all video paths.
  const geminiParts: Array<Record<string, unknown>> = [
    { text: `[Media URL: ${mediaUrl}]\n\n${userPrompt}` },
  ];
  const response = await runGeminiOnce(geminiParts);
  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown");
    throw new Error(
      `Gemini API error ${response.status}: ${errorText.slice(0, 500)}`,
    );
  }
  const geminiData = (await response.json()) as GeminiResponse;
  await handleGeminiSuccess(geminiData);
}

// ---------------------------------------------------------------------------
// Batch processor (for cron or manual trigger)
// ---------------------------------------------------------------------------

export const processPendingBatch = internalAction({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn(
        "[ContentIntelligence] GEMINI_API_KEY not set — batch skipped",
      );
      return;
    }

    const pending = (await ctx.runQuery(
      internal.contentIntelligenceDb.getPendingJobs,
      { limit: args.limit ?? 5 },
    )) as Array<{ _id: Id<"contentIntelligence"> }>;

    if (pending.length === 0) return;

    console.log(
      `[ContentIntelligence] Processing batch of ${pending.length} pending jobs`,
    );

    for (const job of pending) {
      await ctx.scheduler.runAfter(0, internal.contentIntelligence.processJob, {
        jobId: job._id,
      });
    }
  },
});

// ---------------------------------------------------------------------------
// Reprocess (admin trigger for version upgrades)
// ---------------------------------------------------------------------------

export const reprocessPost = internalAction({
  args: {
    postId: v.id("posts"),
  },
  handler: async (ctx, args) => {
    await ctx.scheduler.runAfter(
      0,
      internal.contentIntelligence.enqueueContentIntelligence,
      { postId: args.postId },
    );
  },
});
