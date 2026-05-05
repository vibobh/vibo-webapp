export type CountryOption = { code: string; name: string; flag: string };

function flagEmoji(code: string): string {
  const c = code.toUpperCase();
  if (c.length !== 2) return "🏳️";
  const A = 0x1f1e6;
  const cp = (ch: string) => A + ch.charCodeAt(0) - 65;
  return String.fromCodePoint(cp(c[0]!), cp(c[1]!));
}

/** ISO-like codes when `Intl.supportedValuesOf("region")` is unavailable. */
const FALLBACK_CODES = [
  "PS", "BH", "SA", "AE", "KW", "QA", "OM", "YE", "IQ", "JO", "LB", "SY", "EG", "LY", "TN", "DZ", "MA", "SD",
  "US", "CA", "MX", "BR", "AR", "CO", "GB", "IE", "FR", "DE", "IT", "ES", "PT", "NL", "BE", "CH", "AT", "SE",
  "NO", "DK", "FI", "PL", "CZ", "RO", "GR", "TR", "RU", "UA", "IN", "PK", "BD", "LK", "NP", "CN", "JP", "KR",
  "TH", "VN", "MY", "SG", "ID", "PH", "AU", "NZ", "NG", "KE", "ZA", "ET", "GH",
];

export function getCountriesForOnboarding(locale: string = "en"): CountryOption[] {
  let codes: string[] = [];
  try {
    const IntlAny = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
    if (typeof IntlAny.supportedValuesOf === "function") {
      codes = IntlAny.supportedValuesOf("region").filter(
        (x) => typeof x === "string" && x.length === 2 && !["ZZ", "EU", "UN", "QO", "AC"].includes(x),
      );
    }
  } catch {
    codes = [];
  }
  if (codes.length === 0) {
    codes = [...FALLBACK_CODES];
  }
  codes = codes.filter((c) => c !== "IL");
  if (!codes.includes("PS")) {
    codes.push("PS");
  }
  const uniq = Array.from(new Set(codes));
  const dn = new Intl.DisplayNames([locale === "ar" ? "ar" : "en"], { type: "region" });
  const out = uniq.map((code) => ({
    code,
    name: dn.of(code) ?? code,
    flag: flagEmoji(code),
  }));
  out.sort((a, b) => a.name.localeCompare(b.name, locale === "ar" ? "ar" : "en"));
  return out;
}
