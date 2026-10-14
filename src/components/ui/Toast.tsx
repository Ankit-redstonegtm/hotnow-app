"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

export type ToastVariant = "default" | "success" | "error";

export type ToastOptions = {
  title: string;
  description?: string;
  variant?: ToastVariant;
};

type ToastItem = ToastOptions & {
  id: number;
  /** marks the toast as leaving so the exit animation can play */
  leaving?: boolean;
};

type ToastContextValue = {
  toast: (opts: ToastOptions) => number;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 3500;
const EXIT_MS = 220;
const MAX_VISIBLE = 4;

const VARIANT_ACCENT: Record<ToastVariant, string> = {
  default: "var(--fg)",
  success: "var(--good)",
  error: "var(--accent)",
};

function VariantIcon({ variant }: { variant: ToastVariant }) {
  const color = VARIANT_ACCENT[variant];
  if (variant === "success") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 6 9 17l-5-5" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (variant === "error") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2.2" />
        <path d="M12 7.5v5M12 16h.01" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2.2" />
      <path d="M12 11v5M12 8h.01" stroke={color} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Wraps the app and renders a fixed bottom-right toast stack.
 * Mount once near the root; the lead wires this in.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const clearTimer = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) {
      clearTimeout(t);
      timers.current.delete(id);
    }
  }, []);

  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismiss = useCallback(
    (id: number) => {
      clearTimer(id);
      // play exit animation, then remove
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
      );
      const t = setTimeout(() => remove(id), EXIT_MS);
      timers.current.set(-id - 1, t);
    },
    [clearTimer, remove],
  );

  const toast = useCallback(
    (opts: ToastOptions) => {
      const id = ++idRef.current;
      const item: ToastItem = { id, variant: "default", ...opts };
      setToasts((prev) => {
        const next = [...prev, item];
        // cap visible toasts; drop the oldest beyond the limit
        return next.slice(-MAX_VISIBLE);
      });
      const t = setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
      timers.current.set(id, t);
      return id;
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((t) => clearTimeout(t));
      map.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-viewport" role="region" aria-label="Notifications">
        {toasts.map((t) => {
          const variant = t.variant ?? "default";
          return (
            <div
              key={t.id}
              className={`toast${t.leaving ? " toast-leave" : ""}`}
              role={variant === "error" ? "alert" : "status"}
              aria-live={variant === "error" ? "assertive" : "polite"}
              style={{ ["--toast-accent" as string]: VARIANT_ACCENT[variant] }}
            >
              <span className="toast-ico" aria-hidden="true">
                <VariantIcon variant={variant} />
              </span>
              <div className="toast-body">
                <div className="toast-title">{t.title}</div>
                {t.description ? (
                  <div className="toast-desc">{t.description}</div>
                ) : null}
              </div>
              <button
                type="button"
                className="toast-close"
                aria-label="Dismiss notification"
                onClick={() => dismiss(t.id)}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Returns `{ toast, dismiss }`. Must be used under a ToastProvider.
 * CopyButton uses the guarded variant below so it works without a provider.
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

/** Non-throwing variant: returns null when no ToastProvider is mounted. */
export function useOptionalToast(): ToastContextValue | null {
  return useContext(ToastContext);
}
