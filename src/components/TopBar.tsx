"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function TopBar() {
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <header className="border-b" style={{ borderColor: "var(--border)" }}>
      <div className="mx-auto max-w-5xl px-5 py-3.5 flex items-center justify-between">
        <Link href="/dashboard" className="font-semibold tracking-tight">
          Hot<span style={{ color: "var(--accent)" }}>Now</span>
        </Link>
        <button onClick={signOut} className="btn btn-ghost px-3 py-1.5 text-xs">Sign out</button>
      </div>
    </header>
  );
}
