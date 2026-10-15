"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
} from "react";
import { cn } from "@/lib/cn";

/** Radix Dialog root. */
export const Dialog = DialogPrimitive.Root;
/** Opens the dialog. Use `asChild` to wrap your own button. */
export const DialogTrigger = DialogPrimitive.Trigger;
/** Programmatic close (also rendered as the X). Use `asChild`. */
export const DialogClose = DialogPrimitive.Close;

export type DialogContentProps = ComponentPropsWithoutRef<
  typeof DialogPrimitive.Content
> & {
  /** Hide the top-right close button. Default: false. */
  hideClose?: boolean;
};

/**
 * Centered modal panel. Renders its own overlay (`.ds-overlay`) and content
 * (`.ds-pop`), closes on Esc / overlay click, and is scroll-safe for tall content.
 */
export const DialogContent = forwardRef<
  ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(function DialogContent({ className, children, hideClose = false, ...rest }, ref) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay
        className="ds-overlay fixed inset-0 z-50"
        style={{ background: "rgba(24,23,26,.38)" }}
      />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "ds-pop fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-[480px]",
          "-translate-x-1/2 -translate-y-1/2",
          "max-h-[calc(100dvh-2rem)] overflow-y-auto",
          "flex flex-col gap-4 p-5 outline-none",
          className,
        )}
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
        }}
        {...rest}
      >
        {children}
        {!hideClose ? (
          <DialogPrimitive.Close
            aria-label="Close"
            className={cn(
              "absolute right-3.5 top-3.5 grid h-7 w-7 place-items-center rounded-lg",
              "transition-colors focus-visible:outline-none",
            )}
            style={{ color: "var(--faint)" }}
          >
            <X size={16} strokeWidth={1.75} />
          </DialogPrimitive.Close>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

/** Header block: stacks title + description with tight spacing. */
export function DialogHeader({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 pr-7", className)} {...rest} />;
}

/** Footer block: right-aligned action row. */
export function DialogFooter({
  className,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mt-1 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...rest}
    />
  );
}

export const DialogTitle = forwardRef<
  ElementRef<typeof DialogPrimitive.Title>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...rest }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn("font-semibold leading-tight", className)}
      style={{ color: "var(--fg)", fontSize: "var(--text-md)" }}
      {...rest}
    />
  );
});

export const DialogDescription = forwardRef<
  ElementRef<typeof DialogPrimitive.Description>,
  ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...rest }, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn("text-sm leading-relaxed", className)}
      style={{ color: "var(--muted)" }}
      {...rest}
    />
  );
});
