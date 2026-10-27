"use client";
import { useEffect, useRef, useState } from "react";
import { apiJson } from "@/lib/workspace";
export default function SaveListDialog({ open, onClose, kind, ids, onSaved }: { open: boolean; onClose: () => void; kind: "companies" | "contacts"; ids: string[]; onSaved: (message: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { if (open) { setError(""); setName(kind === "contacts" ? "Decision-makers" : "Hot companies"); dialog.current?.showModal(); } else dialog.current?.close(); }, [open, kind]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const result = await apiJson("/api/lists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, kind, [kind === "contacts" ? "contactIds" : "opportunityIds"]: ids }) });
      onSaved(`Saved “${result.list.name}” with ${result.added} ${kind}.`); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save this list"); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="save-dialog" aria-labelledby="save-list-title" onCancel={event => { if (busy) event.preventDefault(); }} onClose={onClose}>
    <form onSubmit={save}><div className="flex items-center justify-between gap-4"><h2 id="save-list-title" className="text-lg font-semibold">Save to a list</h2><button type="button" onClick={onClose} disabled={busy} aria-label="Close dialog">×</button></div>
      <p className="text-sm mt-2 mb-5" style={{ color: "var(--muted)" }}>{ids.length} selected {kind}, saved to this company workspace.</p>
      <label className="label" htmlFor="list-name">List name</label><input id="list-name" className="input" autoFocus maxLength={100} required value={name} onChange={event => setName(event.target.value)} />
      {error && <p className="text-sm mt-3" role="alert" style={{ color: "var(--accent-ink)" }}>{error}</p>}
      <div className="flex justify-end gap-2 mt-6"><button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="btn btn-primary" disabled={busy || !name.trim() || !ids.length}>{busy ? "Saving…" : "Save list"}</button></div>
    </form>
  </dialog>;
}
