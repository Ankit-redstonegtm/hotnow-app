import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

type SkeletonProps = {
  className?: string;
  style?: CSSProperties;
};

/**
 * A single shimmer block. Reuses the global `.skeleton` class (shimmer sweep +
 * surface-2 base) and adds a token radius. Size it with Tailwind utilities in
 * `className` (e.g. `h-4 w-40`) or with `style`.
 */
export function Skeleton({ className, style }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn("skeleton", className)}
      style={{ borderRadius: "var(--radius-sm)", ...style }}
    />
  );
}

type SkeletonTextProps = {
  /** Number of shimmer lines to render (default 3). The last line is shortened. */
  lines?: number;
  className?: string;
};

/** A stack of text-height shimmer lines, with a shorter final line. */
export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  const count = Math.max(1, lines);
  return (
    <div className={cn("flex flex-col gap-2", className)} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-3"
          style={{ width: i === count - 1 && count > 1 ? "60%" : "100%" }}
        />
      ))}
    </div>
  );
}
