"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  Home, Building2, Users, List, Radio, Target, SlidersHorizontal, Settings, LogOut, Menu, X,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { CompanyAvatar } from "@/components/ui/CompanyAvatar";

const ICONS: Record<string, LucideIcon> = {
  home: Home, building: Building2, users: Users, list: List,
  signal: Radio, target: Target, sliders: SlidersHorizontal, settings: Settings,
};

const NAV: { group?: string; items: { label: string; href: string; icon: keyof typeof ICONS }[] }[] = [
  {
    items: [
      { label: "Home", href: "/dashboard", icon: "home" },
      { label: "Companies", href: "/dashboard/companies", icon: "building" },
      { label: "Contacts", href: "/dashboard/contacts", icon: "users" },
      { label: "Lists", href: "/dashboard/lists", icon: "list" },
    ],
  },
  {
    group: "Targeting",
    items: [
      { label: "Signals", href: "/dashboard/signals", icon: "signal" },
      { label: "Company Criteria", href: "/dashboard/company-criteria", icon: "target" },
      { label: "Contact Criteria", href: "/dashboard/contact-criteria", icon: "sliders" },
    ],
  },
  {
    items: [{ label: "Settings", href: "/dashboard/settings", icon: "settings" }],
  },
];

// Flattened href → label for the header title (longest-prefix match handles detail routes).
const TITLES = NAV.flatMap((s) => s.items).sort((a, b) => b.href.length - a.href.length);

export default function AppShell({
  children,
  companyName,
  userEmail,
}: {
  children: React.ReactNode;
  companyName: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === "/dashboard" : pathname?.startsWith(href);

  const pageTitle = TITLES.find((t) => isActive(t.href))?.label ?? "Home";

  return (
    <div className="min-h-dvh flex">
      {/* sidebar */}
      <aside
        className="fixed z-30 inset-y-0 left-0 flex flex-col border-r bg-[var(--surface)] transition-transform md:translate-x-0"
        style={{
          width: "var(--sidebar)",
          borderColor: "var(--border)",
          transform: open ? "translateX(0)" : undefined,
        }}
        data-open={open}
      >
        <div className="px-4 h-14 flex items-center justify-between gap-2 border-b" style={{ borderColor: "var(--border)" }}>
          <Link href="/dashboard" className="flex items-center gap-2 focus-ring rounded" onClick={() => setOpen(false)}>
            <span className="inline-grid place-items-center h-7 w-7 rounded-lg text-white font-bold" style={{ background: "var(--accent)" }}>H</span>
            <span className="font-semibold tracking-tight">Hot<span style={{ color: "var(--accent)" }}>Now</span></span>
          </Link>
          <button className="md:hidden grid h-8 w-8 place-items-center rounded-lg focus-ring" style={{ color: "var(--faint)" }} onClick={() => setOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
          {NAV.map((section, i) => (
            <div key={i}>
              {section.group && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--faint)" }}>{section.group}</p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const ItemIcon = ICONS[item.icon];
                  return (
                    <Link key={item.href} href={item.href} className="nav-item" data-active={isActive(item.href)} onClick={() => setOpen(false)} aria-current={isActive(item.href) ? "page" : undefined}>
                      <ItemIcon size={17} strokeWidth={1.9} aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center gap-2.5 px-1 pb-2.5">
            <CompanyAvatar name={companyName} size={32} />
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-semibold truncate">{companyName}</p>
              <p className="text-xs truncate" style={{ color: "var(--faint)" }}>{userEmail}</p>
            </div>
          </div>
          <button onClick={signOut} className="nav-item w-full"><LogOut size={17} strokeWidth={1.9} aria-hidden /><span>Sign out</span></button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-20 bg-black/20 md:hidden" onClick={() => setOpen(false)} aria-hidden />}

      {/* main */}
      <div className="flex-1 min-w-0">
        <div className="md:pl-[var(--sidebar)]">
          <header className="sticky top-0 z-10 h-14 flex items-center gap-3 px-4 md:px-6 border-b bg-[var(--bg)]/80 backdrop-blur" style={{ borderColor: "var(--border)" }}>
            <button className="md:hidden grid h-9 w-9 place-items-center rounded-lg focus-ring" style={{ color: "var(--fg)" }} onClick={() => setOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
            <span className="font-semibold tracking-tight">{pageTitle}</span>
            <div className="flex-1" />
            <span className="hidden sm:inline-flex items-center gap-2 text-xs rounded-full px-3 py-1" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>
              <CompanyAvatar name={companyName} size={18} />
              <span className="max-w-[160px] truncate">{companyName}</span>
            </span>
          </header>
          <main className="px-4 md:px-6 py-6 max-w-[1200px] mx-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}
