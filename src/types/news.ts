export type NewsTag =
  | "all"
  | "community"
  | "company"
  | "news"
  | "product"
  | "safety";

export type NewsArticle = {
  title: string;
  description: string;
  /** Full body when NewsAPI provides it (often truncated with "[+N chars]") */
  content?: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  sourceName: string;
};

export type NewsModerationItem = NewsArticle & {
  _id: string;
  tag: NewsTag;
  status: "draft" | "approved";
  publishedAtMs?: number;
};
