"use client";

import { type ReactNode } from "react";
import { AuthProvider } from "@/lib/auth/AuthProvider";

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
