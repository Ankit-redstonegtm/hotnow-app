"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BrandWordmark } from "@/components/marks";

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
        <Link href="/dashboard" className="inline-flex">
          <BrandWordmark />
        </Link>
        <button onClick={signOut} className="btn btn-ghost px-3 py-1.5 text-xs">Sign out</button>
      </div>
    </header>
  );
}
