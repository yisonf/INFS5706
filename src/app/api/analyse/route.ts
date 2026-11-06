import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/apiErrors";
import { runAnalysisStages, runPipeline } from "@/lib/pipeline";
import { caseRecordSchema, scamReportSchema } from "@/lib/schemas";
import type { CaseRecord } from "@/lib/types";

export const maxDuration = 60;

const usageSchema = z.record(
  z.string(),
  z.object({ inputTokens: z.number(), outputTokens: z.number() }),
);

const analyseBodySchema = z.object({
  caseRecord: caseRecordSchema,
  timingMs: z.record(z.string(), z.number()).optional(),
  usage: usageSchema.optional(),
});

/**
 * Two accepted shapes:
 *  - { caseRecord, timingMs?, usage? } → stages 3–5 from an intake result (normal UI flow)
 *  - a bare ScamReport                 → full pipeline, no clarification pause (scripts/tests)
 * Both are fully validated before any stage runs (DEF-08).
 */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { kind: "bad_request", error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  try {
    if (raw && typeof raw === "object" && "caseRecord" in raw) {
      const body = analyseBodySchema.parse(raw);
      const result = await runAnalysisStages(
        body.caseRecord as CaseRecord,
        body.timingMs ?? {},
        body.usage ?? {},
      );
      return NextResponse.json(result);
    }

    const report = scamReportSchema.parse(raw);
    const result = await runPipeline(report);
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
