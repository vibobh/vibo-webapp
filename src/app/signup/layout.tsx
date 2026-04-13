import type { Metadata } from "next";
import en from "@/i18n/en.json";
import { SITE_URL } from "@/lib/seo";

export const metadata: Metadata = {
  title: en.login.metaTitleSignup,
  description: en.login.metaDescriptionSignup,
  alternates: {
    canonical: `${SITE_URL}/signup`,
    languages: {
      en: `${SITE_URL}/signup`,
      ar: `${SITE_URL}/signup`,
      "x-default": `${SITE_URL}/signup`,
    },
  },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
