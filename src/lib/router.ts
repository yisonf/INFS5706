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

export const ROUTING_RULES: Rule[] = [
  {
    id: "BANK-01 financial loss reported",
    agent: "banking",
    when: (c) => c.financialLoss.reported,
  },
  {
    id: "BANK-02 banking credentials or payment details compromised",
    agent: "banking",
    when: (c) =>
      c.compromisedInformation.some((i) =>
        /bank|card|account|pin|passcode|one[- ]?time|otp|payid|bsb/i.test(i),
      ),
  },
  {
    id: "BANK-03 investment or payment-redirect scam type",
    agent: "banking",
    when: (c) =>
      c.scamType === "investment" ||
      c.scamType === "invoice_or_payment_redirect",
  },
  {
    id: "TEL-01 contact via SMS or phone call",
    agent: "telecom",
    when: (c) =>
      c.channels.includes("sms") || c.channels.includes("phone_call"),
  },
  {
    id: "TEL-02 phone numbers identified",
    agent: "telecom",
    when: (c) => c.entities.phoneNumbers.length > 0,
  },
  {
    id: "DIG-01 contact via social media, website or email",
    agent: "digital_platform",
    when: (c) =>
      c.channels.includes("social_media") ||
      c.channels.includes("website") ||
      c.channels.includes("email"),
  },
  {
    id: "DIG-02 URLs or account handles identified",
    agent: "digital_platform",
    when: (c) =>
      c.entities.urls.length > 0 || c.entities.accountsOrHandles.length > 0,
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
    "incidentOngoing",
    "indicators",
    "entities",
  ],
};

/** Entity sub-fields each specialist may see; others are redacted. */
const ENTITY_POLICY: Record<SpecialistKind, (keyof CaseRecord["entities"])[]> =
  {
    banking: ["organisationsImpersonated"],
    telecom: ["phoneNumbers", "organisationsImpersonated"],
    digital_platform: ["urls", "accountsOrHandles", "organisationsImpersonated"],
  };

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
        accountsOrHandles: [],
        organisationsImpersonated: [],
      };
      for (const sub of ENTITY_POLICY[agent]) {
        ents[sub] = record.entities[sub];
        fieldsShared.push(`entities.${sub}`);
      }
      view.entities = ents;
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

  // Fallback: if nothing matched, the digital-platform agent handles generic
  // cases so the employee still gets a recommendation rather than silence.
  if (activated.size === 0) {
    rulesFired.push("DEFAULT-01 no specific rule matched → digital_platform");
    activated.add("digital_platform");
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
    filteredViews,
    disclosureLog,
    fastTrack: record.indicators.urgency === "high",
  };
}
