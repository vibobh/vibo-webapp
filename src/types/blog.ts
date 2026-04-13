export type BlogCategory = "article" | "case_study" | "featured" | "guide";

export type BlogListItem = {
  _id: string;
  slug: string;
  title: string;
  excerpt: string;
  titleAr?: string | null;
  excerptAr?: string | null;
  category: BlogCategory;
  authorName: string;
  authorImageUrl: string | null;
  coverImageUrl: string | null;
  publishedAt: number;
  updatedAt: number;
};

export type BlogPost = BlogListItem & {
  bodyHtml: string;
  bodyHtmlAr?: string | null;
};
