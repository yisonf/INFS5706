/**
 * Orchestrates the six stages. Stage 1 (intake form) and Stage 6 (human
 * review) are the UI. Stage 2 is exposed on its own so the clarification
 * loop in the workflow can run:
 *
 *   intake → (missing info & not high urgency?) → back to employee → intake again
 *          → otherwise → routing → specialists → coordinator
 */
import { runCoordinator } from "./agents/coordinator";
import { runIntake } from "./agents/intake";
import { runSpecialist } from "./agents/specialist";
import { route } from "./router";
import type { CaseRecord, PipelineResult, ScamReport } from "./types";

/** How many clarification rounds before we proceed regardless. */
export const MAX_CLARIFICATION_ROUNDS = 2;

export function newCaseId(): string {
  const d = new Date();
  const stamp = d.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SSA-${stamp}-${rand}`;
}

export interface IntakeResult {
  caseRecord: CaseRecord;
  /** True when the workflow should pause and return to the employee. */
  needsClarification: boolean;
  clarificationReason: string | null;
  round: number;
  timingMs: Record<string, number>;
}

/**
 * Stage 2 only. Decides whether the workflow loops back to the employee.
 * Rule (from the team flowchart): loop when information is missing, unless
 * the case is high urgency — then it is fast-tracked without waiting.
 */
export async function runIntakeStage(
  report: ScamReport,
  opts: { caseId?: string; clarifications?: string; round?: number } = {},
): Promise<IntakeResult> {
  const round = opts.round ?? 1;
  const start = performance.now();
  const caseRecord = await runIntake(
    report,
    opts.caseId ?? newCaseId(),
    opts.clarifications,
  );
  const timingMs = { intake: Math.round(performance.now() - start) };

  const missing = caseRecord.missingInformation.length > 0;
  const high = caseRecord.indicators.urgency === "high";

  let needsClarification = false;
  let clarificationReason: string | null = null;

  if (missing && high) {
    clarificationReason =
      "Information is missing, but the case is high urgency — fast-tracked without waiting for clarification.";
  } else if (missing && round >= MAX_CLARIFICATION_ROUNDS) {
    clarificationReason = `Information is still missing after ${round} rounds — proceeding so the employee is not blocked.`;
  } else if (missing) {
    needsClarification = true;
    clarificationReason =
      "Information is missing and the case is not high urgency — returned to the employee for clarification.";
  }

  return { caseRecord, needsClarification, clarificationReason, round, timingMs };
}

/** Stages 3–5, from an already-structured case record. */
export async function runAnalysisStages(
  caseRecord: CaseRecord,
  timingMs: Record<string, number> = {},
): Promise<PipelineResult> {
  const t = (label: string, start: number) =>
    (timingMs[label] = Math.round(performance.now() - start));

  let s = performance.now();
  const routing = route(caseRecord);
  t("routing", s);

  s = performance.now();
  const findings = await Promise.all(
    routing.activatedAgents.map((agent) =>
      runSpecialist(agent, routing.filteredViews[agent]),
    ),
  );
  t("specialists", s);

  s = performance.now();
  const assessment = await runCoordinator(caseRecord, routing, findings);
  t("coordinator", s);

  return { caseRecord, routing, findings, assessment, timingMs };
}

/** Convenience: whole pipeline with no clarification pause (used by tests/scripts). */
export async function runPipeline(report: ScamReport): Promise<PipelineResult> {
  const intake = await runIntakeStage(report, {
    round: MAX_CLARIFICATION_ROUNDS,
  });
  return runAnalysisStages(intake.caseRecord, intake.timingMs);
}
