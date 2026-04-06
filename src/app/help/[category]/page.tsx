"use client";

import { useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import { getTranslations, isRTL } from "@/i18n";
import { useViboLang } from "@/i18n/useViboLang";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import {
  getCategoryBySlug,
  getArticlesByCategory,
} from "@/data/helpArticles";

const SITE_ORIGIN = "https://joinvibo.com";

export default function HelpCategoryPage() {
  const params = useParams();
  const router = useRouter();
  const { lang, switchLang } = useViboLang();
  const t = getTranslations(lang);
  const rtl = isRTL(lang);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = rtl ? "rtl" : "ltr";
    document.body.classList.toggle("font-ar", rtl);
    document.body.classList.toggle("font-en", !rtl);
  }, [lang, rtl]);

  const slug = params.category as string;
  const category = getCategoryBySlug(slug);
  const articles = getArticlesByCategory(slug);
  const th = (t as any).help ?? {};
  const isAr = lang === "ar";
  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  const handleArticleClick = useCallback(
    (id: string) => {
      router.push(`/help/${slug}/${id}`);
    },
    [router, slug],
  );

  if (!category) {
    return (
      <div className="min-h-screen bg-[#fdfcf9] flex flex-col" dir={rtl ? "rtl" : "ltr"}>
        <Navbar t={t} lang={lang} onSwitchLang={switchLang} siteOrigin={SITE_ORIGIN} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-neutral-500">
            {th.notFound || "Category not found."}
          </p>
        </div>
        <Footer t={t} lang={lang} onSwitchLang={switchLang} siteOrigin={SITE_ORIGIN} />
      </div>
    );
  }

  const Icon = category.icon;

  return (
    <div className="min-h-screen bg-[#fdfcf9] flex flex-col" dir={rtl ? "rtl" : "ltr"}>
      <Navbar t={t} lang={lang} onSwitchLang={switchLang} siteOrigin={SITE_ORIGIN} />

      <main className="flex-1 pt-28 pb-20 px-4">
        <div className="max-w-3xl mx-auto">
          {/* Breadcrumb */}
          <button
            onClick={() => router.push("/help")}
            className="flex items-center gap-2 text-sm text-vibo-primary hover:text-vibo-primary-light transition mb-8"
          >
            <BackIcon className="h-4 w-4" />
            <span>{th.backToHelp || "Help Center"}</span>
          </button>

          {/* Category header */}
          <div className="flex items-center gap-4 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-vibo-rose text-vibo-primary">
              <Icon className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900">
                {isAr ? category.nameAr : category.name}
              </h1>
              <p className="text-neutral-500 text-sm mt-1">
                {isAr ? category.descriptionAr : category.description}
              </p>
            </div>
          </div>

          {/* Article list */}
          <div className="space-y-3">
            {articles.map((article) => (
              <button
                key={article.id}
                onClick={() => handleArticleClick(article.id)}
                className="w-full flex items-center gap-4 rounded-xl border border-neutral-100 bg-white p-4 hover:shadow-sm hover:border-vibo-primary/20 transition text-left"
                dir={isAr ? "rtl" : "ltr"}
              >
                <FileText className="h-5 w-5 text-neutral-400 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-neutral-800">
                    {isAr ? article.titleAr : article.title}
                  </p>
                  <p className="text-xs text-neutral-500 mt-0.5 line-clamp-1">
                    {isAr ? article.bodyAr : article.body}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </main>

      <Footer t={t} lang={lang} onSwitchLang={switchLang} siteOrigin={SITE_ORIGIN} />
    </div>
  );
}
