/**
 * AI search mark: line-art asset shipped at `public/icons/help-ai-search.png`.
 */
type Props = {
  className?: string;
  size?: "field" | "compact";
};

export default function HelpAiSearchIcon({
  className = "",
  size = "field",
}: Props) {
  const dim = size === "field" ? "h-8 w-8" : "h-5 w-5";
  const px = size === "field" ? 32 : 20;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- small static UI icon
    <img
      src="/icons/help-ai-search.png"
      alt=""
      width={px}
      height={px}
      className={`shrink-0 object-contain ${dim} opacity-[0.92] ${className}`}
      aria-hidden
    />
  );
}
