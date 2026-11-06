# ScamSafe Assist — INFS5706 (AI in Action, T3 2026)

A working prototype of an AI-enabled decision-support tool for **authorised frontline employees** who receive reports of suspected scams, built for the fictional **ScamSafe Alliance** case.

> The AI analyses and prepares recommendations. Authorised people verify, communicate and act.
> The AI never confirms a scam occurred, blocks transactions, modifies accounts, contacts another organisation, or makes consequential decisions about an affected person.

**Everything in this repo is synthetic** — cases, phone numbers, URLs, and the "approved guidance" each agent uses. Do not enter real personal information.

## How it works

```
 ┌────────────┐   ┌─────────────┐   ┌──────────────┐   ┌─────────────────┐   ┌─────────────┐   ┌────────────┐
 │ 1 Intake   │ → │ 2 Intake    │ → │ 3 Router +   │ → │ 4 Specialist    │ → │ 5 Coord-    │ → │ 6 Human    │
 │   form     │   │   agent     │   │   access ctrl│   │   agents (×N)   │   │   inator    │   │   review   │
 │ (employee) │   │   (LLM)     │   │   (rules)    │   │   (LLM, parallel)│  │   (LLM)     │   │ (employee) │
 └────────────┘   └─────────────┘   └──────────────┘   └─────────────────┘   └─────────────┘   └────────────┘
```

| Stage | What it does | Where |
|---|---|---|
| 1 Intake form | Employee records the affected person's account plus structured fields | `src/app/page.tsx` |
| 2 Intake agent | Extracts a standardised **case record**; flags missing / conflicting / uncertain info; assigns preliminary **urgency** and **vulnerability** indicators | `src/lib/agents/intake.ts` |
| 2b Clarification loop | If information is missing and the case is not high urgency, the workflow **returns to the employee** with the questions to ask; their answers go back through extraction (max 2 rounds). High-urgency cases skip the wait and are fast-tracked. | `src/lib/pipeline.ts`, `src/app/page.tsx` |
| 3 Router | **Deterministic rules** decide which specialists to activate and apply an **access-control policy** so each specialist sees only permitted fields. Writes a disclosure log. High urgency is *fast-tracked*, not bypassed. | `src/lib/router.ts` |
| 4 Specialists | Banking / Telecom / Digital-platform agents each analyse their filtered view against their own synthetic guidance, citing guidance ids and reporting confidence | `src/lib/agents/specialist.ts`, `src/lib/guidance/` |
| 5 Coordinator | Merges findings, surfaces conflicts and low-confidence items for human review, prioritises actions, drafts wording for the affected person, and builds per-organisation **handover records** using the same access policy | `src/lib/agents/coordinator.ts` |
| 6 Human review | Employee sees the recommendation first, can inspect the full trace, and must record an explicit, reasoned decision. Handovers stay locked until approval; every action is written to a per-case audit log. "Send back" and "Correct information" return the case to clarification under the same id. Nothing is transmitted. | `src/app/review.tsx`, `src/lib/audit.ts` |

The router is plain TypeScript with unit tests (`npm test`) — the sensitive-data boundary doesn't depend on a model.

## Running locally

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
npm test                     # router + access-control tests
```

Click **Load sample 1/2/3** to try a synthetic case.

## Deploying

The app is a standard Next.js project and deploys to Vercel. Set `ANTHROPIC_API_KEY` in the project's environment variables. Optional: `PRIMARY_MODEL`, `SPECIALIST_MODEL`.

## Repo layout

```
src/app/            UI + API routes (/api/intake, /api/analyse)
src/lib/types.ts    data contracts for every stage
src/lib/router.ts   routing rules + access policy
src/lib/agents/     intake, specialist, coordinator prompts
src/lib/guidance/   SYNTHETIC guidance + referral directory
src/lib/sampleCases.ts  SYNTHETIC demo cases
tests/              vitest
docs/               design notes and assignment brief summary
```

## Assignment deliverables

- **Part A** — 6-minute presentation, max 6 slides, includes the demo video
- **Part B** — this prototype + 60–90 s demo video (MP4/MOV) + this repo link
- **Part C** — 6-minute oral defence

See `docs/brief-summary.md` and `docs/design-notes.md`.
