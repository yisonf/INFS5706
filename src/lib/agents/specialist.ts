/**
 * Stage 4 — Specialist agents (banking / telecom / digital platform).
 * Each one sees only the access-filtered view the router produced and reasons
 * against its own synthetic guidance. It recommends; it never acts.
 */
import { guidanceAsText } from "../guidance";
import { askForJson, MODELS, type Usage } from "../llm";
import { specialistFindingSchema } from "../schemas";
import type { CaseRecord, SpecialistFinding, SpecialistKind } from "../types";

const ROLE: Record<SpecialistKind, string> = {
  banking:
    "You are the Banking & Payments specialist. You care about transfers, recalls, credential compromise and financial-hardship referral.",
  telecom:
    "You are the Telecommunications specialist. You care about scam SMS/calls, sender-ID spoofing, SIM-swap risk and remote-access calls.",
  digital_platform:
    "You are the Digital Platform specialist. You care about malicious URLs, compromised online accounts, impersonation profiles and identity-document exposure.",
};

export async function runSpecialist(
  agent: SpecialistKind,
  view: Partial<CaseRecord>,
): Promise<{ finding: SpecialistFinding; usage: Usage }> {
  const system = `${ROLE[agent]}

You are part of ScamSafe Assist. You receive a PARTIAL case record — only the fields you are authorised to see. Do not speculate about withheld fields.

Analyse the case strictly against the approved guidance below (it is SYNTHETIC guidance for a prototype). Every recommendation must cite at least one guidance id. If the guidance does not cover a situation, say so in missingInformation or lower your confidence rather than inventing policy.

You do not take actions. You do not contact anyone. You recommend what the frontline employee could do and what they should ask.

APPROVED GUIDANCE:
${guidanceAsText(agent)}

Return JSON:
{
  "agent": "${agent}",
  "risks": string[],
  "recommendedNextSteps": string[] (each phrased as an action for the employee, e.g. "Raise a recall request with the fraud team [BK-G3]"),
  "missingInformation": string[],
  "guidanceCited": string[] (ids only),
  "confidence": "high"|"medium"|"low",
  "confidenceRationale": string (one sentence)
}`;

  const { data, usage } = await askForJson({
    model: MODELS.specialist,
    system,
    user: `Partial case record (access-filtered):\n${JSON.stringify(view, null, 2)}`,
    schema: specialistFindingSchema,
    maxTokens: 4000,
    stage: `${agent} specialist`,
  });
  const finding = data as SpecialistFinding;
  finding.agent = agent;
  return { finding, usage };
}
