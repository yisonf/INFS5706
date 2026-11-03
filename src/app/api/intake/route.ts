import { NextResponse } from "next/server";
import { runIntakeStage } from "@/lib/pipeline";
import type { ScamReport } from "@/lib/types";

export const maxDuration = 60;

interface IntakeBody {
  report: ScamReport;
  caseId?: string;
  clarifications?: string;
  round?: number;
}

export async function POST(req: Request) {
  let body: IntakeBody;
  try {
    body = (await req.json()) as IntakeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const report = body?.report;
  if (!report?.description || report.description.trim().length < 20) {
    return NextResponse.json(
      { error: "Please provide a description of at least 20 characters." },
      { status: 400 },
    );
  }

  try {
    const result = await runIntakeStage(report, {
      caseId: body.caseId,
      clarifications: body.clarifications,
      round: body.round,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
