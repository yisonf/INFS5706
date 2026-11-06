import { describe, expect, it } from "vitest";
import { caseRecordSchema, scamReportSchema } from "../src/lib/schemas";

describe("caseRecordSchema — DEF-08", () => {
  it("rejects the test 6-04 payload (entities missing) — but with defaults it now passes safely", () => {
    const r = caseRecordSchema.safeParse({
      caseId: "SSA-TEST-0001",
      summary: "Test.",
      channels: ["sms"],
      scamType: "phishing",
      financialLoss: { reported: false, amountAud: null, paymentMethod: null },
      compromisedInformation: [],
      incidentOngoing: false,
      indicators: { urgency: "low", urgencyReasons: [], vulnerability: [] },
    });
    // Missing entities is harmless → defaulted, so routing cannot crash on it.
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.entities.phoneNumbers).toEqual([]);
  });

  it("rejects an invalid urgency value", () => {
    const r = caseRecordSchema.safeParse({
      caseId: "x",
      summary: "y",
      indicators: { urgency: "critical", urgencyReasons: [], vulnerability: [] },
    });
    expect(r.success).toBe(false);
  });

  it("rejects a record with no indicators", () => {
    expect(caseRecordSchema.safeParse({ caseId: "x", summary: "y" }).success).toBe(false);
  });
});

describe("scamReportSchema", () => {
  it("requires a 20+ character description", () => {
    expect(scamReportSchema.safeParse({ description: "short" }).success).toBe(false);
    expect(
      scamReportSchema.safeParse({ description: "a".repeat(25) }).success,
    ).toBe(true);
  });
});
