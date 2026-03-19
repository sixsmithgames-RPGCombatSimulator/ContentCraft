# NPC & Story Arc Generation Success — Changes That Enabled Completion, Remaining Canon Gaps

## Summary
NPC generation now completes successfully, and story arc generation still completes successfully. The changes that enabled that success were primarily pipeline-stability changes rather than creative-quality changes.

In short:
- stage prompts became more stateless and explicit
- canon factpacks stopped being overloaded with planner-reference text
- malformed stage payloads were normalized before strict validation rejected them
- integrated retry behavior became bounded and deterministic instead of looping silently
- story arc stage assembly/restoration became more consistent across generation, save, and reload flows

These fixes made the workflows finish.

They did **not** fully solve canon grounding.
When canon retrieval returns zero facts, generation can still complete while drifting away from established story truth.

## NPC Changes That Resulted in Successful Completion

### 1. Stateless canon embedding was restored for stage prompts
Files:
- `client/src/services/stagePromptShared.ts`
- `client/src/config/npcCreatorStages.ts`

What changed:
- Shared prompt payload building now sends canon factpacks explicitly under `relevant_canon`.
- Planner-reference notes are kept separate instead of reusing the same canon field.
- NPC spellcasting and other late stages stopped depending on overloaded prompt keys.

Why it mattered:
- The app became the authoritative memory for NPC generation again.
- Stages stopped relying on hidden chat continuity.
- Canon context became deterministic and repeatable across retries.

### 2. Character Build normalization was hardened on both client and server
Files:
- `src/shared/generation/workflowStageRepair.ts`
- `src/server/routes/ai.ts`
- `src/shared/generation/workflowStageRepair.test.ts`
- `src/server/routes/ai.keyword.test.ts`
- `client/src/services/workflowStageResponse.test.ts`

What changed:
- `character_build` skills and saves now preserve signed modifiers like `+5` instead of collapsing to placeholders.
- Numeric aliases such as `bonus`, `modifier`, and `value` are normalized deterministically.
- Name/value arrays returned as mixed objects, strings, or numbers are normalized before contract validation.

Why it mattered:
- The Character Build stage was a major source of invalid-response retries.
- Once modifier coercion stopped losing signal, the stage could validate and advance instead of bouncing between malformed retries.

### 3. Integrated retry handling became bounded and explicit
Files:
- `client/src/components/ai-assistant/AiAssistantPanel.tsx`
- `client/src/services/workflowTransport.ts`
- `src/server/routes/ai.ts`

What changed:
- Fixable invalid structured responses are treated as one bounded automatic correction retry.
- Retry metadata is passed explicitly through compiled stage requests.
- Review is surfaced after bounded repair attempts instead of stalling indefinitely.

Why it mattered:
- NPC generation stopped getting trapped in hidden retry loops.
- Failures became deterministic: either repair succeeds, or the user gets a review-required state.

### 4. Manual/integrated stage preparation became authoritative
Files:
- `client/src/pages/ManualGenerator.tsx`
- `client/src/contexts/AiAssistantContext.tsx`

What changed:
- Integrated execution now runs from a compiled stage request prepared by the app.
- Same-stage recompilation preserves retry context and prompt notices.
- The compiled prompt shown to the user matches the prompt that gets executed.

Why it mattered:
- NPC retries now use app-owned state, not accidental prompt drift.
- Stage execution became reproducible across retry, resume, and autosave recovery.

## Story Arc Changes That Resulted in Successful Completion

### 1. Story arc stages now assemble through the shared workflow path
Files:
- `client/src/services/workflowContentAssembler.ts`
- `src/shared/generation/workflowRegistry.ts`

What changed:
- Story arc outputs are merged consistently from premise, structure, characters, and secrets stages.
- Saved `_pipeline_stages` restoration and final content assembly now use the same shared logic.
- Upload/reload flows no longer depend on fragile one-off stage-shape assumptions.

Why it mattered:
- Story arc runs could reach a coherent final assembled output reliably.
- Completed arcs stayed reconstructable after save and reload.

### 2. Story arc secret/reward normalization was hardened
Files:
- `src/shared/generation/workflowStageRepair.ts`
- `src/shared/generation/workflowStageRepair.test.ts`

What changed:
- Secret-stage legacy shapes are normalized into the live story arc contract.
- Rewards and DM notes are reshaped into schema-safe objects.

Why it mattered:
- Late-stage story arc payloads stopped failing validation on shape mismatches.
- The final stage could contribute content instead of stalling the workflow.

### 3. Shared prompt-service migration reduced stage drift
Files:
- `client/src/services/stagePromptShared.ts`
- story-arc prompt-service/config files already migrated earlier

What changed:
- Shared prompt assembly moved stage payload building into consistent helpers.
- Factpacks and prior decisions are handled in one place instead of by many special-case builders.

Why it mattered:
- Story arc stages became more predictable across retries and prompt-budget trimming.
- Completion was driven by consistent contracts rather than stage-specific prompt quirks.

## What These Changes Solved
- NPC workflow can complete instead of stalling at Character Build.
- Story arc workflow can complete and assemble a final result.
- Retry behavior is bounded and understandable.
- Validation failures are repaired deterministically when possible.
- Manual, integrated, resume, and restore flows are closer to using the same authoritative stage contracts.

## What These Changes Did Not Solve

### 1. Canon retrieval is still failing to ground the content
Observed behavior:
- keyword extraction and planner can still produce zero useful retrieval hints
- canon search can still return zero facts
- prompts then execute with empty `relevant_canon`

Why this matters:
- The workflow can now complete successfully while still inventing or drifting.
- Completion is therefore not the same thing as canon alignment.

### 2. Story drift remains possible when canon factpacks are empty
Observed behavior:
- story arc generation can succeed structurally while missing key canon anchors
- scene generation shows the same problem when entity grounding fails

Why this matters:
- the model follows the request and prior decisions, but not established canon, because canon was never actually retrieved
- this is the main reason the resulting story can drift even after the pipeline became stable

### 3. Prompt stability is ahead of retrieval quality
Observed behavior:
- structural contracts, retries, and normalization are significantly better
- retrieval/entity grounding is still the weak link

Why this matters:
- the app now reliably produces a shaped answer
- the next quality frontier is making sure the shaped answer is anchored to the right facts

## Remaining Follow-Up Work
1. Strengthen entity grounding and retrieval-hint generation for narrative scene and story arc workflows.
2. Ensure canon lookup does not stay in ungrounded scope when named characters clearly exist in project canon.
3. Add review-time visibility showing when `relevant_canon` is empty so drift risk is obvious.
4. Continue auditing the structured edit modal across all deliverables now that generation completion is more reliable.

## Verification Completed During This Follow-Up
- `npx tsc -p tsconfig.json --noEmit`
- focused regression coverage for prompt packing and workflow-stage repair paths

## Notes
This follow-up was informed by the repo coding standards in `docs/coding-standards.md` and the NPC stateless-execution requirements in `NPC_architecture.md`.
