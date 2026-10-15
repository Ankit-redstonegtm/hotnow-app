"use client";

import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

/** Radix DropdownMenu root. */
export const DropdownMenu = DropdownMenuPrimitive.Root;
/** Opens the menu. Use `asChild` to wrap your own button. */
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;

export type DropdownMenuContentProps = ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.Content
>;

/** Floating menu surface. Animated via `.ds-pop`. */
export const DropdownMenuContent = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Content>,
  DropdownMenuContentProps
>(function DropdownMenuContent(
  { className, align = "end", sideOffset = 6, collisionPadding = 8, ...rest },
  ref,
) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "ds-pop z-50 min-w-[11rem] max-w-[calc(100vw-1rem)] p-1 outline-none",
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
    </DropdownMenuPrimitive.Portal>
  );
});

export type DropdownMenuItemProps = ComponentPropsWithoutRef<
  typeof DropdownMenuPrimitive.Item
> & {
  /** Optional leading icon (e.g. a lucide icon at ~16px). */
  icon?: ReactNode;
  /** Render in the destructive (--danger) color. */
  danger?: boolean;
};

/**
 * Selectable row. Hover / highlight fills with --surface-2.
 * `danger` tints the row with --danger (never the brand red).
 */
export const DropdownMenuItem = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Item>,
  DropdownMenuItemProps
>(function DropdownMenuItem(
  { className, icon, danger = false, children, ...rest },
  ref,
) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium outline-none",
        "transition-colors data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
        danger
          ? "data-[highlighted]:bg-[var(--danger-soft)]"
          : "data-[highlighted]:bg-[var(--surface-2)]",
        className,
      )}
      style={{ color: danger ? "var(--danger)" : "var(--fg)" }}
      {...rest}
    >
      {icon ? (
        <span className="grid shrink-0 place-items-center" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </DropdownMenuPrimitive.Item>
  );
});

/** 1px divider using --border. */
export const DropdownMenuSeparator = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Separator>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(function DropdownMenuSeparator({ className, ...rest }, ref) {
  return (
    <DropdownMenuPrimitive.Separator
      ref={ref}
      className={cn("my-1 h-px", className)}
      style={{ background: "var(--border)" }}
      {...rest}
    />
  );
});

/** Non-interactive section label (uppercase, faint). */
export const DropdownMenuLabel = forwardRef<
  ElementRef<typeof DropdownMenuPrimitive.Label>,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(function DropdownMenuLabel({ className, ...rest }, ref) {
  return (
    <DropdownMenuPrimitive.Label
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
