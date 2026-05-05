"use client";

import { useState, type ReactNode } from "react";
import {
  Bookmark,
  Grid3x3,
  PlaySquare,
  Repeat2,
  UserSquare2,
  type LucideIcon,
} from "@/components/ui/icons";

interface ProfileTabsPanels {
  posts?: ReactNode;
  videos?: ReactNode;
  reposts?: ReactNode;
  saved?: ReactNode;
  tagged?: ReactNode;
}

const TAB_DEFS: Array<{ id: keyof ProfileTabsPanels; icon: LucideIcon; label: string }> = [
  { id: "posts", icon: Grid3x3, label: "Posts" },
  { id: "videos", icon: PlaySquare, label: "Videos" },
  { id: "reposts", icon: Repeat2, label: "Reposts" },
  { id: "saved", icon: Bookmark, label: "Saved" },
  { id: "tagged", icon: UserSquare2, label: "Tagged" },
];

export function ProfileTabs({
  panels,
  isOwn,
  initial,
}: {
  panels: ProfileTabsPanels;
  /** When false (someone else's profile) we hide own-only tabs (saved). */
  isOwn?: boolean;
  initial?: keyof ProfileTabsPanels;
}) {
  const visibleTabs = TAB_DEFS.filter((t) => {
    if (t.id === "saved" && !isOwn) return false;
    return true;
  });

  const [active, setActive] = useState<keyof ProfileTabsPanels>(initial ?? visibleTabs[0]?.id);
  const activePanel = panels[active] ?? <Empty label={String(active)} />;

  const cols = visibleTabs.length;

  return (
    <section className="mt-6 border-t border-neutral-200 dark:border-neutral-900">
      <div
        className="grid text-center"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {visibleTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              aria-label={tab.label}
              className={`grid place-items-center py-3 transition-colors ${
                isActive
                  ? "border-t-2 border-neutral-900 text-neutral-900 dark:border-white dark:text-white"
                  : "border-t-2 border-transparent text-neutral-400 hover:text-neutral-700 dark:text-neutral-500 dark:hover:text-neutral-300"
              }`}
            >
              <Icon className="h-5 w-5" strokeWidth={isActive ? 2.2 : 1.8} />
            </button>
          );
        })}
      </div>
      <div className="mt-2">{activePanel}</div>
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="px-6 py-12 text-center text-sm text-neutral-500 dark:text-neutral-500">
      No {label} yet.
    </div>
  );
}

