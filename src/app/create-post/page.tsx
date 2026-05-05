"use client";

import { Camera } from "@/components/ui/icons";
import { ComingSoonScreen } from "@/components/app/ComingSoonScreen";

export default function CreatePostPage() {
  return (
    <ComingSoonScreen
      title="Create post"
      description="Web-based post creation lands once we sync the Vibo posts schema with this site. Use the mobile app to publish in the meantime."
      icon={Camera}
    />
  );
}

