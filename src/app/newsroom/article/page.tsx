import { Suspense } from "react";
import type { Metadata } from "next";
import ArticleView from "./ArticleView";

export const metadata: Metadata = {
  robots: { index: false, follow: true },
};

export default function NewsroomArticlePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white pt-[72px] lg:pt-[80px] flex items-center justify-center text-neutral-400 text-sm">
          …
        </div>
      }
    >
      <ArticleView />
    </Suspense>
  );
}
