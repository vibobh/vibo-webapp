export type BlogCategory = "article" | "case_study" | "featured" | "guide";

export type BlogListItem = {
  _id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: BlogCategory;
  authorName: string;
  authorImageUrl: string | null;
  coverImageUrl: string | null;
  publishedAt: number;
  updatedAt: number;
};

export type BlogPost = BlogListItem & {
  bodyHtml: string;
};
