/**
 * Spotify music search — secure backend proxy.
 * Secrets (SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET) never reach the client.
 * Token is cached in `spotifyTokenCache` and auto-refreshed.
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  httpAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SpotifyTokenRow = {
  accessToken: string;
  expiresAt: number;
};

type SpotifyTrack = {
  id: string;
  name: string;
  preview_url: string | null;
  artists: { name: string }[];
  album: {
    images: { url: string; width: number; height: number }[];
  };
  duration_ms: number;
};

type NormalizedTrack = {
  id: string;
  title: string;
  artist: string;
  albumArt: string;
  preview_url: string | null;
  durationMs: number;
  provider: "spotify";
};

// ---------------------------------------------------------------------------
// Rate limiting — simple in-memory sliding window per IP
// ---------------------------------------------------------------------------

const REQUEST_LOG: Map<string, number[]> = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const log = (REQUEST_LOG.get(ip) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );
  log.push(now);
  REQUEST_LOG.set(ip, log);
  return log.length > RATE_MAX;
}

// ---------------------------------------------------------------------------
// Token helpers (internal mutations / queries to persist token in Convex DB)
// ---------------------------------------------------------------------------

export const getSpotifyToken = internalQuery({
  args: {},
  handler: async (ctx): Promise<SpotifyTokenRow | null> => {
    const rows = await ctx.db.query("spotifyTokenCache").collect();
    const row = rows[0];
    if (!row) return null;
    return { accessToken: row.accessToken, expiresAt: row.expiresAt };
  },
});

export const upsertSpotifyToken = internalMutation({
  args: {
    accessToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, { accessToken, expiresAt }) => {
    const rows = await ctx.db.query("spotifyTokenCache").collect();
    if (rows[0]) {
      await ctx.db.patch(rows[0]._id, { accessToken, expiresAt });
    } else {
      await ctx.db.insert("spotifyTokenCache", { accessToken, expiresAt });
    }
  },
});

// ---------------------------------------------------------------------------
// Spotify client-credentials token fetch
// ---------------------------------------------------------------------------

async function fetchSpotifyToken(
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresAt: number }> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization:
        "Basic " +
        Buffer.from(`${clientId}:${clientSecret}`).toString("base64"),
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`Spotify token fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 30_000, // 30s buffer
  };
}

async function getAccessToken(
  ctx: Pick<ActionCtx, "runQuery" | "runMutation">,
): Promise<string> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET must be set in Convex environment variables.",
    );
  }

  const cached = await ctx.runQuery(internal.music.getSpotifyToken, {});
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }

  const fresh = await fetchSpotifyToken(clientId, clientSecret);
  await ctx.runMutation(internal.music.upsertSpotifyToken, {
    accessToken: fresh.accessToken,
    expiresAt: fresh.expiresAt,
  });
  return fresh.accessToken;
}

// ---------------------------------------------------------------------------
// Normalize a Spotify track to our provider-agnostic shape
// ---------------------------------------------------------------------------

function normalizeTrack(t: SpotifyTrack): NormalizedTrack {
  const albumArt =
    t.album.images.find((i) => i.width >= 300)?.url ||
    t.album.images[0]?.url ||
    "";
  const artist = t.artists.map((a) => a.name).join(", ");
  return {
    id: t.id,
    title: t.name,
    artist,
    albumArt,
    preview_url: t.preview_url ?? null,
    durationMs: t.duration_ms,
    provider: "spotify",
  };
}

// ---------------------------------------------------------------------------
// HTTP action: GET /music/search?q=
// ---------------------------------------------------------------------------

export const searchHandler = httpAction(async (ctx, request) => {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Rate limiting
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q || q.length < 1) {
    return new Response(JSON.stringify({ tracks: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const token = await getAccessToken(ctx);

    const spotifyUrl = new URL("https://api.spotify.com/v1/search");
    spotifyUrl.searchParams.set("q", q);
    spotifyUrl.searchParams.set("type", "track");
    spotifyUrl.searchParams.set("limit", "15");
    spotifyUrl.searchParams.set("market", "US");

    const spotifyRes = await fetch(spotifyUrl.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!spotifyRes.ok) {
      throw new Error(`Spotify search failed: ${spotifyRes.status}`);
    }

    const data = (await spotifyRes.json()) as {
      tracks: { items: SpotifyTrack[] };
    };

    const tracks: NormalizedTrack[] = (data.tracks?.items ?? [])
      .filter((t) => t?.id && t?.name)
      .map(normalizeTrack);

    return new Response(JSON.stringify({ tracks }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=30",
      },
    });
  } catch (err) {
    console.error("[music/search]", err);
    return new Response(
      JSON.stringify({ error: "Search failed. Please try again." }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
