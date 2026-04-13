import { AuthPageClient } from "@/components/auth/AuthPageClient";
import { parseLangSearchParam } from "@/i18n/parseLangParam";

type PageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default function SignupPage({ searchParams }: PageProps) {
  const initialUrlLang = parseLangSearchParam(searchParams.lang);
  return <AuthPageClient authMode="signup" initialUrlLang={initialUrlLang} />;
}
