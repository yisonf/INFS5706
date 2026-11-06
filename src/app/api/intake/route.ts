import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/apiErrors";
import { runIntakeStage } from "@/lib/pipeline";
import { scamReportSchema } from "@/lib/schemas";

export const maxDuration = 60;

const bodySchema = z.object({
  report: scamReportSchema,
  caseId: z.string().regex(/^SSA-\d{8}-[A-Z0-9]{4}$/).optional(),
  clarifications: z.string().max(5000).optional(),
  round: z.number().int().min(1).max(10).optional(),
});

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
    const body = bodySchema.parse(raw);
    const result = await runIntakeStage(body.report, {
      caseId: body.caseId,
      clarifications: body.clarifications,
      round: body.round,
    });
    return NextResponse.json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
