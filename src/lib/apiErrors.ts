import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ConfigError, InvalidReportError, ModelOutputError } from "./llm";

/**
 * Maps pipeline errors to HTTP responses the UI can present (DEF-08).
 * Internal details never reach the employee; the `kind` lets the UI decide
 * whether a retry is sensible.
 */
export function errorResponse(err: unknown) {
  if (err instanceof ZodError) {
    // A single problem with a form field reads better without the path.
    if (err.issues.length === 1 && /description$/.test(err.issues[0].path.join("."))) {
      return NextResponse.json(
        { kind: "bad_request", error: err.issues[0].message },
        { status: 400 },
      );
    }
    const issues = err.issues
      .slice(0, 5)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    return NextResponse.json(
      { kind: "bad_request", error: `Invalid request: ${issues}` },
      { status: 400 },
    );
  }
  if (err instanceof InvalidReportError) {
    return NextResponse.json(
      { kind: err.kind, error: err.message },
      { status: 422 },
    );
  }
  if (err instanceof ModelOutputError) {
    return NextResponse.json(
      { kind: err.kind, error: err.message, retryable: true },
      { status: 502 },
    );
  }
  if (err instanceof ConfigError) {
    return NextResponse.json(
      { kind: err.kind, error: err.message },
      { status: 500 },
    );
  }
  console.error("Unhandled pipeline error", err);
  return NextResponse.json(
    {
      kind: "internal",
      error:
        "Something went wrong while processing this case. Your input has been kept — please retry.",
      retryable: true,
    },
    { status: 500 },
  );
}
