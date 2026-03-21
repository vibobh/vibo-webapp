"use client";

import type { NewsTag } from "@/types/news";

type LayoutMode = "grid" | "list";

type Props = {
  tag: NewsTag;
  onTagChange: (t: NewsTag) => void;
  layout: LayoutMode;
  onLayoutChange: (l: LayoutMode) => void;
  labels: Record<NewsTag, string>;
  ariaGrid: string;
  ariaList: string;
};

const TAGS: NewsTag[] = [
  "all",
  "community",
  "company",
  "news",
  "product",
  "safety",
];

export default function NewsroomFilters({
  tag,
  onTagChange,
  layout,
  onLayoutChange,
  labels,
  ariaGrid,
  ariaList,
}: Props) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-4 mb-8">
      <div className="flex flex-wrap items-center gap-2">
        {TAGS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => onTagChange(t)}
            className={`rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium transition-colors ${
              tag === t
                ? "border border-vibo-primary/40 bg-vibo-primary/5 text-vibo-primary"
                : "border border-transparent text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            {labels[t]}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 self-end sm:self-auto">
        <button
          type="button"
          aria-label={ariaGrid}
          onClick={() => onLayoutChange("grid")}
          className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
            layout === "grid"
              ? "border-vibo-primary/40 bg-vibo-primary/5 text-vibo-primary"
              : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
          }`}
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zM3 14h7v7H3v-7zm11 0h7v7h-7v-7z" />
          </svg>
        </button>
        <button
          type="button"
          aria-label={ariaList}
          onClick={() => onLayoutChange("list")}
          className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
            layout === "list"
              ? "border-vibo-primary/40 bg-vibo-primary/5 text-vibo-primary"
              : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
          }`}
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
