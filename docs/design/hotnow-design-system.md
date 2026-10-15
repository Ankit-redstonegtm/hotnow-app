# HotNow Design System

The reusable foundation for HotNow's premium UI. Direction: **editorial minimalism + powerful
data interactions** (Linear polish, Clay data controls, Twain guidance, Attio records — not clones).
Phase 2 built the tokens + primitives + a `/dev/ui` gallery; product screens migrate in later phases.

## 1. Principles
- **Calm by default, powerful on demand** — quiet reading surfaces; density/filters/bulk tools reveal where the user does data work.
- **Company identity everywhere** — real logo when available, deterministic monogram fallback, never a blank box.
- **Evidence before claims** — observed fact + source precede HotNow's inference; never blur them.
- **Fast, responsive** — instant hover/focus, short purposeful transitions; latency is narrated, never a frozen spinner.
- **No generic AI-dashboard aesthetics** — no gradients-for-gradients, no robot motifs; editorial type + real data.

## 2. Tokens (`src/app/globals.css` `:root`)
- **Neutrals:** `--bg #faf8f6` `--surface` `--surface-2` `--border` `--border-strong` `--fg` `--muted` `--faint`.
- **Brand:** `--accent #f0333b` `--accent-ink` `--accent-soft` — **reserved for the primary action + brand only.**
- **Semantic (separate from brand):** `--good`/`--good-soft`, `--info`/`--info-soft`, `--warn`/`--warn-soft`, **`--danger`/`--danger-soft`** (errors/destructive — a distinct darker red, *not* the brand red).
- **Contact priority (deliberately not red):** `--p1 #5b4bd6` (indigo), `--p2 #0e8f9f` (teal), `--p3 #6b6771` (gray) + `-soft` fills.
- **Radius:** `--radius-sm 8` / `--radius 10` / `--radius-lg 14`.
- **Elevation:** `--shadow-xs/sm/md/lg` (use by role; cards xs/sm, popovers md, dialogs lg).
- **Type scale:** `--text-11 … --text-display` (11/12/13/14 base/16/18/22/28/36). Fonts: Geist Sans (UI), Geist Mono (numbers/domains).
- **Motion:** `--dur-fast 120ms` / `--dur 160ms` / `--dur-slow 240ms`, `--ease cubic-bezier(.2,0,0,1)`.

**Brand rule (locked):** brand red is for primary/brand only. Errors → `--danger`; priorities → `--p1/2/3`; confidence → good/info/muted; warnings → `--warn`. Never red for those.

## 3. Component conventions
- All interactive components are client (`"use client"`), composed with **`cn()`** (`@/lib/cn`, clsx + tailwind-merge) and variants via **`cva`** (`class-variance-authority`).
- Accessible primitives are **Radix**-wrapped (`@radix-ui/react-*`); icons are **lucide-react** (~16px, 1.75 stroke).
- Overlays animate via shared classes: add `ds-overlay` to a Radix Overlay and `ds-pop` to Radix Content (CSS drives data-state transitions; respects reduced-motion).
- Toasts: **sonner** via `@/components/ui/Toaster` (`<Toaster/>` mounted once; `toast()` anywhere).
- Tables: headless **@tanstack/react-table** via `@/components/ui/DataTable`.

## 4. Components (`src/components/ui/`)
| Component | Notes |
|---|---|
| `Button` | variants: primary (brand), secondary, ghost, subtle, **danger**; sizes sm/md/lg/icon; `loading`. |
| `Input` / `Textarea` / `Label` / `Field` | `.input`-style; `aria-invalid` → danger ring; `Field` adds label + hint/error. |
| `Checkbox` / `Switch` | Radix, accent when on, visible focus ring, reduced-motion safe. |
| `Select` | Radix Select (trigger looks like an input, checked item, typeahead). |
| `MultiSelect` | **searchable** multiselect (popover + filter + checkbox rows + clear) — the Clay-style control. |
| `Dialog` / `Popover` / `DropdownMenu` / `Tooltip` / `Tabs` | Radix-wrapped, `ds-pop`/`ds-overlay` motion, keyboard + focus. |
| `DataTable<T>` | sortable headers, global search, row selection, selection/bulk bar, sticky header, overflow-safe, empty + skeleton slots. |
| `Badge` (+ `ConfidenceBadge`/`EmailStatusBadge`/`PriorityBadge`) | token-driven; email never shows "Verified" unless truly verified; priorities use the P-ramp. |
| `CompanyAvatar` | real logo over monogram fallback, fixed size (no layout shift), `logo` opt-in. |
| `Spinner` / `Skeleton` / `EmptyState` / `Toaster` | loading, content-shaped skeletons, honest empty states, sonner toasts. |

## 5. Usage examples
```tsx
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { MultiSelect } from "@/components/ui/MultiSelect";
import { toast } from "@/components/ui/Toaster";

<Button variant="primary" loading={saving}>Find opportunities</Button>
<Field label="Company domain" hint="We research this."><Input placeholder="spotio.com" /></Field>
<MultiSelect options={INDUSTRIES} value={sel} onChange={setSel} searchPlaceholder="Filter industries…" />
toast.success("Outreach ready", { description: "Copy what you need." });
```

## 6. Interaction standards
- Durations 120–240ms on the shared easing; one orchestrated moment per screen, not scattered effects.
- Hover: subtle surface/border shift. Active: 1px press. Focus-visible: 3px `--accent-soft` ring (or 2px `--accent` outline) on every interactive element.
- Optimistic UI where safe (e.g., feedback), with revert + error toast on failure.
- Long waits get a narrated "working" state (real stages), never an idle spinner.

## 7. Accessibility requirements
- Keyboard operable everywhere (Radix provides roving focus/typeahead/Esc/arrow nav); custom clickables get `role`, `tabIndex`, Enter/Space.
- Visible focus on all interactive elements; `aria-invalid` on errored fields; `aria-sort` on sortable headers; labelled controls.
- Contrast ≥ WCAG AA for text and essential UI; color is never the only signal (pair with text/icon).
- `prefers-reduced-motion` disables non-essential animation (built into the shared keyframes).
- No native `prompt()/confirm()` — use `Dialog`.

## 8. The `/dev/ui` gallery
A development-only route (`src/app/dev/ui`, 404 in production) showing every component in realistic HotNow contexts with clearly-labeled mock data — SPOTIO identity, ICP industry/size/geography selectors, buying-situation card, opportunity preview, evidence display, outreach preview, contact priority badges, loading + empty + toast states. No API calls.
