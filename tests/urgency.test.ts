import { describe, expect, it } from "vitest";
import type { CaseRecord, ScamReport } from "../src/lib/types";
import { applyUrgencyFloor, maxUrgency } from "../src/lib/urgency";

const baseRecord = (): CaseRecord => ({
  caseId: "SSA-TEST-0001",
  summary: "Test case.",
  channels: [],
  scamType: "unknown",
  financialLoss: { reported: false, amountAud: null, paymentMethod: null },
  compromisedInformation: [],
  incidentOngoing: false,
  indicators: { urgency: "low", urgencyReasons: ["AI reason"], vulnerability: [], telecomRisk: false },
  missingInformation: [],
  conflictingInformation: [],
  uncertainInformation: [],
  entities: { phoneNumbers: [], urls: [], bankAccounts: [], onlineHandles: [], organisationsImpersonated: [] },
});

const baseReport = (): ScamReport => ({
  description: "x".repeat(30),
  contactMethod: "unknown",
  suspectedScamType: "unknown",
  financialLossReported: false,
  informationDisclosed: [],
  incidentOngoing: false,
  reportingOrganisation: "Test",
});

describe("applyUrgencyFloor() — DEF-04", () => {
  it("forces high when the employee ticked incident ongoing, even if AI said low", () => {
    const { record, raised, rulesFired } = applyUrgencyFloor(baseRecord(), {
      ...baseReport(),
      incidentOngoing: true,
    });
    expect(record.indicators.urgency).toBe("high");
    expect(raised).toBe(true);
    expect(rulesFired[0]).toMatch(/^URG-01/);
    expect(record.indicators.urgencyReasons[0]).toMatch(/^Raised by rule from low to high/);
    expect(record.indicators.urgencyReasons).toContain("AI reason");
  });

  it("forces high for remote_access scam type", () => {
    const { record } = applyUrgencyFloor(baseRecord(), {
      ...baseReport(),
      suspectedScamType: "remote_access",
    });
    expect(record.indicators.urgency).toBe("high");
  });

  it("forces high when a one-time code was disclosed", () => {
    const { record } = applyUrgencyFloor(baseRecord(), {
      ...baseReport(),
      informationDisclosed: ["one-time code"],
    });
    expect(record.indicators.urgency).toBe("high");
  });

  it("sets a medium floor for financial loss", () => {
    const { record } = applyUrgencyFloor(baseRecord(), {
      ...baseReport(),
      financialLossReported: true,
    });
    expect(record.indicators.urgency).toBe("medium");
  });

  it("never lowers the AI's rating", () => {
    const rec = baseRecord();
    rec.indicators.urgency = "high";
    const { record, raised } = applyUrgencyFloor(rec, baseReport());
    expect(record.indicators.urgency).toBe("high");
    expect(raised).toBe(false);
    expect(record.indicators.urgencyReasons).toEqual(["AI reason"]);
  });

  it("works from the record alone when no report is supplied", () => {
    const rec = baseRecord();
    rec.incidentOngoing = true;
    const { record } = applyUrgencyFloor(rec, null);
    expect(record.indicators.urgency).toBe("high");
  });

  it("leaves urgency alone when no rule matches", () => {
    const { record, raised, rulesFired } = applyUrgencyFloor(baseRecord(), baseReport());
    expect(record.indicators.urgency).toBe("low");
    expect(raised).toBe(false);
    expect(rulesFired).toEqual([]);
  });
});

describe("maxUrgency()", () => {
  it("orders low < medium < high", () => {
    expect(maxUrgency("low", "medium")).toBe("medium");
    expect(maxUrgency("high", "medium")).toBe("high");
    expect(maxUrgency("low", "low")).toBe("low");
  });
});
