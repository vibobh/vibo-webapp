"use client";

import type { HelpCategory } from "@/data/helpArticles";
import type { Lang } from "@/i18n";

interface HelpCategoryCardProps {
  category: HelpCategory;
  lang: Lang;
  onClick: (slug: string) => void;
}

export default function HelpCategoryCard({
  category,
  lang,
  onClick,
}: HelpCategoryCardProps) {
  const Icon = category.icon;
  const isAr = lang === "ar";

  return (
    <button
      onClick={() => onClick(category.slug)}
      className="group flex flex-col items-center gap-3 rounded-2xl border border-neutral-100 bg-white p-6 shadow-sm hover:shadow-md hover:border-vibo-primary/20 transition-all text-center"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-vibo-rose text-vibo-primary transition-colors group-hover:bg-vibo-primary group-hover:text-white">
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-neutral-800" dir={isAr ? "rtl" : "ltr"}>
        {isAr ? category.nameAr : category.name}
      </h3>
      <p className="text-sm text-neutral-500 leading-relaxed" dir={isAr ? "rtl" : "ltr"}>
        {isAr ? category.descriptionAr : category.description}
      </p>
    </button>
  );
}
