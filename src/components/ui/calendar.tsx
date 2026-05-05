"use client";

import * as React from "react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      classNames={{
        root: "w-fit",
        months: "flex flex-col",
        month: "space-y-4",
        month_caption: "relative flex items-center justify-center pt-1 pb-1",
        caption_label: "text-sm font-semibold text-neutral-900",
        nav: "absolute inset-x-0 top-1 flex items-center justify-between px-0.5",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          "h-8 w-8 rounded-lg border-0 bg-transparent p-0 text-neutral-700 shadow-none hover:bg-neutral-100/70",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "h-8 w-8 rounded-lg border-0 bg-transparent p-0 text-neutral-700 shadow-none hover:bg-neutral-100/70",
        ),
        dropdowns: "flex items-center gap-3 whitespace-nowrap text-sm font-medium",
        dropdown_root:
          "relative inline-flex h-8 flex-row items-center gap-1 whitespace-nowrap rounded-md border-0 bg-transparent px-1.5 py-1 text-sm font-medium leading-none text-neutral-900 shadow-none",
        dropdown:
          "absolute inset-0 cursor-pointer opacity-0",
        chevron: "h-4 w-4 shrink-0",
        months_dropdown: "",
        years_dropdown: "",
        month_grid: "w-full border-collapse",
        weekdays: "mb-1.5 flex",
        weekday: "w-10 text-center text-[0.88rem] font-medium text-neutral-500",
        week: "mt-1.5 flex w-full",
        day: "h-10 w-10 p-0 text-center",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "h-10 w-10 rounded-full p-0 text-[1rem] font-medium text-neutral-800 transition-all duration-150 hover:bg-vibo-primary/10 hover:text-vibo-primary aria-selected:bg-vibo-primary/10 aria-selected:text-vibo-primary",
        ),
        selected:
          "bg-transparent text-vibo-primary [&>button]:bg-vibo-primary/10 [&>button]:text-vibo-primary",
        today: "border border-vibo-primary/35 bg-vibo-primary/5 text-vibo-primary",
        outside: "text-neutral-400 opacity-65",
        disabled: "text-neutral-400 opacity-50",
        day_hidden: "invisible",
        ...classNames,
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };

