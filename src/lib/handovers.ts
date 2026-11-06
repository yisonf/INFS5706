/**
 * DEF-07 — Handover records for EVERY organisation the case touches, not just
 * the three specialist agents: the brief's requirement 8 is "consistent case
 * records and handovers for use by other organisations".
 *
 * Built deterministically from a per-organisation-type policy, mirroring the
 * router's access control. The model never decides what leaves the
 * organisation.
 */
import { redactForAgent } from "./router";
import type {
  CaseRecord,
  SpecialistFinding,
  SpecialistKind,
} from "./types";

/** Organisation types that can receive a handover. */
export type HandoverOrgType =
  | SpecialistKind
  | "government_reporting"
  | "identity_recovery"
  | "community_support"
  | "law_enforcement";

export const HANDOVER_LABELS: Record<HandoverOrgType, string> = {
  banking: "Bank / payment provider",
  telecom: "Telecommunications provider",
  digital_platform: "Digital platform",
  government_reporting: "Government scam-reporting service",
  identity_recovery: "Identity-recovery / victim-support organisation",
  community_support: "Community support organisation",
  law_enforcement: "Law enforcement",
};

/** Map the coordinator's free-text referral names onto handover org types. */
export function classifyReferral(organisationType: string): HandoverOrgType | null {
  const t = organisationType.toLowerCase();
  if (/government|scamwatch|report(ing)? service|national/.test(t))
    return "government_reporting";
  if (/identity|idcare|victim/.test(t)) return "identity_recovery";
  if (/community|support org|welfare|hardship/.test(t)) return "community_support";
  if (/police|law enforcement|afp/.test(t)) return "law_enforcement";
  if (/bank|payment|credit union|fraud team/.test(t)) return "banking";
  if (/telco|telecom|carrier|mobile provider/.test(t)) return "telecom";
  if (/platform|social media|host|provider of the site/.test(t))
    return "digital_platform";
  return null;
}

/**
 * Which top-level fields each organisation type receives. Specialists use
 * the router's ACCESS_POLICY; these are the referral organisations.
 */
const REFERRAL_POLICY: Record<
  Exclude<HandoverOrgType, SpecialistKind>,
  (keyof CaseRecord)[]
> = {
  // National reporting wants the pattern, not the person: type, channels,
  // scammer entities, loss reported (not amount), no vulnerability detail.
  government_reporting: ["caseId", "scamType", "channels", "incidentOngoing", "entities"],
  // Identity recovery needs what was compromised and vulnerability context.
  identity_recovery: ["caseId", "summary", "scamType", "compromisedInformation", "indicators"],
  // Community support needs vulnerability context and nothing financial.
  community_support: ["caseId", "summary", "indicators"],
  // Law enforcement gets the fullest view bar nothing — still redacted
  // summary so figures come from structured fields, not prose.
  law_enforcement: [
    "caseId",
    "summary",
    "scamType",
    "channels",
    "financialLoss",
    "compromisedInformation",
    "incidentOngoing",
    "entities",
  ],
};

/** Entity sub-fields for referral orgs. */
const REFERRAL_ENTITY_POLICY: Record<
  Exclude<HandoverOrgType, SpecialistKind>,
  (keyof CaseRecord["entities"])[]
> = {
  government_reporting: ["phoneNumbers", "urls", "onlineHandles", "organisationsImpersonated"],
  identity_recovery: ["organisationsImpersonated"],
  community_support: [],
  law_enforcement: ["phoneNumbers", "urls", "bankAccounts", "onlineHandles", "organisationsImpersonated"],
};

export interface Handover {
  organisationType: HandoverOrgType;
  label: string;
  reason: string;
  fieldsShared: string[];
  record: Record<string, unknown>;
}

export function buildReferralHandover(
  record: CaseRecord,
  org: Exclude<HandoverOrgType, SpecialistKind>,
  reason: string,
): Handover {
  const view: Record<string, unknown> = {};
  const fieldsShared: string[] = [];
  // Redaction level: community support and identity recovery should not see
  // financial figures; reuse the telecom redaction profile (no amounts, no
  // accounts, no URLs/handles) as the conservative default.
  const redactAs: SpecialistKind =
    org === "law_enforcement" ? "banking" : "telecom";

  for (const key of REFERRAL_POLICY[org]) {
    if (key === "entities") {
      const ents: Partial<CaseRecord["entities"]> = {};
      for (const sub of REFERRAL_ENTITY_POLICY[org]) {
        ents[sub] = record.entities[sub];
        fieldsShared.push(`entities.${sub}`);
      }
      view.entities = ents;
    } else if (key === "summary") {
      view.summary = redactForAgent(record.summary, redactAs);
      fieldsShared.push("summary (redacted)");
    } else if (key === "indicators") {
      view.indicators = {
        urgency: record.indicators.urgency,
        vulnerability: record.indicators.vulnerability.map((v) =>
          redactForAgent(v, redactAs),
        ),
      };
      fieldsShared.push("indicators.urgency", "indicators.vulnerability");
    } else if (key === "financialLoss" && org !== "law_enforcement") {
      view.financialLoss = { reported: record.financialLoss.reported };
      fieldsShared.push("financialLoss.reported");
    } else {
      view[key] = record[key];
      fieldsShared.push(key);
    }
  }

  return {
    organisationType: org,
    label: HANDOVER_LABELS[org],
    reason,
    fieldsShared,
    record: {
      ...view,
      preparedBy: "ScamSafe Assist (AI) — pending employee approval",
    },
  };
}

export function buildSpecialistHandover(
  record: CaseRecord,
  agent: SpecialistKind,
  view: Partial<CaseRecord>,
  fieldsShared: string[],
  finding: SpecialistFinding | null,
): Handover {
  return {
    organisationType: agent,
    label: HANDOVER_LABELS[agent],
    reason: "Specialist agent activated by routing rules",
    fieldsShared,
    record: {
      ...view,
      specialistFinding: finding,
      preparedBy: "ScamSafe Assist (AI) — pending employee approval",
    },
  };
}
