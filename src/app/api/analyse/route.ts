import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/pipeline";
import type { ScamReport } from "@/lib/types";

export const maxDuration = 60;

export async function POST(req: Request) {
  let report: ScamReport;
  try {
    report = (await req.json()) as ScamReport;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!report?.description || report.description.trim().length < 20) {
    return NextResponse.json(
      { error: "Please provide a description of at least 20 characters." },
      { status: 400 },
    );
  }

  try {
    const result = await runPipeline(report);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
