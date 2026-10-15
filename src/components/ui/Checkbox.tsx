"use client";

import { forwardRef } from "react";
import * as RCheckbox from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/cn";

export const Checkbox = forwardRef<
  React.ElementRef<typeof RCheckbox.Root>,
  React.ComponentPropsWithoutRef<typeof RCheckbox.Root>
>(function Checkbox({ className, ...rest }, ref) {
  return (
    <RCheckbox.Root
      ref={ref}
      className={cn(
        "peer h-[18px] w-[18px] shrink-0 rounded-[6px] border border-[var(--border-strong)] [background:var(--surface)] outline-none transition-[background,border-color,box-shadow] duration-[var(--dur-fast)]",
        "focus-visible:ring-[3px] focus-visible:ring-[var(--accent-soft)] focus-visible:border-[var(--accent)]",
        "data-[state=checked]:[background:var(--accent)] data-[state=checked]:border-[var(--accent)]",
        "data-[state=indeterminate]:[background:var(--accent)] data-[state=indeterminate]:border-[var(--accent)]",
        "disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      <RCheckbox.Indicator className="grid place-items-center text-white">
        {rest.checked === "indeterminate" ? <Minus size={13} strokeWidth={3} /> : <Check size={13} strokeWidth={3} />}
      </RCheckbox.Indicator>
    </RCheckbox.Root>
  );
});
