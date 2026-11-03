/**
 * Stage 5 — Coordinator agent.
 * Merges specialist findings into one assessment for the employee, surfaces
 * conflicts and low-confidence items for human review, prioritises actions,
 * drafts what to tell the affected person, and prepares per-organisation
 * handover records using the SAME access policy the router applied.
 */
import { REFERRAL_DIRECTORY } from "../guidance";
import { askForJson, MODELS } from "../llm";
import { filterForAgent } from "../router";
import type {
  CaseRecord,
  ConsolidatedAssessment,
  RoutingDecision,
  SpecialistFinding,
} from "../types";

const DISCLAIMER =
  "AI-generated recommendation for review by an authorised frontline employee. The employee is responsible for verifying, communicating with the affected person and initiating any action within their authority. This tool has not confirmed that a scam occurred and has taken no action.";

const SYSTEM = `You are the Coordinator agent in ScamSafe Assist. You consolidate findings from specialist agents into ONE clear package for an authorised frontline employee.

Rules:
- You never speak to the affected person; you draft wording the employee may use.
- You never confirm a scam occurred — use "suspected".
- Where specialists disagree, or any specialist reports medium/low confidence, list that explicitly under itemsRequiringHumanReview. Do not silently pick a side.
- Prioritise actions by (1) stopping ongoing harm, (2) containing exposure, (3) recovery, (4) reporting/referral.
- Keep the communication draft plain-English, calm, non-blaming, and free of jargon. If vulnerability indicators are present, make it shorter and gentler and mention support options.
- Choose referrals from the directory provided; include the reason.

Return JSON:
{
  "caseId": string,
  "scamSummary": string,
  "urgency": "high"|"medium"|"low",
  "priorityRationale": string,
  "recommendedActions": [{ "action": string, "owner": string (e.g. "Frontline employee", "Fraud team via employee"), "priority": number (1 = first) }],
  "referrals": [{ "organisationType": string, "reason": string }],
  "risksAndUnresolvedIssues": string[],
  "itemsRequiringHumanReview": string[],
  "suggestedCommunicationToAffectedPerson": string
}`;

export async function runCoordinator(
  record: CaseRecord,
  routing: RoutingDecision,
  findings: SpecialistFinding[],
): Promise<ConsolidatedAssessment> {
  const user = `CASE RECORD:
${JSON.stringify(record, null, 2)}

ROUTING (rules fired): ${routing.rulesFired.join("; ")}
Fast-tracked: ${routing.fastTrack}

SPECIALIST FINDINGS:
${JSON.stringify(findings, null, 2)}

REFERRAL DIRECTORY:
${REFERRAL_DIRECTORY.map((r) => `- ${r.organisationType}: ${r.when}`).join("\n")}`;

  const draft = await askForJson<
    Omit<ConsolidatedAssessment, "handovers" | "disclaimer">
  >({
    model: MODELS.primary,
    system: SYSTEM,
    user,
    maxTokens: 3000,
  });

  // Handover records are built deterministically from the router's access
  // policy — not by the model — so what leaves the organisation is exactly
  // what the policy permits, every time.
  const handovers = routing.activatedAgents.map((agent) => ({
    organisationType: agent,
    record: {
      ...filterForAgent(record, agent).view,
      specialistFinding: findings.find((f) => f.agent === agent) ?? null,
      preparedBy: "ScamSafe Assist (AI) — pending employee approval",
    },
  }));

  return {
    ...draft,
    caseId: record.caseId,
    handovers,
    disclaimer: DISCLAIMER,
  };
}
