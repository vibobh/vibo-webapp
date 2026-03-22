"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { type ReactNode, useMemo } from "react";

function makeClient() {
  // next.config.js mirrors CONVEX_URL → NEXT_PUBLIC_CONVEX_URL for the browser bundle
  const url = process.env.NEXT_PUBLIC_CONVEX_URL?.trim() || "";
  if (!url) return null;
  return new ConvexReactClient(url);
}

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  const client = useMemo(() => makeClient(), []);

  if (!client) {
    return <>{children}</>;
  }

  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}
