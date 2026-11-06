/**
 * Stage 2 — Intake agent.
 * Turns the employee's free-text + fields into a standardised CaseRecord,
 * flags gaps/conflicts and assigns a preliminary urgency and vulnerability
 * indicators. It does NOT recommend responses — that is the specialists' and
 * coordinator's job.
 */
import { askForJson, MODELS, type Usage } from "../llm";
import { caseRecordSchema } from "../schemas";
import type { CaseRecord, ScamReport } from "../types";
import { applyUrgencyFloor } from "../urgency";

const SYSTEM = `You are the Intake agent in ScamSafe Assist, a decision-support tool for authorised frontline employees who receive reports of suspected scams.

Your job is ONLY to structure information. You do not confirm whether a scam occurred, do not recommend actions, and do not contact anyone.

Produce a CaseRecord JSON object with this exact shape:
{
  "caseId": string (use the one provided),
  "summary": string (2–4 neutral sentences in third person),
  "channels": array of "sms"|"phone_call"|"email"|"social_media"|"website"|"in_person"|"other"|"unknown" — ONLY channels the SCAMMER used to contact or interact with the affected person, and only those explicitly stated. Do not list channels used by legitimate parties (the bank, a real supplier, the reporting organisation). Do not infer a channel that is not stated; put any inference in uncertainInformation instead.
  "scamType": "phishing"|"investment"|"romance"|"remote_access"|"impersonation"|"invoice_or_payment_redirect"|"online_shopping"|"identity_theft"|"other"|"unknown",
  "financialLoss": { "reported": boolean, "amountAud": number|null, "paymentMethod": string|null },
  "compromisedInformation": string[],
  "incidentOngoing": boolean,
  "indicators": {
    "urgency": "high"|"medium"|"low",
    "urgencyReasons": string[] (reason codes only — do NOT include amounts, phone numbers, URLs, names or other identifying details),
    "vulnerability": string[],
    "telecomRisk": boolean (true if the account mentions losing mobile service, an unexpected SIM/port-out message, a new SIM, or the scammer controlling the person's phone number)
  },
  "missingInformation": string[],
  "conflictingInformation": string[],
  "uncertainInformation": string[],
  "entities": {
    "phoneNumbers": string[] (numbers used BY THE SCAMMER),
    "urls": string[],
    "bankAccounts": string[] (BSB/account numbers, PayIDs or payee names the money went to),
    "onlineHandles": string[] (social media, messaging or email handles used by the scammer),
    "organisationsImpersonated": string[]
  }
}

The "summary" must be neutral and must NOT contain dollar amounts, phone numbers, URLs, account numbers or the person's name; refer to "a transfer", "a phone number", "a link". Those details belong in the structured fields.

Urgency criteria (apply strictly):
- high: incident is ongoing, OR a transfer is pending/just made, OR credentials/one-time codes were disclosed and accounts are still exposed, OR remote-access software was installed.
- medium: loss or disclosure has occurred but exposure appears contained.
- low: attempt only, nothing disclosed, no loss.

Vulnerability indicators to look for (list only those actually evidenced in the text): distress, elderly, disability or cognitive impairment, language barrier, social isolation, financial hardship, repeat victimisation, under pressure from the scammer.

Missing information: list concrete items a frontline employee should ask for (e.g. "date and time of transfer", "exact sender number").
Conflicting information: where the free text and the structured fields disagree, say so explicitly.
Uncertain information: things the affected person was unsure about or that are inferred rather than stated.
Never invent details. Use "unknown"/null/empty arrays when unsure.`;

export async function runIntake(
  report: ScamReport,
  caseId: string,
  clarifications?: string,
): Promise<{ record: CaseRecord; usage: Usage; urgencyRulesFired: string[] }> {
  const user = `caseId: ${caseId}
Reporting organisation: ${report.reportingOrganisation}

Structured fields recorded by the employee:
- contactMethod: ${report.contactMethod}
- suspectedScamType: ${report.suspectedScamType}
- financialLossReported: ${report.financialLossReported}${
    report.financialLossAmount != null
      ? ` (amount AUD ${report.financialLossAmount})`
      : ""
  }
- informationDisclosed: ${report.informationDisclosed.join(", ") || "(none listed)"}
- incidentOngoing: ${report.incidentOngoing}

Employee's free-text account of the incident:
"""
${report.description}
"""${
    clarifications?.trim()
      ? `

Clarifications the employee obtained from the affected person after an earlier extraction (treat as authoritative where they resolve a gap, and remove the corresponding item from missingInformation):
"""
${clarifications.trim()}
"""`
      : ""
  }`;

  const { data, usage } = await askForJson({
    model: MODELS.primary,
    system: SYSTEM,
    user,
    schema: caseRecordSchema,
    stage: "intake",
  });
  const record = data as CaseRecord;
  record.caseId = caseId; // never trust the model with the identifier

  // DEF-04: facts the employee recorded set a floor under the AI's rating.
  const { rulesFired } = applyUrgencyFloor(record, report);
  return { record, usage, urgencyRulesFired: rulesFired };
}
