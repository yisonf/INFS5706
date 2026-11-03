"use client";

import { useState } from "react";
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

export default function Home() {
  const [report, setReport] = useState<ScamReport>(EMPTY);
  const [disclosed, setDisclosed] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);

  function loadSample(i: number) {
    const r = SAMPLE_CASES[i].report;
    setReport(r);
    setDisclosed(r.informationDisclosed.join(", "));
    setResult(null);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    const body: ScamReport = {
      ...report,
      informationDisclosed: disclosed
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      const res = await fetch("/api/analyse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      setResult(json as PipelineResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
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
            disabled={loading}
            className="w-full rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
          >
            {loading ? "Analysing…" : "Submit for AI-assisted analysis"}
          </button>
          {error && (
            <p className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}
        </form>

        <section>
          {loading && (
            <div className="space-y-2 text-sm text-zinc-500">
              <p>Running intake → routing → specialists → coordinator…</p>
              <p className="text-xs">Typically 15–40 seconds.</p>
            </div>
          )}
          {result && <ReviewPanel result={result} />}
          {!loading && !result && (
            <p className="text-sm text-zinc-500">
              Load a sample case or fill in the form, then submit.
            </p>
          )}
        </section>
      </div>
    </main>
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
