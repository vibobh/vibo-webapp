#!/usr/bin/env node

/**
 * One-time migration: copy blogs from a source Convex project to this project.
 *
 * Required env:
 * - SOURCE_CONVEX_URL
 * - SOURCE_BLOG_ADMIN_SECRET
 *
 * Optional env:
 * - TARGET_CONVEX_URL (default: NEXT_PUBLIC_CONVEX_URL)
 * - TARGET_BLOG_ADMIN_SECRET (default: BLOG_ADMIN_SECRET)
 * - MIGRATE_DRY_RUN=true
 */

import { ConvexHttpClient } from "convex/browser";
import fs from "node:fs";
import path from "node:path";

function loadDotEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

function assertEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
}

function normalizeCategory(category) {
  const allowed = new Set(["article", "case_study", "featured", "guide"]);
  return allowed.has(category) ? category : "article";
}

async function uploadImageToTarget(targetClient, imageUrl, targetSecret, label) {
  if (!imageUrl) return undefined;
  const res = await fetch(imageUrl);
  if (!res.ok) {
    console.warn(`  - skip ${label}: failed to fetch image (${res.status})`);
    return undefined;
  }

  const blob = await res.blob();
  const ext = blob.type.includes("png")
    ? "png"
    : blob.type.includes("webp")
      ? "webp"
      : "jpg";

  const uploadUrl = await targetClient.mutation("blogs:generateUploadUrl", {
    secret: targetSecret,
  });

  // Convex upload URL expects raw bytes body (not multipart/form-data).
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": blob.type || (ext === "png" ? "image/png" : "image/jpeg"),
    },
    body: blob,
  });
  if (!uploadRes.ok) {
    console.warn(`  - skip ${label}: upload failed (${uploadRes.status})`);
    return undefined;
  }

  const body = await uploadRes.json();
  return body.storageId;
}

async function main() {
  loadDotEnvLocal();

  const SOURCE_CONVEX_URL = process.env.SOURCE_CONVEX_URL?.trim();
  const SOURCE_BLOG_ADMIN_SECRET = process.env.SOURCE_BLOG_ADMIN_SECRET?.trim();
  const TARGET_CONVEX_URL =
    process.env.TARGET_CONVEX_URL?.trim() ||
    process.env.NEXT_PUBLIC_CONVEX_URL?.trim();
  const TARGET_BLOG_ADMIN_SECRET =
    process.env.TARGET_BLOG_ADMIN_SECRET?.trim() ||
    process.env.BLOG_ADMIN_SECRET?.trim();
  const DRY_RUN = (process.env.MIGRATE_DRY_RUN ?? "").toLowerCase() === "true";

  assertEnv("SOURCE_CONVEX_URL", SOURCE_CONVEX_URL);
  assertEnv("SOURCE_BLOG_ADMIN_SECRET", SOURCE_BLOG_ADMIN_SECRET);
  assertEnv("TARGET_CONVEX_URL or NEXT_PUBLIC_CONVEX_URL", TARGET_CONVEX_URL);
  assertEnv("TARGET_BLOG_ADMIN_SECRET or BLOG_ADMIN_SECRET", TARGET_BLOG_ADMIN_SECRET);

  const sourceClient = new ConvexHttpClient(SOURCE_CONVEX_URL);
  const targetClient = new ConvexHttpClient(TARGET_CONVEX_URL);

  console.log("Reading source blogs...");
  let sourcePosts;
  try {
    sourcePosts = await sourceClient.query("blogs:listAll", {
      secret: SOURCE_BLOG_ADMIN_SECRET,
    });
  } catch (e) {
    throw new Error(
      "Cannot read source blogs. Check SOURCE_CONVEX_URL and SOURCE_BLOG_ADMIN_SECRET (must match BLOG_ADMIN_SECRET configured in the source Convex project).",
    );
  }
  console.log(`Found ${sourcePosts.length} source posts.`);

  console.log("Reading target blogs...");
  let targetPosts;
  try {
    targetPosts = await targetClient.query("blogs:listAll", {
      secret: TARGET_BLOG_ADMIN_SECRET,
    });
  } catch (e) {
    throw new Error(
      "Cannot read target blogs. Check TARGET_BLOG_ADMIN_SECRET/BLOG_ADMIN_SECRET and ensure BLOG_ADMIN_SECRET is set in the target Convex project environment variables.",
    );
  }
  const targetBySlug = new Map(targetPosts.map((p) => [p.slug, p]));

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const src of sourcePosts) {
    const existing = targetBySlug.get(src.slug);
    const op = existing ? "update" : "create";
    console.log(`\n[${op}] ${src.slug}`);

    const payload = {
      slug: src.slug,
      title: src.title,
      excerpt: src.excerpt,
      ...(typeof src.titleAr === "string" ? { titleAr: src.titleAr } : {}),
      ...(typeof src.excerptAr === "string" ? { excerptAr: src.excerptAr } : {}),
      ...(typeof src.bodyHtmlAr === "string" ? { bodyHtmlAr: src.bodyHtmlAr } : {}),
      category: normalizeCategory(src.category),
      authorName: src.authorName,
      bodyHtml: src.bodyHtml,
      published: !!src.published,
    };

    if (DRY_RUN) {
      console.log("  - dry run: skipping writes");
      skipped += 1;
      continue;
    }

    const authorImageId = await uploadImageToTarget(
      targetClient,
      src.authorImageUrl ?? undefined,
      TARGET_BLOG_ADMIN_SECRET,
      `${src.slug}-author`,
    );
    const coverImageId = await uploadImageToTarget(
      targetClient,
      src.coverImageUrl ?? undefined,
      TARGET_BLOG_ADMIN_SECRET,
      `${src.slug}-cover`,
    );

    if (existing) {
      await targetClient.mutation("blogs:updateBlog", {
        secret: TARGET_BLOG_ADMIN_SECRET,
        id: existing._id,
        ...payload,
        authorImageId,
        coverImageId,
      });
      updated += 1;
    } else {
      await targetClient.mutation("blogs:createBlog", {
        secret: TARGET_BLOG_ADMIN_SECRET,
        ...payload,
        authorImageId,
        coverImageId,
      });
      created += 1;
    }
  }

  console.log("\nDone.");
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped (dry run): ${skipped}`);
}

main().catch((err) => {
  console.error("\nMigration failed:");
  if (err instanceof Error) {
    console.error(err.message);
    if (err.stack) console.error(err.stack);
  } else {
    try {
      console.error(JSON.stringify(err, null, 2));
    } catch {
      console.error(String(err));
    }
  }
  process.exit(1);
});
