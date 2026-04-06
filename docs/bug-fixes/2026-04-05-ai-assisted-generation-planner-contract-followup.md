# AI Assisted Generation Planner Contract Follow-up

## Summary
A follow-up regression remained in AI-assisted NPC generation after the earlier planner 422 hardening:

1. Planner canon grounding could still pull in unrelated entities when they shared generic system metadata such as `RPG`, `Dungeons and Dragons`, or `2024RAW`.
2. The planner contract was still inconsistent across shared registries, so `assumptions` could be accepted in one path but rejected in another.
3. The integrated assistant panel validated stage payloads before sanitizing removable extra fields, which let harmless contract drift surface as a hard runner error in the UI.
4. Planner repair still preserved descriptive `deliverable` strings such as `Fiblan character profile and tactical summary`, even though validation requires a canonical workflow content type such as `npc`.

In the reported repro, the planner for `Fiblan` still loaded canon from `Glatham Woodspliter Elanithak`, and the assistant panel halted with:

`Field assumptions is not allowed for this stage.`

## Root Cause

### 1. Generic metadata still counted as canon relevance
- `client/src/services/workflowCanonRetrieval.ts` had been hardened against weak claim-only matches, but exact tag matches were still scored too aggressively.
- Tags such as `rpg`, `dungeons_and_dragons`, or `2024raw` are generic system metadata, not evidence that an entity is relevant to the user’s requested subject.
- Because those generic tags scored as strong structural matches, unrelated entities could still be selected for planner grounding.

### 2. Planner contract drift between shared registries
- `src/shared/generation/workflowStageCatalog.ts` already treated planner `assumptions` as an allowed optional field.
- `src/shared/generation/workflowRegistry.ts`, which powers shared validation and client-side contract lookup through `stageOutputContracts`, still omitted `assumptions`.
- This created split-brain behavior where planner outputs could be normalized with `assumptions`, but then rejected later by contract validation or UI-side allowed-key checks.

### 3. UI validation happened before sanitization
- `client/src/components/ai-assistant/AiAssistantPanel.tsx` checked allowed keys in `validatePatch(...)` before running `sanitizeStagePayload(...)`.
- That meant an integrated payload with removable extras could fail immediately in the panel, even though the panel already had logic to strip disallowed fields safely.
- In practice, this made contract drift look like a fatal runner problem instead of a sanitizable payload variation.

### 4. Planner `deliverable` repair was too literal
- `src/shared/generation/workflowStageRepair.ts` only replaced `deliverable` when it was missing.
- If the model returned any non-empty descriptive string, repair kept it as-is.
- `src/shared/generation/workflowStageValidation.ts` correctly rejected those values because planner `deliverable` must be a known workflow content type and, when present, must match the active workflow type.
- This left automatic retry stuck in a loop where the UI had a precise validation error, but shared repair never converted the invalid field into the canonical type the contract expects.

## Fix Implemented

### 1. Canon retrieval now ignores generic system/tag overlap
- `client/src/services/workflowCanonRetrieval.ts`
  - Added `GENERIC_RETRIEVAL_KEYWORDS` to explicitly treat system/domain tokens like `rpg`, `dungeons_and_dragons`, and `2024raw` as non-grounding metadata.
  - Restricted tag, partial-name, type, region, and claim scoring to specific retrieval keywords only.
  - Reduced tag scoring weight so metadata cannot overpower missing subject relevance.

Result:
- Generic system overlap no longer grounds planner prompts by itself.
- Distinctive lore terms such as names, locations, and institutions still ground correctly.

### 2. Planner `assumptions` support is now consistent
- `src/shared/generation/workflowRegistry.ts`
  - Added `assumptions` to the planner contract’s allowed and proxy key lists.

Result:
- Shared validation, prompt-building, workflow context schema, and integrated UI checks now agree that planner `assumptions` are allowed optional metadata.

### 3. The assistant panel now sanitizes instead of hard-failing on removable extras
- `client/src/components/ai-assistant/AiAssistantPanel.tsx`
  - Removed the early allowed-key rejection from `validatePatch(...)`.
  - The panel now validates patch shape and size first, then relies on `sanitizeStagePayload(...)` to strip disallowed extras before applying to the pipeline.

Result:
- Contract drift or benign extra fields no longer stop the integrated runner at the panel layer.
- The server remains authoritative, while the client becomes resilient to removable payload noise.

### 4. Planner `deliverable` is now canonicalized during shared repair
- `src/shared/generation/workflowStageRepair.ts`
  - Added `normalizePlannerDeliverable(...)`.
  - If the active workflow type is known, planner repair now treats it as authoritative and rewrites descriptive or mismatched `deliverable` values to the canonical workflow content type.
  - If the response already uses a canonical type, it is preserved.
- `src/shared/generation/workflowContentType.ts`
  - Hardened `resolveWorkflowContentType(...)` so it trims, normalizes case, and converts common formatting variants such as `Journal Entry`, `journal-entry`, or `storyArc` into canonical workflow content type keys.

Result:
- Planner responses no longer fail review because the model wrote a descriptive `deliverable` label instead of the canonical workflow type.
- Shared validation is more tolerant of harmless formatting differences while still rejecting genuinely unknown types.

## Regression Coverage
- `client/src/services/workflowCanonRetrieval.test.ts`
  - Added coverage for generic tag-only overlap (`RPG`, `Dungeons and Dragons`, `2024RAW`) not grounding unrelated canon.
- `client/src/utils/stageOutputContracts.test.ts`
  - Added coverage confirming planner `assumptions` are allowed by the shared contract surface.
- `src/shared/generation/workflowStageRepair.test.ts`
  - Added coverage for descriptive planner deliverables being rewritten to the active workflow type.
  - Added coverage for formatted workflow type variants such as `Journal Entry`.
- `src/server/routes/ai.keyword.test.ts`
  - Added coverage confirming shared planner validation accepts optional `assumptions`.
  - Added coverage confirming planner validation accepts normalized workflow type formatting variants.

## Verification
- `npx vitest run client/src/services/workflowCanonRetrieval.test.ts client/src/utils/stageOutputContracts.test.ts src/shared/generation/workflowStageRepair.test.ts src/server/routes/ai.keyword.test.ts`
- `npm run build:server`
- `npm run build:client`

## Result
- Planner canon retrieval is less likely to load unrelated entities from generic system metadata.
- Planner outputs that include optional `assumptions` no longer fail because of registry drift.
- The integrated assistant panel is more robust against removable extra keys and no longer blocks the runner before sanitization can do its job.

## References
- `client/src/services/workflowCanonRetrieval.ts`
- `src/shared/generation/workflowRegistry.ts`
- `client/src/components/ai-assistant/AiAssistantPanel.tsx`
- `src/shared/generation/workflowContentType.ts`
- `src/shared/generation/workflowStageRepair.ts`
- `client/src/services/workflowCanonRetrieval.test.ts`
- `client/src/utils/stageOutputContracts.test.ts`
- `src/shared/generation/workflowStageRepair.test.ts`
- `src/server/routes/ai.keyword.test.ts`
- `docs/bug-fixes/2026-04-04-ai-assisted-generation-planner-422-hardening.md`

---
*Recorded on 2026-04-05 as a follow-up hardening note for planner-stage integrated generation.*
