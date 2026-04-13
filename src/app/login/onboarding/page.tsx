import { OnboardingPageClient } from "@/components/auth/OnboardingPageClient";
import { parseLangSearchParam } from "@/i18n/parseLangParam";

type PageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default function OnboardingPage({ searchParams }: PageProps) {
  const initialUrlLang = parseLangSearchParam(searchParams.lang);
  return <OnboardingPageClient initialUrlLang={initialUrlLang} />;
}
