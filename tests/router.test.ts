import { describe, expect, it } from "vitest";
import {
  buildReferralHandover,
  classifyReferral,
} from "../src/lib/handovers";
import { filterForAgent, redactForAgent, route } from "../src/lib/router";
import type { CaseRecord } from "../src/lib/types";

const base: CaseRecord = {
  caseId: "SSA-TEST-0001",
  summary: "Test case.",
  channels: [],
  scamType: "unknown",
  financialLoss: { reported: false, amountAud: null, paymentMethod: null },
  compromisedInformation: [],
  incidentOngoing: false,
  indicators: {
    urgency: "low",
    urgencyReasons: [],
    vulnerability: [],
    telecomRisk: false,
  },
  missingInformation: [],
  conflictingInformation: [],
  uncertainInformation: [],
  entities: {
    phoneNumbers: [],
    urls: [],
    bankAccounts: [],
    onlineHandles: [],
    organisationsImpersonated: [],
  },
};

const full: CaseRecord = {
  ...base,
  summary:
    "The person transferred $4,200 to a 'safe account' after a call from 0400 000 000 directing them to examplebank-secure.example and @fakebank.",
  channels: ["sms"],
  financialLoss: { reported: true, amountAud: 4200, paymentMethod: "transfer" },
  compromisedInformation: ["bank login", "one-time code"],
  indicators: {
    urgency: "high",
    urgencyReasons: ["AUD 4,200 transferred and incident ongoing"],
    vulnerability: ["elderly", "lives alone"],
    telecomRisk: false,
  },
  entities: {
    phoneNumbers: ["0400 000 000"],
    urls: ["https://examplebank-secure.example"],
    bankAccounts: ["BSB 000-000 acct 12345678"],
    onlineHandles: ["@fakebank"],
    organisationsImpersonated: ["Example Bank"],
  },
};

describe("route() — activation rules", () => {
  it("activates banking when a financial loss is reported", () => {
    const r = route({
      ...base,
      financialLoss: { reported: true, amountAud: 100, paymentMethod: null },
    });
    expect(r.activatedAgents).toContain("banking");
    expect(r.rulesFired.some((x) => x.startsWith("BANK-01"))).toBe(true);
  });

  it("DEF-11: a payee bank account activates banking, not digital_platform", () => {
    const r = route({
      ...base,
      entities: { ...base.entities, bankAccounts: ["BSB 000-000 12345678"] },
    });
    expect(r.activatedAgents).toEqual(["banking"]);
    expect(r.rulesFired.some((x) => x.startsWith("DIG-02"))).toBe(false);
  });

  it("BANK-02 does not fire on a non-banking 'account' (email account)", () => {
    const r = route({ ...base, channels: ["email"], compromisedInformation: ["email account password"] });
    expect(r.activatedAgents).toEqual(["digital_platform"]);
  });

  it("activates telecom for SMS channel", () => {
    expect(route({ ...base, channels: ["sms"] }).activatedAgents).toEqual(["telecom"]);
  });

  it("DEF-10: telecomRisk activates telecom even with no phone channel", () => {
    const r = route({
      ...base,
      channels: ["email"],
      indicators: { ...base.indicators, telecomRisk: true },
    });
    expect(r.activatedAgents).toContain("telecom");
    expect(r.rulesFired.some((x) => x.startsWith("TEL-03"))).toBe(true);
  });

  it("DIG-03: identity documents disclosed activate digital_platform", () => {
    const r = route({ ...base, compromisedInformation: ["driver licence photo"] });
    expect(r.activatedAgents).toContain("digital_platform");
  });

  it("activates all three for a multi-channel case", () => {
    const r = route(full);
    expect(new Set(r.activatedAgents)).toEqual(
      new Set(["banking", "telecom", "digital_platform"]),
    );
    expect(r.needsHumanJudgement).toBe(false);
  });

  it("DEF-06: flags human judgement instead of guessing when nothing matches", () => {
    const r = route({ ...base, channels: ["in_person"], scamType: "other" });
    expect(r.activatedAgents).toEqual([]);
    expect(r.needsHumanJudgement).toBe(true);
    expect(r.rulesFired[0]).toMatch(/^NONE/);
    expect(r.disclosureLog).toEqual([]);
  });

  it("fast-tracks high urgency instead of bypassing", () => {
    const r = route({
      ...base,
      channels: ["phone_call"],
      indicators: { ...base.indicators, urgency: "high" },
    });
    expect(r.fastTrack).toBe(true);
    expect(r.activatedAgents.length).toBeGreaterThan(0);
  });
});

describe("filterForAgent() — field-level access control", () => {
  it("telecom never receives financial loss or compromised credentials", () => {
    const { view, fieldsShared } = filterForAgent(full, "telecom");
    expect(view.financialLoss).toBeUndefined();
    expect(view.compromisedInformation).toBeUndefined();
    expect(fieldsShared).not.toContain("financialLoss");
    expect(view.entities?.phoneNumbers).toEqual(["0400 000 000"]);
    expect(view.entities?.urls).toEqual([]);
    expect(view.entities?.bankAccounts).toEqual([]);
  });

  it("banking never receives phone numbers, URLs or handles", () => {
    const { view } = filterForAgent(full, "banking");
    expect(view.financialLoss?.amountAud).toBe(4200);
    expect(view.entities?.phoneNumbers).toEqual([]);
    expect(view.entities?.urls).toEqual([]);
    expect(view.entities?.onlineHandles).toEqual([]);
    expect(view.entities?.bankAccounts).toEqual(["BSB 000-000 acct 12345678"]);
    expect(view.channels).toBeUndefined();
  });

  it("digital_platform receives URLs/handles but not financial details", () => {
    const { view } = filterForAgent(full, "digital_platform");
    expect(view.entities?.urls).toEqual(["https://examplebank-secure.example"]);
    expect(view.entities?.onlineHandles).toEqual(["@fakebank"]);
    expect(view.financialLoss).toBeUndefined();
    expect(view.entities?.bankAccounts).toEqual([]);
  });

  it("the disclosure log matches the filtered view", () => {
    const r = route(full);
    for (const entry of r.disclosureLog) {
      const view = r.filteredViews[entry.agent];
      for (const f of entry.fieldsShared) {
        const top = f.split(/[ .]/)[0] as keyof CaseRecord;
        expect(view[top]).toBeDefined();
      }
    }
  });
});

describe("redactForAgent() — DEF-03 free-text leakage", () => {
  it("telecom does not see the amount, URL or handle in the summary", () => {
    const { view } = filterForAgent(full, "telecom");
    expect(view.summary).not.toMatch(/4,?200/);
    expect(view.summary).not.toMatch(/examplebank-secure/);
    expect(view.summary).not.toMatch(/@fakebank/);
    expect(view.summary).toMatch(/0400 000 000/); // it IS allowed the number
    expect(view.indicators?.urgencyReasons[0]).not.toMatch(/4,?200/);
  });

  it("banking does not see the phone number, URL or handle but keeps the amount", () => {
    const { view } = filterForAgent(full, "banking");
    expect(view.summary).toMatch(/4,200/);
    expect(view.summary).not.toMatch(/0400 000 000/);
    expect(view.summary).not.toMatch(/examplebank-secure/);
    expect(view.summary).not.toMatch(/@fakebank/);
  });

  it("digital_platform does not see the amount or phone number", () => {
    const { view } = filterForAgent(full, "digital_platform");
    expect(view.summary).not.toMatch(/4,?200/);
    expect(view.summary).not.toMatch(/0400 000 000/);
    expect(view.summary).toMatch(/examplebank-secure/);
  });

  it("handles the sample-3 phrasing 'AUD 18,500' and '+61 400 000 001'", () => {
    const t = "He sent about AUD 18,500 and is messaged from +61 400 000 001 by @crypto.gains.example";
    const r = redactForAgent(t, "digital_platform");
    expect(r).not.toMatch(/18,?500/);
    expect(r).not.toMatch(/400 000 001/);
    expect(r).toMatch(/@crypto\.gains\.example/);
  });
});

describe("handovers — DEF-07", () => {
  it("classifies the coordinator's referral names", () => {
    expect(classifyReferral("Government scam-reporting service")).toBe("government_reporting");
    expect(classifyReferral("Identity-recovery / victim-support organisation")).toBe("identity_recovery");
    expect(classifyReferral("Community support organisation")).toBe("community_support");
    expect(classifyReferral("Law enforcement")).toBe("law_enforcement");
    expect(classifyReferral("Something unknown")).toBeNull();
  });

  it("community support gets vulnerability context and nothing financial", () => {
    const h = buildReferralHandover(full, "community_support", "vulnerable");
    expect(h.record.financialLoss).toBeUndefined();
    expect(h.record.compromisedInformation).toBeUndefined();
    expect(h.record.entities).toBeUndefined();
    expect((h.record.indicators as { vulnerability: string[] }).vulnerability).toEqual([
      "elderly",
      "lives alone",
    ]);
    expect(h.record.summary).not.toMatch(/4,?200/);
  });

  it("government reporting gets the pattern without the person's loss amount", () => {
    const h = buildReferralHandover(full, "government_reporting", "report");
    expect(h.record.financialLoss).toBeUndefined();
    expect(h.record.summary).toBeUndefined();
    const ents = h.record.entities as CaseRecord["entities"];
    expect(ents.phoneNumbers).toEqual(["0400 000 000"]);
    expect(ents.bankAccounts).toBeUndefined();
  });
});
