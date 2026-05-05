"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAction, useMutation, useQuery } from "convex/react";

import { useViboAuth } from "@/lib/auth/AuthProvider";
import { AppShell } from "@/components/app/AppShell";
import { PostCard } from "@/components/app/PostCard";
import { StoriesRail } from "@/components/app/StoriesRail";
import { StoryViewer } from "@/components/app/StoryViewer";
import { api } from "@convex_app/_generated/api";
import type { Id } from "@convex_app/_generated/dataModel";
import type { FeedPost, StoryUser } from "@/lib/feed/types";
import { normalizeConvexFeedPost } from "@/lib/feed/normalizeConvexFeed";

export default function HomeFeedPage() {
  const { user } = useViboAuth();

  const profile = useQuery(
    api.users.getById,
    user ? { id: user.id as Id<"users"> } : "skip",
  );

  const feedResponse = useQuery(
    api.posts.getFeed,
    user ? { userId: user.id as Id<"users">, limit: 30 } : "skip",
  ) as
    | FeedPost[]
    | { posts?: FeedPost[]; nextCursor?: number }
    | { items?: FeedPost[] }
    | undefined;
  const suggestionsRaw = useQuery(
    api.users.getSuggestedUsers,
    user ? { viewerUserId: user.id as Id<"users">, limit: 6 } : "skip",
  ) as SuggestedUser[] | undefined;

  const feed = useMemo(() => {
    if (feedResponse === undefined) return [];
    const fr = feedResponse as unknown;
    const raw = Array.isArray(fr)
      ? fr
      : fr && typeof fr === "object" && "posts" in fr
        ? ((fr as { posts?: FeedPost[] }).posts ?? [])
        : fr && typeof fr === "object" && "items" in fr
          ? ((fr as { items?: FeedPost[] }).items ?? [])
          : [];
    return (raw as Record<string, unknown>[]).map(normalizeConvexFeedPost);
  }, [feedResponse]);
  const stories: StoryUser[] = useMemo(() => [], []);

  const [storyIndex, setStoryIndex] = useState<number | null>(null);

  const meProfile =
    profile &&
    typeof profile === "object" &&
    (!("restricted" in profile) ||
      (profile as { restricted?: boolean }).restricted !== true) &&
    "_id" in profile
      ? (profile as {
          fullName?: string;
          username?: string;
          profilePictureUrl?: string;
          profilePictureKey?: string;
          profilePictureStorageRegion?: string;
        })
      : null;

  return (
    <AppShell maxWidth="max-w-none">
      <div className="mx-auto flex w-full max-w-[1240px] gap-x-7 lg:gap-x-40">
        {/* Feed column */}
        <div className="min-w-0 flex-1 space-y-6 lg:max-w-[630px]">
          <StoriesRail
            users={stories}
            currentUser={{
              username: user?.username,
              fullName: meProfile?.fullName,
              profilePictureUrl: meProfile?.profilePictureUrl,
              profilePictureKey: meProfile?.profilePictureKey,
              profilePictureStorageRegion: meProfile?.profilePictureStorageRegion,
            }}
            onOpen={(i) => setStoryIndex(i)}
          />

          {feedResponse === undefined ? (
            <div className="space-y-6">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-[520px] animate-pulse rounded-3xl bg-neutral-100 dark:bg-neutral-900"
                />
              ))}
            </div>
          ) : feed.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-neutral-200 bg-white px-8 py-16 text-center dark:border-neutral-800 dark:bg-neutral-950">
              <p className="text-[15px] font-semibold text-neutral-900 dark:text-white">
                Welcome to Vibo
              </p>
              <p className="mt-2 text-[14px] text-neutral-500 dark:text-neutral-400">
                Your feed is empty. Follow people to see their posts here.
              </p>
              <Link
                href="/create-post"
                className="mt-5 inline-flex items-center gap-2 rounded-full bg-vibo-primary px-5 py-2 text-sm font-semibold text-white hover:bg-vibo-primary/90"
              >
                Create your first post
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {feed.map((post) => (
                <PostCard
                  key={post.id}
                  post={post}
                  viewerProfile={{
                    username: meProfile?.username ?? user?.username,
                    profilePictureUrl: meProfile?.profilePictureUrl,
                    profilePictureKey: meProfile?.profilePictureKey,
                    profilePictureStorageRegion: meProfile?.profilePictureStorageRegion,
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right rail — Instagram-style suggestions */}
        <aside className="sticky top-0 hidden max-h-screen w-[360px] shrink-0 self-start overflow-y-auto pt-16 lg:block">
          <SuggestionsPanel
            displayName={meProfile?.fullName ?? user?.username ?? "you"}
            username={meProfile?.username ?? user?.username}
            profilePictureUrl={meProfile?.profilePictureUrl}
            profilePictureKey={meProfile?.profilePictureKey}
            profilePictureStorageRegion={meProfile?.profilePictureStorageRegion}
            suggestions={suggestionsRaw ?? []}
          />
        </aside>
      </div>

      <StoryViewer
        open={storyIndex !== null}
        users={stories}
        index={storyIndex ?? 0}
        onIndexChange={(next) => setStoryIndex(next)}
        onClose={() => setStoryIndex(null)}
      />
    </AppShell>
  );
}

interface SuggestedUser {
  _id: Id<"users">;
  id?: Id<"users">;
  username?: string;
  fullName?: string;
  profilePictureUrl?: string;
  profilePictureKey?: string;
  profilePictureStorageRegion?: string;
  verificationTier?: "blue" | "gold" | "gray";
  followerCount?: number;
}

interface SuggestionsPanelProps {
  displayName: string;
  username?: string;
  profilePictureUrl?: string;
  profilePictureKey?: string;
  profilePictureStorageRegion?: string;
  suggestions: SuggestedUser[];
}

function compactCount(n: number): string {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return "0";
  if (x < 1000) return String(x);
  if (x < 1_000_000)
    return `${(x / 1000).toFixed(x < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(x / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

function RailAvatar({
  size,
  profilePictureUrl,
  profilePictureKey,
  profilePictureStorageRegion,
  name,
}: {
  size: number;
  profilePictureUrl?: string;
  profilePictureKey?: string;
  profilePictureStorageRegion?: string;
  name: string;
}) {
  const getPublicMediaUrl = useAction(api.media.getPublicMediaUrl);
  const [failed, setFailed] = useState(false);
  const [url, setUrl] = useState(profilePictureUrl?.trim() || "");

  useEffect(() => {
    setUrl(profilePictureUrl?.trim() || "");
    setFailed(false);
  }, [profilePictureUrl]);

  useEffect(() => {
    if (url || !profilePictureKey?.trim()) return;
    let cancelled = false;
    void getPublicMediaUrl({
      key: profilePictureKey.trim(),
      storageRegion: profilePictureStorageRegion,
    })
      .then((r) => {
        if (!cancelled && r?.url) setUrl(r.url);
      })
      .catch(() => {
        /* keep placeholder */
      });
    return () => {
      cancelled = true;
    };
  }, [url, profilePictureKey, profilePictureStorageRegion, getPublicMediaUrl]);

  const initial = (name || "V").charAt(0).toUpperCase();

  if (url && !failed) {
    return (
      <div
        className="shrink-0 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-vibo-primary font-bold uppercase text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(12, size * 0.34),
      }}
    >
      {initial}
    </span>
  );
}

function SuggestionsPanel({
  displayName,
  username,
  profilePictureUrl,
  profilePictureKey,
  profilePictureStorageRegion,
  suggestions,
}: SuggestionsPanelProps) {
  return (
    <div className="space-y-5 px-1">
      {/* Current user row */}
      <div className="flex items-center gap-4 py-1">
        <RailAvatar
          size={64}
          profilePictureUrl={profilePictureUrl}
          profilePictureKey={profilePictureKey}
          profilePictureStorageRegion={profilePictureStorageRegion}
          name={username ?? displayName}
        />
        <div className="min-w-0 flex-1">
          <Link
            href={username ? `/${username}` : "/profile"}
            className="block truncate text-[15px] font-semibold text-neutral-900 hover:underline dark:text-white"
          >
            {username ?? displayName}
          </Link>
          <p className="truncate text-[15px] text-neutral-500 dark:text-neutral-400">
            {displayName}
          </p>
        </div>
        <button
          type="button"
          className="text-[13px] font-semibold text-vibo-primary hover:opacity-80"
        >
          Switch
        </button>
      </div>

      {/* Suggestions header */}
      <div className="flex items-center justify-between pt-1">
        <p className="text-[15px] font-semibold text-neutral-500 dark:text-neutral-400">
          Suggested for you
        </p>
        <button
          type="button"
          className="text-[13px] font-semibold text-neutral-900 hover:opacity-80 dark:text-white"
        >
          See all
        </button>
      </div>

      {/* Suggestions list */}
      <ul className="space-y-4">
        {suggestions.length === 0 ? (
          <li className="text-[13px] text-neutral-500 dark:text-neutral-400">
            No suggestions yet.
          </li>
        ) : (
          suggestions.map((c) => (
            <SuggestionRow
              key={String(c._id ?? c.id)}
              user={c}
            />
          ))
        )}
      </ul>

      {/* Footer */}
      <div className="pt-5">
        <p className="text-[13px] leading-relaxed text-neutral-400 dark:text-neutral-500">
          About · Help · Press · API · Jobs · Privacy · Terms · Locations · Language
        </p>
        <p className="mt-3 text-[12px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
          © {new Date().getFullYear()} Vibo
        </p>
      </div>
    </div>
  );
}

function SuggestionRow({ user }: { user: SuggestedUser }) {
  const { user: authUser } = useViboAuth();
  const followUser = useMutation(api.follows.followUser);
  const unfollowUser = useMutation(api.follows.unfollowUser);
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const handle = user.username ?? user.fullName ?? "vibo";
  const targetId = (user.id ?? user._id) as Id<"users">;

  const subtitle = user.followerCount
    ? `${compactCount(user.followerCount)} followers`
    : user.fullName ?? "Suggested for you";

  return (
    <li className="flex items-center gap-4">
      <Link href={`/${handle}`} aria-label={handle} className="shrink-0">
        <RailAvatar
          size={52}
          profilePictureUrl={user.profilePictureUrl}
          profilePictureKey={user.profilePictureKey}
          profilePictureStorageRegion={user.profilePictureStorageRegion}
          name={handle}
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link
          href={`/${handle}`}
          className="block truncate text-[15px] font-semibold text-neutral-900 hover:underline dark:text-white"
        >
          {handle}
        </Link>
        <p className="truncate text-[13px] text-neutral-500 dark:text-neutral-400">
          {subtitle}
        </p>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          if (!authUser?.id) return;
          setBusy(true);
          try {
            const next = !following;
            setFollowing(next);
            if (next) {
              await followUser({
                followerId: authUser.id as Id<"users">,
                followingId: targetId,
              });
            } else {
              await unfollowUser({
                followerId: authUser.id as Id<"users">,
                followingId: targetId,
              });
            }
          } catch {
            setFollowing((v) => !v);
          } finally {
            setBusy(false);
          }
        }}
        className="text-[13px] font-semibold text-vibo-primary hover:opacity-80 disabled:opacity-50"
      >
        {following ? "Following" : "Follow"}
      </button>
    </li>
  );
}
