// CSV values from providers are untrusted spreadsheet input.
export function csvText(rows: Record<string, unknown>[]) {
  if (!rows.length) return "";
  const headers = [...new Set(rows.flatMap(row => Object.keys(row)))];
  const escape = (value: unknown) => {
    let text = value == null ? "" : String(value);
    if (typeof value === "string" && /^[\s]*[=+@\-\t\r]/.test(text)) text = "'" + text;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.map(escape).join(","), ...rows.map(row => headers.map(header => escape(row[header])).join(","))].join("\r\n");
}

export type OpportunityCsvSource = {
  what_happened?: string | null;
  why_it_matters?: string | null;
  confidence?: string | null;
  evidence_date?: string | null;
  companies?: { name?: string | null; normalized_domain?: string | null } | null;
  buying_situations?: { name?: string | null } | null;
  evidence?: { source_url?: string | null }[] | null;
};

export function opportunityCsvRows(opportunities: OpportunityCsvSource[]) {
  return opportunities.map((opportunity) => ({
    company: opportunity.companies?.name ?? "",
    domain: opportunity.companies?.normalized_domain ?? "",
    signal: opportunity.buying_situations?.name ?? "",
    what_happened: opportunity.what_happened ?? "",
    why_it_matters: opportunity.why_it_matters ?? "",
    confidence: opportunity.confidence ?? "",
    evidence_date: opportunity.evidence_date ?? "",
    source: opportunity.evidence?.[0]?.source_url ?? "",
  }));
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const blob = new Blob(["\ufeff" + csvText(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob), anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
