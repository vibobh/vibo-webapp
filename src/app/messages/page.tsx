"use client";

import { Send } from "@/components/ui/icons";

export default function MessagesEmptyStatePage() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-6 text-center">
      <div className="grid h-24 w-24 place-items-center rounded-full ring-2 ring-neutral-900 dark:ring-white">
        <Send
          className="h-10 w-10 -translate-y-0.5 translate-x-0.5 text-neutral-900 dark:text-white"
          strokeWidth={1.6}
        />
      </div>
      <h2 className="mt-5 text-[22px] font-semibold tracking-tight text-neutral-900 dark:text-white">
        Your messages
      </h2>
      <p className="mt-1 max-w-sm text-[14px] text-neutral-500 dark:text-neutral-400">
        Send private photos and messages to a friend or group.
      </p>
      <button
        type="button"
        className="mt-5 inline-flex h-10 items-center rounded-lg bg-vibo-primary px-5 text-[14px] font-semibold text-white transition-colors hover:bg-vibo-primary/90"
      >
        Send message
      </button>
    </div>
  );
}

