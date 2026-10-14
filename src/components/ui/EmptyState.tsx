import type { ReactNode } from "react";

type EmptyStateProps = {
  /** Optional illustrative icon (inline SVG or node). */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Optional action, e.g. a button. */
  action?: ReactNode;
};

/**
 * Centered, generous-whitespace empty state matching the
 * `.card p-10 text-center` pattern used across the app.
 */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="card p-10 text-center flex flex-col items-center gap-3">
      {icon ? (
        <div
          className="flex items-center justify-center"
          style={{
            width: 44,
            height: 44,
            borderRadius: "var(--radius-sm)",
            background: "var(--surface-2)",
            color: "var(--faint)",
          }}
          aria-hidden="true"
        >
          {icon}
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <h3 className="text-base font-semibold" style={{ color: "var(--fg)" }}>
          {title}
        </h3>
        {description ? (
          <p
            className="text-sm mx-auto"
            style={{ color: "var(--muted)", maxWidth: "32ch" }}
          >
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
