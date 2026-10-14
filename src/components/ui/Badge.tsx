import { forwardRef } from "react";
import type { CSSProperties, HTMLAttributes } from "react";

type BadgeVariant =
  | "neutral"
  | "good"
  | "info"
  | "muted"
  | "faint"
  | "accent";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

const VARIANT_STYLE: Record<BadgeVariant, CSSProperties> = {
  neutral: {
    background: "var(--surface-2)",
    color: "var(--muted)",
    borderColor: "var(--border)",
  },
  good: {
    background: "var(--good-soft)",
    color: "var(--good)",
    borderColor: "transparent",
  },
  info: {
    background: "#e8f0fe",
    color: "#1b4fd0",
    borderColor: "transparent",
  },
  muted: {
    background: "var(--surface-2)",
    color: "var(--muted)",
    borderColor: "var(--border)",
  },
  faint: {
    background: "transparent",
    color: "var(--faint)",
    borderColor: "var(--border)",
  },
  accent: {
    background: "var(--accent-soft)",
    color: "var(--accent-ink)",
    borderColor: "transparent",
  },
};

/**
 * Small rounded badge, consistent with the `.pill` visual language.
 * Uses --radius-sm and a 1px token border.
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = "neutral", className, style, children, ...rest },
  ref,
) {
  return (
    <span
      ref={ref}
      className={`badge${className ? ` ${className}` : ""}`}
      style={{ ...VARIANT_STYLE[variant], ...style }}
      {...rest}
    >
      {children}
    </span>
  );
});

function capitalize(value: string): string {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

/** 'high' → green, 'medium' → blue, 'low' → gray. Label is the word, capitalized. */
export function ConfidenceBadge({ confidence }: { confidence: string }) {
  const key = (confidence ?? "").toLowerCase();
  const variant: BadgeVariant =
    key === "high" ? "good" : key === "medium" ? "info" : "muted";
  return (
    <Badge variant={variant} title={`Confidence: ${capitalize(confidence)}`}>
      {capitalize(confidence) || "—"}
    </Badge>
  );
}

export type EmailStatus = "verified" | "found" | "none" | "unknown" | null;

/**
 * CRITICAL: only status === 'verified' ever renders "Verified".
 * 'found' renders "Email found" (NOT verified).
 */
export function EmailStatusBadge({
  status,
  checking = false,
}: {
  status: EmailStatus;
  checking?: boolean;
}) {
  if (checking) {
    return <Badge variant="faint">Checking…</Badge>;
  }
  if (status === "verified") {
    return <Badge variant="good">Verified</Badge>;
  }
  if (status === "found") {
    return <Badge variant="info">Email found</Badge>;
  }
  if (status === "none") {
    return <Badge variant="muted">No email</Badge>;
  }
  // 'unknown' | null | anything else
  return (
    <Badge variant="faint" aria-label="Unknown email status">
      —
    </Badge>
  );
}

export type Priority = "P1" | "P2" | "P3";

const PRIORITY_LABEL: Record<Priority, string> = {
  P1: "P1 · Decision-maker",
  P2: "P2 · Champion",
  P3: "P3 · Stakeholder",
};

/** Reuses the existing .pill / .pill-pN classes. */
export function PriorityBadge({ priority }: { priority: Priority }) {
  const cls =
    priority === "P1" ? "pill-p1" : priority === "P2" ? "pill-p2" : "pill-p3";
  return <span className={`pill ${cls}`}>{PRIORITY_LABEL[priority]}</span>;
}
