import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";

/** Arabic UI — Medium as default; 600/700 for semibold/bold in RTL */
const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  weight: ["500", "600", "700"],
  subsets: ["arabic"],
  variable: "--font-arabic",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://joinvibo.com"),
  title: {
    default: "Vibo",
    template: "%s | Vibo",
  },
  description:
    "Vibo is a global social media platform where creativity meets connection. Share short videos, stories, and messages with a community that celebrates authenticity.",
  /** Favicons: 128×128 from `public/Vibo App icon version-01.png` (tight crop, transparent bg). Regenerate: `npm run generate:favicon` */
  openGraph: {
    title: "Vibo",
    url: "https://joinvibo.com",
    siteName: "Vibo",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr">
      <body className={`${ibmPlexSansArabic.variable} font-en antialiased`}>
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
