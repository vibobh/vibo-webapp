import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vibo for Business",
  description:
    "Grow your business with Vibo ads. Reach new customers, build relationships, and measure performance with creative tools built for modern brands.",
  alternates: { canonical: "https://businesses.joinvibo.com/" },
  openGraph: {
    title: "Vibo for Business",
    description:
      "Grow your business with Vibo ads. Reach new customers and build relationships.",
    url: "https://businesses.joinvibo.com/",
    siteName: "Vibo",
    type: "website",
  },
};

export default function BusinessesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}

