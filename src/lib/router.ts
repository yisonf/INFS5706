/**
 * Stage 3 — Agent routing and access control.
 *
 * Deliberately NOT an LLM. Deterministic rules decide which specialist agents
 * are activated and exactly which fields of the case record each one may see.
 * Being deterministic makes this layer auditable and unit-testable, which is
 * the point: the sensitive-data boundary should never depend on a model's mood.
 */
import type { CaseRecord, RoutingDecision, SpecialistKind } from "./types";

type Rule = {
  id: string;
  agent: SpecialistKind;
  when: (c: CaseRecord) => boolean;
};

// Must name something specifically financial. A bare "account" is not enough
// (an "email account password" is a digital-platform matter, not banking).
const BANKING_CREDENTIAL =
  /\b(bank(ing)?|credit card|debit card|card (number|details|pin)|cvv|pin\b|passcode|one[- ]?time (code|password|passcode)|otp|payid|bsb|internet banking|netbank|bank account)\b/i;

export const ROUTING_RULES: Rule[] = [
  {
    id: "BANK-01 financial loss reported",
    agent: "banking",
    when: (c) => c.financialLoss.reported,
  },
  {
    id: "BANK-02 banking credentials or payment details compromised",
    agent: "banking",
    when: (c) => c.compromisedInformation.some((i) => BANKING_CREDENTIAL.test(i)),
  },
  {
    id: "BANK-03 investment or payment-redirect scam type",
    agent: "banking",
    when: (c) =>
      c.scamType === "investment" ||
      c.scamType === "invoice_or_payment_redirect",
  },
  {
    id: "BANK-04 payee bank accounts identified",
    agent: "banking",
    when: (c) => c.entities.bankAccounts.length > 0,
  },
  {
    id: "TEL-01 scammer contacted via SMS or phone call",
    agent: "telecom",
    when: (c) =>
      c.channels.includes("sms") || c.channels.includes("phone_call"),
  },
  {
    id: "TEL-02 scammer phone numbers identified",
    agent: "telecom",
    when: (c) => c.entities.phoneNumbers.length > 0,
  },
  {
    id: "TEL-03 telecom risk indicator (loss of service / SIM or port-out)",
    agent: "telecom",
    when: (c) => c.indicators.telecomRisk === true,
  },
  {
    id: "DIG-01 scammer contacted via social media, website or email",
    agent: "digital_platform",
    when: (c) =>
      c.channels.includes("social_media") ||
      c.channels.includes("website") ||
      c.channels.includes("email"),
  },
  {
    id: "DIG-02 URLs or online handles identified",
    agent: "digital_platform",
    when: (c) =>
      c.entities.urls.length > 0 || c.entities.onlineHandles.length > 0,
  },
  {
    id: "DIG-03 identity theft or identity documents disclosed",
    agent: "digital_platform",
    when: (c) =>
      c.scamType === "identity_theft" ||
      c.compromisedInformation.some((i) =>
        /licen[cs]e|passport|medicare|identity document|tax file|tfn/i.test(i),
      ),
  },
];

/**
 * Access-control policy: the fields each specialist is permitted to receive.
 * Everything not listed is withheld. Note that no specialist receives another
 * organisation's data — the record only ever contains what the reporting
 * organisation captured from the affected person.
 */
export const ACCESS_POLICY: Record<SpecialistKind, (keyof CaseRecord)[]> = {
  banking: [
    "caseId",
    "summary",
    "scamType",
    "financialLoss",
    "compromisedInformation",
    "incidentOngoing",
    "indicators",
    "entities",
  ],
  telecom: [
    "caseId",
    "summary",
    "scamType",
    "channels",
    "incidentOngoing",
    "indicators",
    "entities",
  ],
  digital_platform: [
    "caseId",
    "summary",
    "scamType",
    "channels",
    "compromisedInformation",
    "incidentOngoing",
    "indicators",
    "entities",
  ],
};

/** Entity sub-fields each specialist may see; others are emptied. */
const ENTITY_POLICY: Record<SpecialistKind, (keyof CaseRecord["entities"])[]> =
  {
    banking: ["bankAccounts", "organisationsImpersonated"],
    telecom: ["phoneNumbers", "organisationsImpersonated"],
    digital_platform: ["urls", "onlineHandles", "organisationsImpersonated"],
  };

/**
 * DEF-03 — free-text fields (summary, urgencyReasons, vulnerability) can
 * carry details the field-level policy would otherwise withhold. Each agent
 * gets a redacted copy: anything it is not entitled to by ENTITY_POLICY or
 * ACCESS_POLICY is replaced with a placeholder.
 */
const PATTERNS = {
  amount:
    /(?:AUD?\s?\$?|\$|A\$)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|K|million|m))?|\b\d[\d,]*(?:\.\d+)?\s?(?:dollars|AUD)\b/g,
  phone:
    /(?:\+?61\s?|\b0)(?:[23478]\)?[\s-]?)?\d(?:[\s-]?\d){7,9}\b|\b1[38]00[\s-]?\d{3}[\s-]?\d{3}\b/g,
  url: /\b(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|net|org|au|example|io|co|info|app|xyz)(?:\/\S*)?/gi,
  handle: /(?<![\w.])@[\w.]{2,}/g,
  bankAccount: /\b(?:bsb|account|acct|payid)\b[\s:#-]*[\w@.-]{4,}/gi,
};

export function redactForAgent(text: string, agent: SpecialistKind): string {
  let out = text;
  const can = (f: keyof CaseRecord["entities"]) => ENTITY_POLICY[agent].includes(f);
  if (agent !== "banking") {
    out = out.replace(PATTERNS.amount, "[amount withheld]");
  }
  if (!can("bankAccounts")) {
    out = out.replace(PATTERNS.bankAccount, "[account withheld]");
  }
  if (!can("phoneNumbers")) out = out.replace(PATTERNS.phone, "[number withheld]");
  if (!can("urls")) out = out.replace(PATTERNS.url, "[link withheld]");
  if (!can("onlineHandles")) out = out.replace(PATTERNS.handle, "[handle withheld]");
  return out;
}

export function filterForAgent(
  record: CaseRecord,
  agent: SpecialistKind,
): { view: Partial<CaseRecord>; fieldsShared: string[] } {
  const view: Partial<CaseRecord> = {};
  const fieldsShared: string[] = [];
  for (const key of ACCESS_POLICY[agent]) {
    if (key === "entities") {
      const ents: CaseRecord["entities"] = {
        phoneNumbers: [],
        urls: [],
        bankAccounts: [],
        onlineHandles: [],
        organisationsImpersonated: [],
      };
      for (const sub of ENTITY_POLICY[agent]) {
        ents[sub] = record.entities[sub];
        fieldsShared.push(`entities.${sub}`);
      }
      view.entities = ents;
    } else if (key === "summary") {
      view.summary = redactForAgent(record.summary, agent);
      fieldsShared.push("summary (redacted)");
    } else if (key === "indicators") {
      view.indicators = {
        ...record.indicators,
        urgencyReasons: record.indicators.urgencyReasons.map((r) =>
          redactForAgent(r, agent),
        ),
        vulnerability: record.indicators.vulnerability.map((r) =>
          redactForAgent(r, agent),
        ),
      };
      fieldsShared.push("indicators (redacted)");
    } else {
      // Assigning a known key from the same record type; cast keeps TS happy
      // without weakening the policy table's typing.
      (view as Record<string, unknown>)[key] = record[key];
      fieldsShared.push(key);
    }
  }
  return { view, fieldsShared };
}

export function route(record: CaseRecord): RoutingDecision {
  const rulesFired: string[] = [];
  const activated = new Set<SpecialistKind>();

  for (const rule of ROUTING_RULES) {
    if (rule.when(record)) {
      rulesFired.push(rule.id);
      activated.add(rule.agent);
    }
  }

  // DEF-06: no rule matched → do not guess a specialist. Flag for human
  // judgement; the coordinator still runs so the employee gets a structured
  // package and the referral directory, with no specialist findings.
  const needsHumanJudgement = activated.size === 0;
  if (needsHumanJudgement) {
    rulesFired.push(
      "NONE no routing rule matched — flagged for human judgement; no specialist activated",
    );
  }

  const activatedAgents = Array.from(activated);
  const filteredViews = {} as RoutingDecision["filteredViews"];
  const disclosureLog: RoutingDecision["disclosureLog"] = [];

  for (const agent of activatedAgents) {
    const { view, fieldsShared } = filterForAgent(record, agent);
    filteredViews[agent] = view;
    disclosureLog.push({ agent, fieldsShared });
  }

  return {
    activatedAgents,
    rulesFired,
    needsHumanJudgement,
    filteredViews,
    disclosureLog,
    fastTrack: record.indicators.urgency === "high",
  };
}
