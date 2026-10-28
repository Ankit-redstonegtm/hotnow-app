// LLM provider dispatcher for reasoning stages (spec §7 - swappable providers).
// Selects a provider by LLM_PROVIDER, else by whichever API key is present.
// Default preference: Gemini (current key), then Anthropic Claude.

import { askJSONGemini } from "./gemini";
import { askJSON as askJSONAnthropic } from "./anthropic";

export type LlmProvider = "gemini" | "anthropic" | "parallel";

/**
 * Pick the reasoning provider. LLM_PROVIDER overrides; otherwise prefer a
 * dedicated LLM key, falling back to "parallel" (Parallel Task API) since the
 * Parallel key is always present for the product. "parallel" callers must supply
 * a JSON schema (askJSON cannot - see reasonWithSchema).
 */
export function activeProvider(): LlmProvider {
  const forced = process.env.LLM_PROVIDER as LlmProvider | undefined;
  if (forced === "gemini" || forced === "anthropic" || forced === "parallel") return forced;
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "parallel";
}

/** Generic JSON reasoning for providers that return free-form text (gemini/anthropic). */
export async function askJSON<T = unknown>(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<T> {
  const p = activeProvider();
  if (p === "gemini") return askJSONGemini<T>(opts);
  if (p === "anthropic") return askJSONAnthropic<T>(opts);
  throw new Error('askJSON does not support the "parallel" provider; use reasonWithSchema');
}

/**
 * Schema-bound JSON reasoning that works for ALL providers, including Parallel's
 * Task API (which requires an output json_schema). Seller research and buying
 * situations use Clay instead of this helper.
 */
export async function reasonWithSchema<T = unknown>(opts: {
  system: string;
  prompt: string;
  jsonSchema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T> {
  const p = activeProvider();
  if (p === "gemini" || p === "anthropic") {
    return askJSON<T>({ system: opts.system, prompt: opts.prompt, maxTokens: opts.maxTokens });
  }
  // parallel: reason with the Task API using the provided schema.
  const { taskRun } = await import("../providers/parallel");
  const { content } = await taskRun<T>({
    input: `${opts.system}\n\n${opts.prompt}`,
    jsonSchema: opts.jsonSchema,
    processor: "core",
  });
  return content;
}
