"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

// Brand red (--accent) is reserved for the PRIMARY action only. Destructive uses --danger.
const button = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[background,border-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease)] select-none disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--accent-soft)] active:translate-y-px",
  {
    variants: {
      variant: {
        primary: "text-white [background:var(--accent)] shadow-[0_1px_2px_rgba(240,51,59,.25)] hover:[background:var(--accent-ink)] focus-visible:ring-[var(--accent-soft)]",
        secondary: "[background:var(--surface)] [color:var(--fg)] border border-[var(--border-strong)] hover:[background:var(--surface-2)]",
        ghost: "[background:transparent] [color:var(--muted)] hover:[background:var(--surface-2)] hover:[color:var(--fg)]",
        subtle: "[background:var(--surface-2)] [color:var(--fg)] hover:[background:var(--border)]",
        danger: "text-white [background:var(--danger)] hover:brightness-110 focus-visible:ring-[var(--danger-soft)]",
      },
      size: {
        sm: "h-8 px-3 text-[13px] rounded-[var(--radius-sm)]",
        md: "h-9 px-4 text-sm rounded-[var(--radius)]",
        lg: "h-11 px-5 text-[15px] rounded-[var(--radius)]",
        icon: "h-9 w-9 rounded-[var(--radius)]",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, loading, disabled, children, ...rest },
  ref,
) {
  return (
    <button ref={ref} className={cn(button({ variant, size }), className)} disabled={disabled || loading} {...rest}>
      {loading && (
        <span className="spin inline-block h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent opacity-70" aria-hidden />
      )}
      {children}
    </button>
  );
});
