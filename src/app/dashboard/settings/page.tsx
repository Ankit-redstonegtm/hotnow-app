"use client";
import { apiJson } from "@/lib/workspace";
import { useEffect, useState } from "react";
import DeliveryConnections from "@/components/DeliveryConnections";
import LeadCsvExport from "@/components/LeadCsvExport";

export default function SettingsPage() {
  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    apiJson("/api/settings").then((j) => {
      const s = j.settings;
      if (s) { setCompany(s.companyName ?? ""); setDomain(s.domain ?? ""); }
      setLoaded(true);
    }).catch((error) => { setLoadError(error.message); setLoaded(true); });
  }, []);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>Workspace, integrations, and delivery.</p>
      </div>

      {loadError ? <div className="card p-4" role="alert">{loadError}<button className="btn btn-ghost btn-sm ml-3" onClick={() => window.location.reload()}>Retry</button></div> : !loaded ? <div className="card p-6"><div className="skeleton h-5 w-40 rounded" /></div> : (
        <>
          <div className="card p-6">
            <h2 className="font-semibold">Workspace</h2>
            <div className="mt-4 grid sm:grid-cols-2 gap-4">
              <div><label className="label" htmlFor="workspace-company">Company</label><input id="workspace-company" className="input" value={company} disabled /></div>
              <div><label className="label" htmlFor="workspace-domain">Domain</label><input id="workspace-domain" className="input" value={domain} disabled /></div>
            </div>
          </div>

          <div>
            <h2 className="font-semibold">Lead delivery</h2>
            <p className="text-sm mt-1 mb-4" style={{ color: "var(--muted)" }}>Send new opportunities to Slack, or download a CSV.</p>
            <div className="space-y-3">
              <DeliveryConnections variant="settings" />
              <LeadCsvExport />
            </div>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold">Daily opportunities</h2>
            <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>New opportunities on a set schedule are coming soon. For now, start a search from the Pain-Qualified Signals tab whenever you want fresh companies.</p>
          </div>
        </>
      )}
    </div>
  );
}
