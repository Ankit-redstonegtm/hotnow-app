"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }
  const onDash = pathname?.startsWith("/dashboard");
  return (
    <header className="border-b" style={{ borderColor: "var(--border)" }}>
      <div className="mx-auto max-w-5xl px-5 py-3.5 flex items-center justify-between">
        <Link href={onDash ? "/dashboard" : "/"} className="font-semibold tracking-tight">
          Hot<span style={{ color: "var(--accent)" }}>Now</span>
        </Link>
        <div className="flex items-center gap-2">
          {onDash && (
            <>
              <Link href="/dashboard" className="btn btn-ghost px-3 py-1.5 text-xs">Opportunities</Link>
              <Link href="/dashboard/situations" className="btn btn-ghost px-3 py-1.5 text-xs">Situations</Link>
            </>
          )}
          <button onClick={signOut} className="btn btn-ghost px-3 py-1.5 text-xs">Sign out</button>
        </div>
      </div>
    </header>
  );
}
