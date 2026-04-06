/**
 * AI search mark from `public/icons/help-ai-search.png`, tinted with Vibo primary via mask.
 */
type Props = {
  className?: string;
  size?: "field" | "compact";
};

const MASK = "url(/icons/help-ai-search.png)";

export default function HelpAiSearchIcon({
  className = "",
  size = "field",
}: Props) {
  const px = size === "field" ? 22 : 16;
  return (
    <span
      className={`inline-block shrink-0 bg-vibo-primary ${className}`}
      style={{
        width: px,
        height: px,
        WebkitMaskImage: MASK,
        maskImage: MASK,
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
      aria-hidden
    />
  );
}
