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
          className="relative rounded-2xl border-2 border-vibo-gold/70 bg-white shadow-sm focus-within:border-vibo-primary focus-within:ring-2 focus-within:ring-vibo-primary/15 transition-all"
        >
          <div className="flex items-start gap-2 pl-3 pr-2 pt-3 pb-8 sm:pl-4">
            <div
              className="mt-0.5 shrink-0 flex items-center gap-1 text-vibo-primary"
              aria-hidden
            >
              <Sparkles className="h-4 w-4 text-vibo-gold shrink-0" />
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
                className="shrink-0 p-2 rounded-full hover:bg-vibo-rose/80 text-neutral-500"
                aria-label="Clear"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
          <div className="absolute bottom-2 right-3 text-[11px] tabular-nums text-neutral-500">
            {query.length}/{MAX_LEN}
          </div>
        </div>

        <p className="text-[13px] leading-snug text-neutral-700 px-0.5">
          {copy.disclaimerBefore}
          <a
            href={copy.disclaimerLinkHref}
            className="text-vibo-primary hover:text-vibo-primary-light font-medium underline-offset-2 hover:underline"
          >
            {copy.disclaimerLink}
          </a>
        </p>

        <div className="flex flex-wrap gap-2 justify-center pt-1 border-t border-vibo-gold/25">
          {copy.chips.map((chip, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                setQuery(chip.slice(0, MAX_LEN));
                void runAsk(chip.slice(0, MAX_LEN));
              }}
              className="text-left rounded-full border border-vibo-gold/35 bg-vibo-cream/90 hover:bg-vibo-rose/90 hover:border-vibo-primary/25 text-vibo-primary text-[13px] px-3.5 py-2 transition-colors max-w-full"
            >
              <span className="line-clamp-2">{chip}</span>
            </button>
          ))}
        </div>
      </form>

      {(loading || answer) && (
        <div className="rounded-2xl border border-vibo-gold/40 bg-white shadow-md overflow-hidden text-left">
          <div className="px-4 sm:px-5 pt-4 pb-2 flex items-center gap-2 border-b border-vibo-gold/25 bg-gradient-to-r from-vibo-rose/40 to-white">
            <Sparkles className="h-4 w-4 text-vibo-gold shrink-0" aria-hidden />
            <span className="font-semibold text-vibo-primary">{copy.answerTitle}</span>
          </div>
          <div className="px-4 sm:px-5 py-4">
            {loading ? (
              <div className="flex items-center gap-2 text-vibo-primary/80 py-4">
                <Loader2 className="h-5 w-5 animate-spin shrink-0 text-vibo-primary" />
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
                    className="p-2 rounded-full text-vibo-gold hover:text-vibo-primary hover:bg-vibo-rose/60"
                    aria-label="Helpful"
                  >
                    <ThumbsUp className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    className="p-2 rounded-full text-vibo-gold hover:text-vibo-primary hover:bg-vibo-rose/60"
                    aria-label="Not helpful"
                  >
                    <ThumbsDown className="h-5 w-5" />
                  </button>
                </div>

                {topSources.length > 0 && (
                  <div className="mt-4 border-t border-vibo-gold/20 pt-3">
                    <button
                      type="button"
                      onClick={() => setSourcesOpen((o) => !o)}
                      className="flex items-center gap-1 text-sm font-medium text-vibo-primary w-full"
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
                              className="text-vibo-primary hover:text-vibo-primary-light underline-offset-2 hover:underline"
                            >
                              {isAr ? a.titleAr : a.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                <p className="text-[11px] text-neutral-600 mt-4 pt-3 border-t border-vibo-gold/20">
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
