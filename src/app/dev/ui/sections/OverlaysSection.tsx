"use client";

import {
  Bookmark,
  Copy,
  Info,
  MoreHorizontal,
  Trash2,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/Dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { MultiSelect, type MultiSelectOption } from "@/components/ui/MultiSelect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Hint } from "@/components/ui/Tooltip";

/* ----------------------------- MOCK DATA ----------------------------- */
/* All data below is hard-coded sample content for the gallery — no fetch. */

const INDUSTRY_OPTIONS: MultiSelectOption[] = [
  { value: "roofing", label: "Roofing" },
  { value: "solar", label: "Solar" },
  { value: "home-services", label: "Home Services" },
  { value: "medical-devices", label: "Medical Devices" },
  { value: "telecom", label: "Telecom" },
  { value: "distribution", label: "Distribution" },
  { value: "hvac", label: "HVAC" },
  { value: "construction", label: "Construction" },
  { value: "logistics", label: "Logistics" },
  { value: "manufacturing", label: "Manufacturing" },
];

const COMPANY_SIZE_OPTIONS = [
  { value: "1-10", label: "1–10 employees" },
  { value: "11-50", label: "11–50 employees" },
  { value: "51-200", label: "51–200 employees" },
  { value: "201-1000", label: "201–1,000 employees" },
  { value: "1000+", label: "1,000+ employees" },
];

const GEOGRAPHY_OPTIONS: MultiSelectOption[] = [
  { value: "us-northeast", label: "US — Northeast" },
  { value: "us-southeast", label: "US — Southeast" },
  { value: "us-midwest", label: "US — Midwest" },
  { value: "us-southwest", label: "US — Southwest" },
  { value: "us-west", label: "US — West" },
  { value: "canada", label: "Canada" },
  { value: "uk", label: "United Kingdom" },
  { value: "australia", label: "Australia" },
  { value: "germany", label: "Germany" },
];

/* ------------------------- layout helpers ------------------------- */

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function Demo({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
          {title}
        </h3>
        {hint ? (
          <Hint label={hint}>
            <button
              type="button"
              aria-label={hint}
              className="grid h-5 w-5 place-items-center rounded-md outline-none focus-visible:shadow-[0_0_0_3px_var(--accent-soft)]"
              style={{ color: "var(--faint)" }}
            >
              <Info size={15} strokeWidth={1.75} />
            </button>
          </Hint>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/* --------------------------- the section --------------------------- */

export default function OverlaysSection() {
  const [industries, setIndustries] = useState<string[]>(["roofing", "solar"]);
  const [companySize, setCompanySize] = useState<string>("51-200");
  const [geographies, setGeographies] = useState<string[]>(["us-southeast"]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [listName, setListName] = useState("");
  const [savedList, setSavedList] = useState<string | null>(null);

  function handleSaveList() {
    setSavedList(listName.trim() || "Untitled list");
    setDialogOpen(false);
    setListName("");
  }

  return (
    <section className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl font-semibold" style={{ color: "var(--fg)" }}>
          Overlays &amp; Select primitives
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          Dialog, Popover, Dropdown, Tooltip, Tabs, Select &amp; MultiSelect —
          shown with mock HotNow data (no network calls).
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* ICP industry multiselect */}
        <Demo
          title="ICP industries"
          hint="The industries HotNow targets when discovering accounts."
        >
          <Field label="Target industries">
            <MultiSelect
              options={INDUSTRY_OPTIONS}
              value={industries}
              onChange={setIndustries}
              placeholder="All industries"
              searchPlaceholder="Search industries…"
            />
          </Field>
        </Demo>

        {/* Company-size Select */}
        <Demo
          title="Company size"
          hint="Single-choice headcount band for the ICP."
        >
          <Field label="Headcount band">
            <Select value={companySize} onValueChange={setCompanySize}>
              <SelectTrigger aria-label="Company size">
                <SelectValue placeholder="Any size" />
              </SelectTrigger>
              <SelectContent>
                {COMPANY_SIZE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Demo>

        {/* Geography MultiSelect */}
        <Demo
          title="Geography"
          hint="Regions and countries to include in discovery."
        >
          <Field label="Regions / countries">
            <MultiSelect
              options={GEOGRAPHY_OPTIONS}
              value={geographies}
              onChange={setGeographies}
              placeholder="Anywhere"
              searchPlaceholder="Search regions…"
            />
          </Field>
        </Demo>

        {/* DropdownMenu — row actions */}
        <Demo title="Row actions" hint="The ⋯ menu on an opportunity row.">
          <div
            className="flex items-center justify-between rounded-[10px] px-3 py-2.5"
            style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
          >
            <div className="flex flex-col">
              <span className="text-sm font-semibold" style={{ color: "var(--fg)" }}>
                Summit Roofing Co.
              </span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                summitroofing.com · 51–200
              </span>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Row actions"
                  className="grid h-8 w-8 place-items-center rounded-lg outline-none transition-colors hover:bg-[var(--surface-2)] focus-visible:shadow-[0_0_0_3px_var(--accent-soft)]"
                  style={{ color: "var(--muted)" }}
                >
                  <MoreHorizontal size={16} strokeWidth={1.75} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuItem icon={<Bookmark size={16} strokeWidth={1.75} />}>
                  Save to list
                </DropdownMenuItem>
                <DropdownMenuItem icon={<Copy size={16} strokeWidth={1.75} />}>
                  Copy domain
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  danger
                  icon={<Trash2 size={16} strokeWidth={1.75} />}
                >
                  Dismiss
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Demo>

        {/* Tabs */}
        <Demo title="Account tabs" hint="Sections of the account detail view.">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="people">People</TabsTrigger>
              <TabsTrigger value="outreach">Outreach</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Firmographics, signals, and the discovery rationale for this
                account.
              </p>
            </TabsContent>
            <TabsContent value="people">
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Decision-makers, champions, and stakeholders with verified
                contact info.
              </p>
            </TabsContent>
            <TabsContent value="outreach">
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                Drafted first-touch emails and the follow-up sequence.
              </p>
            </TabsContent>
          </Tabs>
        </Demo>

        {/* Dialog */}
        <Demo title="Save as list" hint="Create a named list from the current view.">
          <div className="flex flex-col items-start gap-2">
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <button type="button" className="btn btn-primary btn-sm">
                  <Bookmark size={16} strokeWidth={1.75} />
                  Save as list
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Save as list</DialogTitle>
                  <DialogDescription>
                    Give this selection of accounts a name you&apos;ll recognize
                    later.
                  </DialogDescription>
                </DialogHeader>
                <Field label="List name">
                  <input
                    className="input"
                    autoFocus
                    value={listName}
                    onChange={(e) => setListName(e.target.value)}
                    placeholder="e.g. Southeast roofers, 50–200"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveList();
                    }}
                  />
                </Field>
                <DialogFooter>
                  <DialogClose asChild>
                    <button type="button" className="btn btn-ghost btn-sm">
                      Cancel
                    </button>
                  </DialogClose>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleSaveList}
                  >
                    Save
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {savedList ? (
              <span className="text-xs" style={{ color: "var(--good)" }}>
                Saved “{savedList}” (mock)
              </span>
            ) : null}
          </div>
        </Demo>
      </div>
    </section>
  );
}
