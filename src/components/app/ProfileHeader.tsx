"use client";

import Link from "next/link";
import { Camera, Plus, ShieldCheck, Users } from "@/components/ui/icons";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useAction } from "convex/react";

import { api } from "@convex_app/_generated/api";
import { readStoredLang } from "@/i18n/useViboLang";

export interface ProfileHeaderUser {
  id: string;
  username?: string;
  fullName?: string;
  bio?: string;
  bioLink?: string;
  profilePictureUrl?: string;
  profilePictureKey?: string;
  profilePictureStorageRegion?: string;
  bannerUrl?: string;
  bannerKey?: string;
  bannerStorageRegion?: string;
  verificationTier?: "blue" | "gold" | "gray";
  followerCount?: number;
  followingCount?: number;
  postCount?: number;
}

interface ProfileHeaderProps {
  user: ProfileHeaderUser;
  /** Action buttons row (Edit profile + Share, or Follow + Message). */
  actions: ReactNode;
  /** Optional override of the count card. */
  isOwn?: boolean;
  onOpenFollowers?: () => void;
  onOpenFollowing?: () => void;
}

function compact(n?: number): string {
  if (!n) return "0";
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

function Stat({
  label,
  value,
  href,
  onClick,
}: {
  label: string;
  value: string;
  href?: string;
  onClick?: () => void;
}) {
  const inner = (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="font-semibold text-neutral-900 dark:text-white">{value}</span>
      <span className="text-neutral-500 dark:text-neutral-400">{label}</span>
    </div>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="hover:opacity-80">
        {inner}
      </button>
    );
  }
  return href ? (
    <Link href={href} className="hover:opacity-80">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function ProfileHeader({
  user,
  actions,
  isOwn,
  onOpenFollowers,
  onOpenFollowing,
}: ProfileHeaderProps) {
  const [lang, setLang] = useState<"en" | "ar">("en");
  const getPublicMediaUrl = useAction(api.media.getPublicMediaUrl);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [bannerFailed, setBannerFailed] = useState(false);
  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState<string | undefined>(
    user.profilePictureUrl,
  );
  const [resolvedBannerUrl, setResolvedBannerUrl] = useState<string | undefined>(
    user.bannerUrl,
  );

  useEffect(() => {
    const stored = readStoredLang();
    if (stored === "ar" || stored === "en") setLang(stored);
    else if (typeof document !== "undefined" && document.documentElement.lang === "ar") setLang("ar");
  }, []);

  const isAr = lang === "ar";
  const t = {
    addAnother: isAr ? "إضافة رابط آخر" : "Add another",
    posts: isAr ? "منشورات" : "Posts",
    followers: isAr ? "متابعون" : "Followers",
    following: isAr ? "يتابع" : "Following",
  };

  useEffect(() => {
    setResolvedAvatarUrl(user.profilePictureUrl);
    setAvatarFailed(false);
  }, [user.profilePictureUrl]);

  useEffect(() => {
    setResolvedBannerUrl(user.bannerUrl);
    setBannerFailed(false);
  }, [user.bannerUrl]);

  useEffect(() => {
    if (resolvedAvatarUrl || !user.profilePictureKey) return;
    let cancelled = false;
    void getPublicMediaUrl({
      key: user.profilePictureKey,
      storageRegion: user.profilePictureStorageRegion,
    })
      .then((r) => {
        if (!cancelled && r?.url) setResolvedAvatarUrl(r.url);
      })
      .catch(() => {
        /* keep fallback avatar */
      });
    return () => {
      cancelled = true;
    };
  }, [
    resolvedAvatarUrl,
    user.profilePictureKey,
    user.profilePictureStorageRegion,
    getPublicMediaUrl,
  ]);

  useEffect(() => {
    if (resolvedBannerUrl || !user.bannerKey) return;
    let cancelled = false;
    void getPublicMediaUrl({
      key: user.bannerKey,
      storageRegion: user.bannerStorageRegion,
    })
      .then((r) => {
        if (!cancelled && r?.url) setResolvedBannerUrl(r.url);
      })
      .catch(() => {
        /* keep fallback banner */
      });
    return () => {
      cancelled = true;
    };
  }, [
    resolvedBannerUrl,
    user.bannerKey,
    user.bannerStorageRegion,
    getPublicMediaUrl,
  ]);
  const displayName = user.fullName || user.username || "Vibo";
  const handle = user.username ? `@${user.username}` : "";
  const links: string[] = [];
  if (user.bioLink) {
    try {
      const u = new URL(user.bioLink.startsWith("http") ? user.bioLink : `https://${user.bioLink}`);
      links.push(u.host.replace(/^www\./, "") + (u.pathname !== "/" ? u.pathname : ""));
    } catch {
      links.push(user.bioLink);
    }
  }

  return (
    <section>
      {/* Banner */}
      <div className="relative -mx-4 h-[180px] overflow-hidden bg-vibo-primary md:rounded-3xl">
        {resolvedBannerUrl && !bannerFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={resolvedBannerUrl}
            alt=""
            className="h-full w-full object-cover"
            onError={() => setBannerFailed(true)}
          />
        ) : (
          <div className="grid h-full w-full place-items-center bg-gradient-to-br from-vibo-primary via-[#3a0211] to-black">
            <span className="text-[44px] font-bold tracking-tight text-white/90 drop-shadow">
              Vibo
            </span>
          </div>
        )}
      </div>

      {/* Avatar + name */}
      <div className="relative -mt-12 flex flex-col gap-4">
        <div className="flex items-end gap-3 px-1">
          <div className="relative">
            <div className="grid h-24 w-24 place-items-center rounded-full bg-vibo-primary ring-4 ring-white dark:ring-black">
              {resolvedAvatarUrl && !avatarFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={resolvedAvatarUrl}
                  alt={user.username ?? user.fullName ?? "Profile"}
                  className="h-full w-full rounded-full object-cover"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <span className="text-[28px] font-bold uppercase text-white">
                  {(user.username ?? user.fullName ?? "V").charAt(0)}
                </span>
              )}
            </div>
            {isOwn ? (
              <Link
                href="/profile/edit-profile"
                aria-label="Add to story"
                className="absolute -bottom-1 right-1 grid h-7 w-7 place-items-center rounded-full bg-neutral-100 ring-2 ring-white hover:bg-neutral-200 dark:bg-neutral-900 dark:ring-black dark:hover:bg-neutral-800"
              >
                <Plus className="h-4 w-4 text-neutral-900 dark:text-white" strokeWidth={2.4} />
              </Link>
            ) : null}
          </div>
        </div>

        <div className="px-1">
          <div className="flex items-center gap-1.5">
            <h1 className="truncate text-[22px] font-bold tracking-tight text-neutral-900 dark:text-white">
              {displayName}
            </h1>
            {user.verificationTier ? (
              <ShieldCheck className="h-5 w-5 text-vibo-primary" strokeWidth={2.2} />
            ) : null}
          </div>
          {handle ? (
            <p className="mt-0.5 text-[14px] text-neutral-500 dark:text-neutral-400">{handle}</p>
          ) : null}

          {user.bio ? (
            <p className="mt-3 whitespace-pre-line text-[14.5px] leading-relaxed text-neutral-800 dark:text-neutral-200">
              {user.bio}
            </p>
          ) : null}

          {links.length > 0 || isOwn ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {links.map((l) => (
                <span
                  key={l}
                  className="inline-flex items-center gap-1.5 rounded-full bg-neutral-100 px-3 py-1.5 text-[12.5px] font-medium text-neutral-800 ring-1 ring-neutral-200 dark:bg-neutral-900 dark:text-neutral-200 dark:ring-neutral-800"
                >
                  <span className="text-vibo-primary">🔗</span>
                  {l}
                </span>
              ))}
              {isOwn ? (
                <Link
                  href="/profile/edit-profile"
                  className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12.5px] font-medium text-vibo-primary ring-1 ring-vibo-primary/40 hover:bg-vibo-primary/10"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t.addAnother}
                </Link>
              ) : null}
            </div>
          ) : null}

          {/* Stats */}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5">
            <Stat label={t.posts} value={compact(user.postCount)} />
            <span className="text-neutral-300 dark:text-neutral-700">·</span>
            <Stat
              label={t.followers}
              value={compact(user.followerCount)}
              onClick={onOpenFollowers}
            />
            <span className="text-neutral-300 dark:text-neutral-700">·</span>
            <Stat
              label={t.following}
              value={compact(user.followingCount)}
              onClick={onOpenFollowing}
            />
          </div>

          <div className="mt-5">{actions}</div>
        </div>
      </div>
    </section>
  );
}

export function EditProfileButton() {
  return (
    <Link
      href="/profile/edit-profile"
      className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-neutral-100 px-5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-200 dark:bg-neutral-900 dark:text-white dark:ring-neutral-800 dark:hover:bg-neutral-800"
    >
      Edit profile
    </Link>
  );
}

export function ShareProfileButton({ userId }: { userId: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        const url = `${window.location.origin}/${userId}`;
        if (navigator.share) {
          void navigator.share({ url, title: "Vibo profile" });
        } else {
          void navigator.clipboard?.writeText(url);
        }
      }}
      className="inline-flex h-11 flex-1 items-center justify-center rounded-full bg-neutral-100 px-5 text-sm font-semibold text-neutral-900 ring-1 ring-neutral-200 transition-colors hover:bg-neutral-200 dark:bg-neutral-900 dark:text-white dark:ring-neutral-800 dark:hover:bg-neutral-800"
    >
      Share profile
    </button>
  );
}

export function CameraButton() {
  return (
    <Link
      href="/story-camera"
      aria-label="Open camera"
      className="grid h-10 w-10 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white"
    >
      <Camera className="h-5 w-5" />
    </Link>
  );
}

export function FollowersInlineLink({ userId }: { userId: string }) {
  return (
    <Link
      href={`/connections?userId=${userId}`}
      className="inline-flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
    >
      <Users className="h-3.5 w-3.5" />
      Connections
    </Link>
  );
}

