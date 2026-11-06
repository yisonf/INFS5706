/**
 * DEF-08 — Runtime validation of every AI stage's output.
 *
 * The model is asked for a specific JSON shape, but nothing guarantees it
 * complies. These schemas are the contract: anything that fails them is
 * rejected (and retried once) before it can reach the router or the UI.
 * Lenient where harmless (missing arrays default to []), strict where it
 * matters (enums, required identifiers, nested objects the router reads).
 */
import { z } from "zod";

const str = z.string().trim();
const strArr = z.array(str).default([]);

export const contactMethodSchema = z.enum([
  "sms",
  "phone_call",
  "email",
  "social_media",
  "website",
  "in_person",
  "other",
  "unknown",
]);

export const scamTypeSchema = z.enum([
  "phishing",
  "investment",
  "romance",
  "remote_access",
  "impersonation",
  "invoice_or_payment_redirect",
  "online_shopping",
  "identity_theft",
  "other",
  "unknown",
]);

export const urgencySchema = z.enum(["high", "medium", "low"]);
export const confidenceSchema = z.enum(["high", "medium", "low"]);
export const specialistKindSchema = z.enum([
  "banking",
  "telecom",
  "digital_platform",
]);

export const caseRecordSchema = z.object({
  caseId: str.min(1),
  summary: str.min(1),
  channels: z.array(contactMethodSchema).default([]),
  scamType: scamTypeSchema.default("unknown"),
  financialLoss: z
    .object({
      reported: z.boolean().default(false),
      amountAud: z.number().nullable().default(null),
      paymentMethod: z.string().nullable().default(null),
    })
    .default({ reported: false, amountAud: null, paymentMethod: null }),
  compromisedInformation: strArr,
  incidentOngoing: z.boolean().default(false),
  indicators: z.object({
    urgency: urgencySchema,
    urgencyReasons: strArr,
    vulnerability: strArr,
    telecomRisk: z.boolean().default(false),
  }),
  missingInformation: strArr,
  conflictingInformation: strArr,
  uncertainInformation: strArr,
  entities: z
    .object({
      phoneNumbers: strArr,
      urls: strArr,
      bankAccounts: strArr,
      onlineHandles: strArr,
      organisationsImpersonated: strArr,
    })
    .default({
      phoneNumbers: [],
      urls: [],
      bankAccounts: [],
      onlineHandles: [],
      organisationsImpersonated: [],
    }),
});

export const specialistFindingSchema = z.object({
  agent: specialistKindSchema,
  risks: strArr,
  recommendedNextSteps: strArr,
  missingInformation: strArr,
  guidanceCited: strArr,
  confidence: confidenceSchema,
  confidenceRationale: str.default(""),
});

export const coordinatorDraftSchema = z.object({
  caseId: str.min(1),
  scamSummary: str.min(1),
  urgency: urgencySchema,
  priorityRationale: str.default(""),
  recommendedActions: z
    .array(
      z.object({
        action: str.min(1),
        owner: str.default("Frontline employee"),
        priority: z.number().int().default(99),
      }),
    )
    .default([]),
  referrals: z
    .array(z.object({ organisationType: str.min(1), reason: str.default("") }))
    .default([]),
  risksAndUnresolvedIssues: strArr,
  itemsRequiringHumanReview: strArr,
  suggestedCommunicationToAffectedPerson: str.default(""),
});

/** Request-body schema for the intake form (also used by /api/intake). */
export const scamReportSchema = z.object({
  description: str.min(20, "Please provide a description of at least 20 characters."),
  contactMethod: contactMethodSchema.default("unknown"),
  suspectedScamType: scamTypeSchema.default("unknown"),
  financialLossReported: z.boolean().default(false),
  financialLossAmount: z.number().nonnegative().optional(),
  informationDisclosed: strArr,
  incidentOngoing: z.boolean().default(false),
  reportingOrganisation: str.default("Unknown organisation"),
});

export type CoordinatorDraft = z.infer<typeof coordinatorDraftSchema>;
