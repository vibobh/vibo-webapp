import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog",
  description: "Stories, guides, and updates from the Vibo team.",
};

export default function BlogsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
