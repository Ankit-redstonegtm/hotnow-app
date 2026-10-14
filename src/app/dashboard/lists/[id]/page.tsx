"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { downloadCSV } from "@/lib/csv";

export default function ListDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [list, setList] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/lists/${id}`).then((r) => r.json()).then((j) => { setList(j.list); setItems(j.items ?? []); setLoaded(true); });
  }, [id]);

  const isContacts = list?.kind === "contacts";

  function exportCsv() {
    const rows = items.map((it) => {
      if (it.contacts) return { name: it.contacts.full_name, title: it.contacts.title, priority: it.contacts.priority, company: it.contacts.companies?.name ?? it.contacts.companies?.normalized_domain ?? "", linkedin: it.contacts.linkedin_url };
      const o = it.opportunities; return { company: o?.companies?.name ?? "", domain: o?.companies?.normalized_domain ?? "", signal: o?.buying_situations?.name ?? "", what_happened: o?.what_happened ?? "" };
    });
    downloadCSV(`hotnow-list-${(list?.name || "list").replace(/\s+/g, "-").toLowerCase()}`, rows);
  }
  async function toSlack() {
    setMsg("Sending to Slack…");
    const r = await fetch("/api/slack/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ listId: id }) });
    const j = await r.json(); setMsg(r.ok ? "Sent to Slack ✓" : j.error);
  }

  return (
    <div>
      <Link href="/dashboard/lists" className="text-sm" style={{ color: "var(--muted)" }}>← Lists</Link>
      <div className="flex items-end justify-between flex-wrap gap-3 mt-2 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{list?.name ?? "List"}</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>{items.length} {isContacts ? "contacts" : "companies"}</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost btn-sm" onClick={exportCsv} disabled={!items.length}>Export CSV</button>
          <button className="btn btn-primary btn-sm" onClick={toSlack} disabled={!items.length}>Send to Slack</button>
        </div>
      </div>
      {msg && <div className="card p-3 mb-4 text-sm" style={{ color: "var(--accent-ink)" }}>{msg}</div>}
      {!loaded ? <div className="card p-6"><div className="skeleton h-5 w-48 rounded" /></div> : (
        <div className="card overflow-x-auto">
          <table className="tbl">
            {isContacts ? (
              <><thead><tr><th>Name</th><th>Title</th><th>Priority</th><th>Company</th></tr></thead>
                <tbody>{items.map((it) => it.contacts && (
                  <tr key={it.id}><td className="font-medium">{it.contacts.full_name}</td><td style={{ color: "var(--muted)" }}>{it.contacts.title}</td><td><span className={`pill pill-${it.contacts.priority?.toLowerCase()}`}>{it.contacts.priority}</span></td><td>{it.contacts.companies?.name || it.contacts.companies?.normalized_domain}</td></tr>
                ))}</tbody></>
            ) : (
              <><thead><tr><th>Company</th><th>Signal</th><th>What happened</th></tr></thead>
                <tbody>{items.map((it) => it.opportunities && (
                  <tr key={it.id}><td className="font-medium">{it.opportunities.companies?.name || it.opportunities.companies?.normalized_domain}</td><td>{it.opportunities.buying_situations?.name && <span className="pill">{it.opportunities.buying_situations.name}</span>}</td><td style={{ color: "var(--muted)", maxWidth: 440 }} className="truncate">{it.opportunities.what_happened}</td></tr>
                ))}</tbody></>
            )}
          </table>
        </div>
      )}
    </div>
  );
}
