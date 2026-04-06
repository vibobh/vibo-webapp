"use client";

import { useState, useCallback, useRef, type FormEvent } from "react";
import {
  ChevronDown,
  Loader2,
  Search,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Lang } from "@/i18n";
import { searchArticles } from "@/data/helpArticles";
import Link from "next/link";

const MAX_LEN = 90;

export type HelpAiSearchCopy = {
  placeholder: string;
  disclaimerBefore: string;
  disclaimerLink: string;
  disclaimerLinkHref: string;
  chips: string[];
  answerTitle: string;
  answerFooter: string;
  sourcesTitle: string;
  loading: string;
  error: string;
};

type Props = {
  lang: Lang;
  copy: HelpAiSearchCopy;
  /** Base path for article links, e.g. "/help" */
  helpBasePath: string;
};

export default function HelpAiSearch({ lang, copy, helpBasePath }: Props) {
  const [query, setQuery] = useState("");
  const [lastQuery, setLastQuery] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const inFlight = useRef(false);
  const askHelp = useAction(api.helpChat.askHelpQuestion);

  const isAr = lang === "ar";
  const base = helpBasePath.replace(/\/$/, "");

  const runAsk = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q || inFlight.current) return;
      inFlight.current = true;
      setLoading(true);
      setAnswer(null);
      setLastQuery(q);
      try {
        const res = await askHelp({
          messages: [{ role: "user", content: q }],
        });
        setAnswer(res.reply);
      } catch {
        setAnswer(copy.error);
      } finally {
        setLoading(false);
        inFlight.current = false;
      }
    },
    [askHelp, copy.error],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runAsk(query.slice(0, MAX_LEN));
  };

  const articleHits =
    lastQuery.trim().length >= 2 ? searchArticles(lastQuery) : [];
  const topSources = articleHits.slice(0, 5);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4" dir={isAr ? "rtl" : "ltr"}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div
          className="relative rounded-2xl border-[3px] border-[#f5e000] bg-white shadow-sm focus-within:border-[#e6d200] transition-colors"
        >
          <div className="flex items-start gap-2 pl-3 pr-2 pt-3 pb-8 sm:pl-4">
            <div
              className="mt-0.5 shrink-0 flex items-center gap-0.5 text-neutral-900"
              aria-hidden
            >
              <Sparkles className="h-4 w-4 text-amber-500 shrink-0" />
              <Search className="h-7 w-7 stroke-[2] shrink-0" />
            </div>
            <input
              type="text"
              value={query}
              maxLength={MAX_LEN}
              onChange={(e) => setQuery(e.target.value.slice(0, MAX_LEN))}
              placeholder={copy.placeholder}
              className="flex-1 min-w-0 bg-transparent border-0 py-1 text-[15px] text-neutral-900 placeholder:text-neutral-400 outline-none"
              autoComplete="off"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setLastQuery("");
                  setAnswer(null);
                }}
                className="shrink-0 p-2 rounded-full hover:bg-neutral-100 text-neutral-400"
                aria-label="Clear"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="absolute bottom-2 right-3 text-[11px] tabular-nums text-neutral-400">
            {query.length}/{MAX_LEN}
          </div>
        </div>

        <p className="text-[13px] leading-snug text-neutral-700 px-0.5">
          {copy.disclaimerBefore}
          <a
            href={copy.disclaimerLinkHref}
            className="text-blue-600 hover:underline font-medium"
          >
            {copy.disclaimerLink}
          </a>
        </p>

        <div className="flex flex-wrap gap-2 pt-1 border-t border-neutral-200/80">
          {copy.chips.map((chip, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setQuery(chip.slice(0, MAX_LEN));
                void runAsk(chip.slice(0, MAX_LEN));
              }}
              className="text-left rounded-full bg-neutral-100 hover:bg-neutral-200/90 text-neutral-900 text-[13px] px-3.5 py-2 transition-colors max-w-full"
            >
              <span className="line-clamp-2">{chip}</span>
            </button>
          ))}
        </div>
      </form>

      {(loading || answer) && (
        <div className="rounded-2xl border border-neutral-200/90 bg-white shadow-md overflow-hidden text-left">
          <div className="px-4 sm:px-5 pt-4 pb-2 flex items-center gap-2 border-b border-neutral-100">
            <Sparkles className="h-4 w-4 text-amber-500 shrink-0" aria-hidden />
            <span className="font-semibold text-neutral-900">{copy.answerTitle}</span>
          </div>
          <div className="px-4 sm:px-5 py-4">
            {loading ? (
              <div className="flex items-center gap-2 text-neutral-500 py-4">
                <Loader2 className="h-5 w-5 animate-spin shrink-0" />
                <span>{copy.loading}</span>
              </div>
            ) : (
              <>
                <p className="text-[15px] leading-relaxed text-neutral-800 whitespace-pre-wrap">
                  {answer}
                </p>
                <div className="flex justify-center gap-6 mt-5 pt-2">
                  <button
                    type="button"
                    className="p-2 rounded-full text-neutral-300 hover:text-neutral-500 hover:bg-neutral-50"
                    aria-label="Helpful"
                  >
                    <ThumbsUp className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    className="p-2 rounded-full text-neutral-300 hover:text-neutral-500 hover:bg-neutral-50"
                    aria-label="Not helpful"
                  >
                    <ThumbsDown className="h-5 w-5" />
                  </button>
                </div>

                {topSources.length > 0 && (
                  <div className="mt-4 border-t border-neutral-100 pt-3">
                    <button
                      type="button"
                      onClick={() => setSourcesOpen((o) => !o)}
                      className="flex items-center gap-1 text-sm font-medium text-neutral-800 w-full"
                    >
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 transition-transform ${sourcesOpen ? "rotate-180" : ""}`}
                      />
                      {copy.sourcesTitle}
                    </button>
                    {sourcesOpen && (
                      <ul className="mt-2 space-y-1.5 text-sm">
                        {topSources.map((a) => (
                          <li key={a.id}>
                            <Link
                              href={`${base}/${a.category}/${a.id}`}
                              className="text-blue-600 hover:underline"
                            >
                              {isAr ? a.titleAr : a.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <p className="text-[11px] text-neutral-500 mt-4 pt-3 border-t border-neutral-100">
                  {copy.answerFooter}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
