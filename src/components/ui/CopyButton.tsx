"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useOptionalToast } from "./Toast";

type CopyButtonProps = {
  /** The text to write to the clipboard. */
  text: string;
  /** Button label when idle. Default "Copy". */
  label?: string;
  className?: string;
};

const RESET_MS = 1500;

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (
      typeof navigator !== "undefined" &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === "function"
    ) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to legacy path
  }
  // Legacy fallback: hidden textarea + execCommand
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.top = "-9999px";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Copies `text` to the clipboard, shows a transient "Copied ✓" state,
 * and fires a success toast when a ToastProvider is present (guarded).
 */
export function CopyButton({ text, label = "Copy", className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const toastCtx = useOptionalToast();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const onClick = useCallback(async () => {
    const ok = await writeClipboard(text);
    if (!ok) {
      toastCtx?.toast({
        title: "Couldn't copy",
        description: "Your browser blocked clipboard access.",
        variant: "error",
      });
      return;
    }
    setCopied(true);
    toastCtx?.toast({ title: "Copied to clipboard", variant: "success" });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), RESET_MS);
  }, [text, toastCtx]);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn btn-ghost btn-sm${className ? ` ${className}` : ""}`}
      aria-label={copied ? "Copied" : label}
      data-copied={copied || undefined}
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" stroke="var(--good)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="M5 15V5a2 2 0 0 1 2-2h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      )}
      <span>{copied ? "Copied ✓" : label}</span>
    </button>
  );
}
