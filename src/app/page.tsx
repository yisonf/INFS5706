"use client";

import { useState } from "react";
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

type Phase =
  | { kind: "idle" }
  | { kind: "intake" }
  | { kind: "clarify"; intake: IntakeResult; report: ScamReport }
  | { kind: "analysing"; intake: IntakeResult }
  | { kind: "done"; result: PipelineResult; intake: IntakeResult };

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let json: { error?: string; kind?: string } & T;
  try {
    json = await res.json();
  } catch {
    throw new Error(
      `The server returned an unexpected response (HTTP ${res.status}). Your input has been kept — please retry.`,
    );
  }
  if (!res.ok) throw new Error(json.error ?? `Request failed (HTTP ${res.status})`);
  return json as T;
}

export default function Home() {
  const [report, setReport] = useState<ScamReport>(EMPTY);
  const [disclosed, setDisclosed] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [error, setError] = useState<string | null>(null);

  const busy = phase.kind === "intake" || phase.kind === "analysing";

  function loadSample(i: number) {
    const r = SAMPLE_CASES[i].report;
    setReport(r);
    setDisclosed(r.informationDisclosed.join(", "));
    setPhase({ kind: "idle" });
    setError(null);
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
  async function runIntake(
    r: ScamReport,
    opts: { caseId?: string; clarifications?: string; round?: number } = {},
  ) {
    setPhase({ kind: "intake" });
    setError(null);
    try {
      const intake = await postJson<IntakeResult>("/api/intake", {
        report: r,
        ...opts,
      });
      if (intake.needsClarification) {
        setPhase({ kind: "clarify", intake, report: r });
      } else {
        await runAnalysis(intake);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase({ kind: "idle" });
    }
  }

  /** Stages 3–5. */
  async function runAnalysis(intake: IntakeResult) {
    setPhase({ kind: "analysing", intake });
    setError(null);
    try {
      const result = await postJson<PipelineResult>("/api/analyse", {
        caseRecord: intake.caseRecord,
        timingMs: intake.timingMs,
        usage: intake.usage,
      });
      setPhase({ kind: "done", result, intake });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase({ kind: "idle" });
    }
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
          {error && (
            <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}
        </form>

        <section>
          <StageTracker phase={phase} />

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

          {phase.kind === "clarify" && (
            <ClarificationPanel
              intake={phase.intake}
              onResubmit={(clarifications) =>
                runIntake(phase.report, {
                  caseId: phase.intake.caseRecord.caseId,
                  clarifications,
                  round: phase.intake.round + 1,
                })
              }
              onProceed={() => runAnalysis(phase.intake)}
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
              {phase.intake.clarificationReason && (
                <p className="mb-3 rounded border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                  Intake decision: {phase.intake.clarificationReason}
                </p>
              )}
              <ReviewPanel result={phase.result} />
            </>
          )}
        </section>
      </div>
    </main>
  );
}

/** Shows where the case is in the six-stage workflow. */
function StageTracker({ phase }: { phase: Phase }) {
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
  };
  const idx = active[phase.kind];
  const skippedClarify =
    (phase.kind === "analysing" || phase.kind === "done") &&
    !phase.intake.clarificationReason?.includes("returned to the employee");
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
  onResubmit,
  onProceed,
}: {
  intake: IntakeResult;
  onResubmit: (clarifications: string) => void;
  onProceed: () => void;
}) {
  const [text, setText] = useState("");
  const c = intake.caseRecord;
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-300">
          Returned for clarification (round {intake.round})
        </h3>
        <p className="text-xs text-amber-900 dark:text-amber-200">
          {intake.clarificationReason}
        </p>
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
        <button
          type="button"
          onClick={onProceed}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
        >
          Proceed without — information unavailable
        </button>
      </div>
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
