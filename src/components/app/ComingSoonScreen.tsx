"use client";

import Link from "next/link";
import { ChevronLeft, type LucideIcon } from "@/components/ui/icons";

import { AppShell } from "@/components/app/AppShell";

export function ComingSoonScreen({
  title,
  description,
  icon: Icon,
  backHref = "/",
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  backHref?: string;
}) {
  return (
    <AppShell maxWidth="max-w-[760px]">
      <header className="-mx-4 flex items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-900">
        <Link
          href={backHref}
          aria-label="Back"
          className="grid h-10 w-10 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-900 dark:hover:text-white"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-[16px] font-semibold tracking-tight text-neutral-900 dark:text-white">
          {title}
        </h1>
      </header>

      <div className="grid place-items-center px-6 py-24 text-center">
        <div className="mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-vibo-primary/15 text-vibo-primary">
          <Icon className="h-7 w-7" />
        </div>
        <h2 className="text-[20px] font-semibold tracking-tight text-neutral-900 dark:text-white">
          Coming soon
        </h2>
        <p className="mt-2 max-w-sm text-sm text-neutral-500 dark:text-neutral-400">
          {description}
        </p>
      </div>
    </AppShell>
  );
}

