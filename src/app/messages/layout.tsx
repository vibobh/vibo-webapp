"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useViboAuth } from "@/lib/auth/AuthProvider";
import { AppShell } from "@/components/app/AppShell";
import { ChatListPanel } from "@/components/app/ChatListPanel";

export default function MessagesLayout({ children }: { children: ReactNode }) {
  const { user } = useViboAuth();
  const pathname = usePathname() ?? "";
  const isThread = /^\/messages\/[^/]+/.test(pathname);

  return (
    <AppShell flush hideBottomBar>
      <div className="flex h-screen w-full">
        {/* Chat list — full-width on mobile when on /messages, hidden on a thread.
            On md+ always visible at 400px. */}
        <aside
          className={`h-full w-full shrink-0 border-e border-neutral-200 dark:border-neutral-900 md:w-[400px] ${
            isThread ? "hidden md:flex" : "flex"
          } flex-col`}
        >
          <ChatListPanel currentUsername={user?.username} />
        </aside>

        {/* Right panel: empty state on /messages, conversation thread on /messages/[id].
            Hidden on mobile when on /messages so the chat list takes the full screen. */}
        <section
          className={`h-full min-w-0 flex-1 flex-col bg-white dark:bg-black ${
            isThread ? "flex" : "hidden md:flex"
          }`}
        >
          {/* Full width of the chat column — no side gutters from max-width */}
          <div className="flex h-full w-full min-w-0 flex-col">{children}</div>
        </section>
      </div>
    </AppShell>
  );
}
