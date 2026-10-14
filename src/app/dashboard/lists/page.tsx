"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type List = { id: string; name: string; kind: string; created_at: string; list_items: { count: number }[] };

export default function ListsPage() {
  const [lists, setLists] = useState<List[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { fetch("/api/lists").then((r) => r.json()).then((j) => { setLists(j.lists ?? []); setLoaded(true); }); }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight mb-1">Lists</h1>
      <p className="text-sm mb-6" style={{ color: "var(--muted)" }}>Saved sets of companies or contacts. Export them or push to Slack.</p>
      {!loaded ? (
        <div className="card p-6"><div className="skeleton h-5 w-40 rounded" /></div>
      ) : lists.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-medium">No lists yet</p>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Save a selection from the Companies or Contacts tab to create your first list.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {lists.map((l) => (
            <Link key={l.id} href={`/dashboard/lists/${l.id}`} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <span className="pill">{l.kind}</span>
                <span className="text-xs" style={{ color: "var(--faint)" }}>{new Date(l.created_at).toLocaleDateString()}</span>
              </div>
              <p className="font-semibold mt-3">{l.name}</p>
              <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>{l.list_items?.[0]?.count ?? 0} items</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
