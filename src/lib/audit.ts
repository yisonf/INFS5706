/**
 * DEF-05 — Audit trail for the human-review step.
 *
 * Every consequential thing the employee does (or chooses not to do) on a
 * case is an AuditEvent. In this prototype the log lives in the browser
 * session only; a real deployment would persist it with the case. The
 * shape is what matters: who, what, why, when — and nothing the AI did is
 * recorded as a human decision.
 */

export type AuditAction =
  | "intake_submitted"
  | "clarification_requested" // the AI returned the case for clarification
  | "clarification_provided" // employee added answers and re-extracted
  | "clarification_skipped" // employee chose to proceed without
  | "clarification_fast_tracked" // skipped automatically — high urgency
  | "correction_requested" // employee re-opened a fast-tracked case to fix info
  | "analysis_completed"
  | "wording_edited"
  | "decision_approved"
  | "decision_approved_with_edits"
  | "decision_sent_back"
  | "decision_escalated"
  | "handovers_released";

export interface AuditEvent {
  id: string;
  caseId: string;
  at: string; // ISO timestamp
  actor: "employee" | "system";
  action: AuditAction;
  reason?: string; // required for every employee decision
  detail?: string;
}

export type Decision =
  | "approved"
  | "approved_with_edits"
  | "sent_back"
  | "escalated";

export const DECISION_LABELS: Record<Decision, string> = {
  approved: "Approve recommendation",
  approved_with_edits: "Approve with edits",
  sent_back: "Send back — need more information",
  escalated: "Escalate to specialist team",
};

export const DECISION_ACTIONS: Record<Decision, AuditAction> = {
  approved: "decision_approved",
  approved_with_edits: "decision_approved_with_edits",
  sent_back: "decision_sent_back",
  escalated: "decision_escalated",
};

/** Decisions that release handover records to other organisations. */
export const RELEASING_DECISIONS: Decision[] = ["approved", "approved_with_edits"];

export const MIN_REASON_LENGTH = 10;

let counter = 0;
export function newEvent(
  e: Omit<AuditEvent, "id" | "at">,
): AuditEvent {
  counter += 1;
  return {
    ...e,
    id: `${Date.now().toString(36)}-${counter}`,
    at: new Date().toISOString(),
  };
}

export function validateReason(reason: string): string | null {
  const r = reason.trim();
  if (r.length < MIN_REASON_LENGTH) {
    return `Please give a reason of at least ${MIN_REASON_LENGTH} characters — it is recorded with your decision.`;
  }
  return null;
}
