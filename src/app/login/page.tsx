import { AuthPageClient } from "@/components/auth/AuthPageClient";
import { parseLangSearchParam } from "@/i18n/parseLangParam";

type PageProps = {
  searchParams: Record<string, string | string[] | undefined>;
};

export default function LoginPage({ searchParams }: PageProps) {
  const initialUrlLang = parseLangSearchParam(searchParams.lang);
  return <AuthPageClient authMode="login" initialUrlLang={initialUrlLang} />;
}
