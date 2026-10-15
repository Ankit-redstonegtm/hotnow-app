import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM so no network/paid call happens.
const reasonWithSchema = vi.fn();
vi.mock("../llm", () => ({ reasonWithSchema: (args: unknown) => reasonWithSchema(args) }));

import { generateOutreach, type OutreachInput } from "./outreach";

const input: OutreachInput = {
  seller: { companyName: "ShipFast", productDescription: "Localized last-mile logistics for retailers." },
  opportunity: {
    companyName: "Acme Retail",
    situationName: "Territory expansion",
    whatHappened: "Acme opened its first UK store in March.",
    whyItMatters: "New-market entry creates demand for localized logistics.",
    evidence: [{ url: "https://news/1", title: "Acme opens UK store", date: "2026-03-01" }],
  },
  contact: { fullName: "Dana Lee", title: "VP Operations", priority: "P1" },
};

beforeEach(() => reasonWithSchema.mockReset());

describe("generateOutreach", () => {
  it("returns normalized email + linkedin content", async () => {
    reasonWithSchema.mockResolvedValue({
      email: { subject: "Your UK launch", body: "Hi Dana, congrats on the UK store..." },
      linkedin: { body: "Hi Dana — saw Acme's UK launch, would love to connect." },
    });
    const out = await generateOutreach(input);
    expect(out.email?.subject).toBe("Your UK launch");
    expect(out.email?.body).toContain("Dana");
    expect(out.linkedin?.body).toContain("UK launch");
    expect(out.followups).toBeUndefined(); // not requested
  });

  it("includes a followups sequence only when requested", async () => {
    reasonWithSchema.mockResolvedValue({
      email: { subject: "s", body: "b" },
      linkedin: { body: "l" },
      followups: [
        { channel: "email", waitDays: 3, body: "Just following up." },
        { channel: "linkedin", waitDays: 5, body: "One more thought." },
      ],
    });
    const out = await generateOutreach({ ...input, withSequence: true });
    expect(out.followups).toHaveLength(2);
    expect(out.followups?.[0].channel).toBe("email");
  });

  it("throws when the model returns neither email nor linkedin", async () => {
    reasonWithSchema.mockResolvedValue({});
    await expect(generateOutreach(input)).rejects.toThrow(/no usable/i);
  });
});

describe("outreach prompt grounding (Step 6A compatibility)", () => {
  const ok = { email: { subject: "s", body: "b" }, linkedin: { body: "l" } };

  it("feeds Gemini the seller value prop, company domain, persona tier, event, and evidence URL", async () => {
    reasonWithSchema.mockResolvedValue(ok);
    await generateOutreach({
      ...input,
      seller: { ...input.seller, valueProposition: "Cut last-mile delivery costs 20%." },
      opportunity: { ...input.opportunity, companyDomain: "acme.com" },
    });
    const prompt: string = reasonWithSchema.mock.calls[0][0].prompt;
    expect(prompt).toContain("Cut last-mile delivery costs"); // value proposition
    expect(prompt).toContain("acme.com"); // company domain
    expect(prompt).toContain("P1"); // persona tier
    expect(prompt).toContain("opened its first UK store"); // observed event
    expect(prompt).toContain("https://news/1"); // evidence source URL
    // fact vs inference is explicit in the prompt framing
    expect(prompt).toMatch(/verified fact/i);
    expect(prompt).toMatch(/inference, not fact/i);
  });

  it("works for a Task-discovered opportunity with no contact email and no evidence", async () => {
    reasonWithSchema.mockResolvedValue(ok);
    const out = await generateOutreach({
      seller: { companyName: "SPOTIO", productDescription: "Field sales execution platform" },
      opportunity: { companyName: "Acme Roofing", situationName: "Scaling field teams", whatHappened: "Posted 6 outside sales roles", whyItMatters: "Scaling field reps often needs territory tooling", evidence: [] },
      contact: { fullName: "Pat Rowe", title: "Director of Field Operations", priority: "P1" },
    });
    expect(out.email).toBeTruthy();
    const prompt: string = reasonWithSchema.mock.calls[0][0].prompt;
    expect(prompt).toContain("Director of Field Operations");
    expect(prompt).toMatch(/none beyond the summary/i); // graceful empty-evidence handling
  });

  it("tolerates a partial seller profile (no value proposition)", async () => {
    reasonWithSchema.mockResolvedValue(ok);
    const out = await generateOutreach({ ...input, seller: { companyName: "ShipFast", productDescription: "" } });
    expect(out.email).toBeTruthy();
    const prompt: string = reasonWithSchema.mock.calls[0][0].prompt;
    expect(prompt).not.toContain("Value proposition:"); // omitted cleanly when absent
  });
});
