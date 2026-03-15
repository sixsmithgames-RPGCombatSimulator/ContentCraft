# Workflow Stage Repair Implementation Progress

## Intent
Implement a shared, app-controlled stage response repair pipeline so integrated and manual AI workflows use the same deterministic normalization, validation, and acceptance rules.

## Scope
- Shared workflow stage repair pipeline
- Integrated server-side workflow execution path
- Manual/client workflow normalization path
- Focused regression tests for malformed stage payload repair

## Progress
- [x] Investigate Planner 422 root cause
- [x] Create shared repair pipeline used by client and server
- [x] Route integrated workflow execution through shared repair before rejection
- [x] Unify manual workflow stage normalization with shared repair pipeline
- [x] Add regression coverage for repaired malformed payloads
- [x] Run targeted tests and full build

## Follow-up Fixes
- [x] Correct shared `stats` repair so movement speeds remain schema-safe strings for integrated validation
- [x] Stop integrated auto-retry from re-sending non-retryable or review-required failures
- [x] Add focused regressions for stats speed repair and integrated failure retry gating

## Risks
- Shared normalization may change accepted payload shape for existing stages
- NPC stage repairs must remain deterministic and app-owned
- Integrated/manual parity changes may expose hidden assumptions in stage-specific validators

## Verification Plan
- Focused unit tests for planner malformed payload repair
- Focused workflow normalization tests
- Server route tests for repaired integrated payloads
- Targeted Vitest run: `client/src/services/workflowStageResponse.test.ts`, `src/shared/generation/workflowStageRepair.test.ts`, `src/server/routes/ai.keyword.test.ts`
- Follow-up targeted Vitest run: `client/src/services/workflowTransport.test.ts`, `client/src/services/workflowStageResponse.test.ts`, `src/shared/generation/workflowStageRepair.test.ts`, `src/server/routes/ai.keyword.test.ts`
- Full project build

## Known Limitations
- Live provider behavior still depends on prompt quality; this implementation should make response handling resilient to repairable formatting drift
