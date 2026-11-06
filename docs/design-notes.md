# Design notes

Source: the team workflow diagram ("INFS5706 Group Workflow rough.drawio") plus refinements made during scaffolding.

## Mapping brief requirements → components

| Brief requirement | Component |
|---|---|
| Gather and structure information | Intake form + Intake agent → `CaseRecord` |
| Identify missing / conflicting / uncertain info | Intake agent (`missingInformation`, `conflictingInformation`, `uncertainInformation`); specialists add their own gaps; coordinator surfaces `itemsRequiringHumanReview` |
| Recognise urgency or vulnerability | Intake agent `indicators.urgency` + `indicators.vulnerability`; router `fastTrack` |
| Access approved guidance | Per-specialist synthetic guidance with ids; every recommendation cites an id |
| Support selection of response pathway | Router activates specialists; coordinator prioritises actions and referrals |
| Prepare guidance for the affected person | Coordinator `suggestedCommunicationToAffectedPerson` (editable before use) |
| Identify when human/specialist intervention is required | Coordinator `itemsRequiringHumanReview`; "Escalate" decision button |
| Consistent case records and handovers | `CaseRecord` schema; `handovers[]` built from the access policy |

## Why a hybrid of LLM + rules?

- **LLM where language is the problem**: extracting structure from free text, reasoning against guidance, drafting plain-English wording.
- **Rules where trust is the problem**: which agents run, which fields each may see, what leaves the organisation in a handover. These are deterministic, logged and unit-tested. The sensitive-data boundary should not depend on a model's judgement.

## The clarification loop

Implemented as drawn: after the intake agent runs, if `missingInformation` is non-empty and urgency is not high, the UI pauses on a clarification screen listing what to ask the affected person. The employee records the answers and the report is re-extracted with those answers treated as authoritative; the case id is preserved. Capped at 2 rounds so an employee is never blocked, and the employee can always choose to proceed without. The intake decision is shown on the review screen so it is auditable.

## Decisions that differ from the first diagram

1. **High urgency fast-tracks rather than ends the workflow.** An ongoing scam is when the employee needs the consolidated recommendation most. The router flags `fastTrack=true`; the coordinator prioritises stop-harm actions first.
2. **Vulnerability is a separate signal from urgency**, per the brief. It changes the coordinator's tone and triggers community-support referral.
3. **Handovers are explicit outputs**, built by the same access policy as routing, so the handover for the telco contains exactly what the telco agent was allowed to see.
4. **Referral orgs without a specialist agent** (government reporting, identity recovery, community support, law enforcement) are handled via a referral directory the coordinator draws from.
5. **Specialists report confidence and cite guidance ids**, giving the coordinator something concrete to flag for human review.

## Human vs AI responsibilities

| AI does | AI does not |
|---|---|
| Structure the report | Confirm a scam occurred |
| Flag gaps, conflicts, urgency, vulnerability | Block transactions or modify accounts |
| Analyse against approved (synthetic) guidance | Contact the affected person or any organisation |
| Prioritise and draft recommendations and wording | Release handovers — only on employee approval |
| Prepare access-filtered handover records | Make consequential decisions about a person |

## Assumptions and limitations (for the oral defence)

- Guidance is synthetic and small; a real deployment would retrieve from each organisation's maintained policy store.
- No persistence: cases live only in the browser session. A real deployment needs an audited case store with role-based access.
- The access policy is field-level, not content-level; a real system would also redact PII inside free text.
- The LLM can still be wrong; confidence and human review are mitigations, not guarantees.
- Latency is 15–40 s per case with sequential intake → coordinator; acceptable for a desk tool, not for live-call use without streaming.
- Embedding in member organisations: each org would run the same intake UI inside its existing case-management tool, with its own guidance pack and its own access-policy row.

## Changes from the 2026-11-05 test log

| Defect | Change |
|---|---|
| DEF-04 | `src/lib/urgency.ts` — rule-based urgency floor; rules can only raise the AI's rating, and the raise is recorded. |
| DEF-08 | `src/lib/schemas.ts` — zod validation of every AI output and both request bodies; one retry on malformed output; refusal → 422 "invalid report". |
| DEF-03 | Free-text fields (`summary`, `urgencyReasons`, `vulnerability`) are redacted per agent before sending — amounts, numbers, links, handles and accounts an agent isn't entitled to are replaced with placeholders. Intake is also told to keep figures out of prose. |
| DEF-06 | No fallback specialist. When no rule matches, routing returns `needsHumanJudgement=true`, no specialist runs, and the coordinator prepares a general package with referrals. |
| DEF-07 | `src/lib/handovers.ts` — a handover record for every referral organisation (government reporting, identity recovery, community support, law enforcement), each with its own field policy. |
| DEF-10 | Intake outputs `indicators.telecomRisk`; rule TEL-03 activates telecom on it. |
| DEF-11 | `entities.accountsOrHandles` split into `bankAccounts` (→ BANK-04) and `onlineHandles` (→ DIG-02). BANK-02 tightened so "email account" no longer routes to banking. |
| DEF-12 | Errors keep the current step and input; Retry resends only the failed step; network loss gets a plain-English message. |
| DEF-02 | `.env.example` committed. |
| IMP-01/02/03/04/05 | Prompt and wording tweaks; clarification cap allows two rounds. |

## Possible extensions

- Streaming stage-by-stage results to the UI
- Retrieval over a larger guidance corpus
- Persisted cases with an approval audit trail
- Employee feedback loop on recommendation quality
