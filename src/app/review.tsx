"use client";

import { useState } from "react";
import type { PipelineResult } from "@/lib/types";

/**
 * Stage 6 — Human review. The employee sees the consolidated recommendation
 * first, can expand the trace (case record, routing/disclosure log, specialist
 * findings, handovers), and must take an explicit decision. Nothing here
 * sends anything anywhere — the buttons record the employee's decision only.
 */
export function ReviewPanel({ result }: { result: PipelineResult }) {
  const { assessment: a, caseRecord: c, routing: r, findings, timingMs } =
    result;
  const [decision, setDecision] = useState<string | null>(null);
  const [tab, setTab] = useState<
    "recommendation" | "record" | "routing" | "findings" | "handovers"
  >("recommendation");

  const urgencyColour = {
    high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    medium:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    low: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  }[a.urgency];

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
        <span className="text-xs text-zinc-500">
          {Object.entries(timingMs)
            .map(([k, v]) => `${k} ${(v / 1000).toFixed(1)}s`)
            .join(" · ")}
        </span>
      </div>

      <nav className="flex gap-1 border-b border-zinc-200 text-sm dark:border-zinc-800">
        {(
          [
            ["recommendation", "Recommendation"],
            ["record", "Case record"],
            ["routing", "Routing & access"],
            ["findings", `Specialists (${findings.length})`],
            ["handovers", "Handovers"],
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
          <Block title="Suspected scam — summary">
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

          <Block title="Suggested wording for the affected person (edit before use)">
            <textarea
              className="input min-h-32 w-full"
              defaultValue={a.suggestedCommunicationToAffectedPerson}
            />
          </Block>

          <p className="rounded border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            {a.disclaimer}
          </p>

          <div className="flex flex-wrap gap-2">
            {[
              "Approve recommendation",
              "Approve with edits",
              "Send back — need more information",
              "Escalate to specialist team",
            ].map((label) => (
              <button
                key={label}
                onClick={() => setDecision(label)}
                className={`rounded border px-3 py-1.5 text-sm ${
                  decision === label
                    ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                    : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {decision && (
            <p className="text-xs text-zinc-500">
              Decision recorded: <strong>{decision}</strong> by authorised
              employee. (Prototype — nothing is transmitted.)
            </p>
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
          <ListBlock
            title="Vulnerability indicators"
            items={c.indicators.vulnerability}
          />
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
          <p className="text-xs text-zinc-500">
            Per-organisation handover records, filtered by the same access
            policy used for routing. Released only on employee approval.
          </p>
          {a.handovers.map((h) => (
            <Block key={h.organisationType} title={`→ ${h.organisationType}`}>
              <Json value={h.record} />
            </Block>
          ))}
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
