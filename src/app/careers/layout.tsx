import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Careers",
  description: "Join the Vibo team — careers and open roles.",
  alternates: { canonical: `${SITE_URL}/careers` },
};

export default function CareersLayout({ children }: { children: ReactNode }) {
  return children;
}
