"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "@/components/ui/icons";
import { useMutation, useQuery } from "convex/react";

import { ResolvedProfileAvatar } from "@/components/messaging/ResolvedProfileAvatar";
import { api } from "@convex_app/_generated/api";
import type { Id } from "@convex_app/_generated/dataModel";

type ShareTarget = {
  _id: Id<"users">;
  username?: string;
  fullName?: string;
  profilePictureUrl?: string;
  profilePictureKey?: string;
  existingConversationId?: Id<"conversations">;
};

export function ForwardMessageSheet({
  open,
  onClose,
  viewerId,
  sourceConversationId,
  messageId,
}: {
  open: boolean;
  onClose: () => void;
  viewerId: Id<"users">;
  sourceConversationId: Id<"conversations">;
  messageId: Id<"messages">;
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
  const forwardMessage = useMutation(api.messages.forwardMessage);

  const sendToUser = useCallback(
    async (row: ShareTarget) => {
      setError(null);
      setBusyId(String(row._id));
      try {
        let targetConversationId = row.existingConversationId;
        if (!targetConversationId) {
          const r = await createDm({ viewerId, peerUserId: row._id });
          targetConversationId = r.conversationId;
        }
        await forwardMessage({
          viewerId,
          sourceConversationId,
          targetConversationId,
          messageId,
        });
        onClose();
        router.push(`/messages/${targetConversationId}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not forward");
      } finally {
        setBusyId(null);
      }
    },
    [
      createDm,
      forwardMessage,
      viewerId,
      sourceConversationId,
      messageId,
      onClose,
      router,
    ],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end justify-center bg-black/50 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Forward message"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-t-2xl bg-white shadow-2xl dark:rounded-2xl dark:bg-neutral-950 sm:max-h-[80vh]">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <p className="text-[16px] font-semibold text-neutral-900 dark:text-white">
            Forward to…
          </p>
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
              placeholder="Search"
              className="h-10 w-full rounded-full border border-neutral-200 bg-neutral-50 pl-9 pr-3 text-[14px] outline-none focus:border-vibo-primary dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto py-2">
          {items.length === 0 ? (
            <p className="px-4 py-8 text-center text-[14px] text-neutral-500 dark:text-neutral-400">
              No people found.
            </p>
          ) : (
            <ul className="divide-y divide-neutral-100 dark:divide-neutral-900">
              {items.map((row) => (
                <li key={String(row._id)}>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void sendToUser(row)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-50 disabled:opacity-50 dark:hover:bg-neutral-900"
                  >
                    <ResolvedProfileAvatar
                      profilePictureUrl={row.profilePictureUrl}
                      profilePictureKey={row.profilePictureKey}
                      initial={(row.username ?? row.fullName ?? "U").charAt(0)}
                      size={44}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-neutral-900 dark:text-white">
                        {row.fullName || row.username || "User"}
                      </span>
                      {row.username ? (
                        <span className="block truncate text-[13px] text-neutral-500 dark:text-neutral-400">
                          @{row.username}
                        </span>
                      ) : null}
                    </span>
                    {busyId === String(row._id) ? (
                      <span className="text-[13px] text-neutral-500">…</span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error ? (
          <p className="border-t border-neutral-100 px-4 py-2 text-[13px] text-red-600 dark:border-neutral-900 dark:text-red-400">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
