/**
 * Clarification answers accumulate across rounds.
 *
 * Every intake round re-extracts the case from the ORIGINAL report, so each
 * round must be given every answer obtained so far — not only the latest one.
 * Otherwise facts the employee collected in round 1 (e.g. an SMS sender
 * number) disappear from the case record when round 2 is submitted.
 */

/** Upper bound on the combined text sent to /api/intake. */
export const MAX_COMBINED_CLARIFICATIONS = 12000;

export function combineClarifications(answers: string[]): string | undefined {
  const parts = answers.map((a) => a.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0];
  return [
    "Answers from each clarification round, in order. Where they conflict, the later round is authoritative.",
    ...parts.map((a, i) => `Round ${i + 1} answers:\n${a}`),
  ].join("\n\n");
}
