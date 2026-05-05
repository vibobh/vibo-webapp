"use client";

import { useCallback, useEffect, useState } from "react";
import { useAction } from "convex/react";
import Link from "next/link";

import { api } from "@convex_app/_generated/api";
import { ResolvedProfileAvatar } from "@/components/messaging/ResolvedProfileAvatar";
import { BadgeCheck, Play } from "@/components/ui/icons";

function isHttpUrl(u: string | undefined): boolean {
  const t = (u ?? "").trim().toLowerCase();
  return t.startsWith("http://") || t.startsWith("https://");
}

export interface MessageMediaBubbleProps {
  type: string;
  text?: string;
  mediaKey?: string;
  mediaStorageRegion?: string;
  mediaThumbKey?: string;
  mediaThumbStorageRegion?: string;
  gifPreviewUrl?: string;
  gifUrl?: string;
  /** DM collaboration invite — preview + optional accept/decline for recipient. */
  collaborationInvite?: {
    showInviteActions: boolean;
    onAccept: () => Promise<void>;
    onDecline: () => Promise<void>;
  };
  postPreview?: {
    postId?: string;
    authorUsername?: string;
    authorFullName?: string;
    authorProfilePictureUrl?: string;
    authorProfilePictureKey?: string;
    authorProfilePictureStorageRegion?: string;
    verificationTier?: "blue" | "gold" | "gray";
    thumbnailUrl?: string;
    displayUrl?: string;
    displayStorageRegion?: string;
    thumbnailStorageRegion?: string;
    caption?: string;
    mediaType?: string;
  } | null;
  fromMe: boolean;
}

type SharedPostPreviewInput = NonNullable<MessageMediaBubbleProps["postPreview"]>;

function computeSharedPostDisplay(
  p: SharedPostPreviewInput,
  resolvedDisplay: string,
  resolvedThumb: string,
  resolvedPostId: string | undefined,
) {
  const rawD = p.displayUrl?.trim() ?? "";
  const rawT = p.thumbnailUrl?.trim() ?? "";
  const pid = p.postId ? String(p.postId) : "";
  const match = Boolean(pid && resolvedPostId === pid);
  const safeD = match ? resolvedDisplay : "";
  const safeT = match ? resolvedThumb : "";
  const effD = rawD ? (isHttpUrl(rawD) ? rawD : safeD) : "";
  const effT = rawT ? (isHttpUrl(rawT) ? rawT : safeT) : "";
  const display = effD || effT;
  const thumb = effT || effD;
  const needsResolve =
    (Boolean(rawD) && !isHttpUrl(rawD)) || (Boolean(rawT) && !isHttpUrl(rawT));
  const resolving = needsResolve && !display;
  return { display, thumb, resolving };
}

/**
 * Renders DM media the same way Convex stores it: keys resolved with
 * `media:getPublicMediaUrl`, GIFs via preview URL, post shares via preview URLs.
 */
export function MessageMediaBubble({
  type,
  text,
  mediaKey,
  mediaStorageRegion,
  mediaThumbKey,
  mediaThumbStorageRegion,
  gifPreviewUrl,
  gifUrl,
  postPreview,
  collaborationInvite,
  fromMe,
}: MessageMediaBubbleProps) {
  const getPublicMediaUrl = useAction(api.media.getPublicMediaUrl);
  const [src, setSrc] = useState("");
  const [poster, setPoster] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [collabBusy, setCollabBusy] = useState(false);
  /** Resolved CDN URLs when Convex stores S3 keys in `postMedia.displayUrl` / `thumbnailUrl`. */
  const [resolvedForShare, setResolvedForShare] = useState<{
    postId: string;
    display: string;
    thumb: string;
  } | null>(null);

  useEffect(() => {
    setSrc("");
    setPoster("");
    setLoadFailed(false);
  }, [mediaKey, mediaThumbKey, type]);

  useEffect(() => {
    if (
      type === "gif" ||
      type === "post_share" ||
      type === "collab_invite" ||
      type === "location" ||
      type === "text"
    ) {
      return;
    }
    if (!mediaKey?.trim()) return;
    let cancelled = false;
    void getPublicMediaUrl({
      key: mediaKey.trim(),
      storageRegion: mediaStorageRegion,
    })
      .then((r) => {
        if (!cancelled && r?.url) setSrc(r.url);
      })
      .catch(() => {
        setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [type, mediaKey, mediaStorageRegion, getPublicMediaUrl]);

  useEffect(() => {
    if (type !== "video" || !mediaThumbKey?.trim()) return;
    let cancelled = false;
    void getPublicMediaUrl({
      key: mediaThumbKey.trim(),
      storageRegion: mediaThumbStorageRegion,
    })
      .then((r) => {
        if (!cancelled && r?.url) setPoster(r.url);
      })
      .catch(() => {
        /* poster optional */
      });
    return () => {
      cancelled = true;
    };
  }, [type, mediaThumbKey, mediaThumbStorageRegion, getPublicMediaUrl]);

  useEffect(() => {
    if (type !== "post_share" && type !== "collab_invite") {
      setResolvedForShare(null);
      return;
    }
    if (!postPreview?.postId) {
      setResolvedForShare(null);
      return;
    }
    const rawD = postPreview.displayUrl?.trim() ?? "";
    const rawT = postPreview.thumbnailUrl?.trim() ?? "";
    const postId = String(postPreview.postId);
    setResolvedForShare(null);
    if (!rawD && !rawT) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const resolve = async (raw: string, region?: string) => {
        if (!raw) return "";
        if (isHttpUrl(raw)) return raw;
        const r = await getPublicMediaUrl({
          key: raw,
          storageRegion: region,
        });
        return r?.url?.trim() ?? "";
      };
      const d = await resolve(rawD, postPreview.displayStorageRegion);
      const t = await resolve(rawT, postPreview.thumbnailStorageRegion);
      if (!cancelled) {
        setResolvedForShare({ postId, display: d, thumb: t });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    type,
    postPreview?.postId,
    postPreview?.displayUrl,
    postPreview?.thumbnailUrl,
    postPreview?.displayStorageRegion,
    postPreview?.thumbnailStorageRegion,
    getPublicMediaUrl,
  ]);

  const caption = text?.trim();
  const bubbleBase = `max-w-[min(280px,85vw)] overflow-hidden rounded-[22px] ${
    fromMe ? "bg-vibo-primary text-white" : "bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100"
  }`;

  const runCollab = useCallback(
    async (fn: () => Promise<void>) => {
      if (collabBusy) return;
      setCollabBusy(true);
      try {
        await fn();
      } finally {
        setCollabBusy(false);
      }
    },
    [collabBusy],
  );

  if (type === "collab_invite") {
    const cap = caption?.trim();
    if (postPreview) {
      const { display, thumb, resolving } = computeSharedPostDisplay(
        postPreview,
        resolvedForShare?.display ?? "",
        resolvedForShare?.thumb ?? "",
        resolvedForShare?.postId,
      );
      const uname = postPreview.authorUsername?.trim() || "user";
      const postCap = postPreview.caption?.trim() || "";
      const sharedCaption =
        (cap && cap.length > 0 ? cap : null) ?? (postCap.length > 0 ? postCap : null);
      const isVideo = postPreview.mediaType === "video" && Boolean(display);

      const card = (
        <div className="max-w-[min(280px,85vw)] overflow-hidden rounded-2xl border border-vibo-primary/25 bg-white shadow-sm dark:border-vibo-primary/40 dark:bg-neutral-950">
          <div className="bg-vibo-primary/10 px-3 py-1.5 text-center text-[11px] font-bold uppercase tracking-wide text-vibo-primary dark:text-vibo-primary">
            Collaborate on a post
          </div>
          <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2 dark:border-neutral-800/80">
            <ResolvedProfileAvatar
              profilePictureUrl={postPreview.authorProfilePictureUrl}
              profilePictureKey={postPreview.authorProfilePictureKey}
              profilePictureStorageRegion={postPreview.authorProfilePictureStorageRegion}
              initial={uname.charAt(0).toUpperCase()}
              size={28}
            />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-neutral-900 dark:text-white">
              {uname}
            </span>
            {postPreview.verificationTier === "blue" ? (
              <BadgeCheck className="h-4 w-4 shrink-0 text-sky-500" strokeWidth={2.2} />
            ) : postPreview.verificationTier === "gold" ? (
              <BadgeCheck className="h-4 w-4 shrink-0 text-amber-500" strokeWidth={2.2} />
            ) : postPreview.verificationTier === "gray" ? (
              <BadgeCheck className="h-4 w-4 shrink-0 text-neutral-400" strokeWidth={2.2} />
            ) : null}
          </div>

          <div className="relative max-h-[min(280px,55vh)] w-full bg-black">
            {isVideo ? (
              <>
                <video
                  src={display}
                  poster={thumb || undefined}
                  muted
                  playsInline
                  className="pointer-events-none max-h-[min(280px,55vh)] w-full object-cover"
                />
                <span className="pointer-events-none absolute inset-0 grid place-items-center">
                  <span className="rounded-full bg-black/55 p-2 text-white">
                    <Play className="h-6 w-6" fill="currentColor" />
                  </span>
                </span>
              </>
            ) : display ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={display}
                alt=""
                className="max-h-[min(280px,55vh)] w-full object-cover"
                loading="lazy"
              />
            ) : resolving ? (
              <p className="px-4 py-8 text-center text-[13px] text-neutral-400">Loading…</p>
            ) : (
              <p className="px-4 py-8 text-center text-[13px] text-neutral-200">Post preview</p>
            )}
          </div>

          {sharedCaption ? (
            <div className="px-3 py-2.5 text-[13px] leading-snug text-neutral-800 dark:text-neutral-200">
              <span className="font-semibold text-neutral-950 dark:text-white">{uname}</span>{" "}
              <span className="text-neutral-700 dark:text-neutral-300">
                {sharedCaption.length > 140 ? `${sharedCaption.slice(0, 137)}…` : sharedCaption}
              </span>
            </div>
          ) : null}
        </div>
      );

      return (
        <div className="inline-block max-w-[min(280px,85vw)]">
          {card}
          {collaborationInvite?.showInviteActions ? (
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                disabled={collabBusy}
                onClick={() => void runCollab(collaborationInvite.onAccept)}
                className="flex-1 rounded-full bg-vibo-primary py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-vibo-primary/90 disabled:opacity-50"
              >
                Accept
              </button>
              <button
                type="button"
                disabled={collabBusy}
                onClick={() => void runCollab(collaborationInvite.onDecline)}
                className="flex-1 rounded-full border border-neutral-300 bg-white py-2 text-[13px] font-semibold text-neutral-800 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                Decline
              </button>
            </div>
          ) : fromMe ? (
            <p className="mt-1.5 text-center text-[11px] text-neutral-500 dark:text-neutral-400">
              Waiting for them to accept…
            </p>
          ) : null}
        </div>
      );
    }
    return (
      <div className="max-w-[min(280px,85vw)] rounded-2xl border border-neutral-200/90 bg-white px-4 py-2.5 text-[14.5px] text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-white">
        {cap || "Collaboration invite"}
      </div>
    );
  }

  if (type === "gif") {
    const g = (gifPreviewUrl || gifUrl)?.trim();
    if (!g) {
      return caption ? <p className={`px-4 py-2 text-[14.5px] ${bubbleBase}`}>{caption}</p> : null;
    }
    return (
      <div className={bubbleBase}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={g}
          alt=""
          className="block max-h-[320px] w-full object-cover"
          loading="lazy"
        />
        {caption ? (
          <p className={`border-t border-black/10 px-3 py-2 text-[14px] ${fromMe ? "text-white/95" : ""}`}>
            {caption}
          </p>
        ) : null}
      </div>
    );
  }

  if (type === "post_share") {
    if (postPreview) {
      const { display, thumb, resolving } = computeSharedPostDisplay(
        postPreview,
        resolvedForShare?.display ?? "",
        resolvedForShare?.thumb ?? "",
        resolvedForShare?.postId,
      );
      const uname = postPreview.authorUsername?.trim() || "user";
      const cap = postPreview.caption?.trim() || "";
      const sharedCaption =
        (caption && caption.trim().length > 0 ? caption : null) ??
        (cap.length > 0 ? cap : null);
      const href =
        postPreview.postId && postPreview.authorUsername
          ? `/${encodeURIComponent(
              postPreview.authorUsername,
            )}?lightboxPostId=${encodeURIComponent(postPreview.postId)}`
          : postPreview.postId
            ? `/?post=${encodeURIComponent(postPreview.postId)}`
            : null;

      const tier = postPreview.verificationTier;
      const isVideo = postPreview.mediaType === "video" && Boolean(display);

      const card = (
        <div className="max-w-[min(280px,85vw)] overflow-hidden rounded-2xl border border-neutral-200/90 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex items-center gap-2 border-b border-neutral-100 px-3 py-2 dark:border-neutral-800/80">
            <ResolvedProfileAvatar
              profilePictureUrl={postPreview.authorProfilePictureUrl}
              profilePictureKey={postPreview.authorProfilePictureKey}
              profilePictureStorageRegion={postPreview.authorProfilePictureStorageRegion}
              initial={uname.charAt(0).toUpperCase()}
              size={28}
            />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-neutral-900 dark:text-white">
              {uname}
            </span>
            {tier === "blue" ? (
              <BadgeCheck className="h-4 w-4 shrink-0 text-sky-500" strokeWidth={2.2} />
            ) : tier === "gold" ? (
              <BadgeCheck className="h-4 w-4 shrink-0 text-amber-500" strokeWidth={2.2} />
            ) : tier === "gray" ? (
              <BadgeCheck className="h-4 w-4 shrink-0 text-neutral-400" strokeWidth={2.2} />
            ) : null}
          </div>

          <div className="relative max-h-[min(320px,55vh)] w-full bg-black">
            {isVideo ? (
              <>
                <video
                  src={display}
                  poster={thumb || undefined}
                  muted
                  playsInline
                  className="pointer-events-none max-h-[min(320px,55vh)] w-full object-cover"
                />
                <span className="pointer-events-none absolute inset-0 grid place-items-center">
                  <span className="rounded-full bg-black/55 p-2 text-white">
                    <Play className="h-6 w-6" fill="currentColor" />
                  </span>
                </span>
              </>
            ) : display ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={display}
                alt=""
                className="max-h-[min(320px,55vh)] w-full object-cover"
                loading="lazy"
              />
            ) : resolving ? (
              <p className="px-4 py-8 text-center text-[13px] text-neutral-400">Loading…</p>
            ) : (
              <p className="px-4 py-8 text-center text-[13px] text-neutral-200">Shared post</p>
            )}
          </div>

          {sharedCaption ? (
            <div className="px-3 py-2.5 text-[13px] leading-snug text-neutral-800 dark:text-neutral-200">
              <span className="font-semibold text-neutral-950 dark:text-white">{uname}</span>{" "}
              <span className="text-neutral-700 dark:text-neutral-300">
                {sharedCaption.length > 140 ? `${sharedCaption.slice(0, 137)}…` : sharedCaption}
              </span>
            </div>
          ) : null}
        </div>
      );

      if (href) {
        return (
          <Link href={href} className="inline-block">
            {card}
          </Link>
        );
      }
      return card;
    }
    return (
      <div className="max-w-[min(280px,85vw)] rounded-2xl border border-neutral-200/90 bg-white px-4 py-2.5 text-[14.5px] text-neutral-900 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:text-white">
        {caption || "Shared a post"}
      </div>
    );
  }

  if (type === "image" || type === "story_reply") {
    if (!mediaKey?.trim()) {
      if (caption?.trim()) {
        return (
          <div
            className={`rounded-3xl px-4 py-2 text-[14.5px] leading-snug ${
              fromMe
                ? "bg-vibo-primary text-white"
                : "bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100"
            } max-w-[min(280px,85vw)]`}
          >
            {caption}
          </div>
        );
      }
      if (type === "story_reply") {
        return (
          <div className={`rounded-3xl px-4 py-2 text-[14.5px] ${bubbleBase}`}>
            Story reply
          </div>
        );
      }
      return null;
    }
    if (!src && !loadFailed) {
      return (
        <div className={`px-4 py-3 text-[13px] opacity-70 ${bubbleBase}`}>Loading…</div>
      );
    }
    if (!src) {
      return (
        <div className={`px-4 py-3 text-[13px] ${bubbleBase}`}>Could not load image</div>
      );
    }
    return (
      <div className={bubbleBase}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className="block max-h-[360px] w-full object-cover"
          loading="lazy"
          onError={() => setLoadFailed(true)}
        />
        {caption ? (
          <p className={`px-3 py-2 text-[14px] ${fromMe ? "text-white/95" : ""}`}>{caption}</p>
        ) : null}
      </div>
    );
  }

  if (type === "video") {
    if (!mediaKey?.trim()) {
      return caption ? (
        <div
          className={`rounded-3xl px-4 py-2 text-[14.5px] leading-snug ${
            fromMe
              ? "bg-vibo-primary text-white"
              : "bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100"
          } max-w-[min(280px,85vw)]`}
        >
          {caption}
        </div>
      ) : null;
    }
    if (!src && !loadFailed) {
      return (
        <div className={`px-4 py-3 text-[13px] opacity-70 ${bubbleBase}`}>Loading…</div>
      );
    }
    if (!src) {
      return (
        <div className={`px-4 py-3 text-[13px] ${bubbleBase}`}>Could not load video</div>
      );
    }
    return (
      <div className={bubbleBase}>
        <video
          src={src}
          poster={poster || undefined}
          controls
          playsInline
          className="max-h-[360px] w-full bg-black object-contain"
        />
        {caption ? (
          <p className={`px-3 py-2 text-[14px] ${fromMe ? "text-white/95" : ""}`}>{caption}</p>
        ) : null}
      </div>
    );
  }

  if (type === "voice") {
    if (mediaKey?.trim()) {
      if (!src && !loadFailed) {
        return (
          <div className={`px-4 py-3 text-[13px] opacity-70 ${bubbleBase}`}>Loading…</div>
        );
      }
      if (!src) {
        return (
          <div className={`px-4 py-3 text-[13px] ${bubbleBase}`}>Could not load audio</div>
        );
      }
      return (
        <div className={bubbleBase}>
          <audio src={src} controls className="w-full min-w-[200px] max-w-[min(280px,85vw)] py-1" />
          {caption ? (
            <p className={`px-3 py-2 text-[13px] ${fromMe ? "text-white/95" : ""}`}>{caption}</p>
          ) : null}
        </div>
      );
    }
    return (
      <div className={`rounded-3xl px-4 py-2 text-[14.5px] ${bubbleBase}`}>
        {caption || "Voice message"}
      </div>
    );
  }

  if (type === "location") {
    return (
      <div className={`rounded-3xl px-4 py-2 text-[14.5px] ${bubbleBase}`}>
        {caption || "Location"}
      </div>
    );
  }

  /* text (default) */
  if (!caption) return null;
  return (
    <div
      className={`rounded-3xl px-4 py-2 text-[14.5px] leading-snug ${
        fromMe
          ? "bg-vibo-primary text-white"
          : "bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-neutral-100"
      } max-w-[min(280px,85vw)]`}
    >
      {caption}
    </div>
  );
}
