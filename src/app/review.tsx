"use client";

import { useState } from "react";
import {
  DECISION_ACTIONS,
  DECISION_LABELS,
  RELEASING_DECISIONS,
  newEvent,
  validateReason,
  type AuditEvent,
  type Decision,
} from "@/lib/audit";
import type { PipelineResult } from "@/lib/types";

/**
 * Stage 6 — Human review (DEF-05).
 *
 * The employee sees the consolidated recommendation first, can inspect the
 * trace, and must take an explicit, reasoned decision. Handover records are
 * locked until an approving decision releases them. "Send back" and
 * "Correct information" hand control back to the page so the case re-enters
 * clarification under the same case id. Nothing is transmitted anywhere.
 */
export function ReviewPanel({
  result,
  audit,
  onAudit,
  onSendBack,
  onCorrect,
}: {
  result: PipelineResult;
  audit: AuditEvent[];
  onAudit: (e: AuditEvent) => void;
  onSendBack: (reason: string) => void;
  onCorrect: (reason: string) => void;
}) {
  const { assessment: a, caseRecord: c, routing: r, findings, timingMs, usage } =
    result;
  const totalIn = Object.values(usage ?? {}).reduce((n, u) => n + u.inputTokens, 0);
  const totalOut = Object.values(usage ?? {}).reduce((n, u) => n + u.outputTokens, 0);
  const raisedByRule = c.indicators.urgencyReasons.find((x) =>
    x.startsWith("Raised by rule"),
  );

  const [tab, setTab] = useState<
    "recommendation" | "record" | "routing" | "findings" | "handovers" | "audit"
  >("recommendation");

  // Employee-editable content (controlled, saved with the decision).
  const [wording, setWording] = useState(a.suggestedCommunicationToAffectedPerson);
  const wordingEdited = wording !== a.suggestedCommunicationToAffectedPerson;

  const [pending, setPending] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  const decisions = audit.filter((e) => e.action.startsWith("decision_"));
  const latest = decisions[decisions.length - 1];
  const released = audit.some((e) => e.action === "handovers_released");
  const finalised = Boolean(latest) && latest.action !== "decision_sent_back";

  const urgencyColour = {
    high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    medium:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    low: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  }[a.urgency];

  function confirmDecision() {
    if (!pending) return;
    const err = validateReason(reason);
    if (err) {
      setReasonError(err);
      return;
    }
    const trimmed = reason.trim();
    // An approval with edited wording is always recorded as "with edits".
    const decision: Decision =
      pending === "approved" && wordingEdited ? "approved_with_edits" : pending;

    if (wordingEdited) {
      onAudit(
        newEvent({
          caseId: a.caseId,
          actor: "employee",
          action: "wording_edited",
          detail: `Communication to affected person edited (${wording.length} chars).`,
        }),
      );
    }

    onAudit(
      newEvent({
        caseId: a.caseId,
        actor: "employee",
        action: DECISION_ACTIONS[decision],
        reason: trimmed,
        detail: wordingEdited ? "Edited wording saved with this decision." : undefined,
      }),
    );

    if (RELEASING_DECISIONS.includes(decision)) {
      onAudit(
        newEvent({
          caseId: a.caseId,
          actor: "system",
          action: "handovers_released",
          detail: `Released ${a.handovers.length} handover record(s): ${a.handovers
            .map((h) => h.organisationType)
            .join(", ")}.`,
        }),
      );
    }

    if (decision === "sent_back") {
      onSendBack(trimmed);
    }

    setPending(null);
    setReason("");
    setReasonError(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs text-zinc-500">{a.caseId}</span>
        <span
          className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${urgencyColour}`}
        >
          {a.urgency} urgency
        </span>
        {r.fastTrack && (
          <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs dark:bg-zinc-800">
            fast-tracked
          </span>
        )}
        {r.needsHumanJudgement && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            needs human judgement — no specialist matched
          </span>
        )}
        {raisedByRule && (
          <span
            className="rounded bg-zinc-200 px-2 py-0.5 text-xs dark:bg-zinc-800"
            title={raisedByRule}
          >
            urgency set by rule
          </span>
        )}
        {latest && (
          <span className="rounded border border-zinc-900 px-2 py-0.5 text-xs font-medium dark:border-zinc-100">
            {latest.action.replace("decision_", "").replace(/_/g, " ")}
          </span>
        )}
        <span className="text-xs text-zinc-500">
          {Object.entries(timingMs)
            .map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`)
            .join(" · ")}
          {totalIn > 0 && (
            <>
              {" "}· {totalIn.toLocaleString()} in / {totalOut.toLocaleString()} out tokens
            </>
          )}
        </span>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-zinc-200 text-sm dark:border-zinc-800">
        {(
          [
            ["recommendation", "Recommendation"],
            ["record", "Case record"],
            ["routing", "Routing & access"],
            ["findings", `Specialists (${findings.length})`],
            ["handovers", `Handovers (${a.handovers.length})${released ? "" : " 🔒"}`],
            ["audit", `Audit log (${audit.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-3 py-2 ${
              tab === key
                ? "border-zinc-900 font-medium dark:border-zinc-100"
                : "border-transparent text-zinc-500"
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "recommendation" && (
        <div className="space-y-4 text-sm">
          <Block title="Case summary">
            <p>{a.scamSummary}</p>
            <p className="mt-1 text-xs text-zinc-500">{a.priorityRationale}</p>
          </Block>

          {a.itemsRequiringHumanReview.length > 0 && (
            <Block title="Requires your judgement" tone="warn">
              <ul className="list-disc pl-5">
                {a.itemsRequiringHumanReview.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </Block>
          )}

          <Block title="Recommended actions (in order)">
            <ol className="list-decimal space-y-1 pl-5">
              {[...a.recommendedActions]
                .sort((x, y) => x.priority - y.priority)
                .map((x) => (
                  <li key={x.action}>
                    {x.action}{" "}
                    <span className="text-xs text-zinc-500">— {x.owner}</span>
                  </li>
                ))}
            </ol>
          </Block>

          <Block title="Referrals">
            <ul className="list-disc pl-5">
              {a.referrals.map((x) => (
                <li key={x.organisationType}>
                  <strong>{x.organisationType}</strong>: {x.reason}
                </li>
              ))}
            </ul>
          </Block>

          <Block title="Risks and unresolved issues">
            <ul className="list-disc pl-5">
              {a.risksAndUnresolvedIssues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </Block>

          <Block
            title={`Wording for the affected person${wordingEdited ? " (edited)" : ""}`}
          >
            <textarea
              data-testid="wording"
              className="input min-h-32 w-full"
              value={wording}
              disabled={finalised}
              onChange={(e) => setWording(e.target.value)}
            />
            <p className="mt-1 text-xs text-zinc-500">
              Edit before use. Your edits are saved with your decision.
            </p>
          </Block>

          <p className="rounded border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            {a.disclaimer}
          </p>

          {finalised ? (
            <div className="rounded border border-zinc-900 p-3 text-sm dark:border-zinc-100">
              <p className="font-medium">
                Decision recorded: {latest.action.replace("decision_", "").replace(/_/g, " ")}
              </p>
              <p className="text-xs text-zinc-500">
                {new Date(latest.at).toLocaleString()} — {latest.reason}
              </p>
              {released && (
                <p className="mt-1 text-xs text-zinc-500">
                  Handover records are now released and viewable on the Handovers tab.
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setPending("escalated")}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Escalate after approval
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const why = window.prompt(
                      "What needs correcting? (recorded in the audit log)",
                    );
                    if (why && !validateReason(why)) onCorrect(why.trim());
                  }}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                >
                  Correct information and re-run
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(Object.keys(DECISION_LABELS) as Decision[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setPending(d);
                      setReasonError(null);
                    }}
                    className={`rounded border px-3 py-1.5 text-sm ${
                      pending === d
                        ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                        : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {d === "approved" && wordingEdited
                      ? DECISION_LABELS.approved_with_edits
                      : DECISION_LABELS[d]}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const why = window.prompt(
                      "What needs correcting? (recorded in the audit log)",
                    );
                    if (why && !validateReason(why)) onCorrect(why.trim());
                  }}
                  className="rounded border border-dashed border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                  title="Re-open the case to add or fix information; re-extracts under the same case id"
                >
                  Correct information
                </button>
              </div>

              {pending && (
                <div className="rounded border border-zinc-300 p-3 dark:border-zinc-700">
                  <label className="block text-sm">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-zinc-500">
                      Reason for &ldquo;{DECISION_LABELS[pending]}&rdquo; (required, recorded)
                    </span>
                    <textarea
                      data-testid="reason"
                      className="input min-h-20"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={
                        pending === "sent_back"
                          ? "e.g. Need the transfer time and whether the card number was given before I can act."
                          : pending === "escalated"
                            ? "e.g. Loss over threshold and customer vulnerable — fraud team to call back."
                            : "e.g. Recommendation matches what I observed; wording adjusted for tone."
                      }
                    />
                  </label>
                  {reasonError && (
                    <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                      {reasonError}
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={confirmDecision}
                      className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
                    >
                      Confirm decision
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPending(null);
                        setReasonError(null);
                      }}
                      className="rounded border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700"
                    >
                      Cancel
                    </button>
                  </div>
                  {RELEASING_DECISIONS.includes(pending) && (
                    <p className="mt-2 text-xs text-zinc-500">
                      Confirming will release {a.handovers.length} handover
                      record(s) to: {a.handovers.map((h) => h.label).join(", ")}.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {tab === "record" && (
        <div className="space-y-4 text-sm">
          <Block title="Standardised case record">
            <Json value={c} />
          </Block>
          <div className="grid gap-4 md:grid-cols-3">
            <ListBlock title="Missing" items={c.missingInformation} />
            <ListBlock title="Conflicting" items={c.conflictingInformation} />
            <ListBlock title="Uncertain" items={c.uncertainInformation} />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ListBlock
              title={`Urgency reasons (${c.indicators.urgency})`}
              items={c.indicators.urgencyReasons}
            />
            <ListBlock
              title="Vulnerability indicators"
              items={c.indicators.vulnerability}
            />
          </div>
        </div>
      )}

      {tab === "routing" && (
        <div className="space-y-4 text-sm">
          <Block title="Rules fired (deterministic)">
            <ul className="list-disc pl-5 font-mono text-xs">
              {r.rulesFired.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </Block>
          <Block title="Disclosure log — what each agent was allowed to see">
            {r.disclosureLog.length === 0 && (
              <p className="text-xs text-zinc-500">No specialist was activated.</p>
            )}
            {r.disclosureLog.map((d) => (
              <div key={d.agent} className="mb-2">
                <strong>{d.agent}</strong>:{" "}
                <span className="font-mono text-xs">
                  {d.fieldsShared.join(", ")}
                </span>
              </div>
            ))}
          </Block>
        </div>
      )}

      {tab === "findings" && (
        <div className="space-y-4 text-sm">
          {findings.length === 0 && (
            <p className="text-zinc-500">
              No specialist was activated — no routing rule matched this case.
              The coordinator has prepared a general package; use your judgement
              and the referrals.
            </p>
          )}
          {findings.map((f) => (
            <Block
              key={f.agent}
              title={`${f.agent} — confidence ${f.confidence}`}
            >
              <p className="mb-2 text-xs text-zinc-500">
                {f.confidenceRationale}
              </p>
              <ListBlock title="Risks" items={f.risks} />
              <ListBlock title="Next steps" items={f.recommendedNextSteps} />
              <ListBlock title="Missing" items={f.missingInformation} />
              <p className="mt-2 font-mono text-xs text-zinc-500">
                cites: {f.guidanceCited.join(", ")}
              </p>
            </Block>
          ))}
        </div>
      )}

      {tab === "handovers" && (
        <div className="space-y-4 text-sm">
          {!released ? (
            <div className="rounded border border-zinc-300 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
              <p className="font-medium">
                🔒 {a.handovers.length} handover record(s) prepared — locked until you approve.
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Nothing leaves this organisation until an authorised employee
                approves the recommendation. The organisations and the fields
                each would receive are listed below; the contents are released
                on approval.
              </p>
              <ul className="mt-3 space-y-1">
                {a.handovers.map((h) => (
                  <li key={h.organisationType}>
                    <strong>{h.label}</strong>
                    <span className="text-xs text-zinc-500"> — {h.reason}</span>
                    <div className="font-mono text-xs text-zinc-500">
                      fields: {h.fieldsShared.join(", ")}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <p className="text-xs text-zinc-500">
                Released on employee approval. Each record contains only the
                fields that organisation&rsquo;s policy permits.
              </p>
              {a.handovers.map((h) => (
                <Block key={h.organisationType} title={`→ ${h.label}`}>
                  <p className="mb-1 text-xs text-zinc-500">{h.reason}</p>
                  <p className="mb-2 font-mono text-xs text-zinc-500">
                    fields: {h.fieldsShared.join(", ")}
                  </p>
                  <Json value={h.record} />
                </Block>
              ))}
            </>
          )}
        </div>
      )}

      {tab === "audit" && (
        <div className="space-y-2 text-sm">
          <p className="text-xs text-zinc-500">
            Every decision on this case, with who made it and why. Prototype:
            held in this browser session only.
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-zinc-500 dark:border-zinc-800">
                <th className="py-1 pr-2">Time</th>
                <th className="py-1 pr-2">Actor</th>
                <th className="py-1 pr-2">Action</th>
                <th className="py-1">Reason / detail</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((e) => (
                <tr key={e.id} className="border-b border-zinc-100 align-top dark:border-zinc-900">
                  <td className="py-1 pr-2 font-mono whitespace-nowrap">
                    {new Date(e.at).toLocaleTimeString()}
                  </td>
                  <td className="py-1 pr-2">{e.actor}</td>
                  <td className="py-1 pr-2 font-medium">{e.action.replace(/_/g, " ")}</td>
                  <td className="py-1">
                    {e.reason && <div>{e.reason}</div>}
                    {e.detail && <div className="text-zinc-500">{e.detail}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Block({
  title,
  tone,
  children,
}: {
  title: string;
  tone?: "warn";
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded border p-3 ${
        tone === "warn"
          ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40"
          : "border-zinc-200 dark:border-zinc-800"
      }`}
    >
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {title}
      </h3>
      {children}
    </section>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="text-xs font-medium text-zinc-500">{title}</h4>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-400">none</p>
      ) : (
        <ul className="list-disc pl-5">
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded bg-zinc-50 p-2 font-mono text-xs dark:bg-zinc-900">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
