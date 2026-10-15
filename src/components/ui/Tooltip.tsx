"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/**
 * Wrap the app (or a subtree) once. Sets a snappy default delay.
 * Individual <Tooltip> instances can still override.
 */
export function TooltipProvider({
  delayDuration = 200,
  skipDelayDuration = 300,
  ...rest
}: ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      delayDuration={delayDuration}
      skipDelayDuration={skipDelayDuration}
      {...rest}
    />
  );
}

/** Radix Tooltip root. */
export const Tooltip = TooltipPrimitive.Root;
/** The hovered/focused element. Use `asChild`. */
export const TooltipTrigger = TooltipPrimitive.Trigger;

export type TooltipContentProps = ComponentPropsWithoutRef<
  typeof TooltipPrimitive.Content
>;

/** Dark, compact bubble (bg = --fg, white text). Animated via `.ds-pop`. */
export const TooltipContent = forwardRef<
  ElementRef<typeof TooltipPrimitive.Content>,
  TooltipContentProps
>(function TooltipContent(
  { className, sideOffset = 6, collisionPadding = 8, children, ...rest },
  ref,
) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "ds-pop z-50 max-w-[min(18rem,calc(100vw-1rem))] px-2.5 py-1.5",
          "text-xs font-medium leading-snug",
          className,
        )}
        style={{
          background: "var(--fg)",
          color: "#fff",
          borderRadius: "var(--radius-sm)",
          boxShadow: "var(--shadow-md)",
        }}
        {...rest}
      >
        {children}
        <TooltipPrimitive.Arrow
          width={10}
          height={5}
          style={{ fill: "var(--fg)" }}
        />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
});

export type HintProps = {
  /** Tooltip text (or any node). */
  label: ReactNode;
  /** The element the hint is attached to. */
  children: ReactNode;
  side?: TooltipContentProps["side"];
  align?: TooltipContentProps["align"];
  /** Per-instance open delay (ms). */
  delayDuration?: number;
};

/**
 * Convenience wrapper: `<Hint label="…"><button/></Hint>`.
 * Self-contained — includes its own Provider so it works anywhere.
 */
export function Hint({
  label,
  children,
  side = "top",
  align = "center",
  delayDuration = 200,
}: HintProps) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side={side} align={align}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
