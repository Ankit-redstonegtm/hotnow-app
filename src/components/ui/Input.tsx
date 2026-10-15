"use client";

import { forwardRef } from "react";
import type { InputHTMLAttributes, TextareaHTMLAttributes, LabelHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

const base =
  "w-full rounded-[var(--radius)] px-3.5 py-2.5 text-sm outline-none [background:var(--surface)] [color:var(--fg)] border border-[var(--border-strong)] transition-[border-color,box-shadow] duration-[var(--dur-fast)] placeholder:[color:var(--faint)] focus:border-[var(--accent)] focus:shadow-[0_0_0_3px_var(--accent-soft)] disabled:opacity-60 aria-[invalid=true]:border-[var(--danger)] aria-[invalid=true]:shadow-[0_0_0_3px_var(--danger-soft)]";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(base, className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 4, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(base, "resize-y leading-relaxed", className)} {...rest} />;
});

export function Label({ className, children, ...rest }: LabelHTMLAttributes<HTMLLabelElement> & { children: ReactNode }) {
  return (
    <label className={cn("block text-xs font-semibold mb-1.5 [color:var(--muted)]", className)} {...rest}>
      {children}
    </label>
  );
}

/** Label + control + optional hint/error, consistently spaced. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  htmlFor?: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error ? (
        <p className="mt-1.5 text-xs [color:var(--danger)]">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs [color:var(--faint)]">{hint}</p>
      ) : null}
    </div>
  );
}
