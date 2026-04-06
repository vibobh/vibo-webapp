/**
 * Single mark: magnifying glass (burgundy) + star (gold), matching Vibo theme.
 * Star path scaled from Lucide “Star” and positioned at the lens top-right.
 */
type Props = {
  className?: string;
  /** Default tuned for the main search field */
  size?: "field" | "compact";
};

export default function HelpAiSearchIcon({
  className = "",
  size = "field",
}: Props) {
  const dim = size === "field" ? "h-8 w-8" : "h-5 w-5";
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${dim} ${className}`}
      aria-hidden
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-vibo-primary"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.35-4.35" />
      </g>
      <path
        fill="currentColor"
        className="text-vibo-gold"
        transform="translate(17.25, 4.75) scale(0.32) translate(-12, -12)"
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
      />
    </svg>
  );
}
