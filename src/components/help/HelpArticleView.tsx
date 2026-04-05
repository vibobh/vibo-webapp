"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import type { HelpArticle, HelpCategory } from "@/data/helpArticles";
import type { Lang } from "@/i18n";

interface HelpArticleViewProps {
  article: HelpArticle;
  category: HelpCategory;
  lang: Lang;
  onBack: () => void;
}

function renderBody(raw: string) {
  const paragraphs = raw.split(/\n\n+/);
  return paragraphs.map((p, i) => {
    const lines = p.split("\n");
    const isNumberedList = lines.every((l) => /^\d+\.\s/.test(l.trim()));
    const isBulletList = lines.every((l) => /^[-*]\s/.test(l.trim()));

    if (isNumberedList) {
      return (
        <ol key={i} className="list-decimal pl-6 space-y-1 text-neutral-700">
          {lines.map((l, j) => (
            <li key={j}>{renderInline(l.replace(/^\d+\.\s*/, ""))}</li>
          ))}
        </ol>
      );
    }
    if (isBulletList) {
      return (
        <ul key={i} className="list-disc pl-6 space-y-1 text-neutral-700">
          {lines.map((l, j) => (
            <li key={j}>{renderInline(l.replace(/^[-*]\s*/, ""))}</li>
          ))}
        </ul>
      );
    }
    return (
      <p key={i} className="text-neutral-700 leading-relaxed">
        {lines.map((l, j) => (
          <span key={j}>
            {j > 0 && <br />}
            {renderInline(l)}
          </span>
        ))}
      </p>
    );
  });
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-neutral-900">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export default function HelpArticleView({
  article,
  category,
  lang,
  onBack,
}: HelpArticleViewProps) {
  const isAr = lang === "ar";
  const BackIcon = isAr ? ArrowRight : ArrowLeft;
  const body = isAr ? article.bodyAr : article.body;

  return (
    <div dir={isAr ? "rtl" : "ltr"} className="max-w-2xl mx-auto">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-vibo-primary hover:text-vibo-primary-light transition mb-6"
      >
        <BackIcon className="h-4 w-4" />
        <span>{isAr ? category.nameAr : category.name}</span>
      </button>

      <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 mb-6">
        {isAr ? article.titleAr : article.title}
      </h1>

      <div className="space-y-4">{renderBody(body)}</div>
    </div>
  );
}
