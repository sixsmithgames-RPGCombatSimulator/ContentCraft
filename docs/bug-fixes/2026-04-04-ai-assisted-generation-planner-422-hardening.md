# AI Assisted Generation Planner 422 Hardening

## Summary
A recent tightening of shared workflow contracts exposed a planner-stage regression in integrated AI generation:

1. The server now correctly rejects malformed planner payloads when `proposals` are strings instead of proposal objects.
2. The planner prompt was still being polluted by weak canon matches from unrelated entities, which increased the odds of malformed output and made the recovery prompts harder for the model to satisfy.
3. When automatic repair was exhausted, the review/manual-retry flow only surfaced a generic "malformed structured data" message instead of the concrete validation issues that actually needed to be fixed.

This combination made the planner look like auto-retry/manual retry had broken even though the deeper issue was a contract + relevance + diagnostics mismatch.

## Root Cause

### 1. Planner proposal contract mismatch
- `src/shared/generation/workflowStageValidation.ts` rejects planner responses whose `proposals` are strings.
- Some providers still return planner proposals as bare strings.
- The client review layer knew how to normalize those strings, but the integrated server path validates earlier, so the stage failed with `422 INVALID_RESPONSE` before downstream normalization could help.

### 2. Canon retrieval admitted low-signal matches
- `client/src/services/workflowCanonRetrieval.ts` was still permissive enough to ground planner prompts on generic overlap such as alignment, class, or other common claim text.
- In the reported failure, the planner prompt for `Fiblan` included canon from `Glatham Woodspliter Elanithak`, which is unrelated and added noise to the repair loop.
- Irrelevant canon increases prompt size and lowers the chance that the model returns contract-clean planner JSON.

### 3. Review/manual retry lacked actionable issue detail
- `src/server/routes/ai.ts` returned retry metadata such as `reason` and `correctionPrompt`, but review-required failures did not preserve the concrete validation issues in machine-readable form.
- `client/src/pages/ManualGenerator.tsx` therefore had to fall back to the generic error message when building the review modal and manual retry instructions.
- Users saw "malformed structured data" instead of the exact contract problems, which made manual recovery much weaker than intended.

## Fix Implemented

### 1. Planner proposal repair now canonicalizes string proposals
- `src/shared/generation/workflowStageRepair.ts`
  - Added planner proposal normalization that converts string entries into canonical proposal objects with `id`, `topic`, `question`, `options`, `default`, and `required`.
  - This repair now happens before shared contract validation, so common planner outputs can be accepted and normalized instead of failing immediately.

### 2. Canon retrieval now prefers high-signal grounding
- `client/src/services/workflowCanonRetrieval.ts`
  - Added keyword-specific claim weighting so distinctive lore terms score higher than generic descriptor terms.
  - Tightened inclusion thresholds based on match strength:
    - exact entity/name/alias matches dominate
    - structural matches such as tags/type/region require higher scores
    - claim-only matches now need meaningful specificity
  - This blocks weak claim-only grounding such as generic alignment overlap while still allowing distinctive claim matches like named places or institutions.

### 3. Review-required failures now preserve validation issues
- `src/server/services/workflowExecutionService.ts`
  - Extended `WorkflowExecutionRetryContext` with `validationIssues?: string[]`.
- `src/server/routes/ai.ts`
  - Added normalized validation-issue extraction for both shared-contract and AJV schema failures.
  - Included those issue lists in both automatic-retry and review-required failure metadata.
- `client/src/pages/ManualGenerator.tsx`
  - Updated integrated failure handling to build critical review issues from `retryContext.validationIssues` when present.
  - Review modal/manual retry now uses the actual validation failures instead of the generic transport message whenever possible.

## Regression Coverage
- `src/shared/generation/workflowStageRepair.test.ts`
  - Covers planner string proposals being repaired into contract-valid proposal objects.
- `client/src/services/workflowStageResponse.test.ts`
  - Covers planner string-proposal normalization through the client/shared response path.
- `client/src/services/workflowCanonRetrieval.test.ts`
  - Covers rejection of weak claim-only generic planner grounding.
  - Covers preservation of exact direct canon matches.
- `client/src/services/workflowTransport.test.ts`
  - Covers preservation of retry-context validation issues through the integrated transport layer.

## Verification
- `npx vitest run src/shared/generation/workflowStageRepair.test.ts client/src/services/workflowCanonRetrieval.test.ts client/src/services/workflowStageResponse.test.ts client/src/services/workflowTransport.test.ts`
- `npm run build:server`
- `npm run build:client`

## Result
- Planner-stage integrated generation is more resilient to string-style planner proposals.
- Irrelevant canon is less likely to contaminate planner prompts and trigger avoidable `422` retries.
- When review is still required, the manual recovery path now carries specific validation issues forward instead of generic error text.

## References
- `src/shared/generation/workflowStageRepair.ts`
- `client/src/services/workflowCanonRetrieval.ts`
- `src/server/routes/ai.ts`
- `src/server/services/workflowExecutionService.ts`
- `client/src/pages/ManualGenerator.tsx`
- `src/shared/generation/workflowStageRepair.test.ts`
- `client/src/services/workflowCanonRetrieval.test.ts`
- `client/src/services/workflowStageResponse.test.ts`
- `client/src/services/workflowTransport.test.ts`

---
*Recorded on 2026-04-04 for future maintenance and regression triage.*
