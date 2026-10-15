import { describe, it, expect } from "vitest";
import { classifyContact, personaMatchesTitle, personaTokens } from "./contacts";

const SPOTIO = ["Field Sales Leader", "RevOps Manager", "Director of Sales Coaching"];
const PHARMA = ["Medical Affairs Director", "Clinical Operations Lead", "Market Access Lead"];

describe("classifyContact (P1/P2/P3 prioritization)", () => {
  it("tiers C-level / founders / VPs as P1 (economic buyers)", () => {
    expect(classifyContact({ title: "Chief Revenue Officer", jobLevel: "" })).toBe("P1");
    expect(classifyContact({ title: "Co-Founder", jobLevel: "" })).toBe("P1");
    expect(classifyContact({ title: "VP of Sales", jobLevel: "" })).toBe("P1");
    expect(classifyContact({ title: "Some title", jobLevel: "C-Team" })).toBe("P1");
  });

  it("tiers directors / managers as P2 (champions)", () => {
    expect(classifyContact({ title: "Director of Operations", jobLevel: "" })).toBe("P2");
    expect(classifyContact({ title: "Senior Manager", jobLevel: "" })).toBe("P2");
    expect(classifyContact({ title: "Operations Manager", jobLevel: "" })).toBe("P2");
    expect(classifyContact({ title: "anything", jobLevel: "Director" })).toBe("P2");
  });

  it("treats 'Head of …' as P1 (a function owner / decision-maker) by design", () => {
    expect(classifyContact({ title: "Head of Growth", jobLevel: "" })).toBe("P1");
  });

  it("tiers everyone else as P3 (wider stakeholders)", () => {
    expect(classifyContact({ title: "Account Executive", jobLevel: "" })).toBe("P3");
    expect(classifyContact({ title: "Software Engineer", jobLevel: "Senior" })).toBe("P3");
    expect(classifyContact({ title: "", jobLevel: "" })).toBe("P3");
  });
});

describe("persona-aware prioritization (seller-specific decision-makers)", () => {
  it("extracts discriminating tokens and drops generic role words", () => {
    const toks = personaTokens(SPOTIO);
    expect(toks).toContain("field");
    expect(toks).toContain("revops");
    expect(toks).not.toContain("sales"); // too generic
    expect(toks).not.toContain("director");
  });

  it("matches a title only against the seller's own personas", () => {
    expect(personaMatchesTitle("Director of Field Operations", SPOTIO)).toBe(true);
    expect(personaMatchesTitle("Director of Field Operations", PHARMA)).toBe(false);
    expect(personaMatchesTitle("Director of Medical Affairs", PHARMA)).toBe(true);
    expect(personaMatchesTitle("anything", [])).toBe(false);
  });

  it("elevates a persona-aligned department leader to P1 — differently per seller", () => {
    expect(classifyContact({ title: "Director of Field Operations", jobLevel: "Director" }, SPOTIO)).toBe("P1");
    expect(classifyContact({ title: "Director of Field Operations", jobLevel: "Director" }, PHARMA)).toBe("P2");
    expect(classifyContact({ title: "Director of Medical Affairs", jobLevel: "Director" }, PHARMA)).toBe("P1");
    expect(classifyContact({ title: "Director of Medical Affairs", jobLevel: "Director" }, SPOTIO)).toBe("P2");
  });

  it("still ranks true economic buyers (C-level/VP) as P1 regardless of persona", () => {
    expect(classifyContact({ title: "Chief Revenue Officer", jobLevel: "C-Team" }, PHARMA)).toBe("P1");
    expect(classifyContact({ title: "VP of Engineering", jobLevel: "VP" }, SPOTIO)).toBe("P1");
  });

  it("is backward compatible with no personas", () => {
    expect(classifyContact({ title: "Account Executive", jobLevel: "" })).toBe("P3");
    expect(classifyContact({ title: "Director of Operations", jobLevel: "" })).toBe("P2");
  });
});
