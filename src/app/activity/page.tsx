"use client";

import { BellRing } from "@/components/ui/icons";
import { ComingSoonScreen } from "@/components/app/ComingSoonScreen";

export default function ActivityPage() {
  return (
    <ComingSoonScreen
      title="Activity"
      description="Follow requests, likes, and replies will land here on the web shortly."
      icon={BellRing}
    />
  );
}

