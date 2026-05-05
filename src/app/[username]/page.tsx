"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Check, MessageCircleMore, Search, X } from "@/components/ui/icons";
import { useMutation, useQuery } from "convex/react";

import { useViboAuth } from "@/lib/auth/AuthProvider";
import { AppShell } from "@/components/app/AppShell";
import { ProfileHeader } from "@/components/app/ProfileHeader";
import { ProfileTabs } from "@/components/app/ProfileTabs";
import { PostsGrid } from "@/components/app/PostsGrid";
import { PostLightbox } from "@/components/app/PostLightbox";
import { ResolvedProfileAvatar } from "@/components/messaging/ResolvedProfileAvatar";
import { api } from "@convex_app/_generated/api";
import type { Doc, Id } from "@convex_app/_generated/dataModel";
import type { FeedPost, FeedPostDetail } from "@/lib/feed/types";
import { readStoredLang } from "@/i18n/useViboLang";

const USERNAME_RE = /^[a-z0-9_.]{3,30}$/i;

type VisibleProfile = Doc<"users"> & {
  followerCount?: number;
  followingCount?: number;
};

function isRestrictedProfileOverlay(p: unknown): p is {
  restricted: true;
  status: "banned" | "suspended";
} {
  return (
    typeof p === "object" &&
    p !== null &&
    "restricted" in p &&
    (p as { restricted?: unknown }).restricted === true
  );
}

function toVisibleProfile(p: unknown): VisibleProfile | null {
  if (p === null || p === undefined || typeof p !== "object") return null;
  if (isRestrictedProfileOverlay(p)) return null;
  if (!("_id" in p)) return null;
  return p as VisibleProfile;
}

type LightboxState = { source: "posts" | "videos" | "reposts"; index: number } | null;
type ConnectionsModalTab = "followers" | "following" | null;

/** Convert a `FeedPost` (from the list query) to the `FeedPostDetail` shape
 * the lightbox expects. Comments are loaded lazily by the lightbox itself
 * via `getByShortId`, but for now we render with empty comment lists for the
 * "preview" slide and fall back to the post-detail query when opened. */
function toDetail(p: FeedPost): FeedPostDetail {
  return { ...p, comments: [] };
}

function toFeedPost(raw: any): FeedPost {
  const mediaRows = Array.isArray(raw?.media) ? [...raw.media] : [];
  mediaRows.sort(
    (a: any, b: any) => Number(a?.position ?? 0) - Number(b?.position ?? 0),
  );
  const firstMedia = mediaRows[0] ?? null;
  const mediaType = firstMedia?.type === "video" ? "video" : firstMedia ? "image" : "text";
  const id = String(raw?._id ?? raw?.id ?? "");
  const shortId =
    raw?.shortId != null
      ? String(raw.shortId)
      : id.length >= 11
        ? id.slice(0, 11)
        : id;
  return {
    id,
    shortId,
    type: mediaType,
    caption: raw?.caption ?? undefined,
    captionAr: raw?.captionAr ?? undefined,
    mediaUrl: firstMedia?.displayUrl ?? undefined,
    thumbUrl: firstMedia?.thumbnailUrl ?? undefined,
    location: raw?.locationName ?? undefined,
    likeCount: Number(raw?.likeCount ?? 0),
    commentCount: Number(raw?.commentCount ?? 0),
    repostCount: Number(raw?.repostCount ?? 0),
    shareCount: Number(raw?.sharesCount ?? raw?.shareCount ?? 0),
    createdAt: Number(raw?.createdAt ?? Date.now()),
    author: {
      id: String(raw?.author?._id ?? raw?.userId ?? ""),
      username: raw?.author?.username ?? undefined,
      fullName: raw?.author?.fullName ?? undefined,
      profilePictureUrl: raw?.author?.profilePictureUrl ?? undefined,
      profilePictureKey: raw?.author?.profilePictureKey ?? undefined,
      profilePictureStorageRegion:
        raw?.author?.profilePictureStorageRegion ?? undefined,
      verificationTier: raw?.author?.verificationTier ?? undefined,
    },
    likedByMe: raw?.isLiked === true,
    collaborationPending: raw?.collaborationPending === true,
  };
}

export default function UserProfilePage() {
  const { user } = useViboAuth();
  const router = useRouter();
  const params = useParams<{ username: string }>();
  const raw = decodeURIComponent(params?.username ?? "");
  const handle = raw.replace(/^@/, "");

  const looksLikeUsername = USERNAME_RE.test(handle);

  const userByUsername = useQuery(
    api.users.getByUsername,
    looksLikeUsername ? { username: handle } : "skip",
  );

  const profile = useQuery(
    api.users.getById,
    userByUsername?._id
      ? {
          id: userByUsername._id as Id<"users">,
          viewerUserId: user?.id as Id<"users"> | undefined,
        }
      : "skip",
  );

  const visibleProfile = toVisibleProfile(profile);
  const profileRestricted = profile != null && isRestrictedProfileOverlay(profile);

  const isOwn =
    !!visibleProfile && !!user && (visibleProfile._id as unknown as string) === user.id;

  const userFeedRaw = useQuery(
    api.posts.getUserPostsFeed,
    visibleProfile?._id
      ? {
          userId: visibleProfile._id as Id<"users">,
          viewerUserId: user?.id as Id<"users"> | undefined,
          limit: 60,
        }
      : "skip",
  ) as { posts?: any[] } | any[] | undefined;

  const followStatus = useQuery(
    api.follows.getFollowStatus,
    !isOwn && visibleProfile && user?.id
      ? {
          followerId: user.id as Id<"users">,
          followingId: visibleProfile._id as Id<"users">,
        }
      : "skip",
  ) as
    | { isFollowing?: boolean; following?: boolean }
    | boolean
    | undefined;

  const followUser = useMutation(api.follows.followUser);
  const unfollowUser = useMutation(api.follows.unfollowUser);
  const removeFollower = useMutation(api.follows.removeFollower);
  const createDirectConversation = useMutation(api.messages.createOrGetDirectConversation);

  const [followingState, setFollowingState] = useState<boolean | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [connectionsModalTab, setConnectionsModalTab] = useState<ConnectionsModalTab>(null);
  const [connectionsSearch, setConnectionsSearch] = useState("");
  const [connectionActionBusy, setConnectionActionBusy] = useState<string | null>(null);

  const followersRaw = useQuery(
    api.follows.getFollowers,
    visibleProfile?._id
      ? {
          userId: visibleProfile._id as Id<"users">,
          limit: 200,
        }
      : "skip",
  ) as
    | {
        followers?: Array<{
          _id: Id<"users">;
          username?: string;
          fullName?: string;
          profilePictureUrl?: string;
          profilePictureKey?: string;
          profilePictureStorageRegion?: string;
        }>;
      }
    | undefined;

  const followingRaw = useQuery(
    api.follows.getFollowing,
    visibleProfile?._id
      ? {
          userId: visibleProfile._id as Id<"users">,
          limit: 200,
        }
      : "skip",
  ) as
    | {
        following?: Array<{
          _id: Id<"users">;
          username?: string;
          fullName?: string;
          profilePictureUrl?: string;
          profilePictureKey?: string;
          profilePictureStorageRegion?: string;
        }>;
      }
    | undefined;

  // Sync follow toggle with server state.
  useEffect(() => {
    const stored = readStoredLang();
    if (stored === "ar" || stored === "en") setLang(stored);
    else if (typeof document !== "undefined" && document.documentElement.lang === "ar") setLang("ar");
  }, []);

  const isAr = lang === "ar";
  const t = {
    userNotFound: isAr ? "المستخدم غير موجود." : "User not found.",
    profileUnavailable: isAr ? "هذا الملف الشخصي غير متاح." : "This profile is not available.",
    editProfile: isAr ? "تعديل الملف الشخصي" : "Edit profile",
    shareProfile: isAr ? "مشاركة الملف الشخصي" : "Share profile",
    copied: isAr ? "تم النسخ" : "Copied",
    message: isAr ? "رسالة" : "Message",
    share: isAr ? "مشاركة" : "Share",
    noVideosYet: isAr ? "لا توجد فيديوهات بعد." : "No videos yet.",
    noRepostsYet: isAr ? "لا توجد إعادة نشر بعد." : "No reposts yet.",
    noSavedPosts: isAr ? "لا توجد منشورات محفوظة." : "No saved posts.",
    noTaggedPosts: isAr ? "لا توجد منشورات تمت الإشارة إليك فيها." : "No tagged posts.",
    followers: isAr ? "المتابعون" : "Followers",
    following: isAr ? "المتابَعون" : "Following",
    close: isAr ? "إغلاق" : "Close",
    search: isAr ? "بحث" : "Search",
    noUsersFound: isAr ? "لا يوجد مستخدمون." : "No users found.",
    remove: isAr ? "إزالة" : "Remove",
    followingBtn: isAr ? "يتابع" : "Following",
    follow: isAr ? "متابعة" : "Follow",
    loading: isAr ? "جارٍ التحميل…" : "Loading…",
  };

  useEffect(() => {
    if (typeof followStatus === "boolean") {
      setFollowingState(followStatus);
      return;
    }
    if (followStatus && typeof followStatus === "object") {
      const next = followStatus.isFollowing ?? followStatus.following;
      if (typeof next === "boolean") setFollowingState(next);
    }
  }, [followStatus]);

  const followLabel = followingState ? t.followingBtn : t.follow;

  const handleFollow = async () => {
    if (!visibleProfile || !user?.id) return;
    setFollowBusy(true);
    const next = !followingState;
    setFollowingState(next);
    try {
      if (next) {
        await followUser({
          followerId: user.id as Id<"users">,
          followingId: visibleProfile._id as Id<"users">,
        });
      } else {
        await unfollowUser({
          followerId: user.id as Id<"users">,
          followingId: visibleProfile._id as Id<"users">,
        });
      }
    } catch {
      setFollowingState(!next);
    } finally {
      setFollowBusy(false);
    }
  };

  const handleMessage = async () => {
    if (!visibleProfile?._id || !user?.id) return;
    try {
      const { conversationId } = await createDirectConversation({
        viewerId: user.id as Id<"users">,
        peerUserId: visibleProfile._id as Id<"users">,
      });
      router.push(`/messages/${conversationId}`);
    } catch {
      router.push("/messages");
    }
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/${visibleProfile?.username ?? handle}`;
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await navigator.share({ url, title: t.shareProfile });
        return;
      }
    } catch {
      // user dismissed — fall through to clipboard
    }
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  const connectionsItems = useMemo(() => {
    const q = connectionsSearch.trim().toLowerCase();
    const source =
      connectionsModalTab === "followers"
        ? followersRaw?.followers ?? []
        : connectionsModalTab === "following"
          ? followingRaw?.following ?? []
          : [];
    if (!q) return source;
    return source.filter((u) =>
      `${u.username ?? ""} ${u.fullName ?? ""}`.toLowerCase().includes(q),
    );
  }, [connectionsModalTab, followersRaw, followingRaw, connectionsSearch]);

  const handleConnectionAction = async (targetUserId: Id<"users">) => {
    if (!user?.id || !visibleProfile?._id) return;
    setConnectionActionBusy(String(targetUserId));
    try {
      if (connectionsModalTab === "followers") {
        await removeFollower({
          userId: visibleProfile._id as Id<"users">,
          followerId: targetUserId,
        });
      } else if (connectionsModalTab === "following") {
        await unfollowUser({
          followerId: visibleProfile._id as Id<"users">,
          followingId: targetUserId,
        });
      }
    } finally {
      setConnectionActionBusy(null);
    }
  };

  const allPosts = (Array.isArray(userFeedRaw) ? userFeedRaw : userFeedRaw?.posts ?? []).map(
    toFeedPost,
  );
  const posts: FeedPost[] = allPosts.filter((p) => p.type !== "video");
  const videos: FeedPost[] = allPosts.filter((p) => p.type === "video");

  const repostsRaw = useQuery(
    api.postInteractions.getUserReposts,
    visibleProfile?._id
      ? {
          userId: visibleProfile._id as Id<"users">,
          limit: 60,
        }
      : "skip",
  ) as Array<{
    postId: Id<"posts">;
    post: any;
  }> | undefined;

  const reposts: FeedPost[] = useMemo(() => {
    if (!Array.isArray(repostsRaw)) return [];
    return repostsRaw.map((r) => {
      const base = toFeedPost(r.post);
      // We only know "isReposted by viewer" in a perfect way on the home feed.
      // For the profile grid we at least set it correctly when the viewer is the profile owner.
      return {
        ...base,
        isReposted: isOwn,
        isSaved: false,
      };
    });
  }, [repostsRaw, isOwn]);

  // ---- Lightbox URL sync ----------------------------------------------------
  const [lightbox, setLightbox] = useState<LightboxState>(null);
  const pushedRef = useRef(false);
  const openedFromUrlRef = useRef(false);
  const baseUrlRef = useRef<string | null>(null);
  const searchParams = useSearchParams();
  const lightboxPostIdFromUrl = searchParams.get("lightboxPostId")?.trim() ?? null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!baseUrlRef.current) {
      baseUrlRef.current = window.location.pathname + window.location.search;
    }
  }, []);

  const currentList =
    lightbox?.source === "videos"
      ? videos
      : lightbox?.source === "reposts"
        ? reposts
        : posts;

  const selectedPostAuthor = lightbox ? currentList[lightbox.index]?.author : null;

  // If someone navigates here with `?lightboxPostId=...` (e.g. DM post shares),
  // open the corresponding post/lightbox once we have the feed loaded.
  useEffect(() => {
    if (openedFromUrlRef.current) return;
    if (!lightboxPostIdFromUrl) return;
    if (lightbox) return;

    const id = lightboxPostIdFromUrl;
    const pIndex = posts.findIndex((p) => String(p.id) === id);
    if (pIndex >= 0) {
      openedFromUrlRef.current = true;
      setLightbox({ source: "posts", index: pIndex });
      return;
    }
    const vIndex = videos.findIndex((p) => String(p.id) === id);
    if (vIndex >= 0) {
      openedFromUrlRef.current = true;
      setLightbox({ source: "videos", index: vIndex });
      return;
    }
    const rIndex = reposts.findIndex((p) => String(p.id) === id);
    if (rIndex >= 0) {
      openedFromUrlRef.current = true;
      setLightbox({ source: "reposts", index: rIndex });
      return;
    }
  }, [lightboxPostIdFromUrl, lightbox, posts, reposts, videos]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (lightbox && currentList[lightbox.index]) {
      const id = currentList[lightbox.index].shortId;
      const url = `/${id}`;
      if (!pushedRef.current) {
        window.history.pushState({ vibo: "lightbox", id }, "", url);
        pushedRef.current = true;
      } else {
        window.history.replaceState({ vibo: "lightbox", id }, "", url);
      }
    }
  }, [lightbox, currentList]);

  useEffect(() => {
    const onPop = () => {
      if (pushedRef.current) {
        pushedRef.current = false;
        setLightbox(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const closeLightbox = useCallback(() => {
    if (pushedRef.current) {
      pushedRef.current = false;
      window.history.back();
    } else {
      setLightbox(null);
    }
  }, []);

  if (!looksLikeUsername) {
    return (
      <AppShell maxWidth="max-w-[820px]">
        <p className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
          {t.userNotFound}
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell maxWidth="max-w-[1040px]">
      <div>
        {profile === undefined ? (
          <p className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {t.loading}
          </p>
        ) : profile === null || (profile !== undefined && !visibleProfile && !profileRestricted) ? (
          <p className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {t.userNotFound}
          </p>
        ) : profileRestricted ? (
          <p className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {t.profileUnavailable}
          </p>
        ) : visibleProfile ? (
          <>
            <ProfileHeader
              isOwn={isOwn}
              onOpenFollowers={() => {
                setConnectionsSearch("");
                setConnectionsModalTab("followers");
              }}
              onOpenFollowing={() => {
                setConnectionsSearch("");
                setConnectionsModalTab("following");
              }}
              user={{
                id: visibleProfile.username ?? (visibleProfile._id as unknown as string),
                username: visibleProfile.username,
                fullName: visibleProfile.fullName,
                bio: visibleProfile.bio,
                bioLink: visibleProfile.bioLink,
                profilePictureUrl: visibleProfile.profilePictureUrl,
                profilePictureKey: visibleProfile.profilePictureKey,
                profilePictureStorageRegion: visibleProfile.profilePictureStorageRegion,
                bannerUrl: visibleProfile.bannerUrl,
                bannerKey: visibleProfile.bannerKey,
                bannerStorageRegion: visibleProfile.bannerStorageRegion,
                verificationTier: visibleProfile.verificationTier,
                followerCount: visibleProfile.followerCount ?? 0,
                followingCount: visibleProfile.followingCount ?? 0,
                postCount: posts.length,
              }}
              actions={
                <div className="flex items-stretch gap-2.5">
                  {isOwn ? (
                    <>
                      <Link
                        href="/profile/edit-profile"
                        className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-neutral-100 px-5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-200 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-white dark:ring-neutral-800 dark:hover:bg-neutral-800"
                      >
                        {t.editProfile}
                      </Link>
                      <button
                        type="button"
                        onClick={() => void handleShare()}
                        className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-neutral-100 px-5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-200 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-white dark:ring-neutral-800 dark:hover:bg-neutral-800"
                      >
                        {copied ? (
                          <>
                            <Check className="h-4 w-4 text-emerald-500" />
                            {t.copied}
                          </>
                        ) : (
                          t.shareProfile
                        )}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleFollow()}
                        disabled={followBusy}
                        className={`inline-flex h-11 flex-1 items-center justify-center rounded-full px-5 text-sm font-semibold disabled:opacity-60 ${
                          followingState
                            ? "bg-neutral-100 text-neutral-900 ring-1 ring-neutral-200 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-white dark:ring-neutral-800 dark:hover:bg-neutral-800"
                            : "bg-vibo-primary text-white hover:bg-vibo-primary/90"
                        }`}
                      >
                        {followLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleMessage()}
                        className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-neutral-100 px-5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-200 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-white dark:ring-neutral-800 dark:hover:bg-neutral-800"
                      >
                        <MessageCircleMore className="h-4 w-4" />
                        {t.message}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleShare()}
                        aria-label={t.shareProfile}
                        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-neutral-100 px-4 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-200 hover:bg-neutral-200 dark:bg-neutral-900 dark:text-white dark:ring-neutral-800 dark:hover:bg-neutral-800"
                      >
                        {copied ? (
                          <>
                            <Check className="h-4 w-4 text-emerald-500" />
                            {t.copied}
                          </>
                        ) : (
                          t.share
                        )}
                      </button>
                    </>
                  )}
                </div>
              }
            />

            <ProfileTabs
              isOwn={isOwn}
              panels={{
                posts: (
                  <PostsGrid
                    posts={posts}
                    isLoading={allPosts === undefined}
                    showOwnHint={isOwn}
                    onPostClick={(i) => setLightbox({ source: "posts", index: i })}
                  />
                ),
                videos: (
                  <PostsGrid
                    posts={videos}
                    isLoading={allPosts === undefined}
                    emptyMessage={t.noVideosYet}
                    onPostClick={(i) => setLightbox({ source: "videos", index: i })}
                  />
                ),
                reposts: (
                  <PostsGrid
                    posts={reposts}
                    isLoading={repostsRaw === undefined}
                    emptyMessage={t.noRepostsYet}
                    onPostClick={(i) =>
                      setLightbox({ source: "reposts", index: i })
                    }
                  />
                ),
                saved: (
                  <p className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
                    {t.noSavedPosts}
                  </p>
                ),
                tagged: (
                  <p className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
                    {t.noTaggedPosts}
                  </p>
                ),
              }}
            />

            <PostLightbox
              open={!!lightbox}
              posts={currentList.map(toDetail)}
              index={lightbox?.index ?? 0}
              onIndexChange={(next) =>
                setLightbox((prev) => (prev ? { ...prev, index: next } : prev))
              }
              onClose={closeLightbox}
              owner={{
                username:
                  selectedPostAuthor?.username ?? visibleProfile.username,
                fullName:
                  selectedPostAuthor?.fullName ?? visibleProfile.fullName,
                profilePictureUrl:
                  selectedPostAuthor?.profilePictureUrl ??
                  visibleProfile.profilePictureUrl,
                verificationTier:
                  selectedPostAuthor?.verificationTier ??
                  visibleProfile.verificationTier,
              }}
              isOwn={isOwn}
            />

            {connectionsModalTab ? (
              <div
                className="fixed inset-0 z-[95] flex items-center justify-center bg-black/70 p-4"
                onClick={(e) => {
                  if (e.target === e.currentTarget) setConnectionsModalTab(null);
                }}
              >
                <div className="flex h-[72vh] w-full max-w-[680px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-neutral-950">
                  <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
                    <p className="text-[16px] font-semibold text-neutral-900 dark:text-white">
                      {connectionsModalTab === "followers" ? t.followers : t.following}
                    </p>
                    <button
                      type="button"
                      onClick={() => setConnectionsModalTab(null)}
                      aria-label={t.close}
                      className="grid h-8 w-8 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
                    >
                      <X className="h-4.5 w-4.5" />
                    </button>
                  </div>
                  <div className="border-b border-neutral-100 px-3 py-2 dark:border-neutral-900">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
                      <input
                        type="search"
                        value={connectionsSearch}
                        onChange={(e) => setConnectionsSearch(e.target.value)}
                        placeholder={t.search}
                        className="h-10 w-full rounded-full border-0 bg-neutral-100 py-2 pl-9 pr-3 text-[14px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200 dark:bg-neutral-900 dark:text-white dark:focus:ring-neutral-800"
                      />
                    </div>
                  </div>

                  <ul className="min-h-0 flex-1 overflow-y-auto py-1">
                    {connectionsItems.length === 0 ? (
                      <li className="px-4 py-10 text-center text-[13px] text-neutral-500">
                        {t.noUsersFound}
                      </li>
                    ) : (
                      connectionsItems.map((row) => {
                        const key = String(row._id);
                        const busy = connectionActionBusy === key;
                        const canManage = isOwn && !!user?.id;
                        return (
                          <li key={key} className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 dark:hover:bg-neutral-900/80">
                            <Link href={`/${row.username ?? ""}`} className="min-w-0 flex flex-1 items-center gap-3">
                              <ResolvedProfileAvatar
                                profilePictureUrl={row.profilePictureUrl}
                                profilePictureKey={row.profilePictureKey}
                                profilePictureStorageRegion={row.profilePictureStorageRegion}
                                initial={(row.username ?? row.fullName ?? "U").charAt(0)}
                                size={42}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[14px] font-semibold text-neutral-900 dark:text-white">
                                  {row.username ?? "user"}
                                </span>
                                <span className="block truncate text-[12px] text-neutral-500 dark:text-neutral-400">
                                  {row.fullName ?? ""}
                                </span>
                              </span>
                            </Link>
                            {canManage ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleConnectionAction(row._id)}
                                className="rounded-lg bg-neutral-100 px-3 py-1.5 text-[12px] font-semibold text-neutral-800 hover:bg-neutral-200 disabled:opacity-50 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800"
                              >
                                {busy ? "..." : connectionsModalTab === "followers" ? t.remove : t.followingBtn}
                              </button>
                            ) : null}
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
