"use client";

import { useState, useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { searchArticles, type HelpArticle } from "@/data/helpArticles";
import type { Lang } from "@/i18n";

interface HelpSearchBarProps {
  lang: Lang;
  placeholder: string;
  onSelectArticle: (article: HelpArticle) => void;
}

export default function HelpSearchBar({
  lang,
  placeholder,
  onSelectArticle,
}: HelpSearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HelpArticle[]>([]);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const r = searchArticles(query);
    setResults(r);
    setOpen(r.length > 0);
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isAr = lang === "ar";

  return (
    <div ref={containerRef} className="relative w-full max-w-xl mx-auto">
      <div className="flex items-center rounded-xl border border-neutral-200 bg-white shadow-sm focus-within:ring-2 focus-within:ring-vibo-primary/30 transition">
        <Search className="ml-4 mr-2 h-5 w-5 text-neutral-400 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          dir={isAr ? "rtl" : "ltr"}
          className="flex-1 py-3.5 pr-4 bg-transparent outline-none text-neutral-800 placeholder:text-neutral-400"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setResults([]);
              setOpen(false);
            }}
            className="mr-3 p-1 rounded-full hover:bg-neutral-100 transition"
          >
            <X className="h-4 w-4 text-neutral-400" />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-50 mt-2 w-full rounded-xl border border-neutral-200 bg-white shadow-lg overflow-hidden">
          <ul className="max-h-72 overflow-y-auto divide-y divide-neutral-100">
            {results.map((article) => (
              <li key={article.id}>
                <button
                  onClick={() => {
                    onSelectArticle(article);
                    setQuery("");
                    setOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-neutral-50 transition"
                  dir={isAr ? "rtl" : "ltr"}
                >
                  <p className="text-sm font-medium text-neutral-800">
                    {isAr ? article.titleAr : article.title}
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">
                    {isAr ? article.bodyAr : article.body}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
