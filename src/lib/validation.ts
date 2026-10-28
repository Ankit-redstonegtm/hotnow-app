import { z } from "zod";
const strings = z.array(z.string().trim().min(1).max(160)).max(30);
export const icpInput = z.object({
  geographies: strings.default([]), industries: strings.default([]), excludedIndustries: strings.default([]),
  sizeMin: z.number().int().min(0).max(1_000_000_000).nullable().default(null),
  sizeMax: z.number().int().min(1).max(1_000_000_000).nullable().default(null),
  dailyTarget: z.number().int().min(1).max(15).default(5),
}).refine(v => v.sizeMin === null || v.sizeMax === null || v.sizeMin <= v.sizeMax, { message: "Minimum company size must not exceed maximum size" });
export function validSlackUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && ["hooks.slack.com", "hooks.slack-gov.com"].includes(url.hostname)
      && /^\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(url.pathname) && !url.username && !url.password && !url.port && !url.search && !url.hash;
  } catch { return false; }
}
export const deliveryProviderInput = z.object({
  provider: z.enum(["slack", "google_sheets", "teams", "telegram"]),
});
export const deliveryToggleInput = deliveryProviderInput.extend({ enabled: z.boolean() });
export const slackChannelInput = z.object({
  channelId: z.string().trim().regex(/^[CG][A-Z0-9]{8,32}$/, "Choose a Slack channel"),
});
export const sheetChoiceInput = z.object({
  mode: z.enum(["create", "existing"]),
  spreadsheetUrl: z.string().trim().max(500).optional(),
}).refine((value) => value.mode === "create" || Boolean(value.spreadsheetUrl), { message: "Paste a Google Sheets link" });
export const teamsConnectInput = z.object({
  webhookUrl: z.string().trim().min(1, "Paste a Teams webhook URL").max(4000),
});
export const settingsInput = z.object({
  slackWebhookUrl: z.string().trim().max(512).refine(v => !v || validSlackUrl(v), { message: "Enter a valid HTTPS Slack incoming webhook URL" }).optional(),
  contactCriteria: z.object({
    jobLevels: z.array(z.enum(["C-Team", "VP", "Director", "Manager", "Staff", "Other"])).min(1).max(6).optional(),
    jobFunctions: strings.optional(),
    countryCode: z.string().trim().regex(/^([A-Z]{2})?$/, "Use a two-letter country code such as US").optional(),
  }).optional(),
});
const ids = z.array(z.string().uuid()).max(500).transform(v => [...new Set(v)]).optional();
export const listInput = z.object({ name: z.string().trim().min(1, "Enter a list name").max(100),
  kind: z.enum(["companies", "contacts"]).default("companies"), opportunityIds: ids, contactIds: ids,
}).refine(v => v.kind === "contacts" ? !v.opportunityIds?.length : !v.contactIds?.length, { message: "List items must match the list type" });
export const listItemsInput = z.object({ listId: z.string().uuid(), opportunityIds: ids, contactIds: ids });
export function inputError(error: unknown) {
  if (error instanceof z.ZodError) return error.issues[0]?.message || "Invalid input";
  if (error instanceof SyntaxError) return "Invalid JSON request";
  return null;
}
