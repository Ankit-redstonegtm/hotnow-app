// Google Gemini client for reasoning stages. Server-side only.
// Reads GEMINI_API_KEY (or GOOGLE_API_KEY).

import { GoogleGenAI } from "@google/genai";

export const GEMINI_MODEL = "gemini-3.8-flash";

let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  if (!client) client = new GoogleGenAI({ apiKey });
  return client;
}

export async function askJSONGemini<T = unknown>(opts: {
  system: string;
  prompt: string;
  maxTokens?: number;
  model?: string;
}): Promise<T> {
  const res = await gemini().models.generateContent({
    model: opts.model ?? GEMINI_MODEL,
    contents: opts.prompt,
    config: {
      systemInstruction: opts.system,
      responseMimeType: "application/json",
      maxOutputTokens: opts.maxTokens ?? 8000,
      temperature: 0.4,
    },
  });
  const text = res.text ?? "";
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
    throw new Error(`Could not parse JSON from Gemini output: ${text.slice(0, 300)}`);
  }
}
