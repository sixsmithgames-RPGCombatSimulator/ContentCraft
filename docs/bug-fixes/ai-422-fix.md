# AI 422 Errors – Bug Report and Resolution

## Summary
Two related regressions were causing **422 Unprocessable Content** or equivalent malformed-structured-data failures during NPC generation:

1. The original **Basic Info** failure, where the model returned malformed allowed fields such as `personality`.
2. A follow-up **Character Build enrichment** failure, where valid batch payloads were incorrectly retried with `Missing class_features` even though the enrichment contract allows empty arrays for non-batch categories.

The second issue also exposed a broader hardening gap in the AI-assisted integrated apply path: the active stage schema was not always present in the panel context, so non-contract keys were not consistently filtered client-side.

## Root Cause

### 1. Malformed allowed fields during Basic Info
- The LLM sometimes returned **stringified JSON** instead of proper objects.
- The `personality` field is optional in the schema, but the server attempted to validate malformed content directly, which produced errors such as:
  ```
  /personality must be object
  ```
- The original server fallback only stripped disallowed top-level keys and did not repair malformed values for otherwise allowed fields.

### 2. Character Build enrichment stage-identity drift
- The shared `character_build_feature_enrichment` contract requires the five feature buckets to be present, but it explicitly allows them to be empty arrays when a category is not part of the current batch.
- `client/src/utils/npcStageValidator.ts` recognized the internal enrichment **stage key** but not the internal enrichment **display label** (`Creator: Character Build Enrichment`).
- When the explicit stage key was missing or degraded to the label, validation fell through to the generic `character_build` validator, which applies stricter final-stage rules and surfaced false errors such as `Missing class_features`.
- `client/src/services/workflowStageResponse.ts` also merged the finalized `creator:_character_build` state into NPC validation context even while validating Character Build internal substages, which increased the chance of applying merged-stage semantics to batch-scoped enrichment payloads.
- `client/src/pages/ManualGenerator.tsx` was not consistently propagating the active shared stage contract into `workflowContext.schema`, so `client/src/components/ai-assistant/AiAssistantPanel.tsx` could miss the correct allowed-key surface during integrated apply.

## Fix Implemented

### 1. Server-side malformed-field repair
1. **Generic coercion of stringified JSON values**
   - The server attempts to parse JSON-looking string values for allowed payload keys before AJV validation.
2. **Explicit handling of `personality`**
   - If `personality` arrives as a malformed string, the server attempts to parse it and drops it if it cannot be repaired safely.
3. **Improved validation fallback**
   - After coercion, invalid top-level keys can still be stripped and re-validated, with warning logs preserved for diagnosis.

### 2. Character Build internal-stage routing fix
1. **Display-label-aware NPC validation**
   - `client/src/utils/npcStageValidator.ts` now treats both the canonical internal substage keys and the internal display labels for Character Build inventory/enrichment as authoritative.
   - `Creator: Character Build Enrichment` now routes to the lenient enrichment validator instead of the stricter final Character Build validator.
2. **Batch-safe validation context**
   - `client/src/services/workflowStageResponse.ts` now detects Character Build internal substages before assembling NPC validation context.
   - When validating inventory or enrichment batches, it no longer merges the finalized `creator:_character_build` payload into the substage validation context.

### 3. Cross-workflow AI panel hardening
1. **Active stage schema propagation**
   - `client/src/pages/ManualGenerator.tsx` now derives the active shared workflow-stage contract and exposes it as a schema-like object on `workflowContext.schema`.
2. **Shared-contract fallback in integrated apply**
   - `client/src/components/ai-assistant/AiAssistantPanel.tsx` now resolves allowed keys from `workflowContext.schema` first and falls back to the shared workflow-stage contract when schema context is missing or stale.
   - Disallowed fields are rejected during validation and pruned during apply, which keeps integrated responses aligned with the active stage contract across workflows.

### 4. Regression coverage
`client/src/services/workflowStageResponse.test.ts` now covers:
- batch-scoped enrichment payloads with empty non-batch arrays
- Character Build enrichment validation when the client only has the internal display label
- pruning of non-contract modifier arrays from enrichment payloads
- repair of truncated enrichment JSON that still contains usable structured content

## Verification
- `npx tsc -p tsconfig.json --noEmit`
- `npm run test -- --run client/src/services/workflowStageResponse.test.ts`

## Result
- Basic Info is more resilient to malformed allowed fields.
- Character Build enrichment no longer emits false `Missing class_features` retries when a valid batch response is validated through the internal display label.
- Integrated AI apply now enforces the active shared stage contract more reliably, which improves robustness across other generation workflows as well.

## References
- `src/server/routes/ai.ts`
- `client/src/utils/npcStageValidator.ts`
- `client/src/services/workflowStageResponse.ts`
- `client/src/pages/ManualGenerator.tsx`
- `client/src/components/ai-assistant/AiAssistantPanel.tsx`
- `client/src/services/workflowStageResponse.test.ts`
- `src/shared/generation/workflowStageCatalog.ts`
- `src/shared/generation/workflowStageValidation.ts`

---
*Updated on 2026-03-22 for future maintenance.*
