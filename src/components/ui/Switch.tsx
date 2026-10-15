"use client";

import { forwardRef } from "react";
import * as RSwitch from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";

export const Switch = forwardRef<
  React.ElementRef<typeof RSwitch.Root>,
  React.ComponentPropsWithoutRef<typeof RSwitch.Root>
>(function Switch({ className, ...rest }, ref) {
  return (
    <RSwitch.Root
      ref={ref}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 cursor-pointer items-center rounded-full border border-transparent outline-none transition-colors duration-[var(--dur)] ease-[var(--ease)]",
        "[background:var(--border-strong)] data-[state=checked]:[background:var(--accent)]",
        "focus-visible:ring-[3px] focus-visible:ring-[var(--accent-soft)] disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
      {...rest}
    >
      <RSwitch.Thumb className="pointer-events-none block h-[18px] w-[18px] translate-x-0.5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,.2)] transition-transform duration-[var(--dur)] ease-[var(--ease)] data-[state=checked]:translate-x-[18px]" />
    </RSwitch.Root>
  );
});
