"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";

import { api } from "@convex_app/_generated/api";

export interface ResolvedProfileAvatarProps {
  profilePictureUrl?: string;
  profilePictureKey?: string;
  profilePictureStorageRegion?: string;
  /** Single letter or short fallback when no image. */
  initial: string;
  size: number;
  className?: string;
}

/**
 * Avatar that uses `profilePictureUrl` when present, otherwise resolves
 * `profilePictureKey` via `media:getPublicMediaUrl` (convex_app pattern).
 */
export function ResolvedProfileAvatar({
  profilePictureUrl,
  profilePictureKey,
  profilePictureStorageRegion,
  initial,
  size,
  className = "",
}: ResolvedProfileAvatarProps) {
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
        /* keep initial */
      });
    return () => {
      cancelled = true;
    };
  }, [url, profilePictureKey, profilePictureStorageRegion, getPublicMediaUrl]);

  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 rounded-full object-cover ${className}`}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.38) }}
      className={`grid shrink-0 place-items-center rounded-full bg-vibo-primary font-bold uppercase text-white ${className}`}
    >
      {initial.charAt(0).toUpperCase()}
    </span>
  );
}
