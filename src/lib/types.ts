/**
 * Shared data contracts for the ScamSafe Assist pipeline.
 *
 * Stage 1  Intake form        → ScamReport
 * Stage 2  Intake agent (LLM) → CaseRecord
 * Stage 3  Router (rules)     → RoutingDecision
 * Stage 4  Specialists (LLM)  → SpecialistFinding[]
 * Stage 5  Coordinator (LLM)  → ConsolidatedAssessment
 * Stage 6  Human review       → employee approves / edits / sends back
 */

export type ContactMethod =
  | "sms"
  | "phone_call"
  | "email"
  | "social_media"
  | "website"
  | "in_person"
  | "other"
  | "unknown";

export type SuspectedScamType =
  | "phishing"
  | "investment"
  | "romance"
  | "remote_access"
  | "impersonation"
  | "invoice_or_payment_redirect"
  | "online_shopping"
  | "identity_theft"
  | "other"
  | "unknown";

export type Urgency = "high" | "medium" | "low";
export type Confidence = "high" | "medium" | "low";

export type SpecialistKind = "banking" | "telecom" | "digital_platform";

/** Raw submission from the frontline employee (Stage 1). All synthetic. */
export interface ScamReport {
  description: string; // free-text account of the incident, in the employee's words
  contactMethod: ContactMethod;
  suspectedScamType: SuspectedScamType;
  financialLossReported: boolean;
  financialLossAmount?: number; // AUD, if known
  informationDisclosed: string[]; // e.g. ["bank login", "one-time code"]
  incidentOngoing: boolean;
  reportingOrganisation: string; // which Alliance member took the report
}

/** Standardised case record produced by the Intake agent (Stage 2). */
export interface CaseRecord {
  caseId: string;
  summary: string;
  channels: ContactMethod[];
  scamType: SuspectedScamType;
  financialLoss: {
    reported: boolean;
    amountAud: number | null;
    paymentMethod: string | null;
  };
  compromisedInformation: string[];
  incidentOngoing: boolean;
  indicators: {
    urgency: Urgency;
    urgencyReasons: string[];
    vulnerability: string[]; // observed vulnerability indicators, may be empty
  };
  missingInformation: string[];
  conflictingInformation: string[];
  uncertainInformation: string[];
  entities: {
    phoneNumbers: string[];
    urls: string[];
    accountsOrHandles: string[];
    organisationsImpersonated: string[];
  };
}

/** Output of the rule-based router (Stage 3). */
export interface RoutingDecision {
  activatedAgents: SpecialistKind[];
  rulesFired: string[];
  /** Per-agent, the access-filtered view of the case it is allowed to see. */
  filteredViews: Record<SpecialistKind, Partial<CaseRecord>>;
  /** Audit log: which fields each agent received. */
  disclosureLog: { agent: SpecialistKind; fieldsShared: string[] }[];
  fastTrack: boolean; // high urgency → prioritised, not bypassed
}

/** Each specialist's analysis (Stage 4). */
export interface SpecialistFinding {
  agent: SpecialistKind;
  risks: string[];
  recommendedNextSteps: string[];
  missingInformation: string[];
  guidanceCited: string[]; // ids from the synthetic guidance file
  confidence: Confidence;
  confidenceRationale: string;
}

/** Coordinator output presented to the employee (Stage 5). */
export interface ConsolidatedAssessment {
  caseId: string;
  scamSummary: string;
  urgency: Urgency;
  priorityRationale: string;
  recommendedActions: { action: string; owner: string; priority: number }[];
  referrals: { organisationType: string; reason: string }[];
  risksAndUnresolvedIssues: string[];
  itemsRequiringHumanReview: string[];
  suggestedCommunicationToAffectedPerson: string;
  handovers: { organisationType: string; record: Record<string, unknown> }[];
  disclaimer: string;
}

export interface PipelineResult {
  caseRecord: CaseRecord;
  routing: RoutingDecision;
  findings: SpecialistFinding[];
  assessment: ConsolidatedAssessment;
  timingMs: Record<string, number>;
  /** Token usage per stage, keyed e.g. "intake", "specialist:banking", "coordinator". */
  usage: Record<string, { inputTokens: number; outputTokens: number }>;
}
