"use client";

import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";

export type MultiSelectOption = {
  value: string;
  label: string;
};

export type MultiSelectProps = {
  options: MultiSelectOption[];
  /** Controlled selected values. */
  value: string[];
  /** Called with the full next selection. */
  onChange: (next: string[]) => void;
  /** Trigger placeholder when nothing is selected. */
  placeholder?: string;
  /** Search box placeholder. */
  searchPlaceholder?: string;
  /** Max chips shown in the trigger before collapsing to "+N". Default 3. */
  maxChips?: number;
  /** Disable the control. */
  disabled?: boolean;
  className?: string;
};

/**
 * Searchable, Clay-style multiselect: a trigger (chips or count), a filterable
 * list of checkbox rows, and a Clear action. Built on Popover + Radix Checkbox.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  maxChips = 3,
  disabled = false,
  className,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const selectedOptions = useMemo(
    () => options.filter((o) => selected.has(o.value)),
    [options, selected],
  );

  function toggle(val: string) {
    if (selected.has(val)) {
      onChange(value.filter((v) => v !== val));
    } else {
      onChange([...value, val]);
    }
  }

  function clearAll() {
    onChange([]);
    searchRef.current?.focus();
  }

  const shownChips = selectedOptions.slice(0, maxChips);
  const overflow = selectedOptions.length - shownChips.length;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={placeholder}
          className={cn(
            "flex min-h-[42px] w-full items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-sm outline-none",
            "transition-shadow",
            "focus-visible:border-[var(--accent)] focus-visible:shadow-[0_0_0_3px_var(--accent-soft)]",
            "data-[state=open]:border-[var(--accent)] data-[state=open]:shadow-[0_0_0_3px_var(--accent-soft)]",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border-strong)",
            color: "var(--fg)",
          }}
        >
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {selectedOptions.length === 0 ? (
              <span style={{ color: "var(--faint)" }}>{placeholder}</span>
            ) : (
              <>
                {shownChips.map((o) => (
                  <span
                    key={o.value}
                    className="inline-flex max-w-[12rem] items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{
                      background: "var(--accent-soft)",
                      color: "var(--accent-ink)",
                    }}
                  >
                    <span className="truncate">{o.label}</span>
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={`Remove ${o.label}`}
                      className="grid shrink-0 cursor-pointer place-items-center rounded-full"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(o.value);
                      }}
                    >
                      <X size={12} strokeWidth={2} />
                    </span>
                  </span>
                ))}
                {overflow > 0 ? (
                  <span
                    className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
                    style={{ background: "var(--surface-2)", color: "var(--muted)" }}
                  >
                    +{overflow}
                  </span>
                ) : null}
              </>
            )}
          </span>
          <ChevronDown
            size={16}
            strokeWidth={1.75}
            style={{ color: "var(--faint)" }}
            aria-hidden
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[15rem] p-0"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          searchRef.current?.focus();
        }}
      >
        {/* Search */}
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <Search size={15} strokeWidth={1.75} style={{ color: "var(--faint)" }} aria-hidden />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            aria-controls={listId}
            className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--faint)]"
            style={{ color: "var(--fg)" }}
          />
        </div>

        {/* Options */}
        <div
          id={listId}
          role="listbox"
          aria-multiselectable
          className="max-h-60 overflow-y-auto p-1"
        >
          {filtered.length === 0 ? (
            <p
              className="px-2.5 py-6 text-center text-sm"
              style={{ color: "var(--faint)" }}
            >
              No matches
            </p>
          ) : (
            filtered.map((o) => {
              const isChecked = selected.has(o.value);
              return (
                <label
                  key={o.value}
                  className={cn(
                    "flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm",
                    "transition-colors hover:bg-[var(--surface-2)]",
                    "has-[:focus-visible]:bg-[var(--surface-2)]",
                  )}
                  style={{ color: "var(--fg)" }}
                >
                  <CheckboxPrimitive.Root
                    checked={isChecked}
                    onCheckedChange={() => toggle(o.value)}
                    className={cn(
                      "grid h-4 w-4 shrink-0 place-items-center rounded-[5px] outline-none",
                      "transition-colors",
                      "focus-visible:shadow-[0_0_0_3px_var(--accent-soft)]",
                    )}
                    style={{
                      background: isChecked ? "var(--accent)" : "var(--surface)",
                      border: `1px solid ${isChecked ? "var(--accent)" : "var(--border-strong)"}`,
                    }}
                  >
                    <CheckboxPrimitive.Indicator>
                      <Check size={12} strokeWidth={2.5} color="#fff" />
                    </CheckboxPrimitive.Indicator>
                  </CheckboxPrimitive.Root>
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                </label>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {value.length} selected
          </span>
          <button
            type="button"
            onClick={clearAll}
            disabled={value.length === 0}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-semibold outline-none transition-colors",
              "hover:bg-[var(--surface-2)] focus-visible:shadow-[0_0_0_3px_var(--accent-soft)]",
              "disabled:pointer-events-none disabled:opacity-40",
            )}
            style={{ color: "var(--muted)" }}
          >
            Clear
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
