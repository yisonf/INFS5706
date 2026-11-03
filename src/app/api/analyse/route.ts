import { NextResponse } from "next/server";
import { runAnalysisStages, runPipeline } from "@/lib/pipeline";
import type { CaseRecord, ScamReport } from "@/lib/types";

export const maxDuration = 60;

/**
 * Two accepted shapes:
 *  - { caseRecord, timingMs? }  → stages 3–5 from an intake result (normal UI flow)
 *  - a bare ScamReport           → full pipeline, no clarification pause (scripts/tests)
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    if (body && typeof body === "object" && "caseRecord" in body) {
      const { caseRecord, timingMs } = body as {
        caseRecord: CaseRecord;
        timingMs?: Record<string, number>;
      };
      if (!caseRecord?.caseId || !caseRecord.indicators) {
        return NextResponse.json(
          { error: "caseRecord is missing required fields." },
          { status: 400 },
        );
      }
      const result = await runAnalysisStages(caseRecord, timingMs ?? {});
      return NextResponse.json(result);
    }

    const report = body as ScamReport;
    if (!report?.description || report.description.trim().length < 20) {
      return NextResponse.json(
        { error: "Please provide a description of at least 20 characters." },
        { status: 400 },
      );
    }
    const result = await runPipeline(report);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
