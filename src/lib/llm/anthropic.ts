// Anthropic Claude client for reasoning stages (Stage B, qualification narrative).
// Server-side only (reads ANTHROPIC_API_KEY).

import Anthropic from "@anthropic-ai/sdk";

export const REASONING_MODEL = "claude-sonnet-5-5";

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

/**
 * Ask Claude for a JSON object. Returns parsed JSON. We instruct JSON-only and
 * extract the first {...} block defensively.
 */
export async function askJSON<T = unknown>(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
  model?: string;
}): Promise<T> {
  const msg = await anthropic().messages.create({
    model: opts.model ?? REASONING_MODEL,
    max_tokens: opts.maxTokens ?? 4000,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return parseJSON<T>(text);
}

function parseJSON<T>(text: string): T {
  const trimmed = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1)) as T;
    throw new Error(`Could not parse JSON from model output: ${text.slice(0, 300)}`);
  }
}
