"use client";

import { Film } from "@/components/ui/icons";
import { ComingSoonScreen } from "@/components/app/ComingSoonScreen";

export default function VideosPage() {
  return (
    <ComingSoonScreen
      title="Videos"
      description="The full Vibo video player is being tuned for the web. Check back soon."
      icon={Film}
    />
  );
}

