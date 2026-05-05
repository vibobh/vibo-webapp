import { OnboardingPageClient } from "@/components/auth/OnboardingPageClient";
import { parseLangSearchParam } from "@/i18n/parseLangParam";

type PageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default function OnboardingPage({ searchParams }: PageProps) {
  const initialUrlLang = parseLangSearchParam(searchParams.lang);
  const preview =
    searchParams.preview === "1" ||
    searchParams.preview === "true" ||
    (Array.isArray(searchParams.preview) && searchParams.preview.includes("1"));
  return <OnboardingPageClient initialUrlLang={initialUrlLang} preview={preview} />;
}
