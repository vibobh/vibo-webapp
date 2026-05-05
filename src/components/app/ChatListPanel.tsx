"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronDown, MoreHorizontal, Search, SquarePen } from "@/components/ui/icons";
import { useQuery } from "convex/react";

import { ResolvedProfileAvatar } from "@/components/messaging/ResolvedProfileAvatar";
import { useViboAuth } from "@/lib/auth/AuthProvider";
import { api } from "@convex_app/_generated/api";
import type { Id } from "@convex_app/_generated/dataModel";

interface ChatListPanelProps {
  /** Current authenticated user's display handle. */
  currentUsername?: string;
}

type Tab = "primary" | "general" | "requests";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "primary", label: "Primary" },
  { id: "general", label: "General" },
  { id: "requests", label: "Requests" },
];

interface PeerLite {
  id: Id<"users">;
  username?: string;
  fullName?: string;
  profilePictureUrl?: string;
  profilePictureKey?: string;
  profilePictureStorageRegion?: string;
  verificationTier?: "blue" | "gold" | "gray";
}

interface ConversationListItem {
  id: Id<"conversations">;
  peer: PeerLite | null;
  /** Group DM title from Convex when `isGroup` is true. */
  groupTitle?: string;
  isGroup?: boolean;
  lastMessage?: string;
  lastMessageAt?: number;
  lastSenderId?: Id<"users"> | null;
  unread: boolean;
  isYouSentLast: boolean;
}

type ListConversationsResult = {
  items: Array<{
    conversationId: Id<"conversations">;
    isGroup: boolean;
    title: string;
    peers: Array<{
      _id: Id<"users">;
      username?: string;
      fullName?: string;
      profilePictureUrl?: string;
      profilePictureKey?: string;
      profilePictureStorageRegion?: string;
    }>;
    unreadCount?: number;
    lastMessagePreview?: string;
    lastMessageAt?: number;
  }>;
  nextCursor?: number | null;
};

function mapConversationRow(row: ListConversationsResult["items"][number]): ConversationListItem {
  const first = row.peers[0];
  return {
    id: row.conversationId,
    isGroup: row.isGroup,
    groupTitle: row.isGroup ? row.title : undefined,
    peer: first
      ? {
          id: first._id,
          username: first.username,
          fullName: first.fullName,
          profilePictureUrl: first.profilePictureUrl,
          profilePictureKey: first.profilePictureKey,
          profilePictureStorageRegion: first.profilePictureStorageRegion,
        }
      : null,
    lastMessage: row.lastMessagePreview,
    lastMessageAt: row.lastMessageAt,
    lastSenderId: null,
    unread: (row.unreadCount ?? 0) > 0,
    isYouSentLast: false,
  };
}

/** Compact pre-formatted "time ago" string used by the chat list. */
function timeAgoShort(ms?: number): string {
  if (!ms) return "";
  const diff = Math.max(0, Date.now() - ms);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo`;
  return `${Math.floor(d / 365)}y`;
}

export function ChatListPanel({ currentUsername }: ChatListPanelProps) {
  const { user } = useViboAuth();
  const [tab, setTab] = useState<Tab>("primary");
  const [query, setQuery] = useState("");

  const params = useParams<{ conversationId?: string }>();
  const activeId = params?.conversationId;

  /** `messages:listConversations` only supports folders `primary` | `general` (see convex_app/messages.ts). */
  const listQueryEnabled = Boolean(user?.id) && tab !== "requests";
  const folder = tab === "general" ? ("general" as const) : ("primary" as const);
  const qTrim = query.trim();

  const listResult = useQuery(
    api.messages.listConversations,
    listQueryEnabled
      ? {
          viewerId: user!.id as Id<"users">,
          folder,
          limit: 30,
          ...(qTrim ? { q: qTrim } : {}),
        }
      : "skip",
  ) as ListConversationsResult | undefined;

  const conversationsRaw = useMemo((): ConversationListItem[] | undefined => {
    if (tab === "requests") return [];
    if (!listQueryEnabled) return [];
    if (listResult === undefined) return undefined;
    const items = listResult.items ?? [];
    return items.map(mapConversationRow);
  }, [tab, listQueryEnabled, listResult]);

  const filtered = useMemo(() => {
    const list = conversationsRaw ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => {
      const handle = c.peer?.username?.toLowerCase() ?? "";
      const name = c.peer?.fullName?.toLowerCase() ?? "";
      const group = c.groupTitle?.toLowerCase() ?? "";
      const last = c.lastMessage?.toLowerCase() ?? "";
      return (
        handle.includes(q) ||
        name.includes(q) ||
        group.includes(q) ||
        last.includes(q)
      );
    });
  }, [conversationsRaw, query]);

  const listLoading = listQueryEnabled && listResult === undefined;

  return (
    <div className="flex h-full w-full flex-col bg-white dark:bg-black">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-6 py-5">
        <button
          type="button"
          className="flex min-w-0 items-center gap-1.5 text-[18px] font-bold tracking-tight text-neutral-900 dark:text-white"
        >
          <span className="truncate">{currentUsername ?? "Direct"}</span>
          <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2.4} />
        </button>
        <button
          type="button"
          aria-label="New message"
          className="grid h-9 w-9 place-items-center rounded-full text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-900"
        >
          <SquarePen className="h-5 w-5" strokeWidth={1.9} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-2 dark:border-neutral-900">
        {TABS.map((t) => {
          const active = t.id === tab;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className="relative flex-1 px-3 py-2 text-center text-[14px] font-semibold transition-colors"
            >
              <span
                className={
                  active
                    ? "text-neutral-900 dark:text-white"
                    : "text-neutral-500 dark:text-neutral-400"
                }
              >
                {t.label}
              </span>
              {active ? (
                <span className="absolute -bottom-px left-3 right-3 h-[2px] rounded-full bg-neutral-900 dark:bg-white" />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="px-6 pb-2 pt-3">
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400 dark:text-neutral-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="h-9 w-full rounded-full border-0 bg-neutral-100 ps-9 pe-4 text-[14px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200 dark:bg-neutral-900 dark:text-white dark:placeholder:text-neutral-500 dark:focus:ring-neutral-800"
          />
        </div>
      </div>

      {/* Section header */}
      <div className="flex items-center justify-between px-6 pb-1 pt-3">
        <h3 className="text-[15px] font-semibold text-neutral-900 dark:text-white">
          {tab === "requests" ? "Requests" : "Messages"}
        </h3>
        <button
          type="button"
          className="text-[12px] font-semibold text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
        >
          Requests
        </button>
      </div>

      {/* Conversations list */}
      <ul className="flex-1 overflow-y-auto pb-2">
        {listLoading ? (
          <li className="px-6 py-10 text-center text-[14px] text-neutral-500 dark:text-neutral-400">
            Loading…
          </li>
        ) : filtered.length === 0 ? (
          <li className="px-6 py-10 text-center text-[14px] text-neutral-500 dark:text-neutral-400">
            {tab === "requests"
              ? "No message requests right now."
              : query
                ? `No conversations match "${query}".`
                : "No messages yet. Search someone and say hi."}
          </li>
        ) : (
          filtered.map((c) => {
            const active = activeId === String(c.id);
            const handle = c.peer?.username ?? "vibo";
            const name =
              c.isGroup && c.groupTitle
                ? c.groupTitle
                : (c.peer?.fullName ?? handle);
            const initial = (c.isGroup && c.groupTitle
              ? c.groupTitle
              : name
            ).charAt(0);
            return (
              <li key={String(c.id)}>
                <Link
                  href={`/messages/${c.id}`}
                  className={`group flex items-center gap-3 px-6 py-3 transition-colors ${
                    active
                      ? "bg-neutral-100 dark:bg-neutral-900"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-900/60"
                  }`}
                >
                  <span className="relative h-14 w-14 shrink-0">
                    <ResolvedProfileAvatar
                      profilePictureUrl={c.peer?.profilePictureUrl}
                      profilePictureKey={c.peer?.profilePictureKey}
                      profilePictureStorageRegion={c.peer?.profilePictureStorageRegion}
                      initial={initial}
                      size={56}
                    />
                    {c.unread ? (
                      <span className="absolute right-0 top-0 h-3.5 w-3.5 rounded-full bg-vibo-primary ring-2 ring-white dark:ring-black" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium text-neutral-900 dark:text-white">
                      {name}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 truncate text-[13px] text-neutral-500 dark:text-neutral-400">
                      <span className="truncate">
                        {c.isYouSentLast ? "You: " : ""}
                        {c.lastMessage ?? "Say hi"}
                      </span>
                      {c.lastMessageAt ? (
                        <>
                          <span aria-hidden>·</span>
                          <span className="shrink-0" suppressHydrationWarning>
                            {timeAgoShort(c.lastMessageAt)}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label="Conversation actions"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-400 opacity-0 hover:bg-neutral-200 hover:text-neutral-700 group-hover:opacity-100 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}

