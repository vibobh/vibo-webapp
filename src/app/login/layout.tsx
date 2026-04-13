import type { Metadata } from "next";
import en from "@/i18n/en.json";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: en.login.metaTitle,
  description: en.login.metaDescription,
  alternates: {
    canonical: `${SITE_URL}/login`,
    languages: {
      en: `${SITE_URL}/login`,
      ar: `${SITE_URL}/login`,
      "x-default": `${SITE_URL}/login`,
    },
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
