"use client";

import { Users } from "@/components/ui/icons";
import { ComingSoonScreen } from "@/components/app/ComingSoonScreen";

export default function ConnectionsPage() {
  return (
    <ComingSoonScreen
      title="Connections"
      description="Manage who you follow, requests, and suggested people you may know."
      icon={Users}
    />
  );
}

