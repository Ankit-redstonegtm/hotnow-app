import type { CSSProperties } from "react";

type SpinnerProps = {
  /** Diameter in px. Default 16. */
  size?: number;
  /** Accessible label; also shown as inline text when provided. */
  label?: string;
};

/**
 * Small inline loading spinner. Reuses the `.spin` keyframe from globals.css
 * and the design tokens. Honors prefers-reduced-motion (handled in CSS).
 */
export function Spinner({ size = 16, label }: SpinnerProps) {
  const style: CSSProperties = { width: size, height: size };
  return (
    <span
      className="inline-flex items-center gap-2"
      role="status"
      aria-live="polite"
    >
      <svg
        className="spin"
        style={style}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="var(--border-strong)"
          strokeWidth="3"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {label ? (
        <span className="text-sm" style={{ color: "var(--muted)" }}>
          {label}
        </span>
      ) : (
        <span className="sr-only">{label ?? "Loading"}</span>
      )}
    </span>
  );
}
