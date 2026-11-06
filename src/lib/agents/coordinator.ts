/**
 * Stage 5 — Coordinator agent.
 * Merges specialist findings into one assessment for the employee, surfaces
 * conflicts and low-confidence items for human review, prioritises actions,
 * drafts what to tell the affected person, and prepares per-organisation
 * handover records using the SAME access policy the router applied.
 */
import { REFERRAL_DIRECTORY } from "../guidance";
import { askForJson, MODELS, type Usage } from "../llm";
import { coordinatorDraftSchema } from "../schemas";
import {
  buildReferralHandover,
  buildSpecialistHandover,
  classifyReferral,
  type Handover,
} from "../handovers";
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
- Quote guidance faithfully. Where guidance says the AI must not do something (e.g. initiate a hold or a block), that restriction applies to the AI only; the employee may escalate such actions to the appropriate team. Never rewrite an AI restriction as an employee restriction.
- If the evidence suggests this may NOT be a scam, say so plainly in scamSummary and lower the urgency accordingly.
- If no specialist ran because no routing rule matched, say so under itemsRequiringHumanReview, keep recommendations general, and lean on referrals. Do not invent specialist findings.

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
): Promise<{ assessment: ConsolidatedAssessment; usage: Usage }> {
  const user = `CASE RECORD:
${JSON.stringify(record, null, 2)}

ROUTING (rules fired): ${routing.rulesFired.join("; ")}
Fast-tracked: ${routing.fastTrack}
Needs human judgement (no routing rule matched, no specialist ran): ${routing.needsHumanJudgement}

SPECIALIST FINDINGS:
${JSON.stringify(findings, null, 2)}

REFERRAL DIRECTORY:
${REFERRAL_DIRECTORY.map((r) => `- ${r.organisationType}: ${r.when}`).join("\n")}`;

  const { data: draft, usage } = await askForJson({
    model: MODELS.primary,
    system: SYSTEM,
    user,
    schema: coordinatorDraftSchema,
    maxTokens: 8000,
    stage: "coordinator",
  });

  // Handover records are built deterministically from the access policies —
  // not by the model — so what leaves the organisation is exactly what the
  // policy permits, every time. One per activated specialist, plus one per
  // referral organisation the coordinator named (DEF-07).
  const handovers: Handover[] = routing.activatedAgents.map((agent) => {
    const { view, fieldsShared } = filterForAgent(record, agent);
    return buildSpecialistHandover(
      record,
      agent,
      view,
      fieldsShared,
      findings.find((f) => f.agent === agent) ?? null,
    );
  });
  const seen = new Set<string>(handovers.map((h) => h.organisationType));
  for (const ref of draft.referrals) {
    const org = classifyReferral(ref.organisationType);
    if (!org || seen.has(org)) continue;
    seen.add(org);
    if (org === "banking" || org === "telecom" || org === "digital_platform") {
      // Referral to a specialist-type org that routing did not activate:
      // give it the same filtered view, with no finding.
      const { view, fieldsShared } = filterForAgent(record, org);
      handovers.push({
        ...buildSpecialistHandover(record, org, view, fieldsShared, null),
        reason: ref.reason,
      });
    } else {
      handovers.push(buildReferralHandover(record, org, ref.reason));
    }
  }

  return {
    assessment: {
      ...draft,
      caseId: record.caseId,
      // The record's urgency already includes the rule floor; never let the
      // coordinator lower it.
      urgency:
        draft.urgency === "high" || record.indicators.urgency === "high"
          ? "high"
          : draft.urgency === "medium" || record.indicators.urgency === "medium"
            ? "medium"
            : "low",
      handovers,
      disclaimer: DISCLAIMER,
    },
    usage,
  };
}
