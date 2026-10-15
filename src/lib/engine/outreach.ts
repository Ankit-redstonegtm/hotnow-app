// Outreach generation. Turns a qualified opportunity + a specific contact into a
// personalized email and LinkedIn message, grounded ONLY in the stored evidence for
// that opportunity. It must never invent facts, numbers, quotes, or sources.
//
// Runs on the shared LLM abstraction (reasonWithSchema), so it works on whatever
// reasoning provider is configured (Gemini today). User-initiated only.

import { reasonWithSchema } from "../llm";
import type { OutreachContent } from "./types";

export interface OutreachInput {
  seller: {
    companyName: string;
    productDescription: string;
    valueProposition?: string;
  };
  opportunity: {
    companyName: string;
    companyDomain?: string;
    situationName: string;
    whatHappened: string; // the verified fact
    whyItMatters: string; // the interpretation / demand hypothesis
    evidence: Array<{ url: string; title?: string; date?: string }>;
  };
  contact: {
    fullName: string;
    title: string;
    priority: string; // P1/P2/P3
  };
  /** include a short 3-touch follow-up sequence */
  withSequence?: boolean;
}

// Framework: Eric's RedstoneGTM cold-email approach (the `cold-email-redstonegtm` skill /
// "RSGTM GEX Copywriting Swipe File"). Structure + subject rules below follow his Standard
// Sequence; the grounding guardrails are HotNow's and always override.
const SYSTEM = `You write cold outreach on behalf of a specific seller to one named person at a prospect company, using Eric's RedstoneGTM framework. You're given a real, evidence-backed reason the prospect is worth contacting NOW ("what happened") and why it might create demand ("why it matters").

GROUNDING RULES (absolute — these override the framework):
- Ground every claim ONLY in the provided facts. NEVER invent events, metrics, quotes, funding amounts, names, or sources. If a detail isn't provided, don't state it.
- The "what happened" is an OBSERVED fact — reference it as the reason for reaching out (this is the whole point) and state it as fact.
- The "why it matters" is an INFERENCE, not a fact. NEVER assert the prospect HAS a problem, is struggling, or definitely needs the product. Frame it as a possibility ("often means", "teams in this situation frequently"), never a diagnosis.
- NEVER imply an existing relationship, prior conversation, mutual connection, or that they're already a customer.

ERIC'S PRINCIPLES:
- Write what you'd send after 10 minutes of research on this person. Specific beats clever.
- One value proposition per message. One low-friction CTA, phrased as a question.
- Respect seniority: P1 decision-maker → lead with the business outcome; P2 champion → lead with their function; P3 → keep it light.
- No "I hope this finds you well", no buzzwords, no hype, no fake flattery.

EMAIL STRUCTURE (Eric's Standard Sequence, first touch):
1. "Hey {firstName} – " then a short relevance opener tied to the observed event (the real "why now").
2. The seller's value proposition — what it could help this kind of team do.
3. "Specifically, I think it could help you ..." — how THIS company/role could use it (grounded in the event).
4. CTA: a soft question, e.g. "If we could help you {outcome}, would that be useful?"
5. Sign off as the seller's company.
6. Optional P.S.: a short, relevant analogy — only if it genuinely adds something.

OUTPUT FORMAT (JSON only):
- email.subject: Eric's rule — 2–4 words, looks like it could come from a colleague or customer (e.g. "field reps", "your UK store"). Never clickbait, never lie, no title case gimmicks.
- email.body: 60–120 words, plain text, short paragraphs, no markdown, use the contact's first name, sign off as the seller's company.
- linkedin.body: <= 300 chars, no subject — one or two casual, connection-request-friendly lines with the same trigger + a soft ask.
- followups: ONLY if asked. 2 items (touch 2, touch 3), each { channel, waitDays, subject?, body }. Each tests a DIFFERENT value proposition and lowers CTA friction (e.g. "could I send a short video?"). Never guilt-trip.`;

const SCHEMA = {
  type: "object",
  properties: {
    email: {
      type: "object",
      properties: { subject: { type: "string" }, body: { type: "string" } },
      required: ["subject", "body"],
    },
    linkedin: {
      type: "object",
      properties: { body: { type: "string" } },
      required: ["body"],
    },
    followups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          channel: { type: "string", enum: ["email", "linkedin"] },
          waitDays: { type: "number" },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["channel", "waitDays", "body"],
      },
    },
  },
  required: ["email", "linkedin"],
} as const;

function buildPrompt(input: OutreachInput): string {
  const { seller, opportunity, contact } = input;
  const evidenceLines =
    opportunity.evidence.length > 0
      ? opportunity.evidence
          .slice(0, 5)
          .map((e, i) => `  ${i + 1}. ${e.title || "source"}${e.date ? ` (${e.date})` : ""}${e.url ? ` — ${e.url}` : ""}`)
          .join("\n")
      : "  (none beyond the summary above)";

  return `SELLER
  Company: ${seller.companyName}
  What they sell: ${seller.productDescription}${seller.valueProposition ? `\n  Value proposition: ${seller.valueProposition}` : ""}

PROSPECT
  Company: ${opportunity.companyName}${opportunity.companyDomain ? ` (${opportunity.companyDomain})` : ""}
  Buying situation: ${opportunity.situationName}
  What happened (verified fact): ${opportunity.whatHappened}
  Why it matters (inference, not fact): ${opportunity.whyItMatters}
  Supporting evidence (use only what's here; do not fabricate details beyond these):
${evidenceLines}

CONTACT
  Name: ${contact.fullName}
  Title: ${contact.title}
  Tier: ${contact.priority}

Write the outreach now.${input.withSequence ? " Include a 2-step followups sequence." : " Do not include followups."}`;
}

/** Generate personalized outreach for one opportunity+contact. Throws on provider error. */
export async function generateOutreach(input: OutreachInput): Promise<OutreachContent> {
  const raw = await reasonWithSchema<OutreachContent>({
    system: SYSTEM,
    prompt: buildPrompt(input),
    jsonSchema: SCHEMA as unknown as Record<string, unknown>,
    maxTokens: 1500,
  });

  // Defensive normalization - the model occasionally omits optional fields or nests oddly.
  const content: OutreachContent = {};
  if (raw?.email?.subject && raw?.email?.body) {
    content.email = { subject: String(raw.email.subject).trim(), body: String(raw.email.body).trim() };
  }
  if (raw?.linkedin?.body) {
    content.linkedin = { body: String(raw.linkedin.body).trim() };
  }
  if (Array.isArray(raw?.followups) && input.withSequence) {
    content.followups = raw.followups
      .filter((f) => f && (f.channel === "email" || f.channel === "linkedin") && f.body)
      .slice(0, 3)
      .map((f) => ({
        channel: f.channel,
        waitDays: Number.isFinite(f.waitDays) ? Number(f.waitDays) : 3,
        subject: f.subject ? String(f.subject).trim() : undefined,
        body: String(f.body).trim(),
      }));
  }

  if (!content.email && !content.linkedin) {
    throw new Error("Outreach generation returned no usable email or LinkedIn message");
  }
  return content;
}
