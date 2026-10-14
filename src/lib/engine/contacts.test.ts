import { describe, it, expect } from "vitest";
import { classifyContact } from "./contacts";

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
