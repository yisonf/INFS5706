"use client";

import { useRef, useState } from "react";
import { newEvent, type AuditEvent } from "@/lib/audit";
import { combineClarifications } from "@/lib/clarifications";
import type { IntakeResult } from "@/lib/pipeline";
import { SAMPLE_CASES } from "@/lib/sampleCases";
import type {
  ContactMethod,
  PipelineResult,
  ScamReport,
  SuspectedScamType,
} from "@/lib/types";
import { ReviewPanel } from "./review";

const CONTACT_METHODS: ContactMethod[] = [
  "sms",
  "phone_call",
  "email",
  "social_media",
  "website",
  "in_person",
  "other",
  "unknown",
];
const SCAM_TYPES: SuspectedScamType[] = [
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
];

const EMPTY: ScamReport = {
  reportingOrganisation: "Example Bank (synthetic)",
  contactMethod: "unknown",
  suspectedScamType: "unknown",
  financialLossReported: false,
  financialLossAmount: undefined,
  informationDisclosed: [],
  incidentOngoing: false,
  description: "",
};

/**
 * `answers` holds every clarification the employee has entered for this case,
 * one entry per round. Each re-extraction starts from the original report, so
 * all of them are sent every time (see lib/clarifications.ts).
 */
type IntakeOpts = { caseId?: string; answers?: string[]; round?: number };

/** What to resend if the employee clicks Retry (DEF-12). */
type FailedStep =
  | { step: "intake"; report: ScamReport; opts: IntakeOpts }
  | { step: "analyse"; intake: IntakeResult; answers: string[] };

type Phase =
  | { kind: "idle" }
  | { kind: "intake" }
  | {
      kind: "clarify";
      intake: IntakeResult;
      report: ScamReport;
      answers: string[];
      /** Set when an employee sent the case back or re-opened it (DEF-05). */
      reopened?: { reason: string; mode: "sent_back" | "correction" };
    }
  | { kind: "analysing"; intake: IntakeResult }
  | { kind: "done"; result: PipelineResult; intake: IntakeResult; answers: string[] }
  | { kind: "error"; message: string; retryable: boolean; failed: FailedStep };

class ApiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: { error?: string; kind?: string; retryable?: boolean } & T;
  try {
    json = await res.json();
  } catch {
    throw new ApiError(
      `The server returned an unexpected response (HTTP ${res.status}). Your input has been kept — please retry.`,
      true,
    );
  }
  if (!res.ok) {
    throw new ApiError(
      json.error ?? `Request failed (HTTP ${res.status})`,
      json.retryable ?? res.status >= 500,
    );
  }
  return json as T;
}

function describeError(err: unknown): { message: string; retryable: boolean } {
  if (err instanceof ApiError) return { message: err.message, retryable: err.retryable };
  if (err instanceof TypeError && /fetch/i.test(err.message)) {
    return {
      message:
        "Network interrupted — the request did not reach the server. Your input has been kept; check your connection and retry.",
      retryable: true,
    };
  }
  return {
    message: err instanceof Error ? err.message : String(err),
    retryable: true,
  };
}

export default function Home() {
  const [report, setReport] = useState<ScamReport>(EMPTY);
  const [disclosed, setDisclosed] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  /** Audit trail per case id (DEF-05). Session-only in the prototype. */
  const [auditByCase, setAuditByCase] = useState<Record<string, AuditEvent[]>>({});

  const busy = phase.kind === "intake" || phase.kind === "analysing";
  /** Synchronous guard against double submission before React re-renders. */
  const inFlight = useRef(false);

  function audit(e: AuditEvent) {
    setAuditByCase((m) => ({ ...m, [e.caseId]: [...(m[e.caseId] ?? []), e] }));
  }

  function loadSample(i: number) {
    const r = SAMPLE_CASES[i].report;
    setReport(r);
    setDisclosed(r.informationDisclosed.join(", "));
    setPhase({ kind: "idle" });
  }

  function currentReport(): ScamReport {
    return {
      ...report,
      informationDisclosed: disclosed
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }

  /** Stage 2. Pauses at the clarification screen if the record has gaps. */
  async function runIntake(r: ScamReport, opts: IntakeOpts = {}) {
    if (inFlight.current) return;
    inFlight.current = true;
    setPhase({ kind: "intake" });
    const answers = opts.answers ?? [];
    try {
      const intake = await postJson<IntakeResult>("/api/intake", {
        report: r,
        caseId: opts.caseId,
        round: opts.round,
        clarifications: combineClarifications(answers),
      });
      const caseId = intake.caseRecord.caseId;
      audit(
        newEvent({
          caseId,
          actor: "employee",
          action: answers.length > 0 ? "clarification_provided" : "intake_submitted",
          detail: answers.length > 0
            ? `Round ${intake.round}: clarifications added and report re-extracted.`
            : `Round ${intake.round}: report submitted for AI-assisted analysis.`,
        }),
      );
      if (intake.needsClarification) {
        audit(
          newEvent({
            caseId,
            actor: "system",
            action: "clarification_requested",
            detail: `${intake.caseRecord.missingInformation.length} item(s) missing; urgency ${intake.caseRecord.indicators.urgency}.`,
          }),
        );
        setPhase({ kind: "clarify", intake, report: r, answers });
      } else {
        if (intake.clarificationReason?.includes("fast-tracked")) {
          audit(
            newEvent({
              caseId,
              actor: "system",
              action: "clarification_fast_tracked",
              detail: intake.clarificationReason,
            }),
          );
        }
        await runAnalysis(intake, answers);
      }
    } catch (err) {
      const { message, retryable } = describeError(err);
      // DEF-12: keep the step and its input so Retry resends exactly this.
      setPhase({
        kind: "error",
        message,
        retryable,
        failed: { step: "intake", report: r, opts },
      });
    } finally {
      inFlight.current = false;
    }
  }

  /** Stages 3–5. */
  async function runAnalysis(intake: IntakeResult, answers: string[] = []) {
    if (inFlight.current && phase.kind === "analysing") return;
    inFlight.current = true;
    setPhase({ kind: "analysing", intake });
    try {
      const result = await postJson<PipelineResult>("/api/analyse", {
        caseRecord: intake.caseRecord,
        timingMs: intake.timingMs,
        usage: intake.usage,
      });
      audit(
        newEvent({
          caseId: result.caseRecord.caseId,
          actor: "system",
          action: "analysis_completed",
          detail: `Specialists: ${result.routing.activatedAgents.join(", ") || "none"}; urgency ${result.assessment.urgency}; ${result.assessment.handovers.length} handover(s) prepared (locked).`,
        }),
      );
      setPhase({ kind: "done", result, intake, answers });
    } catch (err) {
      const { message, retryable } = describeError(err);
      setPhase({
        kind: "error",
        message,
        retryable,
        failed: { step: "analyse", intake, answers },
      });
    } finally {
      inFlight.current = false;
    }
  }

  function retry(failed: FailedStep) {
    if (failed.step === "intake") return runIntake(failed.report, failed.opts);
    return runAnalysis(failed.intake, failed.answers);
  }

  /** Employee chose to proceed without clarifying — recorded (DEF-05). */
  function skipClarification(intake: IntakeResult, reason: string, answers: string[]) {
    audit(
      newEvent({
        caseId: intake.caseRecord.caseId,
        actor: "employee",
        action: "clarification_skipped",
        reason,
        detail: `${intake.caseRecord.missingInformation.length} item(s) still missing.`,
      }),
    );
    return runAnalysis(intake, answers);
  }

  /**
   * "Send back" or "Correct information" from the review screen: re-open the
   * case at the clarification step under the same case id, with the original
   * report and every clarification already given, so the employee can add
   * what was missing without losing earlier answers (DEF-05).
   */
  function reopen(
    intake: IntakeResult,
    mode: "sent_back" | "correction",
    reason: string,
    answers: string[],
  ) {
    if (mode === "correction") {
      audit(
        newEvent({
          caseId: intake.caseRecord.caseId,
          actor: "employee",
          action: "correction_requested",
          reason,
        }),
      );
    }
    setPhase({
      kind: "clarify",
      intake: { ...intake, needsClarification: true },
      report: currentReport(),
      answers,
      reopened: { reason, mode },
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await runIntake(currentReport());
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 border-b border-zinc-200 pb-4 dark:border-zinc-800">
        <h1 className="text-2xl font-semibold">ScamSafe Assist</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          AI decision support for authorised frontline employees — the AI
          analyses and recommends; you verify, communicate and act.
        </p>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          Prototype. All guidance and cases are synthetic. Do not enter real
          personal information.
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
        <form onSubmit={submit} className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {SAMPLE_CASES.map((c, i) => (
              <button
                key={c.label}
                type="button"
                onClick={() => loadSample(i)}
                className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Load sample {i + 1}
              </button>
            ))}
          </div>

          <Field label="Reporting organisation">
            <input
              className="input"
              value={report.reportingOrganisation}
              onChange={(e) =>
                setReport({ ...report, reportingOrganisation: e.target.value })
              }
            />
          </Field>

          <Field label="Contact method">
            <select
              className="input"
              value={report.contactMethod}
              onChange={(e) =>
                setReport({
                  ...report,
                  contactMethod: e.target.value as ContactMethod,
                })
              }
            >
              {CONTACT_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>

          <Field label="Suspected scam type">
            <select
              className="input"
              value={report.suspectedScamType}
              onChange={(e) =>
                setReport({
                  ...report,
                  suspectedScamType: e.target.value as SuspectedScamType,
                })
              }
            >
              {SCAM_TYPES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={report.financialLossReported}
                onChange={(e) =>
                  setReport({
                    ...report,
                    financialLossReported: e.target.checked,
                  })
                }
              />
              Financial loss reported
            </label>
            <input
              className="input"
              type="number"
              placeholder="Amount (AUD)"
              value={report.financialLossAmount ?? ""}
              onChange={(e) =>
                setReport({
                  ...report,
                  financialLossAmount: e.target.value
                    ? Number(e.target.value)
                    : undefined,
                })
              }
            />
          </div>

          <Field label="Information disclosed (comma-separated)">
            <input
              className="input"
              value={disclosed}
              onChange={(e) => setDisclosed(e.target.value)}
              placeholder="e.g. bank login, one-time code"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={report.incidentOngoing}
              onChange={(e) =>
                setReport({ ...report, incidentOngoing: e.target.checked })
              }
            />
            Incident is ongoing
          </label>

          <Field label="Description of the incident">
            <textarea
              className="input min-h-40"
              value={report.description}
              onChange={(e) =>
                setReport({ ...report, description: e.target.value })
              }
              placeholder="What the affected person told you, in your words."
            />
          </Field>

          <button
            type="submit"
            disabled={busy || phase.kind === "clarify"}
            className="w-full rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {phase.kind === "intake"
              ? "Structuring report…"
              : phase.kind === "analysing"
                ? "Analysing…"
                : "Submit for AI-assisted analysis"}
          </button>
        </form>

        <section>
          <StageTracker
            phase={phase}
            clarified={(() => {
              const id =
                phase.kind === "done"
                  ? phase.result.caseRecord.caseId
                  : phase.kind === "analysing" || phase.kind === "clarify"
                    ? phase.intake.caseRecord.caseId
                    : null;
              return Boolean(
                id &&
                  (auditByCase[id] ?? []).some(
                    (e) => e.action === "clarification_requested",
                  ),
              );
            })()}
          />

          {phase.kind === "idle" && (
            <p className="text-sm text-zinc-500">
              Load a sample case or fill in the form, then submit.
            </p>
          )}

          {phase.kind === "intake" && (
            <p className="text-sm text-zinc-500">
              Intake agent is extracting a standardised case record…
            </p>
          )}

          {phase.kind === "error" && (
            <div className="space-y-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              <p className="font-medium">
                {phase.failed.step === "intake"
                  ? "The intake step could not be completed."
                  : "The analysis step could not be completed."}
              </p>
              <p>{phase.message}</p>
              <div className="flex flex-wrap gap-2">
                {phase.retryable && (
                  <button
                    type="button"
                    onClick={() => retry(phase.failed)}
                    className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
                  >
                    Retry this step
                  </button>
                )}
                {phase.failed.step === "intake" && phase.failed.opts.caseId && (
                  <button
                    type="button"
                    onClick={() => {
                      // Back to the clarification screen the employee came from,
                      // with their original report intact.
                      const f = phase.failed;
                      if (f.step !== "intake") return;
                      runIntake(f.report, {
                        caseId: f.opts.caseId,
                        round: (f.opts.round ?? 2) - 1,
                      });
                    }}
                    className="rounded border border-red-300 px-3 py-1.5 text-sm hover:bg-red-100 dark:border-red-700 dark:hover:bg-red-900"
                  >
                    Back to clarification
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPhase({ kind: "idle" })}
                  className="rounded border border-red-300 px-3 py-1.5 text-sm hover:bg-red-100 dark:border-red-700 dark:hover:bg-red-900"
                >
                  Edit the report
                </button>
              </div>
              <p className="text-xs opacity-80">
                Your form input has been kept.
              </p>
            </div>
          )}

          {phase.kind === "clarify" && (
            <ClarificationPanel
              intake={phase.intake}
              reopened={phase.reopened}
              onResubmit={(clarifications) =>
                runIntake(phase.report, {
                  caseId: phase.intake.caseRecord.caseId,
                  answers: [...phase.answers, clarifications],
                  round: phase.intake.round + 1,
                })
              }
              onProceed={(reason) => skipClarification(phase.intake, reason, phase.answers)}
            />
          )}

          {phase.kind === "analysing" && (
            <div className="space-y-2 text-sm text-zinc-500">
              <p>Routing → specialists → coordinator…</p>
              <p className="text-xs">Typically 15–30 seconds.</p>
            </div>
          )}

          {phase.kind === "done" && (
            <>
              {(() => {
                const log = auditByCase[phase.result.caseRecord.caseId] ?? [];
                const skipped = log.find((e) => e.action === "clarification_skipped");
                const provided = log.filter((e) => e.action === "clarification_provided").length;
                const text = skipped
                  ? `Clarification skipped by employee — "${skipped.reason}"`
                  : provided > 0
                    ? `${provided} clarification round(s) completed before analysis.`
                    : phase.intake.clarificationReason;
                return text ? (
                  <p className="mb-3 rounded border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                    Intake decision: {text}
                  </p>
                ) : null;
              })()}
              <ReviewPanel
                result={phase.result}
                audit={auditByCase[phase.result.caseRecord.caseId] ?? []}
                onAudit={audit}
                onSendBack={(reason) => reopen(phase.intake, "sent_back", reason, phase.answers)}
                onCorrect={(reason) => reopen(phase.intake, "correction", reason, phase.answers)}
              />
            </>
          )}
        </section>
      </div>
    </main>
  );
}

/** Shows where the case is in the six-stage workflow. */
function StageTracker({
  phase,
  clarified,
}: {
  phase: Phase;
  /** Whether the clarification step actually happened on this case. */
  clarified: boolean;
}) {
  const stages = [
    "Intake",
    "Intake agent",
    "Clarify",
    "Routing",
    "Specialists",
    "Coordinator",
    "Human review",
  ];
  const active: Record<Phase["kind"], number> = {
    idle: 0,
    intake: 1,
    clarify: 2,
    analysing: 4,
    done: 6,
    error: 0,
  };
  const idx =
    phase.kind === "error"
      ? phase.failed.step === "intake"
        ? 1
        : 4
      : active[phase.kind];
  const skippedClarify =
    (phase.kind === "analysing" || phase.kind === "done") && !clarified;
  return (
    <ol className="mb-4 flex flex-wrap gap-1 text-[11px]">
      {stages.map((s, i) => {
        const state =
          i < idx || (i === idx && phase.kind === "done")
            ? "done"
            : i === idx
              ? "active"
              : "todo";
        const dim = i === 2 && skippedClarify;
        return (
          <li
            key={s}
            className={`rounded px-2 py-0.5 ${
              state === "done"
                ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                : state === "active"
                  ? "border border-zinc-900 font-medium dark:border-zinc-100"
                  : "border border-zinc-200 text-zinc-400 dark:border-zinc-800"
            } ${dim ? "line-through opacity-50" : ""}`}
            title={dim ? "Clarification not required for this case" : undefined}
          >
            {i + 1}. {s}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The "Need more info" loop from the workflow diagram. The AI lists what it
 * could not establish; the employee asks the affected person, records the
 * answers, and sends the report back through extraction. They can also
 * choose to proceed without — that is their call, not the AI's.
 */
function ClarificationPanel({
  intake,
  reopened,
  onResubmit,
  onProceed,
}: {
  intake: IntakeResult;
  reopened?: { reason: string; mode: "sent_back" | "correction" };
  onResubmit: (clarifications: string) => void;
  onProceed: (reason: string) => void;
}) {
  const [text, setText] = useState("");
  const [skipReason, setSkipReason] = useState("");
  const [skipping, setSkipping] = useState(false);
  const c = intake.caseRecord;
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
          {reopened
            ? reopened.mode === "sent_back"
              ? `Sent back by employee (round ${intake.round})`
              : `Re-opened to correct information (round ${intake.round})`
            : `Returned for clarification (round ${intake.round})`}
        </h3>
        <p className="text-xs text-amber-900 dark:text-amber-200">
          {reopened ? reopened.reason : intake.clarificationReason}
        </p>
        {reopened && (
          <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
            Add the missing or corrected details below; the case will be
            re-extracted under the same case id and re-analysed.
          </p>
        )}
      </div>

      <div className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Please ask the affected person
        </h3>
        <ul className="list-disc space-y-1 pl-5">
          {c.missingInformation.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        {c.conflictingInformation.length > 0 && (
          <>
            <h4 className="mt-3 text-xs font-medium text-zinc-500">
              Conflicts to resolve
            </h4>
            <ul className="list-disc space-y-1 pl-5">
              {c.conflictingInformation.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        )}
        {c.uncertainInformation.length > 0 && (
          <>
            <h4 className="mt-3 text-xs font-medium text-zinc-500">
              Uncertain
            </h4>
            <ul className="list-disc space-y-1 pl-5">
              {c.uncertainInformation.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Preliminary record (urgency: {c.indicators.urgency})
        </h3>
        <p>{c.summary}</p>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
          Answers obtained from the affected person
        </span>
        <textarea
          className="input min-h-28"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Transfer was made at 10:40am today by bank transfer to a domestic BSB. She confirms she did not give her card number."
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={text.trim().length < 5}
          onClick={() => onResubmit(text)}
          className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Add clarifications and re-extract
        </button>
        {!reopened && (
          <button
            type="button"
            onClick={() => setSkipping((v) => !v)}
            className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Proceed without — information unavailable
          </button>
        )}
      </div>

      {skipping && (
        <div className="rounded border border-zinc-300 p-3 dark:border-zinc-700">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
              Why are you proceeding without this information? (recorded)
            </span>
            <textarea
              className="input min-h-16"
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              placeholder="e.g. Customer has left the branch and cannot be reached; proceeding on what we have."
            />
          </label>
          <button
            type="button"
            disabled={skipReason.trim().length < 10}
            onClick={() => onProceed(skipReason.trim())}
            className="mt-2 rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            Confirm and proceed
          </button>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}
