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
