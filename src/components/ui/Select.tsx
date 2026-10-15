"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
} from "react";
import { cn } from "@/lib/cn";

/** Radix Select root. Controlled via `value`/`onValueChange`. */
export const Select = SelectPrimitive.Root;
/** Renders the chosen value (or placeholder). */
export const SelectValue = SelectPrimitive.Value;
export const SelectGroup = SelectPrimitive.Group;

/** Button that looks like `.input`, with a trailing chevron. */
export const SelectTrigger = forwardRef<
  ElementRef<typeof SelectPrimitive.Trigger>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(function SelectTrigger({ className, children, ...rest }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        "flex w-full items-center justify-between gap-2 rounded-[10px] px-3.5 py-2.5 text-sm outline-none",
        "transition-shadow data-[placeholder]:text-[var(--faint)]",
        "focus-visible:border-[var(--accent)] focus-visible:shadow-[0_0_0_3px_var(--accent-soft)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-strong)",
        color: "var(--fg)",
      }}
      {...rest}
    >
      <span className="min-w-0 flex-1 truncate text-left">{children}</span>
      <SelectPrimitive.Icon asChild>
        <ChevronDown
          size={16}
          strokeWidth={1.75}
          style={{ color: "var(--faint)" }}
          aria-hidden
        />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});

export type SelectContentProps = ComponentPropsWithoutRef<
  typeof SelectPrimitive.Content
>;

/** Floating list. Animated via `.ds-pop`. Defaults to `popper`. */
export const SelectContent = forwardRef<
  ElementRef<typeof SelectPrimitive.Content>,
  SelectContentProps
>(function SelectContent(
  { className, children, position = "popper", sideOffset = 6, ...rest },
  ref,
) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        position={position}
        sideOffset={sideOffset}
        className={cn(
          "ds-pop z-50 overflow-hidden p-1 outline-none",
          position === "popper" &&
            "max-h-[var(--radix-select-content-available-height)] w-[var(--radix-select-trigger-width)] min-w-[11rem]",
          className,
        )}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-md)",
        }}
        {...rest}
      >
        <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center">
          <ChevronUp size={14} strokeWidth={1.75} style={{ color: "var(--faint)" }} />
        </SelectPrimitive.ScrollUpButton>
        <SelectPrimitive.Viewport className="p-0">
          {children}
        </SelectPrimitive.Viewport>
        <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center">
          <ChevronDown size={14} strokeWidth={1.75} style={{ color: "var(--faint)" }} />
        </SelectPrimitive.ScrollDownButton>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

/** One option. Shows a check when selected; highlights with --surface-2. */
export const SelectItem = forwardRef<
  ElementRef<typeof SelectPrimitive.Item>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, children, ...rest }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        "relative flex cursor-pointer select-none items-center gap-2 rounded-lg py-2 pl-2.5 pr-8 text-sm outline-none",
        "transition-colors data-[highlighted]:bg-[var(--surface-2)]",
        "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        className,
      )}
      style={{ color: "var(--fg)" }}
      {...rest}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-2.5 grid place-items-center">
        <Check size={16} strokeWidth={1.75} style={{ color: "var(--accent)" }} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
});

/** Non-interactive group label. */
export const SelectLabel = forwardRef<
  ElementRef<typeof SelectPrimitive.Label>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(function SelectLabel({ className, ...rest }, ref) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn(
        "px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[.06em]",
        className,
      )}
      style={{ color: "var(--faint)" }}
      {...rest}
    />
  );
});

/** 1px divider using --border. */
export const SelectSeparator = forwardRef<
  ElementRef<typeof SelectPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(function SelectSeparator({ className, ...rest }, ref) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      className={cn("my-1 h-px", className)}
      style={{ background: "var(--border)" }}
      {...rest}
    />
  );
});
