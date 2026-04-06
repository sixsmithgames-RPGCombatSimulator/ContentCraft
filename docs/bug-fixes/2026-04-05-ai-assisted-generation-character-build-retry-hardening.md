# AI Assisted Generation Character Build Retry Hardening

## Summary
A follow-up regression remained in AI-assisted NPC generation after the planner fixes were completed:

1. Character Build enrichment finalization matched requested features too literally.
2. Review retries for Character Build always relaunched the last enrichment batch, even when the missing feature came from an earlier batch.
3. Placeholder inventory entries like `None` could become fake requested features and poison enrichment batching.

In the reported repro, planner and earlier creator stages succeeded, but Character Build became trapped in review because:

- the inventory requested `Ability Score Improvement (x2)`,
- the enrichment retry returned `Ability Score Improvement`,
- the finalizer treated those as different features,
- and retrying from review kept resubmitting the last batch instead of restarting from the batch that originally contained the missing feature.

## Root Cause

### 1. Feature finalization required near-exact name matches
- `client/src/services/npcCharacterBuildEnrichment.ts`
  - `finalizeCharacterBuildPayload(...)` indexed enriched results by a normalized exact feature name.
  - This was too brittle for harmless variations such as:
    - `Ability Score Improvement (x2)` vs `Ability Score Improvement`
    - repeated tokens introduced by subclass prefixes
    - punctuation-only differences

Result:
- The stage could still fail even when the model returned the correct mechanical description under a slightly different but obviously equivalent name.

### 2. Review retry targeted the wrong enrichment batch
- `client/src/pages/ManualGenerator.tsx`
  - Character Build finalization errors were raised after all enrichment batches ran.
  - The retry UI reused the current chunk context, which still pointed at the most recently attempted batch.
  - Earlier bad batches were never replaced because enriched batch state was append-oriented, so retries kept fixing the wrong slice of work.

Result:
- Auto-retry and manual retry could both become unrecoverable loops.

### 3. Placeholder batch entries polluted the inventory
- Inventory responses could include sentinel values such as `None` for non-applicable categories like fighting styles.
- Those entries were batched and later treated as real requested features.

Result:
- The workflow could waste enrichment passes on synthetic, non-feature placeholders.

## Fix Implemented

### 1. Character Build finalization now matches equivalent feature names
- `client/src/services/npcCharacterBuildEnrichment.ts`
  - Added feature-name matching helpers that:
    - remove parenthetical counters such as `(x2)`,
    - collapse duplicate adjacent tokens,
    - tolerate punctuation/formatting variations,
    - and allow equivalent-name matching when exact lookup fails.

Result:
- `Ability Score Improvement` now satisfies an inventory request for `Ability Score Improvement (x2)` when the mechanics are concrete and otherwise correct.

### 2. Character Build review retries now restart from the earliest failed batch
- `client/src/services/npcCharacterBuildEnrichment.ts`
  - Added `resolveCharacterBuildRetryPlan(...)` to map review issues back to the feature batch that owns the missing feature.
- `client/src/pages/ManualGenerator.tsx`
  - Review retry and manual recovery now:
    - detect Character Build finalization issues,
    - truncate cached enriched batches back to the failing batch,
    - restore the correct chunk context,
    - and relaunch enrichment from that batch forward.

Result:
- Retrying Character Build now actually redoes the broken batch instead of resubmitting the last one.

### 3. Placeholder non-features are ignored before batching
- `client/src/services/npcCharacterBuildEnrichment.ts`
  - Added filtering for non-applicable placeholders such as `None`, `N/A`, and `Not applicable`.

Result:
- Fake entries no longer create unnecessary enrichment batches or finalization failures.

### 4. Review-state cache now keeps the latest enriched batch set
- `client/src/pages/ManualGenerator.tsx`
  - When Character Build finalization enters review, the current enriched batch collection is stored in stage results before the modal opens.

Result:
- Review retries and resume flows have a complete view of the last Character Build attempt.

## Regression Coverage
- `client/src/services/npcCharacterBuildEnrichment.test.ts`
  - Added coverage for alias matching (`Ability Score Improvement (x2)` vs `Ability Score Improvement`).
  - Added coverage for ignoring `None` placeholders.
  - Added coverage for resolving the earliest failed enrichment batch for retry.

## Verification
- `npx vitest run client/src/services/npcCharacterBuildEnrichment.test.ts`
- `npm run build:client`

## Result
- Planner now proceeds cleanly into Character Build.
- Character Build retries can recover from earlier bad enrichment batches instead of looping on the last batch.
- Equivalent feature names no longer fail finalization just because the model omitted a parenthetical counter.

## 2026-04-06 Follow-Up: Inventory Contract Hardening

### Additional problem discovered
Retry targeting was improved, but a deeper workflow flaw still remained:

- the Character Build inventory pass could accept abstract labels such as `Wizard Subclass` or `Arcane School Feature (Level 6, 10)` as if they were discrete enrichable requirements,
- later enrichment batches correctly returned concrete subclass data like `School of Evocation` or `Evocation Savant`,
- and finalization still treated the earlier abstract label as a missing feature instead of recognizing it as a redundant planning marker.

This meant the pipeline could continue to enter review even when the model had already supplied the real mechanical data needed to finish the build.

### Additional fix implemented
- `client/src/services/npcCharacterBuildEnrichment.ts`
  - Inventory normalization now prunes redundant abstract feature markers when more specific subclass, feat, or proficiency data is already present.
  - Generic subclass selectors can now reconcile against a specific subclass choice during finalization instead of failing as a literal name mismatch.

### Why this is more coherent
The Character Build process now treats the inventory pass as a source of provisional success criteria rather than unquestionable truth.

- Abstract category labels are no longer promoted into enrichable work items when the inventory already contains concrete details.
- Enrichment is now focused on discrete mechanics, not on trying to "describe" bookkeeping markers.
- Finalization can recognize that `Wizard Subclass` was satisfied by a concrete subclass choice like `School of Evocation`.

This keeps the workflow closer to the intended sequence:

1. infer and organize the required mechanical structure,
2. reduce that structure to concrete feature work items,
3. enrich those items in batches,
4. finalize only against real success criteria.

### Additional regression coverage
- `client/src/services/npcCharacterBuildEnrichment.test.ts`
  - Added coverage for pruning redundant subclass markers before batching.
  - Added coverage for reconciling a generic subclass selector from a specific subclass choice.

### Additional verification
- `npx vitest run client/src/services/npcCharacterBuildEnrichment.test.ts`
- `npm run build:client`

## References
- `client/src/services/npcCharacterBuildEnrichment.ts`
- `client/src/pages/ManualGenerator.tsx`
- `client/src/services/npcCharacterBuildEnrichment.test.ts`
- `docs/bug-fixes/2026-04-05-ai-assisted-generation-planner-contract-followup.md`

---
*Recorded on 2026-04-05 as a Character Build follow-up hardening note for AI-assisted NPC generation.*
