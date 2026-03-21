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
  /** Logo + “Vibo” wordmark — `public/images/vibo-logo-full.png` */
  icons: {
    icon: [{ url: "/images/vibo-logo-full.png", type: "image/png" }],
    apple: [{ url: "/images/vibo-logo-full.png", type: "image/png", sizes: "180x180" }],
    shortcut: "/images/vibo-logo-full.png",
  },
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
