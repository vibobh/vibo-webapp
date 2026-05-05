"use client";

import { useViboAuth } from "@/lib/auth/AuthProvider";
import { SettingsScreen } from "@/components/app/SettingsScreen";

export default function ProfileSettingsPage() {
  const { user } = useViboAuth();
  const backHref = user?.username ? `/${user.username}` : "/profile";
  return <SettingsScreen backHref={backHref} />;
}
