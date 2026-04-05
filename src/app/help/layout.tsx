import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vibo Help Center",
  description:
    "Find answers, browse help articles, and get support for using Vibo.",
  alternates: { canonical: "https://help.joinvibo.com/" },
  openGraph: {
    title: "Vibo Help Center",
    description: "Find answers and get support for using Vibo.",
    url: "https://help.joinvibo.com/",
    siteName: "Vibo",
    type: "website",
  },
};

export default function HelpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
