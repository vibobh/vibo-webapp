"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BellRing,
  Compass,
  Film,
  Home,
  ImagePlus,
  MessageCircleMore,
  PlusSquare,
  Search,
  Settings,
  Sparkles,
  UserRound,
  type LucideIcon,
} from "@/components/ui/icons";

import { useViboAuth } from "@/lib/auth/AuthProvider";
import { SearchPanel } from "@/components/app/SearchPanel";
import { CreatePostDialog } from "@/components/app/CreatePostDialog";
import { api } from "@convex_app/_generated/api";
import type { Id } from "@convex_app/_generated/dataModel";
import { readStoredLang } from "@/i18n/useViboLang";
import { ResolvedProfileAvatar } from "@/components/messaging/ResolvedProfileAvatar";

interface AppShellProps {
  /** Page content. Should NOT include its own background/scaffold. */
  children: ReactNode;
  /** Optional right-rail (only rendered at lg+ when provided). */
  rightRail?: ReactNode;
  /** Hide the bottom mobile nav on full-screen pages (e.g. message thread). */
  hideBottomBar?: boolean;
  /** Inner max-width of the main column. Defaults to 935px (Instagram-style). */
  maxWidth?: string;
  /**
   * Render `children` flush against the sidebar (no padding, no max-width).
   * Used by full-screen experiences such as /messages.
   */
  flush?: boolean;
}

type PrimaryNavItem =
  | { kind: "link"; href: string; label: string; icon: LucideIcon }
  | { kind: "search"; label: string; icon: LucideIcon }
  | { kind: "create"; label: string; icon: LucideIcon };

const PRIMARY_NAV: Array<PrimaryNavItem> = [
  { kind: "link", href: "/", label: "Home", icon: Home },
  { kind: "search", label: "Search", icon: Search },
  { kind: "link", href: "/explore", label: "Explore", icon: Compass },
  { kind: "link", href: "/videos", label: "Videos", icon: Film },
  { kind: "link", href: "/messages", label: "Messages", icon: MessageCircleMore },
  { kind: "link", href: "/activity", label: "Activity", icon: BellRing },
  { kind: "create", label: "Create", icon: PlusSquare },
];

const BOTTOM_NAV: Array<{
  href: string;
  icon: LucideIcon;
  ariaLabel: string;
}> = [
  { href: "/", icon: Home, ariaLabel: "Home" },
  { href: "/search", icon: Search, ariaLabel: "Search" },
  { href: "/videos", icon: Film, ariaLabel: "Videos" },
];

/**
 * Reusable per-row classes. We rely on:
 *  - `group/sidebar` on the <aside> so labels can fade in on hover/focus.
 *  - Sidebar `overflow-x-hidden` clips the labels when collapsed (76px) so
 *    only the icon (positioned at px-4) is visible.
 */
const ROW_BASE =
  "flex h-14 items-center gap-4 rounded-2xl px-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-vibo-primary";

const ROW_ACTIVE =
  "bg-neutral-100 text-neutral-900 dark:bg-neutral-900 dark:text-white";

const ROW_INACTIVE =
  "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-900/70 dark:hover:text-white";

const LABEL_BASE =
  "whitespace-nowrap text-[16px] opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100 group-focus-within/sidebar:opacity-100";

export function AppShell({
  children,
  rightRail,
  hideBottomBar,
  maxWidth,
  flush,
}: AppShellProps) {
  const { user, isLoading } = useViboAuth();
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  const [searchOpen, setSearchOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createPostOpen, setCreatePostOpen] = useState(false);
  const [storyToast, setStoryToast] = useState(false);
  const createBtnRef = useRef<HTMLButtonElement | null>(null);
  const createMenuRef = useRef<HTMLDivElement | null>(null);

  const meProfile = useQuery(
    api.users.getById,
    user ? { id: user.id as Id<"users"> } : "skip",
  );
  const viewerProfile =
    meProfile &&
    typeof meProfile === "object" &&
    (!("restricted" in meProfile) ||
      (meProfile as { restricted?: boolean }).restricted !== true) &&
    "_id" in meProfile
      ? (meProfile as {
          username?: string;
          fullName?: string;
          profilePictureUrl?: string;
          profilePictureKey?: string;
          profilePictureStorageRegion?: string;
        })
      : null;

  const [shellLang, setShellLang] = useState<"en" | "ar">("en");
  useEffect(() => {
    const stored = readStoredLang();
    if (stored === "ar" || stored === "en") setShellLang(stored);
    else if (typeof document !== "undefined" && document.documentElement.lang === "ar") setShellLang("ar");
  }, []);
  const isAr = shellLang === "ar";
  const tt = isAr ? { post: "منشور", story: "قصة", storySoon: "ستتوفر القصص قريبًا" } : { post: "Post", story: "Story", storySoon: "Stories are coming soon" };

  // Close the search panel whenever the route changes (e.g. user clicks a nav item).
  useEffect(() => {
    setSearchOpen(false);
    setCreateMenuOpen(false);
  }, [pathname]);

  // Click outside / Escape closes the create menu.
  useEffect(() => {
    if (!createMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCreateMenuOpen(false);
    };
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        createMenuRef.current &&
        !createMenuRef.current.contains(t) &&
        createBtnRef.current &&
        !createBtnRef.current.contains(t)
      ) {
        setCreateMenuOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDoc);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDoc);
    };
  }, [createMenuOpen]);

  // Auto-hide story toast.
  useEffect(() => {
    if (!storyToast) return;
    const timer = window.setTimeout(() => setStoryToast(false), 2400);
    return () => window.clearTimeout(timer);
  }, [storyToast]);

  // Esc closes the panel.
  useEffect(() => {
    if (!searchOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchOpen]);

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace("/login");
    }
  }, [isLoading, user, router]);

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  // Canonical own-profile URL. Falls back to /profile (which redirects) until
  // the session has loaded.
  const profileHref = user?.username ? `/${user.username}` : "/profile";
  const isProfileActive = pathname === profileHref || pathname === "/profile";
  const isSettingsActive = isActive("/settings");

  const profileInitial =
    (user?.username ?? viewerProfile?.username ?? "U").trim().charAt(0) || "U";

  return (
    <div className="min-h-screen w-full bg-white text-neutral-900 dark:bg-black dark:text-neutral-100">
      {/* Sidebar — fixed, icon-only by default (76px), expands to 245px on hover.
          When the search panel is open we LOCK the sidebar to icon-only mode and
          disable hover-expansion so the layout matches Instagram. */}
      <aside
        className={`group/sidebar fixed start-0 top-0 z-40 hidden h-screen w-[76px] flex-col overflow-x-hidden overflow-y-auto bg-white transition-[width] duration-300 ease-out md:flex dark:bg-black ${
          searchOpen
            ? ""
            : "hover:w-[245px] hover:shadow-[0_0_40px_rgba(0,0,0,0.08)] focus-within:w-[245px] dark:hover:shadow-[0_0_40px_rgba(0,0,0,0.5)]"
        }`}
        aria-label="Primary navigation"
      >
        {/* Logo — V mark only, no text label, no background. Same h-9 w-9
            footprint as every other icon so the column reads as one stack. */}
        <Link
          href="/"
          onClick={() => setSearchOpen(false)}
          aria-label="Vibo home"
          className="mx-2 mb-2 mt-4 flex h-14 items-center px-3 outline-none focus-visible:ring-2 focus-visible:ring-vibo-primary"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/vibo-v-mark.png"
            alt="Vibo"
            width={36}
            height={36}
            draggable={false}
            className="h-9 w-9 shrink-0 select-none object-contain"
          />
        </Link>

        {/* All nav rows in ONE flex column with justify-evenly so every row
            (primary + profile + settings) gets the exact same vertical
            spacing — no special tighter gap at the bottom group. */}
        <nav className="flex flex-1 flex-col justify-evenly px-2 pb-2">
          {PRIMARY_NAV.map((item) => {
            const Icon = item.icon;
            if (item.kind === "search") {
              const active = searchOpen;
              return (
                <button
                  key="search"
                  type="button"
                  onClick={() => setSearchOpen((v) => !v)}
                  title={item.label}
                  aria-current={active ? "true" : undefined}
                  aria-pressed={active}
                  className={`${ROW_BASE} w-full text-start ${active ? ROW_ACTIVE : ROW_INACTIVE}`}
                >
                  <Icon className="h-9 w-9 shrink-0" strokeWidth={active ? 2.4 : 1.9} />
                  <span className={`${LABEL_BASE} ${active ? "font-semibold" : "font-medium"}`}>
                    {item.label}
                  </span>
                </button>
              );
            }
            if (item.kind === "create") {
              const active = createMenuOpen || createPostOpen;
              return (
                <div key="create" className="relative">
                  <button
                    ref={createBtnRef}
                    type="button"
                    onClick={() => {
                      setSearchOpen(false);
                      setCreateMenuOpen((v) => !v);
                    }}
                    title={item.label}
                    aria-haspopup="menu"
                    aria-expanded={createMenuOpen}
                    className={`${ROW_BASE} w-full text-start ${active ? ROW_ACTIVE : ROW_INACTIVE}`}
                  >
                    <Icon className="h-9 w-9 shrink-0" strokeWidth={active ? 2.4 : 1.9} />
                    <span className={`${LABEL_BASE} ${active ? "font-semibold" : "font-medium"}`}>
                      {item.label}
                    </span>
                  </button>
                  {createMenuOpen ? (
                    <div
                      ref={createMenuRef}
                      role="menu"
                      className="absolute start-[72px] top-1/2 z-50 w-44 -translate-y-1/2 overflow-hidden rounded-2xl bg-white p-1 shadow-2xl ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setCreateMenuOpen(false);
                          setCreatePostOpen(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-[14px] font-medium text-neutral-900 hover:bg-neutral-100 dark:text-white dark:hover:bg-neutral-800"
                      >
                        <ImagePlus className="h-5 w-5" />
                        {tt.post}
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setCreateMenuOpen(false);
                          setStoryToast(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-start text-[14px] font-medium text-neutral-900 hover:bg-neutral-100 dark:text-white dark:hover:bg-neutral-800"
                      >
                        <Sparkles className="h-5 w-5" />
                        {tt.story}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            }
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSearchOpen(false)}
                title={item.label}
                aria-current={active ? "page" : undefined}
                className={`${ROW_BASE} ${active ? ROW_ACTIVE : ROW_INACTIVE}`}
              >
                <Icon className="h-9 w-9 shrink-0" strokeWidth={active ? 2.4 : 1.9} />
                <span className={`${LABEL_BASE} ${active ? "font-semibold" : "font-medium"}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}

          <Link
            href={profileHref}
            onClick={() => setSearchOpen(false)}
            title="Profile"
            aria-current={isProfileActive ? "page" : undefined}
            className={`${ROW_BASE} ${isProfileActive ? ROW_ACTIVE : ROW_INACTIVE}`}
          >
            {user ? (
              <ResolvedProfileAvatar
                profilePictureUrl={viewerProfile?.profilePictureUrl}
                profilePictureKey={viewerProfile?.profilePictureKey}
                profilePictureStorageRegion={viewerProfile?.profilePictureStorageRegion}
                initial={profileInitial}
                size={36}
                className="ring-1 ring-black/5 dark:ring-white/10"
              />
            ) : (
              <UserRound className="h-9 w-9 shrink-0" strokeWidth={isProfileActive ? 2.4 : 1.9} />
            )}
            <span className={`${LABEL_BASE} ${isProfileActive ? "font-semibold" : "font-medium"}`}>
              Profile
            </span>
          </Link>

          <Link
            href="/settings"
            onClick={() => setSearchOpen(false)}
            title="Settings"
            aria-current={isSettingsActive ? "page" : undefined}
            className={`${ROW_BASE} ${isSettingsActive ? ROW_ACTIVE : ROW_INACTIVE}`}
          >
            <Settings className="h-9 w-9 shrink-0" strokeWidth={isSettingsActive ? 2.4 : 1.9} />
            <span className={`${LABEL_BASE} ${isSettingsActive ? "font-semibold" : "font-medium"}`}>
              Settings
            </span>
          </Link>
        </nav>
      </aside>

      {/* Slide-out search panel anchored to the right edge of the sidebar. */}
      <SearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} />

      {/* Create post popup */}
      <CreatePostDialog
        open={createPostOpen}
        onClose={() => setCreatePostOpen(false)}
        viewer={{
          username: viewerProfile?.username ?? user?.username,
          fullName: viewerProfile?.fullName,
          profilePictureUrl: viewerProfile?.profilePictureUrl,
          profilePictureKey: viewerProfile?.profilePictureKey,
          profilePictureStorageRegion: viewerProfile?.profilePictureStorageRegion,
        }}
      />

      {/* Story coming-soon toast */}
      {storyToast ? (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-[140] -translate-x-1/2 rounded-full bg-neutral-900/90 px-4 py-2 text-[13px] font-medium text-white shadow-xl backdrop-blur dark:bg-white/15">
          {tt.storySoon}
        </div>
      ) : null}

      {/* Main content area + optional right rail. The fixed sidebar reserves
          76px on md+ via padding-inline-start. */}
      <div className="flex min-h-screen w-full md:ps-[76px]">
        <main className="flex min-h-screen min-w-0 flex-1 flex-col bg-white dark:bg-black">
          {flush ? (
            children
          ) : (
            <div
              className={`mx-auto w-full px-4 pt-4 sm:px-6 ${maxWidth ?? "max-w-[1100px]"} ${
                hideBottomBar ? "pb-4" : "pb-24"
              } md:pb-10`}
            >
              {children}
            </div>
          )}
        </main>

        {rightRail ? (
          <aside className="sticky top-0 hidden h-screen w-[320px] shrink-0 bg-white px-5 py-6 lg:block dark:bg-black">
            {rightRail}
          </aside>
        ) : null}
      </div>

      {/* Bottom nav — mobile only */}
      {hideBottomBar ? null : (
        <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-around bg-white/95 px-2 py-2 backdrop-blur md:hidden dark:bg-black/95">
          {BOTTOM_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.ariaLabel}
                className={`grid h-10 w-12 place-items-center rounded-xl transition-colors ${
                  active
                    ? "text-neutral-900 dark:text-white"
                    : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                }`}
              >
                <Icon className="h-6 w-6" strokeWidth={active ? 2.2 : 1.7} />
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setCreatePostOpen(true)}
            aria-label="Create"
            className="grid h-10 w-12 place-items-center rounded-xl text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            <PlusSquare className="h-6 w-6" strokeWidth={1.9} />
          </button>
          <Link
            href={profileHref}
            aria-label="Profile"
            className={`grid h-10 w-12 place-items-center rounded-xl ${
              isProfileActive
                ? "text-neutral-900 dark:text-white"
                : "text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            }`}
          >
            {user ? (
              <ResolvedProfileAvatar
                profilePictureUrl={viewerProfile?.profilePictureUrl}
                profilePictureKey={viewerProfile?.profilePictureKey}
                profilePictureStorageRegion={viewerProfile?.profilePictureStorageRegion}
                initial={profileInitial}
                size={28}
                className="ring-1 ring-black/10 dark:ring-white/15"
              />
            ) : (
              <span className="grid h-7 w-7 place-items-center rounded-full bg-vibo-primary text-[11px] font-bold uppercase text-white">
                V
              </span>
            )}
          </Link>
        </nav>
      )}
    </div>
  );
}

