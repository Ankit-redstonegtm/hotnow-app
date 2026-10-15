"use client";

// HotNow toaster built on sonner. Mount <Toaster/> once near the app root; call toast()
// anywhere. Themed to the app's tokens. (The older custom Toast is kept for existing screens
// until they migrate; new work should use this.)
import { Toaster as Sonner, toast } from "sonner";

export { toast };

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      gap={10}
      toastOptions={{
        style: {
          background: "var(--surface)",
          color: "var(--fg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          boxShadow: "var(--shadow-md)",
          fontSize: "13px",
        },
        classNames: {
          title: "font-semibold",
          description: "text-[var(--muted)]",
        },
      }}
    />
  );
}
