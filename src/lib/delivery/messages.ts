import type { LeadCard } from "./types";
import { SHEET_HEADERS } from "./types";

export function clip(value: string | null | undefined, max: number) {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

export function slackEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function htmlEscape(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Neutralize values that a spreadsheet would treat as formulas. */
export function sheetCell(value: string) {
  const text = value.replace(/\r?\n/g, " ").slice(0, 1000);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function leadLines(leads: LeadCard[], limit = 8) {
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

export function telegramHtml(summary: string, leads: LeadCard[]) {
  const lines = leadLines(leads).map((lead) => {
    const who = htmlEscape(clip(lead.company || lead.domain || "Company", 80));
    const signal = htmlEscape(clip(lead.signal, 80));
    const fact = htmlEscape(clip(lead.whatHappened, 180));
    const domain = lead.domain ? ` (${htmlEscape(lead.domain)})` : "";
    return `• <b>${who}</b>${domain}${signal ? ` · ${signal}` : ""}${fact ? `\n  ${fact}` : ""}`;
  });
  const extra = leads.length > 8 ? `\nAnd ${leads.length - 8} more in HotNow.` : "";
  return [htmlEscape(summary), ...lines].filter(Boolean).join("\n") + extra;
}

export function teamsText(summary: string, leads: LeadCard[]) {
  const lines = leadLines(leads).map((lead) => {
    const who = clip(lead.company || lead.domain || "Company", 80);
    const signal = clip(lead.signal, 80);
    const fact = clip(lead.whatHappened, 180);
    return `• ${who}${lead.domain ? ` (${lead.domain})` : ""}${signal ? ` · ${signal}` : ""}${fact ? ` — ${fact}` : ""}`;
  });
  const extra = leads.length > 8 ? `\n\nAnd ${leads.length - 8} more in HotNow.` : "";
  return `${summary}${lines.length ? `\n\n${lines.join("\n")}` : ""}${extra}`.slice(0, 5000);
}

export function leadToRow(lead: LeadCard): string[] {
  return [
    lead.company, lead.domain, lead.signal, lead.whatHappened, lead.whyItMatters,
    lead.confidence, lead.evidenceDate, lead.sourceUrl, lead.discoveredAt, lead.link,
  ].map((value) => sheetCell(value));
}

export function sheetRows(leads: LeadCard[]) {
  return leads.slice(0, 50).map(leadToRow);
}

export { SHEET_HEADERS };
