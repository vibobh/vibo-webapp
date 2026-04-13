import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About Vibo",
  description:
    "Vibo is a social home for short video, photos, and real moments—built for authentic expression, thoughtful discovery, and a safer community.",
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
