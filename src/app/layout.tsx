import type { Metadata } from "next";
import "./globals.css";
import ConvexClientProvider from "@/components/ConvexClientProvider";

export const metadata: Metadata = {
  metadataBase: new URL("https://joinvibo.com"),
  title: {
    default: "Vibo",
    template: "%s | Vibo",
  },
  description:
    "Vibo is a global social media platform where creativity meets connection. Share short videos, stories, and messages with a community that celebrates authenticity.",
  /** Favicons: `app/icon.png` + `app/apple-icon.png` (white mark on #4b0415 from `vibo-icon-maroon.png`). Regenerate: `npm run generate:favicon` */
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
      <body className="font-en antialiased">
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
