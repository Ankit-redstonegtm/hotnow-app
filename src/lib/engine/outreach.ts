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
  };
  opportunity: {
    companyName: string;
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

const SYSTEM = `You are an expert B2B sales copywriter writing on behalf of a specific seller to a specific person at a prospect company.

You are given a real, evidence-backed reason the prospect is worth contacting NOW ("what happened") and why it creates demand for the seller's product ("why it matters").

ABSOLUTE RULES:
- Ground every claim ONLY in the provided facts. NEVER invent events, metrics, quotes, funding amounts, names, or sources. If a detail isn't provided, don't state it.
- Reference the specific "what happened" as the reason for reaching out - this is the whole point. The "what happened" is an OBSERVED fact; state it as fact.
- The "why it matters" is an INFERENCE, not a fact. NEVER assert that the prospect HAS a problem, is struggling, is failing, or definitely needs the product. Frame relevance as a possibility ("often means", "teams in this situation frequently", "may be worth a look"), never as a diagnosis of their company.
- NEVER imply an existing relationship, a prior conversation, a mutual connection, or that they are already a customer, unless that is in the provided facts.
- Write as the seller, to the named contact. Respect their seniority (P1 = decision-maker: lead with business outcome; P2 = champion: lead with their function's pain; P3 = stakeholder: keep it light).
- Tone: warm, direct, human, concise. No buzzwords, no hype, no "I hope this finds you well", no fake flattery, no "I noticed" if you can be more specific.
- One clear, low-friction call to action (a question or a short ask), not a hard pitch.

OUTPUT FORMAT (JSON only):
- email.subject: <= 60 chars, specific to the trigger, not clickbait.
- email.body: 70-130 words. Plain text, short paragraphs, no markdown, sign off as the seller's company. Use the contact's first name.
- linkedin.body: <= 300 chars. No subject. Even more concise and casual than the email; a connection-request-friendly note.
- followups: ONLY if asked. 2 items (touch 2 and touch 3), each { channel, waitDays, subject?, body }. Short, add a new angle, never guilt-trip.`;

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
          .map((e, i) => `  ${i + 1}. ${e.title || e.url}${e.date ? ` (${e.date})` : ""}`)
          .join("\n")
      : "  (none beyond the summary above)";

  return `SELLER
  Company: ${seller.companyName}
  What they sell: ${seller.productDescription}

PROSPECT
  Company: ${opportunity.companyName}
  Buying situation: ${opportunity.situationName}
  What happened (verified fact): ${opportunity.whatHappened}
  Why it matters (for the seller's product): ${opportunity.whyItMatters}
  Supporting evidence (titles only - do not fabricate details beyond these):
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
