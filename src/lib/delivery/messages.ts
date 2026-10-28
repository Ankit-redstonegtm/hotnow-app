import type { LeadCard } from "./types";

export function clip(value: string | null | undefined, max: number) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

export function slackEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function leadLines(leads: LeadCard[], limit = 8) {
  return leads.slice(0, limit);
}

export function slackText(summary: string, leads: LeadCard[]) {
  const lines = leadLines(leads).map((lead) => {
    const who = slackEscape(clip(lead.company || lead.domain || "Company", 80));
    const signal = slackEscape(clip(lead.signal, 80));
    const fact = slackEscape(clip(lead.whatHappened, 180));
    const domain = lead.domain ? ` (${slackEscape(lead.domain)})` : "";
    return `• *${who}*${domain}${signal ? ` · ${signal}` : ""}${fact ? `\n  ${fact}` : ""}`;
  });
  const extra = leads.length > 8 ? `\nAnd ${leads.length - 8} more in HotNow.` : "";
  return [summary, ...lines].filter(Boolean).join("\n") + extra;
}
