"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ShieldCheck, X } from "@/components/ui/icons";
import { useQuery } from "convex/react";

import { api } from "@convex_app/_generated/api";
import type { Id } from "@convex_app/_generated/dataModel";
import { useViboAuth } from "@/lib/auth/AuthProvider";
import { ResolvedProfileAvatar } from "@/components/messaging/ResolvedProfileAvatar";
import { readStoredLang } from "@/i18n/useViboLang";

interface SearchPanelProps {
  open: boolean;
  onClose: () => void;
}

interface UserCard {
  id?: Id<"users">;
  _id?: Id<"users">;
  username?: string;
  fullName?: string;
  profilePictureUrl?: string;
  profilePictureKey?: string;
  profilePictureStorageRegion?: string;
  verificationTier?: "blue" | "gold" | "gray";
  followerCount?: number;
}

const RECENT_KEY = "vibo:recentSearches";
const MAX_RECENTS = 8;

function compactCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000)
    return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

function loadRecents(): UserCard[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UserCard[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENTS) : [];
  } catch {
    return [];
  }
}

function saveRecents(list: UserCard[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, MAX_RECENTS)));
  } catch {
    // localStorage may be unavailable (private mode); ignore.
  }
}

export function SearchPanel({ open, onClose }: SearchPanelProps) {
  const { user } = useViboAuth();
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [recents, setRecents] = useState<UserCard[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Hydrate recents from localStorage once on mount.
  useEffect(() => {
    setRecents(loadRecents());
    const stored = readStoredLang();
    if (stored === "ar" || stored === "en") setLang(stored);
    else if (typeof document !== "undefined" && document.documentElement.lang === "ar") setLang("ar");
  }, []);

  const isAr = lang === "ar";
  const t = {
    searchTitle: isAr ? "بحث" : "Search",
    searchPlaceholder: isAr ? "ابحث" : "Search",
    searching: isAr ? "جارٍ البحث…" : "Searching…",
    noResults: isAr ? "لا توجد نتائج لـ" : "No results for",
    recent: isAr ? "عمليات البحث الأخيرة" : "Recent",
    suggested: isAr ? "مقترح" : "Suggested",
    clearAll: isAr ? "مسح الكل" : "Clear all",
    noRecent: isAr ? "لا توجد عمليات بحث حديثة." : "No recent searches.",
    followers: isAr ? "متابع" : "followers",
    removeRecent: isAr ? "إزالة" : "Remove",
  };

  // Focus input when opened.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 220);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Debounce the query a touch so we don't fire a fetch on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 220);
    return () => clearTimeout(t);
  }, [query]);

  const searchResults = useQuery(
    api.users.searchUsers,
    debounced && user?.id
      ? {
          query: debounced,
          limit: 12,
          viewerUserId: user.id as Id<"users">,
        }
      : debounced
        ? { query: debounced, limit: 12 }
        : "skip",
  ) as UserCard[] | undefined;

  const fallback = useQuery(
    api.users.getSuggestedUsers,
    !debounced && user ? { viewerUserId: user.id as Id<"users">, limit: 8 } : "skip",
  ) as UserCard[] | undefined;

  const filtered = useMemo((): UserCard[] | undefined => {
    if (!debounced) return undefined;
    if (searchResults === undefined) return undefined;
    return searchResults.map((r) => {
      const u = r as UserCard;
      return { ...u, id: u.id ?? u._id };
    });
  }, [debounced, searchResults]);

  const normalizedFallback = useMemo((): UserCard[] => {
    if (!fallback) return [];
    return fallback.map((r) => {
      const u = r as UserCard;
      return { ...u, id: u.id ?? u._id };
    });
  }, [fallback]);

  const removeRecent = (id: string) => {
    setRecents((rs) => {
      const next = rs.filter((r) => String(r.id ?? r._id ?? "") !== id);
      saveRecents(next);
      return next;
    });
  };

  const clearAll = () => {
    setRecents([]);
    saveRecents([]);
  };

  const recordRecent = (u: UserCard) => {
    const uid = String(u.id ?? u._id ?? "");
    if (!uid) return;
    const normalized: UserCard = { ...u, id: u.id ?? u._id };
    setRecents((rs) => {
      const next = [
        normalized,
        ...rs.filter((r) => String(r.id ?? r._id ?? "") !== uid),
      ].slice(0, MAX_RECENTS);
      saveRecents(next);
      return next;
    });
  };

  const recentList = recents.length > 0 ? recents : normalizedFallback;

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close search"
          onClick={onClose}
          className="fixed inset-0 z-20 cursor-default md:left-[76px]"
          tabIndex={-1}
        />
      ) : null}

      <aside
        aria-hidden={!open}
        className={`fixed inset-y-0 left-0 z-30 hidden w-[400px] transform overflow-hidden rounded-r-[18px] border-r border-neutral-200 bg-white shadow-[8px_0_28px_rgba(0,0,0,0.06)] transition-transform duration-300 ease-out md:block dark:border-neutral-900 dark:bg-black dark:shadow-[8px_0_28px_rgba(0,0,0,0.5)] ${
          open ? "translate-x-[76px]" : "-translate-x-full pointer-events-none"
        }`}
      >
        <div className="flex h-full flex-col">
          <div className="px-6 pb-4 pt-7">
            <h2 className="text-[24px] font-bold tracking-tight text-neutral-900 dark:text-white">
              {t.searchTitle}
            </h2>
          </div>

          <div className="px-6">
            <div className="relative">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className="h-10 w-full rounded-lg border-0 bg-neutral-100 px-4 pr-9 text-[14px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-500 dark:focus:ring-neutral-800"
              />
              {query.length > 0 ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-neutral-300 text-white hover:bg-neutral-400 dark:bg-neutral-700 dark:hover:bg-neutral-600"
                >
                  <X className="h-3 w-3" strokeWidth={2.5} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="mt-6 h-px w-full bg-neutral-200 dark:bg-neutral-900" />

          <div className="flex-1 overflow-y-auto">
            {debounced ? (
              filtered === undefined ? (
                <div className="px-6 py-10 text-center text-[14px] text-neutral-500 dark:text-neutral-400">
                  {t.searching}
                </div>
              ) : filtered.length === 0 ? (
                <div className="px-6 py-10 text-center text-[14px] text-neutral-500 dark:text-neutral-400">
                  {t.noResults} &ldquo;{debounced}&rdquo;
                </div>
              ) : (
                <ul className="px-2 py-2">
                  {filtered.map((c) => (
                    <li key={String(c.id ?? c._id ?? "")}>
                      <Link
                        href={`/${c.username ?? ""}`}
                        onClick={() => {
                          recordRecent(c);
                          onClose();
                        }}
                        className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                      >
                        <UserAvatar user={c} />
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1 truncate text-[14px] font-semibold text-neutral-900 dark:text-white">
                            <span className="truncate">{c.username ?? "vibo"}</span>
                            {c.verificationTier ? (
                              <ShieldCheck
                                className="h-3.5 w-3.5 shrink-0 text-vibo-primary"
                                strokeWidth={2.4}
                              />
                            ) : null}
                          </p>
                          <p className="truncate text-[13px] text-neutral-500 dark:text-neutral-400">
                            {c.fullName ?? ""}
                            {typeof c.followerCount === "number"
                              ? ` • ${compactCount(c.followerCount)} ${t.followers}`
                              : ""}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <>
                <div className="flex items-center justify-between px-6 pt-4">
                  <h3 className="text-[15px] font-semibold text-neutral-900 dark:text-white">
                    {recents.length > 0 ? t.recent : t.suggested}
                  </h3>
                  {recents.length > 0 ? (
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-[12px] font-semibold text-vibo-primary hover:opacity-80"
                    >
                      {t.clearAll}
                    </button>
                  ) : null}
                </div>

                {recentList.length === 0 ? (
                  <div className="px-6 py-10 text-center text-[14px] text-neutral-500 dark:text-neutral-400">
                    {t.noRecent}
                  </div>
                ) : (
                  <ul className="px-2 py-2">
                    {recentList.map((r) => (
                      <li
                        key={String(r.id ?? r._id ?? "")}
                        className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-neutral-100 dark:hover:bg-neutral-900"
                      >
                        <Link
                          href={`/${r.username ?? ""}`}
                          onClick={() => {
                            recordRecent(r);
                            onClose();
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3 px-1 py-1"
                        >
                          <UserAvatar user={r} />
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1 truncate text-[14px] font-semibold text-neutral-900 dark:text-white">
                              <span className="truncate">{r.username ?? "vibo"}</span>
                              {r.verificationTier ? (
                                <ShieldCheck
                                  className="h-3.5 w-3.5 shrink-0 text-vibo-primary"
                                  strokeWidth={2.4}
                                />
                              ) : null}
                            </p>
                            <p className="truncate text-[13px] text-neutral-500 dark:text-neutral-400">
                              {r.fullName ?? ""}
                              {typeof r.followerCount === "number"
                                ? ` • ${compactCount(r.followerCount)} ${t.followers}`
                                : ""}
                            </p>
                          </div>
                        </Link>
                        {recents.some(
                          (x) =>
                            String(x.id ?? x._id ?? "") === String(r.id ?? r._id ?? ""),
                        ) ? (
                          <button
                            type="button"
                            onClick={() => removeRecent(String(r.id ?? r._id ?? ""))}
                            aria-label={`${t.removeRecent} ${r.username ?? "user"}`}
                            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-neutral-500 hover:bg-neutral-200 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function UserAvatar({ user }: { user: UserCard }) {
  return (
    <ResolvedProfileAvatar
      profilePictureUrl={user.profilePictureUrl}
      profilePictureKey={user.profilePictureKey}
      profilePictureStorageRegion={user.profilePictureStorageRegion}
      initial={(user.username ?? user.fullName ?? "V").charAt(0)}
      size={44}
    />
  );
}

