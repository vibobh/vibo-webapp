import fs from "fs";

const root = "C:/Users/Administrator/Documents/vibo_webapp/convex";
let s = fs.readFileSync(`${root}/_schema_extracted.ts`, "utf8");

const header = `import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const blogCategory = v.union(
  v.literal("article"),
  v.literal("case_study"),
  v.literal("featured"),
  v.literal("guide"),
);

const newsTag = v.union(
  v.literal("all"),
  v.literal("community"),
  v.literal("company"),
  v.literal("news"),
  v.literal("product"),
  v.literal("safety"),
);

const newsStatus = v.union(
  v.literal("draft"),
  v.literal("approved"),
);

`;

s = s.replace(
  /^import \{ defineSchema, defineTable \} from "convex\/server";\r?\nimport \{ v \} from "convex\/values";\r?\n\r?\n\/\*\*\r?\n \* User document/m,
  header + "/**\n * User document",
);

s = s.replace(
  "appealAllowedWhileSuspended: v.optional(v.boolean()),",
  `appealAllowedWhileSuspended: v.optional(v.boolean()),
    /** Web auth / admin (existing Next.js flows). */
    onboardingCompleted: v.optional(v.boolean()),
    isAdmin: v.optional(v.boolean()),
    role: v.optional(v.string()),
    totpEnabled: v.optional(v.boolean()),
    totpSecret: v.optional(v.string()),
    mustChangePassword: v.optional(v.boolean()),`,
);

const postsChunk = `    deletedAt: v.optional(v.number()),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_user_status", ["userId", "status", "createdAt"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_visibility_created", ["visibility", "createdAt"])
    .index("by_user_visibility", ["userId", "visibility", "createdAt"]),

  /** Post media items`;

if (!s.includes(postsChunk)) {
  throw new Error("posts chunk marker not found — check extracted schema");
}

s = s.replace(
  postsChunk,
  `    deletedAt: v.optional(v.number()),
    /** Public permalink for web (joinvibo.com/{shortId}); optional for legacy rows. */
    shortId: v.optional(v.string()),
  })
    .index("by_user_created", ["userId", "createdAt"])
    .index("by_user_status", ["userId", "status", "createdAt"])
    .index("by_status_created", ["status", "createdAt"])
    .index("by_visibility_created", ["visibility", "createdAt"])
    .index("by_user_visibility", ["userId", "visibility", "createdAt"])
    .index("by_short_id", ["shortId"]),

  /** Post media items`,
);

const tail = `
  blogs: defineTable({
    slug: v.string(),
    title: v.string(),
    excerpt: v.string(),
    titleAr: v.optional(v.string()),
    excerptAr: v.optional(v.string()),
    bodyHtmlAr: v.optional(v.string()),
    category: blogCategory,
    authorName: v.string(),
    authorImageId: v.optional(v.id("_storage")),
    coverImageId: v.optional(v.id("_storage")),
    bodyHtml: v.string(),
    published: v.boolean(),
    publishedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_published", ["published", "publishedAt"]),

  newsItems: defineTable({
    tag: newsTag,
    status: newsStatus,
    title: v.string(),
    description: v.string(),
    content: v.optional(v.string()),
    url: v.string(),
    urlToImage: v.optional(v.string()),
    publishedAt: v.string(),
    publishedAtMs: v.number(),
    sourceName: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_status_tag", ["status", "tag"])
    .index("by_url_tag", ["url", "tag"]),
});`;

s = s.replace(
  /\.index\("by_type", \["eventType", "createdAt"\]\),\s*\}\);\s*$/,
  `.index("by_type", ["eventType", "createdAt"]),${tail}`,
);

fs.writeFileSync(`${root}/schema.ts`, s);
console.log("OK", s.length);
