"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
        <div className="px-4 h-14 flex items-center gap-2 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="inline-grid place-items-center h-7 w-7 rounded-lg text-white font-bold" style={{ background: "var(--accent)" }}>H</span>
          <span className="font-semibold tracking-tight">Hot<span style={{ color: "var(--accent)" }}>Now</span></span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-5">
          {NAV.map((section, i) => (
            <div key={i}>
              {section.group && (
                <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--faint)" }}>{section.group}</p>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <Link key={item.href} href={item.href} className="nav-item" data-active={isActive(item.href)} onClick={() => setOpen(false)}>
                    <Icon name={item.icon} />
                    <span>{item.label}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t p-3" style={{ borderColor: "var(--border)" }}>
          <div className="px-2 pb-2">
            <p className="text-sm font-medium truncate">{companyName}</p>
            <p className="text-xs truncate" style={{ color: "var(--faint)" }}>{userEmail}</p>
          </div>
          <button onClick={signOut} className="nav-item w-full"><Icon name="signout" /><span>Sign out</span></button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-20 bg-black/20 md:hidden" onClick={() => setOpen(false)} />}

      {/* main */}
      <div className="flex-1 min-w-0" style={{ marginLeft: "0" }}>
        <div className="md:pl-[var(--sidebar)]">
          <header className="sticky top-0 z-10 h-14 flex items-center gap-3 px-4 md:px-6 border-b bg-[var(--bg)]/80 backdrop-blur" style={{ borderColor: "var(--border)" }}>
            <button className="md:hidden btn btn-ghost btn-sm" onClick={() => setOpen(true)} aria-label="Menu">☰</button>
            <div className="flex-1" />
          </header>
          <main className="px-4 md:px-6 py-6 max-w-[1200px] mx-auto">{children}</main>
        </div>
      </div>
    </div>
  );
}

const ICONS = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5",
  building: "M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 21V9h5a1 1 0 0 1 1 1v11M7 8h2M7 12h2M7 16h2M17 13h0M17 17h0",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13A4 4 0 0 1 16 11",
  list: "M8 6h13M8 12h13M8 18h13M3 6h0M3 12h0M3 18h0",
  signal: "M13 2 3 14h7l-1 8 10-12h-7l1-8Z",
  target: "M12 12m-9 0a9 9 0 1 0 18 0 9 9 0 1 0-18 0M12 12m-5 0a5 5 0 1 0 10 0 5 5 0 1 0-10 0M12 12h0",
  sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z",
  signout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
} as const;

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}
