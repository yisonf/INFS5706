import { describe, expect, it } from "vitest";
import {
  combineClarifications,
  MAX_COMBINED_CLARIFICATIONS,
} from "../src/lib/clarifications";

describe("combineClarifications — answers accumulate across rounds", () => {
  it("returns undefined when there are no answers", () => {
    expect(combineClarifications([])).toBeUndefined();
    expect(combineClarifications(["  ", ""])).toBeUndefined();
  });

  it("passes a single round through unchanged", () => {
    expect(combineClarifications(["  Email received 5 Nov at 7:48pm.  "])).toBe(
      "Email received 5 Nov at 7:48pm.",
    );
  });

  it("keeps round 1 facts when round 2 is added (2026-11-06 retest finding)", () => {
    const combined = combineClarifications([
      "Last week he received an SMS from 0400 000 222 with the link parcel-help.example.",
      "The email is still in his inbox and he can forward it today.",
    ])!;
    expect(combined).toContain("0400 000 222");
    expect(combined).toContain("parcel-help.example");
    expect(combined).toContain("still in his inbox");
    expect(combined.indexOf("Round 1 answers")).toBeLessThan(
      combined.indexOf("Round 2 answers"),
    );
  });

  it("tells the model that the later round wins on conflict", () => {
    const combined = combineClarifications([
      "She thinks she transferred $2,000.",
      "Actually no money left her account.",
    ])!;
    expect(combined).toMatch(/later round is authoritative/);
  });

  it("drops blank rounds without renumbering gaps", () => {
    const combined = combineClarifications(["first", "   ", "second"])!;
    expect(combined).toContain("Round 1 answers:\nfirst");
    expect(combined).toContain("Round 2 answers:\nsecond");
    expect(combined).not.toContain("Round 3");
  });

  it("allows more room than a single round used to have", () => {
    expect(MAX_COMBINED_CLARIFICATIONS).toBeGreaterThan(5000);
  });
});
