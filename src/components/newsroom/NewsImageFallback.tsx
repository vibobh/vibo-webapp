/**
 * Branded placeholder when NewsAPI has no thumbnail (maroon + cream Vibo mark).
 */
type Props = {
  className?: string;
  /** Tailwind classes controlling logo size within the maroon area */
  logoClassName?: string;
};

export default function NewsImageFallback({
  className = "",
  logoClassName = "max-h-[52%] max-w-[52%] min-h-[48px]",
}: Props) {
  return (
    <div
      className={`flex items-center justify-center bg-[#800000] ${className}`}
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static local asset */}
      <img
        src="/images/vibo-news-placeholder.png"
        alt=""
        className={`object-contain ${logoClassName}`}
      />
    </div>
  );
}
