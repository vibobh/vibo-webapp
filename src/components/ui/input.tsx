import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        "flex h-10 w-full min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-2 text-base text-neutral-900 shadow-sm transition-colors md:text-sm",
        "placeholder:text-neutral-400",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vibo-primary focus-visible:ring-offset-2",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-[invalid=true]:border-red-500 aria-[invalid=true]:ring-red-200",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { Input };
