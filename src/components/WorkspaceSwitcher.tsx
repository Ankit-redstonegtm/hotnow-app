"use client";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { apiFetch, selectWorkspace } from "@/lib/workspace";

type Workspace = { id: string; domain: string; company_name?: string; research_status?: string };

export default function WorkspaceSwitcher({ initialId, initialName, initialDomain }: {
  initialId: string;
  initialName: string;
  initialDomain: string;
}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [active, setActive] = useState(initialId);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const addCompany = useRef<HTMLAnchorElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  useEffect(() => {
    if (open) list.current?.querySelectorAll<HTMLElement>('[role="option"]')[focused]?.focus();
  }, [open, focused]);
  useEffect(() => {
    const id = sessionStorage.getItem("hotnow_workspace") || initialId;
    selectWorkspace(id);
    setActive(id);
    apiFetch("/api/workspaces").then(async r => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setWorkspaces(data.workspaces || []);
    }).catch(e => setError(String(e.message)));
  }, [initialId]);

  async function remove(workspace: Workspace) {
    if (!window.confirm("Delete this domain? Its leads and research will be removed.")) return;
    setOpen(false);
    setBusy(true); setError("");
    try {
      const res = await apiFetch(`/api/workspaces?id=${encodeURIComponent(workspace.id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not delete this domain.");
      const rest = workspaces.filter((item) => item.id !== workspace.id);
      if (!rest.length || data.remaining === 0) {
        sessionStorage.removeItem("hotnow_workspace");
        window.location.assign("/onboarding");
        return;
      }
      if (workspace.id === active) {
        const next = rest[0];
        if (!next) {
          sessionStorage.removeItem("hotnow_workspace");
          window.location.assign("/onboarding");
          return;
        }
        const switchRes = await apiFetch("/api/workspaces", {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: next.id }),
        });
        const switchData = await switchRes.json();
        if (!switchRes.ok) throw new Error(switchData.error || "Could not switch company");
        selectWorkspace(next.id);
        window.location.assign(next.research_status === "done" ? "/dashboard" : "/onboarding");
        return;
      }
      setWorkspaces(rest);
      setBusy(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete this domain.");
      setBusy(false);
    }
  }

  async function change(id: string) {
    setOpen(false);
    if (id === active) { trigger.current?.focus(); return; }
    setBusy(true); setError("");
    try {
      const res = await apiFetch("/api/workspaces", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      selectWorkspace(id);
      const workspace = workspaces.find(w => w.id === id);
      window.location.assign(workspace?.research_status === "done" ? "/dashboard" : "/onboarding");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not switch company"); setBusy(false); }
  }

  const selected = workspaces.find(w => w.id === active);
  const name = selected?.company_name || selected?.domain || (active === initialId ? initialName : "Loading company…");
  const domain = selected?.domain || (active === initialId ? initialDomain : "");

  function showMenu(last = false) {
    setFocused(last ? workspaces.length - 1 : Math.max(0, workspaces.findIndex(w => w.id === active)));
    setOpen(true);
  }

  function menuKey(event: KeyboardEvent<HTMLDivElement>) {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      setFocused(index => event.key === "Home" ? 0 : event.key === "End" ? workspaces.length - 1
        : (index + (event.key === "ArrowDown" ? 1 : -1) + workspaces.length) % workspaces.length);
    } else if (event.key === "Escape") {
      event.preventDefault(); setOpen(false); trigger.current?.focus();
    } else if (event.key === "Tab") {
      event.preventDefault(); setOpen(false);
      (event.shiftKey ? trigger.current : addCompany.current)?.focus();
    }
  }

  return <div className="workspace-switcher" ref={root}>
    <label className="workspace-label" htmlFor={`${id}-trigger`}>Your companies</label>
    <div className="workspace-picker">
    <button type="button" id={`${id}-trigger`} ref={trigger} className="workspace-control" data-busy={busy || undefined}
      disabled={busy || !workspaces.length} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? `${id}-list` : undefined}
      aria-label={`Switch company, current company ${name}`} aria-busy={busy}
      onClick={() => open ? setOpen(false) : showMenu()}
      onKeyDown={event => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); showMenu(event.key === "ArrowUp"); }
      }}>
      <span className="workspace-avatar" aria-hidden="true">
        <CompanyIcon />
      </span>
      <span className="workspace-copy" aria-hidden="true">
        <span className="workspace-name" title={name}>{busy ? "Switching company…" : name}</span>
        <span className="workspace-domain" title={domain}>{domain || "Company workspace"}</span>
      </span>
      <svg className={busy ? "workspace-chevron spin" : "workspace-chevron"} data-open={open} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {busy ? <path d="M20 12a8 8 0 1 1-8-8" /> : <path d="m8 9 4-4 4 4M8 15l4 4 4-4" />}
      </svg>
    </button>
    {open && <div className="workspace-menu">
      <div className="workspace-menu-heading"><span>Switch company</span><span>{workspaces.length}</span></div>
      <div id={`${id}-list`} role="listbox" aria-label="Your companies" className="workspace-options" ref={list} onKeyDown={menuKey}>
        {workspaces.map((workspace, index) => <div key={workspace.id} role="option"
          aria-selected={workspace.id === active} tabIndex={index === focused ? 0 : -1}
          className="workspace-option" onFocus={() => setFocused(index)}
          onClick={() => void change(workspace.id)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void change(workspace.id); }
          }}>
          <span className="workspace-option-avatar" aria-hidden="true"><CompanyIcon /></span>
          <span className="workspace-copy">
            <span className="workspace-name" title={workspace.company_name || workspace.domain}>{workspace.company_name || workspace.domain}</span>
            <span className="workspace-domain" title={workspace.domain}>{workspace.domain}</span>
          </span>
          <span className="workspace-option-actions">
            {workspace.id === active && <svg className="workspace-check" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}
            <button type="button" className="workspace-delete" disabled={busy} aria-label={`Delete ${workspace.domain}`}
              onClick={(event) => { event.stopPropagation(); void remove(workspace); }}
              onKeyDown={(event) => event.stopPropagation()}>Delete</button>
          </span>
        </div>)}
      </div>
    </div>}
    </div>
    <a href="/onboarding?new=1" className="workspace-add" ref={addCompany}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
      <span>Add company</span>
    </a>
    {error && <p role="alert" className="workspace-error">{error}</p>}
  </div>;
}

function CompanyIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 21V9h5a1 1 0 0 1 1 1v11M7 8h3M7 12h3M7 16h3M17 13h0M17 17h0M2 21h20" />
  </svg>;
}
