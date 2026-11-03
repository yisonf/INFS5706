/**
 * Stage 2 — Intake agent.
 * Turns the employee's free-text + fields into a standardised CaseRecord,
 * flags gaps/conflicts and assigns a preliminary urgency and vulnerability
 * indicators. It does NOT recommend responses — that is the specialists' and
 * coordinator's job.
 */
import { askForJson, MODELS } from "../llm";
import type { CaseRecord, ScamReport } from "../types";

const SYSTEM = `You are the Intake agent in ScamSafe Assist, a decision-support tool for authorised frontline employees who receive reports of suspected scams.

Your job is ONLY to structure information. You do not confirm whether a scam occurred, do not recommend actions, and do not contact anyone.

Produce a CaseRecord JSON object with this exact shape:
{
  "caseId": string (use the one provided),
  "summary": string (2–4 neutral sentences in third person),
  "channels": array of "sms"|"phone_call"|"email"|"social_media"|"website"|"in_person"|"other"|"unknown",
  "scamType": "phishing"|"investment"|"romance"|"remote_access"|"impersonation"|"invoice_or_payment_redirect"|"online_shopping"|"identity_theft"|"other"|"unknown",
  "financialLoss": { "reported": boolean, "amountAud": number|null, "paymentMethod": string|null },
  "compromisedInformation": string[],
  "incidentOngoing": boolean,
  "indicators": {
    "urgency": "high"|"medium"|"low",
    "urgencyReasons": string[],
    "vulnerability": string[]
  },
  "missingInformation": string[],
  "conflictingInformation": string[],
  "uncertainInformation": string[],
  "entities": { "phoneNumbers": string[], "urls": string[], "accountsOrHandles": string[], "organisationsImpersonated": string[] }
}

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
): Promise<CaseRecord> {
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

  const record = await askForJson<CaseRecord>({
    model: MODELS.primary,
    system: SYSTEM,
    user,
  });
  record.caseId = caseId; // never trust the model with the identifier
  return record;
}
