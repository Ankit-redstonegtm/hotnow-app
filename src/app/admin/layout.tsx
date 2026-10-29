import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin/guard";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return (
    <div className="min-h-dvh">
      <header className="border-b" style={{ borderColor: "var(--border)" }}>
        <div className="mx-auto max-w-[1200px] px-4 md:px-6 h-14 flex items-center justify-between gap-3">
          <Link href="/admin" className="font-semibold tracking-tight">Hot<span style={{ color: "var(--accent)" }}>Now</span></Link>
          <p className="text-xs truncate" style={{ color: "var(--muted)" }}>{user.email}</p>
        </div>
      </header>
      <main className="px-4 md:px-6 py-6 max-w-[1200px] mx-auto">{children}</main>
    </div>
  );
}
