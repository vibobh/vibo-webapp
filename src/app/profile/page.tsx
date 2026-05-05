"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "@/components/ui/icons";

import { useViboAuth } from "@/lib/auth/AuthProvider";
import { AppShell } from "@/components/app/AppShell";

/**
 * `/profile` is just a shortcut into the authenticated user's username route.
 * The canonical URL for any user — including yourself — is `/{username}`.
 */
export default function OwnProfileRedirect() {
  const { user, isLoading } = useViboAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.username) {
      router.replace(`/${user.username}`);
    }
  }, [isLoading, user, router]);

  return (
    <AppShell maxWidth="max-w-[640px]">
      <div className="grid place-items-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
      </div>
    </AppShell>
  );
}

