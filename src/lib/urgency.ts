/**
 * DEF-04 — Rule-based urgency floor.
 *
 * The intake agent proposes an urgency level, but whether a case is
 * fast-tracked must not depend solely on a model's judgement. These rules set
 * a MINIMUM urgency from facts the employee recorded or that are plainly in
 * the structured record. If the rule level is higher than the AI level, the
 * rule wins and the reason is recorded as "raised by rule".
 */
import type { CaseRecord, ScamReport, Urgency } from "./types";

const ORDER: Record<Urgency, number> = { low: 0, medium: 1, high: 2 };

export interface UrgencyRule {
  id: string;
  level: Urgency;
  when: (report: ScamReport | null, record: CaseRecord) => boolean;
}

export const URGENCY_RULES: UrgencyRule[] = [
  {
    id: "URG-01 employee marked incident as ongoing",
    level: "high",
    when: (report, record) =>
      report?.incidentOngoing === true || record.incidentOngoing === true,
  },
  {
    id: "URG-02 remote-access scam type",
    level: "high",
    when: (report, record) =>
      report?.suspectedScamType === "remote_access" ||
      record.scamType === "remote_access",
  },
  {
    id: "URG-03 one-time code or banking credentials disclosed",
    level: "high",
    when: (report, record) =>
      [...(report?.informationDisclosed ?? []), ...record.compromisedInformation].some(
        (i) => /one[- ]?time|otp|bank(ing)? (login|password|passcode)|internet banking|pin\b/i.test(i),
      ),
  },
  {
    id: "URG-04 financial loss reported",
    level: "medium",
    when: (report, record) =>
      report?.financialLossReported === true || record.financialLoss.reported,
  },
  {
    id: "URG-05 identity document disclosed",
    level: "medium",
    when: (report, record) =>
      [...(report?.informationDisclosed ?? []), ...record.compromisedInformation].some(
        (i) => /licen[cs]e|passport|medicare|identity|tax file|tfn/i.test(i),
      ),
  },
];

export function maxUrgency(a: Urgency, b: Urgency): Urgency {
  return ORDER[a] >= ORDER[b] ? a : b;
}

/**
 * Applies the floor to a record in place and returns it. Pure with respect
 * to inputs other than the record it mutates.
 */
export function applyUrgencyFloor(
  record: CaseRecord,
  report: ScamReport | null,
): { record: CaseRecord; rulesFired: string[]; raised: boolean } {
  const rulesFired: string[] = [];
  let floor: Urgency = "low";

  for (const rule of URGENCY_RULES) {
    if (rule.when(report, record)) {
      rulesFired.push(rule.id);
      floor = maxUrgency(floor, rule.level);
    }
  }

  const aiLevel = record.indicators.urgency;
  const finalLevel = maxUrgency(aiLevel, floor);
  const raised = ORDER[finalLevel] > ORDER[aiLevel];

  if (raised) {
    record.indicators.urgency = finalLevel;
    record.indicators.urgencyReasons = [
      `Raised by rule from ${aiLevel} to ${finalLevel}: ${rulesFired
        .filter((id) => {
          const r = URGENCY_RULES.find((x) => x.id === id);
          return r && ORDER[r.level] >= ORDER[finalLevel];
        })
        .join("; ")}`,
      ...record.indicators.urgencyReasons,
    ];
  }

  return { record, rulesFired, raised };
}
