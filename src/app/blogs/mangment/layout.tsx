import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Blog management",
  robots: { index: false, follow: false },
};

export default function MangmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
