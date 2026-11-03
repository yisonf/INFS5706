import { describe, expect, it } from "vitest";
import { filterForAgent, route } from "../src/lib/router";
import type { CaseRecord } from "../src/lib/types";

const base: CaseRecord = {
  caseId: "SSA-TEST-0001",
  summary: "Test case.",
  channels: [],
  scamType: "unknown",
  financialLoss: { reported: false, amountAud: null, paymentMethod: null },
  compromisedInformation: [],
  incidentOngoing: false,
  indicators: { urgency: "low", urgencyReasons: [], vulnerability: [] },
  missingInformation: [],
  conflictingInformation: [],
  uncertainInformation: [],
  entities: {
    phoneNumbers: [],
    urls: [],
    accountsOrHandles: [],
    organisationsImpersonated: [],
  },
};

describe("route()", () => {
  it("activates banking when a financial loss is reported", () => {
    const r = route({
      ...base,
      financialLoss: { reported: true, amountAud: 100, paymentMethod: null },
    });
    expect(r.activatedAgents).toContain("banking");
    expect(r.rulesFired.some((x) => x.startsWith("BANK-01"))).toBe(true);
  });

  it("activates telecom for SMS channel", () => {
    const r = route({ ...base, channels: ["sms"] });
    expect(r.activatedAgents).toEqual(["telecom"]);
  });

  it("activates digital_platform when URLs are present", () => {
    const r = route({
      ...base,
      entities: { ...base.entities, urls: ["https://bad.example"] },
    });
    expect(r.activatedAgents).toContain("digital_platform");
  });

  it("activates multiple agents for a multi-channel case", () => {
    const r = route({
      ...base,
      channels: ["sms", "website"],
      financialLoss: { reported: true, amountAud: 4200, paymentMethod: null },
    });
    expect(new Set(r.activatedAgents)).toEqual(
      new Set(["banking", "telecom", "digital_platform"]),
    );
  });

  it("falls back to digital_platform when nothing matches", () => {
    const r = route(base);
    expect(r.activatedAgents).toEqual(["digital_platform"]);
    expect(r.rulesFired[0]).toMatch(/^DEFAULT-01/);
  });

  it("fast-tracks high urgency instead of bypassing", () => {
    const r = route({
      ...base,
      channels: ["phone_call"],
      indicators: { urgency: "high", urgencyReasons: ["ongoing"], vulnerability: [] },
    });
    expect(r.fastTrack).toBe(true);
    expect(r.activatedAgents.length).toBeGreaterThan(0);
  });
});

describe("filterForAgent() — access control", () => {
  const full: CaseRecord = {
    ...base,
    channels: ["sms"],
    financialLoss: { reported: true, amountAud: 4200, paymentMethod: "transfer" },
    compromisedInformation: ["bank login", "one-time code"],
    entities: {
      phoneNumbers: ["0400 000 000"],
      urls: ["https://bad.example"],
      accountsOrHandles: ["@fake"],
      organisationsImpersonated: ["Example Bank"],
    },
  };

  it("telecom never receives financial loss or compromised credentials", () => {
    const { view, fieldsShared } = filterForAgent(full, "telecom");
    expect(view.financialLoss).toBeUndefined();
    expect(view.compromisedInformation).toBeUndefined();
    expect(fieldsShared).not.toContain("financialLoss");
    expect(view.entities?.phoneNumbers).toEqual(["0400 000 000"]);
    expect(view.entities?.urls).toEqual([]);
  });

  it("banking never receives phone numbers or URLs", () => {
    const { view } = filterForAgent(full, "banking");
    expect(view.financialLoss?.amountAud).toBe(4200);
    expect(view.entities?.phoneNumbers).toEqual([]);
    expect(view.entities?.urls).toEqual([]);
    expect(view.channels).toBeUndefined();
  });

  it("digital_platform receives URLs/handles but not financial details", () => {
    const { view } = filterForAgent(full, "digital_platform");
    expect(view.entities?.urls).toEqual(["https://bad.example"]);
    expect(view.entities?.accountsOrHandles).toEqual(["@fake"]);
    expect(view.financialLoss).toBeUndefined();
  });

  it("the disclosure log matches the filtered view", () => {
    const r = route(full);
    for (const entry of r.disclosureLog) {
      const view = r.filteredViews[entry.agent];
      for (const f of entry.fieldsShared) {
        const top = f.split(".")[0] as keyof CaseRecord;
        expect(view[top]).toBeDefined();
      }
    }
  });
});
