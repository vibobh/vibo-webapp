"use client";

import { Compass } from "@/components/ui/icons";
import { ComingSoonScreen } from "@/components/app/ComingSoonScreen";

export default function ExplorePage() {
  return (
    <ComingSoonScreen
      title="Explore"
      description="Discover trending creators, places, and stories from the Vibo community."
      icon={Compass}
    />
  );
}

