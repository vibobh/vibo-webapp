import { Suspense } from "react";
import BlogArticleClient from "./BlogArticleClient";

export default function BlogArticlePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white flex items-center justify-center text-neutral-400 text-sm pt-24">
          Loading…
        </div>
      }
    >
      <BlogArticleClient />
    </Suspense>
  );
}
