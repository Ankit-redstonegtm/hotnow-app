"use client";

import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from "react";
import { cn } from "@/lib/cn";

/** Radix Popover root. */
export const Popover = PopoverPrimitive.Root;
/** Opens the popover. Use `asChild` to wrap your own trigger. */
export const PopoverTrigger = PopoverPrimitive.Trigger;
/** Programmatic close. Use `asChild`. */
export const PopoverClose = PopoverPrimitive.Close;
/** Optional arrow pointing at the anchor. */
export const PopoverAnchor = PopoverPrimitive.Anchor;

export type PopoverContentProps = ComponentPropsWithoutRef<
  typeof PopoverPrimitive.Content
>;

/** Floating surface anchored to the trigger. Animated via `.ds-pop`. */
export const PopoverContent = forwardRef<
  ElementRef<typeof PopoverPrimitive.Content>,
  PopoverContentProps
>(function PopoverContent(
  { className, align = "start", sideOffset = 6, collisionPadding = 8, ...rest },
  ref,
) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "ds-pop z-50 w-72 max-w-[calc(100vw-1rem)] p-3 outline-none",
          className,
        )}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-md)",
        }}
        {...rest}
      />
    </PopoverPrimitive.Portal>
  );
});
