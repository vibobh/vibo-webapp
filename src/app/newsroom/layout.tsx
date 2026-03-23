import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Newsroom",
  description:
    "Latest updates, announcements, and stories from Vibo — real people, real moments.",
  alternates: { canonical: "https://joinvibo.com/newsroom" },
};

export default function NewsroomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
