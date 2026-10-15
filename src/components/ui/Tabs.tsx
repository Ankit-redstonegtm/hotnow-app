"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from "react";
import { cn } from "@/lib/cn";

/** Radix Tabs root. */
export const Tabs = TabsPrimitive.Root;

/** Segmented control track, sitting on --surface-2. */
export const TabsList = forwardRef<
  ElementRef<typeof TabsPrimitive.List>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...rest }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn("inline-flex items-center gap-1 p-1", className)}
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "var(--radius)",
      }}
      {...rest}
    />
  );
});

/**
 * One segment. Active segment lifts onto --surface with --shadow-xs.
 * Transition is smooth and respects keyboard focus.
 */
export const TabsTrigger = forwardRef<
  ElementRef<typeof TabsPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...rest }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5",
        "text-sm font-medium outline-none transition-all",
        "text-[var(--muted)] hover:text-[var(--fg)]",
        "data-[state=active]:bg-[var(--surface)] data-[state=active]:text-[var(--fg)] data-[state=active]:shadow-[var(--shadow-xs)]",
        "focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)]",
        "disabled:pointer-events-none disabled:opacity-50",
        className,
      )}
      {...rest}
    />
  );
});

/** Panel for the active tab. */
export const TabsContent = forwardRef<
  ElementRef<typeof TabsPrimitive.Content>,
  ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...rest }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn(
        "mt-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-soft)] rounded-[var(--radius)]",
        className,
      )}
      {...rest}
    />
  );
});
