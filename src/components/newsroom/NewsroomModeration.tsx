"use client";

import { useCallback, useEffect, useState } from "react";
import { parseApiJson } from "@/lib/parseApiJson";
import { getTranslations, type Lang } from "@/i18n";
import type { NewsModerationItem, NewsTag } from "@/types/news";
import NewsImageFallback from "./NewsImageFallback";

const TAGS: NewsTag[] = ["all", "community", "company", "news", "product", "safety"];

function formatDate(ts: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(new Date(ts));
  } catch {
    return ts;
  }
}

export default function NewsroomModeration({ lang }: { lang: Lang }) {
  const t = getTranslations(lang);
  const nm = t.newsroomManagement;

  const locale = lang === "ar" ? "ar" : "en";
  const filterLabels: Record<NewsTag, string> = {
    all: t.newsroom.filters.all,
    community: t.newsroom.filters.community,
    company: t.newsroom.filters.company,
    news: t.newsroom.filters.news,
    product: t.newsroom.filters.product,
    safety: t.newsroom.filters.safety,
  };

  const [loggedIn, setLoggedIn] = useState(false);
  const [tag, setTag] = useState<NewsTag>("all");
  const [drafts, setDrafts] = useState<NewsModerationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingLatest, setFetchingLatest] = useState(false);
  const [creating, setCreating] = useState(false);
  const [didInitialFetch, setDidInitialFetch] = useState(false);
  const [manualTitle, setManualTitle] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualSource, setManualSource] = useState("Vibo");
  const [manualUrl, setManualUrl] = useState("");
  const [manualImageUrl, setManualImageUrl] = useState("");
  const [manualPublishedAt, setManualPublishedAt] = useState("");

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/news/drafts?tag=${encodeURIComponent(tag)}`, {
        credentials: "include",
      });
      const j = await parseApiJson<{
        items?: NewsModerationItem[];
        error?: string;
      }>(r);
      if (!r.ok) throw new Error(j.error ?? nm.loading);
      setDrafts(j.items ?? []);
    } catch {
      setDrafts([]);
    } finally {
      setLoading(false);
    }
  }, [nm.loading, tag]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await fetch("/api/blog/me", { credentials: "include" });
      if (cancelled) return;
      try {
        const j = (await r.json()) as { ok: boolean };
        setLoggedIn(!!j.ok);
      } catch {
        setLoggedIn(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchLatest = useCallback(async () => {
    setFetchingLatest(true);
    try {
      const r = await fetch("/api/news/drafts/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tag }),
      });
      const j = await parseApiJson<{
        ok?: boolean;
        count?: number;
        error?: string;
      }>(r);
      if (!r.ok) throw new Error(j.error ?? "Failed to fetch");
      await loadDrafts();
    } catch {
      // leave drafts as-is
    } finally {
      setFetchingLatest(false);
    }
  }, [loadDrafts, tag]);

  useEffect(() => {
    if (!loggedIn) return;
    if (!didInitialFetch) {
      // First time: fetch latest drafts so the editor immediately sees “new news to review”.
      fetchLatest().finally(() => setDidInitialFetch(true));
      return;
    }

    // Subsequent tag changes: keep it lightweight and just load existing drafts.
    loadDrafts();
  }, [didInitialFetch, fetchLatest, loggedIn, loadDrafts, tag]);

  const approve = useCallback(
    async (id: string) => {
      const r = await fetch("/api/news/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      });
      const j = await parseApiJson<{ ok?: boolean; error?: string }>(r);
      if (!r.ok) throw new Error(j.error ?? "Failed");
      await loadDrafts();
    },
    [loadDrafts],
  );

  const reject = useCallback(
    async (id: string) => {
      const r = await fetch("/api/news/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      });
      const j = await parseApiJson<{ ok?: boolean; error?: string }>(r);
      if (!r.ok) throw new Error(j.error ?? "Failed");
      await loadDrafts();
    },
    [loadDrafts],
  );

  const createManual = useCallback(async () => {
    setCreating(true);
    try {
      const r = await fetch("/api/news/drafts/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tag,
          title: manualTitle,
          description: manualDescription,
          sourceName: manualSource,
          url: manualUrl,
          urlToImage: manualImageUrl,
          publishedAt: manualPublishedAt,
        }),
      });
      const j = await parseApiJson<{ ok?: boolean; error?: string }>(r);
      if (!r.ok) throw new Error(j.error ?? "Failed to create");
      setManualTitle("");
      setManualDescription("");
      setManualSource("Vibo");
      setManualUrl("");
      setManualImageUrl("");
      setManualPublishedAt("");
      await loadDrafts();
    } catch {
      // keep form values for quick edit/retry
    } finally {
      setCreating(false);
    }
  }, [
    loadDrafts,
    manualDescription,
    manualImageUrl,
    manualPublishedAt,
    manualSource,
    manualTitle,
    manualUrl,
    tag,
  ]);

  return (
    <section className="mt-10">
      <div className="flex items-start justify-between gap-6 mb-5">
        <div>
          <h2 className="text-[1.5rem] font-bold text-neutral-900 leading-tight">
            {nm.title}
          </h2>
          <p className="text-neutral-600 text-sm mt-1">{nm.subtitle}</p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={fetchLatest}
            disabled={!loggedIn || fetchingLatest}
            className="inline-flex items-center justify-center rounded-full bg-vibo-primary text-white px-5 py-2.5 text-sm font-medium hover:bg-vibo-primary-light disabled:opacity-50"
          >
            {fetchingLatest ? nm.loading : nm.fetchLatest}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-6">
        {TAGS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTag(t)}
            className={`rounded-full px-3.5 py-1.5 text-[0.8rem] font-medium transition-colors ${
              tag === t
                ? "border border-vibo-primary/40 bg-vibo-primary/5 text-vibo-primary"
                : "border border-transparent text-neutral-700 hover:bg-neutral-100"
            }`}
          >
            {filterLabels[t]}
          </button>
        ))}
      </div>

      <div className="bg-white border border-neutral-200 rounded-2xl p-4 mb-6">
        <h3 className="text-[1rem] font-semibold text-neutral-900 mb-3">{nm.createNews}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">{nm.formTitle}</span>
            <input
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              className="rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">{nm.formSource}</span>
            <input
              value={manualSource}
              onChange={(e) => setManualSource(e.target.value)}
              className="rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-xs text-neutral-500">{nm.formDescription}</span>
            <textarea
              value={manualDescription}
              onChange={(e) => setManualDescription(e.target.value)}
              rows={3}
              className="rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 md:col-span-2">
            <span className="text-xs text-neutral-500">{nm.formUrl}</span>
            <input
              value={manualUrl}
              onChange={(e) => setManualUrl(e.target.value)}
              className="rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">{nm.formImageUrl}</span>
            <input
              value={manualImageUrl}
              onChange={(e) => setManualImageUrl(e.target.value)}
              className="rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-neutral-500">{nm.formPublishedAt}</span>
            <input
              type="datetime-local"
              value={manualPublishedAt}
              onChange={(e) => setManualPublishedAt(e.target.value)}
              className="rounded-xl border border-neutral-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={createManual}
            disabled={!loggedIn || creating}
            className="inline-flex items-center justify-center rounded-full bg-neutral-900 text-white px-5 py-2.5 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50"
          >
            {creating ? nm.creating : nm.formCreate}
          </button>
        </div>
      </div>

      {!loggedIn ? (
        <p className="text-neutral-500 text-sm">{nm.notAuthorized}</p>
      ) : loading ? (
        <p className="text-neutral-400 text-sm">{nm.loading}</p>
      ) : drafts.length === 0 ? (
        <p className="text-neutral-500 text-sm max-w-lg">{nm.empty}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {drafts.map((d) => (
            <div
              key={d._id}
              className="bg-white border border-neutral-200 rounded-2xl p-4"
            >
              <div className="flex gap-4 items-stretch">
                <div className="w-[120px] flex-shrink-0 rounded-xl overflow-hidden bg-neutral-100 ring-1 ring-neutral-100">
                  {d.urlToImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={d.urlToImage}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <NewsImageFallback
                      className="h-full w-full p-3"
                      logoClassName="max-h-[55%] max-w-[55%] min-h-[36px]"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="text-[0.75rem] text-neutral-400 mb-2">
                    {formatDate(d.publishedAt, locale)} <span className="mx-1.5">•</span>{" "}
                    {d.sourceName}
                  </p>
                  <h3 className="text-[1.05rem] font-bold text-neutral-900 leading-tight mb-1">
                    {d.title}
                  </h3>
                  <p className="text-[0.95rem] text-neutral-600 leading-relaxed line-clamp-3">
                    {d.description}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => approve(d._id)}
                      className="inline-flex items-center justify-center rounded-full bg-emerald-600 text-white px-4 py-2 text-sm font-medium hover:bg-emerald-700"
                    >
                      {nm.approve}
                    </button>
                    <button
                      type="button"
                      onClick={() => reject(d._id)}
                      className="inline-flex items-center justify-center rounded-full bg-red-600 text-white px-4 py-2 text-sm font-medium hover:bg-red-700"
                    >
                      {nm.reject}
                    </button>
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`inline-flex items-center justify-center rounded-full border border-neutral-200 text-neutral-700 px-4 py-2 text-sm font-medium hover:border-vibo-primary/40 hover:text-vibo-primary`}
                    >
                      Open link
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

