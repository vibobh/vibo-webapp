import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic, Inter } from "next/font/google";
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";
import JsonLd from "@/components/seo/JsonLd";
import { THEME_INIT_SCRIPT } from "@/lib/theme/ThemeProvider";
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_KEYWORDS,
  DEFAULT_PAGE_TITLE,
  OG_IMAGE_PATH,
  SITE_URL,
} from "@/lib/seo";

/** Arabic UI — Medium as default; 600/700 for semibold/bold in RTL */
const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  weight: ["500", "600", "700"],
  subsets: ["arabic"],
  variable: "--font-arabic",
  display: "swap",
});

/** Latin UI — replaces missing self-hosted “Instagram Sans” files under `/fonts` */
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-en",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_PAGE_TITLE,
    template: "%s | Vibo",
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [...DEFAULT_KEYWORDS],
  alternates: {
    canonical: "/",
    languages: {
      en: `${SITE_URL}/`,
      ar: `${SITE_URL}/`,
      "x-default": `${SITE_URL}/`,
    },
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: "Vibo",
    title: "Vibo",
    description: DEFAULT_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE_PATH,
        width: 1200,
        height: 630,
        alt: "Vibo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Vibo",
    description: DEFAULT_DESCRIPTION,
    images: [OG_IMAGE_PATH],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" dir="ltr">
      <head>
        {/* Set `dark` class on <html> before hydration so app surfaces don't flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${inter.variable} ${ibmPlexSansArabic.variable} font-en antialiased`}>
        <JsonLd />
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
