"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "@/components/ui/icons";
import { useMutation, useQuery } from "convex/react";

import { ResolvedProfileAvatar } from "@/components/messaging/ResolvedProfileAvatar";
import { api } from "@convex_app/_generated/api";
import type { Id } from "@convex_app/_generated/dataModel";

function shareSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  const k = "vibo_share_session";
  let s = sessionStorage.getItem(k);
  if (!s) {
    s = crypto.randomUUID();
    sessionStorage.setItem(k, s);
  }
  return s;
}

type ShareTarget = {
  _id: Id<"users">;
  username?: string;
  fullName?: string;
  profilePictureUrl?: string;
  profilePictureKey?: string;
  existingConversationId?: Id<"conversations">;
};

export function SharePostSheet({
  open,
  onClose,
  postId,
  viewerId,
}: {
  open: boolean;
  onClose: () => void;
  postId: Id<"posts">;
  viewerId: Id<"users">;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const targets = useQuery(
    api.messages.listShareTargets,
    open ? { viewerId, limit: 40, ...(q.trim() ? { q: q.trim() } : {}) } : "skip",
  ) as { items?: ShareTarget[] } | undefined;

  const items = useMemo(() => targets?.items ?? [], [targets]);

  const createDm = useMutation(api.messages.createOrGetDirectConversation);
  const sendMessage = useMutation(api.messages.sendMessage);
  const recordShare = useMutation(api.productAnalytics.recordSharePost);

  const sendToUser = useCallback(
    async (row: ShareTarget) => {
      setError(null);
      setBusyId(String(row._id));
      try {
        let conversationId = row.existingConversationId;
        if (!conversationId) {
          const r = await createDm({ viewerId, peerUserId: row._id });
          conversationId = r.conversationId;
        }
        await sendMessage({
          viewerId,
          conversationId,
          type: "post_share",
          postId,
        });
        await recordShare({
          postId,
          sessionId: shareSessionId(),
          method: "dm",
          userId: viewerId,
        });
        onClose();
        router.push(`/messages/${conversationId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not send");
      } finally {
        setBusyId(null);
      }
    },
    [createDm, sendMessage, recordShare, viewerId, postId, onClose, router],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Share post"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl dark:rounded-2xl dark:bg-neutral-950 sm:max-h-[80vh]">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <p className="text-[16px] font-semibold text-neutral-900 dark:text-white">Share to…</p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="border-b border-neutral-100 px-3 py-2 dark:border-neutral-900">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search people…"
              className="h-10 w-full rounded-full border-0 bg-neutral-100 py-2 pl-9 pr-3 text-[14px] text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-neutral-200 dark:bg-neutral-900 dark:text-white dark:focus:ring-neutral-800"
            />
          </div>
        </div>
        {error ? (
          <p className="px-4 py-2 text-center text-[13px] text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        <ul className="min-h-0 flex-1 overflow-y-auto py-1">
          {targets === undefined ? (
            <li className="px-4 py-8 text-center text-[13px] text-neutral-500">Loading…</li>
          ) : items.length === 0 ? (
            <li className="px-4 py-8 text-center text-[13px] text-neutral-500">No one found.</li>
          ) : (
            items.map((row) => {
              const name = row.fullName ?? row.username ?? "User";
              const initial = name.charAt(0);
              const loading = busyId === String(row._id);
              return (
                <li key={String(row._id)}>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void sendToUser(row)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50 disabled:opacity-50 dark:hover:bg-neutral-900/80"
                  >
                    <ResolvedProfileAvatar
                      profilePictureUrl={row.profilePictureUrl}
                      profilePictureKey={row.profilePictureKey}
                      initial={initial}
                      size={44}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-neutral-900 dark:text-white">
                        {row.username ?? name}
                      </span>
                      {row.fullName && row.username ? (
                        <span className="block truncate text-[12px] text-neutral-500 dark:text-neutral-400">
                          {row.fullName}
                        </span>
                      ) : null}
                    </span>
                    {loading ? (
                      <span className="text-[12px] font-medium text-vibo-primary">Sending…</span>
                    ) : (
                      <span className="text-[12px] font-semibold text-vibo-primary">Send</span>
                    )}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

