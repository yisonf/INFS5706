/**
 * Orchestrates the six stages. Stage 1 (intake form) and Stage 6 (human
 * review) are the UI; this file runs stages 2–5.
 */
import { runCoordinator } from "./agents/coordinator";
import { runIntake } from "./agents/intake";
import { runSpecialist } from "./agents/specialist";
import { route } from "./router";
import type { PipelineResult, ScamReport } from "./types";

function newCaseId(): string {
  const d = new Date();
  const stamp = d.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SSA-${stamp}-${rand}`;
}

export async function runPipeline(report: ScamReport): Promise<PipelineResult> {
  const timingMs: Record<string, number> = {};
  const t = (label: string, start: number) =>
    (timingMs[label] = Math.round(performance.now() - start));

  let s = performance.now();
  const caseRecord = await runIntake(report, newCaseId());
  t("intake", s);

  s = performance.now();
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
