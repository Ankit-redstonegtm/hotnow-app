# HotNow — Premium UX/UI Audit (Phase 1: Design Foundation)

Read-only audit. No app code changed, no deps installed. Grounded in the current `app/src`
on branch `mvp-build`. Design north star: **editorial minimalism + powerful data interactions**,
at the level of Linear (polish), Clay (data controls), Twain (guided flows), Attio (records) —
without cloning any of them.

---

## 1. Current frontend architecture

**Stack:** Next.js 16.4 (App Router, React 19.3), Tailwind v4 (+ Turbopack), Supabase auth. All UI is **hand-built** — no component library.

**Routes (17):**
- Public: `/` (marketing splash), `/login`, `/signup`, `/onboarding`, `/auth/callback`.
- Dashboard (`dashboard/layout.tsx` = auth guard + `AppShell`): `/dashboard` (Home/briefing), `companies`, `companies/[id]` (opportunity detail), `contacts`, `lists`, `lists/[id]`, `signals`, `company-criteria`, `contact-criteria`, `settings`.
- `/admin` (owner-only, outside the dashboard layout).
- Marketing site is a **separate Astro repo** (`hotnow-website/`), not in this codebase.

**Components (12):**
- Composed: `AppShell` (sidebar + topbar), `AuthForm`, `Onboarding` (~600 lines, the 3-step wizard), `OpportunityCard`, `OutreachPanel`, `TopBar`.
- Primitives (`ui/`): `Badge` (Confidence/EmailStatus/Priority), `CompanyAvatar`, `CopyButton`, `EmptyState`, `Spinner`, `Toast`.

**Styling:** one global stylesheet `app/globals.css` — CSS custom properties on `:root` + an `@layer components` set of classes (`.btn`, `.card`, `.pill`, `.tbl`, `.badge`, `.input`, `.nav-item`, `.panel`, `.toast`, `.skeleton`, etc.), consumed via className + **pervasive inline `style={{ color: "var(--…)" }}`**. Tailwind utilities handle layout/spacing/type ad hoc.

**Data/interaction patterns:** pages are client components that `fetch` their own data, poll on intervals (15s), and hold form state in `useState`. Tables, tabs, toggles, dialogs, and icons are all bespoke.

---

## 2. UI dependency audit

| Concern | Current state |
|---|---|
| UI component library | **None** (all custom) |
| Headless primitives (dialog/menu/popover/tooltip/tabs/select) | **None** — ad-hoc or native |
| Icon library | **None** — hand-written inline `<svg>` path strings (inconsistent weight/size) |
| Form library | **None** — raw `useState` + manual validation |
| Table library | **None** — hand-rolled `.tbl` (no sort/filter/column/density controls) |
| Animation library | **None** — CSS `@keyframes` (`.spin`, `.dot`, toast in/out) |
| Styling | Tailwind v4 + custom CSS vars + heavy inline styles |
| Design tokens | A small `:root` set (colors + 2 radii + sidebar width); **no type scale, spacing scale, shadow, or motion tokens** |
| Design-related skills on machine | `apple-design`, `emil-design-eng`, `pick-ui-library`, `ask-sonner`, animation skills (`animate`, `animation-vocabulary`, `improve-animations`), `mobile-native` |

**Recommended smallest additions** (all client-side, all verified React 19 / Next 16 / Tailwind v4 compatible):
1. **Radix UI primitives** (`@radix-ui/react-*`: dialog, dropdown-menu, popover, tooltip, tabs, switch, select) — accessible, unstyled; replaces native dialogs + ad-hoc tabs/toggles. *The highest-leverage addition.*
2. **lucide-react** — one coherent, tree-shakeable icon set; retire the hand-written SVG paths.
3. **@tanstack/react-table** (headless) — Clay-grade Companies/Contacts tables (sort, filter, selection, density, column visibility). Style with Tailwind.
4. **sonner** — polished toasts (there's an `ask-sonner` skill); replaces the custom `Toast`.
5. *Optional:* **motion** (`motion`/framer-motion v11) for restrained interaction polish (tab/layout transitions), **cmdk** for a ⌘K command palette, **react-hook-form** (+ existing `zod`) for the heavier criteria forms.

Keep: Tailwind v4, the token layer (extend it), `zod`. Add **class-variance-authority** + **tailwind-merge** for typed component variants. Net new runtime weight is modest and all tree-shaken.

---

## 3. Top 15 UX / design problems (prioritized)

1. **The two long waits dominate the first session** — Clay research **~90s** in onboarding, then Parallel Task discovery **~3–4 min** after "Find opportunities." Progress is honest but *feels idle*; this is the #1 problem.
2. **Empty states read as "unfinished"** — every rich component only renders with data, so a fresh account looks bare and un-premium precisely when first impressions form.
3. **Native `prompt()` / `confirm()`** for "Save as list" and admin "Clear" — jarring against the otherwise-polished UI; not accessible or themeable.
4. **No dialog / dropdown / combobox / popover / tooltip primitives** — caps the "powerful data interactions" the product needs (bulk actions, filters, column menus, inline edit).
5. **Hand-rolled tables** — no sorting, filtering, density, or column controls; Companies/Contacts feel like static lists, not Clay-like data surfaces.
6. **No icon system** — inline SVG path strings vary in stroke weight/size and are hard to maintain.
7. **Pervasive inline styles** (`style={{ var(--…) }}`) — the main source of drift; makes consistency and theming fragile.
8. **Ad-hoc tabs & toggles** — the outreach Email/LinkedIn tabs and onboarding switches are one-off inline implementations, not shared, accessible primitives.
9. **Accent overloaded** — red (`--accent #f0333b`) is simultaneously the brand, primary-button, and P1 color, and reads as "error." Semantic colors (good/info/warn) aren't clearly separated from brand, muddying meaning.
10. **No type or spacing scale** — headings/body sizes and gaps are applied via scattered Tailwind utilities; rhythm drifts screen to screen.
11. **No elevation/shadow system** — hierarchy rests on hairline borders; the UI is flat and lacks the quiet depth of a funded SaaS.
12. **Onboarding is 3 steps + a wait before value**, and the Company/Contact criteria are **duplicated** between onboarding and standalone Targeting pages (drift risk).
13. **Companies vs. Contacts are split, with an opaque auto-running enrichment pipeline** — no unified, Attio-style **company record** that fuses the opportunity + its people + its evidence.
14. **No opportunity workflow state** (New → Reviewed → Contacted → Snoozed/Dismissed) — opportunities just accumulate; the "act on today's 3" loop has no closure.
15. **Marketing site is old/inconsistent** with the app, and app responsiveness is functional-but-basic (inline `maxWidth`, a few fixed widths); mobile is usable, not considered.

*Accessibility threads through several of these:* native dialogs, some clickable `<div>`s, inconsistent `aria`/labels, and focus states that exist but aren't uniform.

---

## 4. Recommended design stack

- **Primitives:** Radix UI (dialog, dropdown-menu, popover, tooltip, tabs, switch, select/combobox) → wrapped in a thin `ui/` layer styled with Tailwind + tokens.
- **Icons:** lucide-react (one import, consistent 1.5–2px stroke to match current drawing).
- **Tables:** @tanstack/react-table (headless) for Companies + Contacts; keep markup/Tailwind styling.
- **Toasts:** sonner.
- **Variants:** class-variance-authority + tailwind-merge (`cn()` helper) for typed, consistent component variants.
- **Motion (optional, recommended):** `motion` for tab/layout/list transitions and the "your employee is working" onboarding moment; always behind `prefers-reduced-motion`.
- **Forms (optional):** react-hook-form + the existing `zod` for criteria/onboarding.
- **Command palette (optional):** cmdk for ⌘K.

All are client-only, React-19-ready, and style through Tailwind v4 (no v3 config assumptions). Keep the stack this small — resist a full component kit (shadcn can scaffold the Radix wrappers, but adopt selectively, not wholesale).

---

## 5. Brand foundation — "Editorial minimalism + powerful data interactions"

Principles to encode:
- **Calm by default, powerful on demand** — the briefing is quiet and readable; density, filters, and bulk tools reveal progressively (Clay-like) only where the user is doing data work.
- **Company identity everywhere** — real logos (favicon/Clearbit-style) with the monogram avatar as fallback; the company is the hero of every record.
- **Evidence before claims** — the observed *fact* and its source always visually precede HotNow's *inference*; never blur them.
- **Fast, responsive interactions** — optimistic UI, instant hovers/focus, snappy transitions; latency is backgrounded and narrated, never a frozen spinner.
- **No generic AI-dashboard aesthetics** — no purple gradients, no robot icons, no "AI is thinking" theater; editorial typography and real data instead.

**Brand decision to make:** keep red as the brand accent but **demote it from doing three jobs**. Recommended: a refined warm-neutral canvas, a single confident brand accent (red, used sparingly for brand/primary only), and a **separate semantic set** (success/info/warn/danger) so P-tiers and states stop competing with the brand. (This is a founder call — flagged, not changed.)

---

## 6. Design-system specification (proposed)

**Typography** — Geist Sans (UI) + Geist Mono (numbers/data/domains). Token scale:
`--text-11 11 / 12 / 13 / 14(base) / 16 / 18 / 22 / 28 / 36`, with paired line-heights and `-0.01em` to `-0.02em` tracking on headings, `+0.04em` uppercase tracking on labels. One scale, applied via tokens, not ad-hoc `text-*`.

**Color** — keep the warm neutral ramp (`--bg`→`--faint`), harden to a 10-step neutral. Brand `--accent #f0333b` + `--accent-ink`/`--accent-soft`. **Separate** semantics: `--success #16a06a`, `--info #2f6df0`, `--warn #c98a12`, `--danger` (distinct from brand red). Define on `:root`; structure for a future dark mode even if light-only ships first.

**Spacing** — 4px base: `4 8 12 16 20 24 32 40 48 64`. Expose as tokens + a density flag (comfortable/compact) for tables.

**Radius** — `--radius-sm 8 / --radius 10 / --radius-lg 14 / --radius-full`. (Tightens the current 12/9.)

**Shadow/elevation** — introduce `--shadow-xs` (hairline + 1px), `--shadow-sm` (cards), `--shadow-md` (popovers/dialogs), `--shadow-lg` (command palette). Use sparingly, by role.

**Component architecture** — three layers: (a) `ui/` Radix-wrapped primitives (Button, Dialog, Menu, Tooltip, Tabs, Switch, Select, Table, Toast, Badge, Avatar, EmptyState, Skeleton) with `cva` variants; (b) composed app components (OpportunityCard, OutreachPanel, CompanyRecord, SituationCard); (c) page layouts. Replace inline styles with variant classes.

**Motion** — durations 120/160/240ms; easing `cubic-bezier(.2,.0,.0,1)` (decelerate) for enter, standard for hover; orchestrate *one* moment per screen (e.g., briefing cards stagger-in), not scattered effects; honor reduced-motion.

**Breakpoints** — Tailwind defaults (sm 640 / md 768 / lg 1024 / xl 1280); desktop-first app, but every screen must work at 390px with no horizontal scroll.

**Loading & empty patterns** — content-shaped skeletons (not generic bars); a dedicated **"working" state** for the 90s/3–4min waits that narrates real stages + lets the user keep working; empty states with exactly one primary action and an honest line (never fake example rows).

---

## 7. Screen-by-screen redesign recommendations

- **Auth (`/login`,`/signup`):** goal = get in fast. One calm centered card, Radix inputs, Google button, inline error. Low effort, high polish — quick win.
- **Onboarding:** goal = confirm understanding with minimal clicks. Reframe the ~90s research as "your employee is researching" with staged narration; let Company/Contacts steps be filled *during* it; make the "what I understood" card the hero (Attio-record feel); dedupe criteria with the standalone pages (shared component).
- **Daily briefing (`/dashboard`):** goal = "here are today's ≤3, act now." Make it a true briefing — big, confident "3 companies worth contacting today," each card previewing company + why-now + recommended contact + a one-click **Review outreach**. Hide the discovery wait behind a calm working banner.
- **Opportunity detail (`companies/[id]`):** goal = decide + act. Keep the strong fact-vs-inference split; upgrade to an **Attio-style company record**: identity header with real logo, tabbed/segmented *Why now · People · Outreach*, evidence as first-class citations, a visible **workflow status** control (New/Reviewed/Contacted/Dismissed).
- **Contacts + tables (`contacts`, `companies` list):** goal = work the data. Adopt TanStack table — sort, filter, density, column menu, sticky header, bulk actions via a Radix toolbar; replace native "Save as list" with a Radix dialog; persona tiers as quiet chips.
- **Lists / Settings / Targeting:** goal = configure without friction. Demote Lists from primary nav; Settings → sectioned cards with Radix switches; Targeting → shared criteria component with the onboarding steps.
- **Marketing site (separate repo):** goal = convert. Rebuild to match the app's editorial system; keep the single domain-capture CTA.

---

## 8. Phased implementation plan (independently reviewable)

Each phase: ships behind the same tokens, is independently reviewable, touches **no backend/API contracts**.

1. **Design system foundation** — add Radix/lucide/tanstack-table/sonner/cva; define the full token set (type/space/radius/shadow/motion); build the `ui/` primitive layer; `cn()` helper. *Accept:* primitives rendered in a `/ui` gallery, tokens applied, no visual regressions on existing screens.
2. **Authentication** — restyle `/login` `/signup` on the new primitives. *Accept:* pixel-clean, accessible, error states.
3. **Onboarding** — new "employee is working" research state, hero understanding card, shared criteria, Radix switches/steppers. *Accept:* full flow with Clay path, no logic change.
4. **Daily briefing** — the briefing redesign with richer, action-first cards. *Accept:* real counts, honest states, ≤3 hero.
5. **Opportunity detail** — Attio-style company record + workflow status + evidence citations. *Accept:* fact/inference preserved, outreach panel intact.
6. **Contacts & tables** — TanStack tables, dialogs replacing native prompts, bulk tools. *Accept:* sort/filter/density + save-as-list dialog.
7. **Remaining screens** — Lists, Settings, Targeting on the system.
8. **Marketing website** — rebuild in the Astro repo to match.
9. **Final polish** — motion pass, responsive sweep (390px), a11y pass, empty/loading audit, ⌘K (optional).

Parallelizable after Phase 1: {Auth}, {Onboarding}, {Tables/Contacts}, {Marketing} are largely independent; Briefing → Detail share the card/record components so sequence them.

---

## 9. Risks & compatibility concerns

- **Bleeding-edge stack:** Next 16.4 + React 19.3 + Tailwind v4 are very new; pin exact versions of any added lib and smoke-test (Radix, TanStack, sonner all support React 19, but verify under Turbopack). Add deps one at a time.
- **Tailwind v4:** some libraries assume a v3 `tailwind.config.js`; v4 is CSS-first — confirm each lib styles via classes, not a v3 preset.
- **Inline-style → token migration is large** and the main regression risk; do it screen-by-screen behind the gallery, not in one sweep.
- **Don't touch the backend:** all API routes, response shapes, RLS, and the Clay/Parallel/Blitz/Gemini pipeline must stay byte-stable; this is a presentation-layer redesign only.
- **Red-accent change is a brand decision**, not an engineering one — needs founder sign-off before recoloring primary/P1.
- **Bundle growth:** keep the stack minimal (Radix + lucide + tanstack + sonner + cva); resist a full kit. Motion/cmdk are optional.
- **Logos:** real company logos need an external source (favicon/Clearbit); gate behind the monogram fallback and consider privacy/caching.

---

*Stop point: audit only. No code, deps, or backend changed. Next step is Phase 2 — build the design-system foundation (Section 8.1) for review before touching product screens.*
