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
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  sourceName: string;
};
