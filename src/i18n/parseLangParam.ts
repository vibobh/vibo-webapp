import type { Lang } from "./index";

/** Parse `?lang=` from App Router `searchParams` (string or string[]). */
export function parseLangSearchParam(
  value: string | string[] | undefined,
): Lang | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === "ar" || raw === "en") return raw;
  return undefined;
}
