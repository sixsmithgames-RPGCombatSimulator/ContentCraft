# Unified Generation Workflow Work Statement

## Purpose

This document captures:

- the user goals behind the workflow refactor
- the work completed so far
- the architectural approach and why that approach was chosen
- the next implementation steps needed to finish the migration to a robust, unified generation engine

This is intended to function as both a status report and a practical handoff document for continued implementation.

## User Goals Restated

The requested outcomes for this work are:

1. Build a robust AI-assisted workflow for content generation across the app, not just for one narrow content type.
2. Make D&D NPC generation especially strong, so the AI reliably produces the data needed to fully flesh out an NPC.
3. Preserve a manual copy/paste workflow as a first-class fallback so generation can continue even if the integrated AI path fails, is unavailable, or becomes unreliable.
4. Reduce fragility caused by duplicated client-only logic, provider-specific behavior, and page-level orchestration living in one large component.
5. Ensure canon retrieval, validation, retry, resume, and completion behavior are all predictable, explainable, and resilient.
6. Improve specialized workflows, including location generation, where geometry, paired doors, and wall thickness were producing unreliable outputs.

## High-Level Outcome So Far

The system is no longer primarily driven by a single page-level orchestration blob.

The architecture has been moved significantly toward a shared workflow engine with:

- shared workflow definitions
- shared stage contracts
- shared launch/progression/completion helpers
- shared client/server validation behavior
- shared retry and resume provenance
- shared manual and integrated execution paths

The result is not yet the final end state, but the app is materially more robust than the starting point, especially for:

- D&D NPC generation
- location generation
- retry and resume behavior
- manual fallback parity
- integrated/manual workflow consistency

## Summary of Work Completed

### 1. Shared workflow foundation

A shared workflow model now exists in `src/shared/generation` and is being used as the common source of truth for workflow identity, stage identity, and validation behavior.

This includes:

- workflow definitions
- workflow content-type resolution
- stage alias handling
- stage contract lookup
- shared run-state and attempt metadata
- shared validation semantics

This work shifts the app away from duplicated, local stage maps and toward a central workflow registry.

### 2. Manual and integrated paths were brought onto the same runtime model

The manual copy/paste path and the integrated AI path now share much more of the same workflow behavior instead of acting like separate systems.

Shared behavior now includes:

- prompt compilation
- stage response normalization
- stage validation
- stage review preparation
- retry metadata
- stage progression
- completion handling
- save/resume metadata

This is one of the most important changes in the entire refactor because it protects the manual fallback requirement while improving the integrated path at the same time.

### 3. Shared launch, navigation, review, transition, and completion services were introduced

Large sections of `ManualGenerator.tsx` were extracted into shared services for:

- stage launch
- stage navigation
- stage continuation
- stage transition
- stage response parsing
- review preparation
- completion presentation
- canon retrieval and canon narrowing
- chunking and multi-part progression
- stage-chunk restore and continuation

This reduced page-owned orchestration and made the workflow behavior more testable and reusable.

### 4. Shared client/server validation was hardened

Validation logic that had previously drifted between client and server was consolidated around shared workflow-aware contract resolution.

This improved:

- stage alias ambiguity handling
- required versus optional field behavior
- empty-versus-invalid array handling
- NPC slice validation
- non-NPC contract validation for item, encounter, story arc, monster, and other flows

This also reduced false rejections and false retries.

### 5. D&D NPC generation received focused hardening

NPC generation was a primary target of the refactor and received several robustness improvements.

Completed improvements include:

- stage-aware slice validation instead of full-schema rejection
- better preservation of rich NPC data
- improved species/race normalization
- smarter dynamic NPC stage routing
- better handling for spellcasting and non-spellcasting cases
- better acceptance of optional empty arrays where appropriate
- reduced false retry loops

The practical effect is that NPC generation is much better aligned with the goal of producing a fully fleshed-out character, not a thin or structurally invalid stub.

### 6. Location generation received major workflow and geometry fixes

Location generation previously had meaningful logic issues, especially around:

- paired doors
- reciprocal door syncing
- wall thickness usage
- stitched map layout
- preview versus editor math drift
- retry guidance when geometry was invalid

Completed location work includes:

- shared wall-thickness and room geometry utilities
- shared spatial layout logic
- shared preview and stitched-map rendering
- shared editor/live-map conversion logic
- shared location retry guidance
- issue-aware reject/retry workflows
- retry provenance carried into prompts and session history

This materially improved the professionalism and reliability of location generation and editing.

### 7. Canon retrieval and fallback behavior were improved

The workflow now treats canon grounding as explicit state rather than an implicit assumption.

Implemented behavior includes:

- project canon first
- library fallback second
- ungrounded generation last
- visible warnings instead of silent failure
- shared factpack merge/dedup/narrowing logic
- retrieval hints integrated into the same workflow model

This means content generation can continue when canon is missing, while still making that limitation visible and actionable.

### 8. Retry and resume provenance were made explicit

Retry behavior now carries structured metadata instead of just a freeform prompt.

That provenance is used in:

- prompt notices
- saved progress
- resume UI
- integrated AI runner logs
- location retry guidance

This improves explainability and recovery, and it makes the workflow easier to debug when a stage is retried due to a specific issue.

### 9. Homebrew extraction workflow was brought closer to the shared engine

The homebrew chunk-processing path remained one of the last large content-type-specific orchestration islands.

That has now been moved onto shared runtime behavior for:

- chunk state initialization
- current chunk lookup
- chunk progression
- final chunk merge
- completion launch behavior

This also fixed a real defect: earlier parsed homebrew chunks could be lost during final merge, causing incomplete final outputs.

## Approach and Reasoning

## Why this was done as a phased migration

A big-bang rewrite would have introduced too much regression risk into a workflow-heavy application with multiple content types and a critical manual fallback requirement.

The phased approach was chosen so that:

- each improvement could be verified incrementally
- manual mode remained usable throughout the migration
- high-risk flows like NPC and location generation could be hardened first
- the system could keep shipping improvements without waiting for a total rewrite

This was the right choice because the codebase already contained active, user-facing workflows that could not be taken offline.

## Why the shared workflow layer was prioritized

The core structural problem was not just “bad prompts” or “one broken stage.”

The deeper issue was that workflow logic was fragmented across:

- page-level orchestration
- local config modules
- provider-specific routes
- duplicated validation paths
- content-type-specific special cases

The shared workflow layer was prioritized because it creates a single place to answer questions like:

- What stage is this really?
- What fields are valid here?
- What should happen next?
- Is this response acceptable?
- Can this be resumed?
- Was this retry expected and why?

Without that shared layer, every content type and every execution mode would continue to drift.

## Why manual copy/paste was preserved as an equal path

The manual path is not just a convenience feature.

It is part of the product requirement.

The reasoning was:

- provider outages happen
- model behavior changes
- parsing can fail
- retries sometimes need human intervention
- users need a way to continue working when the integrated path is impaired

Because of that, the manual path was treated as a first-class transport, not as a degraded emergency fallback. The correct architecture is that both manual and integrated modes share the same workflow engine and differ mainly in transport and interaction pattern.

## Why NPCs and locations were prioritized

NPC generation was prioritized because it is the clearest expression of the user’s core goal: the app must be able to generate fully fleshed-out content, not thin scaffolding.

Locations were prioritized because they exposed a different class of problem:

- geometry consistency
- structured review
- retry and edit loops
- visual/editor/export divergence

Together, NPCs and locations covered both:

- semantic generation quality
- structural and workflow robustness

Hardening both gives the shared engine a stronger foundation for the remaining content types.

## Why the server path is still being migrated gradually

The server workflow path is improved, but not yet the sole orchestrator.

That is intentional.

The current approach improves correctness without forcing a destabilizing backend rewrite before the shared model is ready. The long-term direction is still to move more acceptance and orchestration responsibility into the server runtime, but that is being done after the shared workflow contracts and client runtime patterns are proven.

## Current State Assessment

### What is now strong

- NPC workflow robustness
- location workflow robustness
- contract-driven stage validation
- retry and resume metadata
- shared integrated/manual runtime behavior
- canon fallback behavior
- completion and continuation logic

### What is improved but not fully finished

- server-side orchestration centralization
- non-NPC content-type parity
- resume/session restore standardization across every edge case
- browser-level QA coverage

### What is no longer the main risk

- basic stage alias confusion
- location door pairing drift across renderers
- NPC slice validation rejecting valid partial stage output
- integrated/manual behavior diverging as completely separate systems
- hidden retry reasons with no provenance

## Current NPC Workflow Process

The NPC workflow now behaves as a shared, stateless stage pipeline rather than a loosely connected sequence of prompts.

### 1. Prompt compilation is app-owned

- `ManualGenerator.tsx` compiles the authoritative stage request before execution.
- The compiled request carries a stable `requestId`, prompt-budget metadata, stage identity, and workflow context.
- Integrated and manual execution both depend on that compiled request rather than ad hoc prompt assembly at send time.

### 2. Stage execution is stateless and contract-driven

- Each NPC stage runs against an explicit stage contract and only the minimal prior stage context required for that stage.
- The app, not the model, is the authoritative memory for prior outputs, retry provenance, and unresolved decisions.
- Stage routing is determined from app-owned stage results rather than from implicit chat continuity.

### 3. Shared repair runs before acceptance

- Integrated server execution and manual/client parsing now both run through the shared workflow stage repair pipeline.
- That repair layer handles deterministic cleanup such as:
  - parsing stringified JSON fields
  - pruning disallowed keys
  - normalizing malformed `character_build` arrays into schema-safe object arrays
  - flattening malformed core-details personality structures
  - normalizing planner retrieval/proposal payload shape
- Repairs are explicit, bounded, and logged rather than hidden fallbacks.

### 4. Schema-invalid output gets one bounded automatic correction retry

- If integrated execution returns schema-invalid structured data after deterministic repair, the server classifies that as `INVALID_RESPONSE` with retry metadata.
- The server returns a calmer user-facing message plus a hidden `retryContext.correctionPrompt`.
- The client automatically replays the same stage once with that hidden correction prompt and a bounded `correctionAttempt` count.
- If the corrected response is still schema-invalid, the run moves to review-required behavior instead of looping.

### 5. NPC-specific routing and validation are stricter and more realistic

- NPC routing now treats `class_levels` as valid whether it arrives as:
  - an object map
  - an array of class entries
  - a normalized string such as `Rogue (Assassin) 5`
- This prevents false skipping of `Combat` and `Spellcasting` when the model uses a different but still meaningful representation.
- NPC validation now also recognizes populated relationship/equipment arrays even when the entries are plain strings instead of object records.
- NPC character-build validation rejects clearly placeholder mechanical output such as listed skill proficiencies or saving throws that are all `+0`.
- NPC stats validation now recognizes placeholder default ability-score blocks even when the model uses long-form keys like `strength` and `dexterity` instead of abbreviated keys.

### 6. Review and retry behavior are explicit

- Review preparation deduplicates conflicts and proposals before deciding whether to pause.
- Same-stage retries now clear stale compiled-request state so a retry always creates a fresh compiled attempt.
- Retry, advance, and completion transitions now also clear stale review payload, retry notice, and retry-source state so corrected stages do not leak old review context into later runs.
- Review-triggered retries are now treated as one-shot client actions until the workflow returns a fresh review/error state, which prevents duplicate corrected retries from being re-issued with the same signature.
- The AI assistant runner now allows a fresh compiled request to proceed even if the previous attempt for that stage ended in `error`.
- Integrated execution now distinguishes between server patch acceptance and true local workflow acceptance: if the browser pipeline pauses for review or local validation after the patch is applied, the assistant keeps the run in an error/review-required state instead of reporting a false success.
- This prevents retry deadlocks such as `attempt not ready (error)` and avoids stale attempt state blocking reviewed retries.

### 7. Acceptance is stronger, but still not fully centralized

- The client and server now share much more of the same acceptance logic than before.
- Structural repair, contract validation, routing, retry provenance, and review preparation are materially more aligned.
- The remaining architectural direction is still to move more final acceptance responsibility into the shared server runtime so browser-local logic becomes thinner over time.

## Next Steps

The next steps below are ordered by architectural leverage and user impact.

### 1. Finish moving workflow acceptance and orchestration guarantees into the server runtime

#### Goal

Make the server the authoritative executor of stage acceptance, stage identity, retry state, and progression metadata so the client is less responsible for making correctness decisions.

#### Work to do

- Expand the generic workflow execution service so more stage acceptance rules are enforced server-side.
- Ensure the server returns canonical stage identity, workflow identity, acceptance status, and retry context for every execution.
- Move more stage-level structural checks out of page-level branches and into the shared server runtime.
- Introduce clearer server response states for:
  - accepted
  - retry required
  - review required
  - invalid response
  - partial but acceptable

#### Why this matters to the user goals

This directly supports the goal of making the app architecturally robust for any content type. It also improves reliability for D&D NPC generation because the system becomes less dependent on browser-local logic to decide whether AI output is acceptable.

#### Validation required

- server route tests for accepted/rejected/review-required stage responses
- client transport tests that consume the new metadata
- manual verification that integrated runs still behave the same from the user’s perspective

### 2. Continue migrating remaining legacy prompt/config islands into shared workflow modules

#### Goal

Reduce the number of content-type-specific config files that still behave like custom mini-engines.

#### Work to do

- Audit all remaining stage config files for bespoke prompt assembly and bespoke progression assumptions.
- Move remaining reusable logic into shared prompt helpers or shared stage prompt services.
- Keep truly special domain stages as explicit exceptions, but isolate them behind shared interfaces.
- Reduce content-type-specific branching in `ManualGenerator.tsx` even further.

#### Why this matters to the user goals

This is essential for the “not just D&D NPCs, but any content generation” requirement. If too much logic remains trapped in old config islands, other content types will stay less robust than NPCs and locations.

#### Validation required

- prompt-shape tests for each migrated stage set
- shared contract tests confirming stage identity and expected inputs
- smoke testing for item, encounter, monster, story arc, and location structural stages

#### Recent progress

- The location stage set was moved further behind a shared `locationStagePrompt` service so foundation, spaces prompt assembly, spaces chunk planning, details, and accuracy refinement no longer live as bespoke prompt/progression logic inside `locationCreatorStages.ts`.
- Prompt-shape coverage was added for the migrated location builders, including template-derived foundation prompts, shared spaces chunk planning, strict-mode spaces prompts, details prompts, and accuracy-refinement prompts.
- The item stage set was migrated behind a shared `itemStagePrompt` service so `itemCreatorStages.ts` is now a thin stage-definition layer instead of owning inline prompt assembly for concept, mechanics, and lore.
- Focused item prompt-shape and config contract tests were added, and the migration validated cleanly with focused tests plus a full build.
- The encounter stage set was migrated behind a shared `encounterStagePrompt` service so `encounterCreatorStages.ts` now delegates concept, enemies, terrain, tactics, and rewards prompt assembly through a shared interface instead of keeping those builders inline.
- Focused encounter prompt-shape and config contract tests were added, and the migration validated cleanly with focused tests plus a full build.
- The monster stage set was migrated behind a shared `monsterStagePrompt` service so `monsterCreatorStages.ts` now delegates basic info, stats, combat, legendary, and lore prompt assembly through a shared interface instead of keeping those builders inline.
- Focused monster prompt-shape coverage was added alongside updated config-layer tests, and the migration validated cleanly with focused tests plus a full build.
- The story arc stage set was migrated behind a shared `storyArcStagePrompt` service so `storyArcCreatorStages.ts` now delegates premise, structure, characters, and secrets prompt assembly through a shared interface while keeping character-facing context explicit and stateless.
- Focused story arc prompt-shape and config contract tests were added, and the migration validated cleanly with focused tests plus a full build.
- The shared workflow dispatch layer in `generatorWorkflow.ts` was tightened so specialized stage selection now routes through a shared type-to-catalog lookup instead of a longer content-type-specific branch chain, while preserving the special NPC routing path.
- Focused workflow dispatch tests were expanded to cover specialized catalog lookup, NPC dynamic-stage precedence, and the cleanup validated cleanly with focused tests plus a full build.

### 3. Finish standardizing saved-session and resume behavior across all workflow modes

#### Goal

Make resume behavior equally reliable for integrated mode, manual mode, retries, multi-part runs, stage chunking, and homebrew extraction.

#### Work to do

- Audit all resume paths to ensure they restore canonical stage identity, workflow type, current prompt state, retry context, and chunk state.
- Standardize pending prompt restoration for content types that do not go through normal prompt compilation.
- Ensure saved sessions always reconstruct the same state the user last saw.
- Tighten any remaining content-type-specific end-state or restore logic.

#### Why this matters to the user goals

The manual fallback is only truly first-class if sessions can be resumed accurately. Robust recovery is also a major part of making the workflow dependable for long-form and multi-stage content generation.

#### Validation required

- automated resume tests for:
  - pending prompt
  - retry prompt
  - completed run
  - stage chunking
  - multi-part fact chunking
  - homebrew chunk progression
- browser QA of save, close, resume, retry, and completion flows

- Session workflow metadata persistence was centralized behind a shared `resolveWorkflowSessionMetadata` helper so `ManualGenerator.tsx` now saves canonical workflow type and stage-sequence data from one place for both normal session saves and pending-prompt saves.
- Resume stage resolution was tightened in `workflowResume.ts` so saved stage labels and aliases now resolve through canonical workflow stage keys before falling back to raw stage names, reducing resume drift for specialized workflows and label changes.
- Location stage chunk reconstruction was tightened in `workflowStageChunkRestore.ts` so saved chunk progress now resolves through the workflow-scoped canonical Spaces stage key instead of relying on a hardcoded stage label.
- Direct homebrew prompt launches now persist pending prompt entries through the same session-save path used by generated stage prompts, so saved sessions can reopen the exact homebrew chunk prompt the user last saw instead of only the stage state.
- Saved-session validation passed with focused workflow metadata/resume tests (`generatorWorkflow.test.ts`, `workflowResume.test.ts`) plus a full build.
- Follow-up chunk-restore validation passed with focused chunk restore/resume/workflow tests (`workflowStageChunkRestore.test.ts`, `workflowResume.test.ts`, `generatorWorkflow.test.ts`) plus a full build.
- Homebrew prompt-persistence validation passed with focused homebrew/resume/workflow/chunk-restore tests (`workflowHomebrewRuntime.test.ts`, `workflowResume.test.ts`, `generatorWorkflow.test.ts`, `workflowStageChunkRestore.test.ts`) plus a full build.
- Focused fact-chunk resume coverage was added so later pending canon-chunk prompts are explicitly tested to resume via the saved prompt before any generic stage fallback, and the updated resume suite plus full build passed cleanly.

### 4. Finish broad content-type parity hardening

#### Goal

Bring monster, item, encounter, story arc, and other content flows up to the same standard already being reached by NPCs and locations.

#### Work to do

- Expand shared stage contracts where they are still thin.
- Reduce remaining content-type-specific assembly logic in `ManualGenerator.tsx` and workflow orchestration paths.
- Standardize content reconstruction/finalization so all workflows save, restore, and complete through the same narrow set of helpers.
- Add focused tests for each workflow that prove stage assembly, upload restoration, retry, and completion behavior are consistent.

#### Progress notes

- Location upload restoration now uses the same shared stage-assembly path as item, encounter, and story arc when reopening saved `_pipeline_stages`, and direct stage-structured location uploads are flattened through the same helper instead of relying on ad hoc UI assumptions.
- Focused parity validation passed with `workflowContentAssembler.test.ts` plus the previously hardened resume/chunk/workflow suites, and a full build completed cleanly after tightening the raw-location flattening guard.
- Monster upload restoration now also rebuilds saved `_pipeline_stages` through the shared assembler path instead of depending on fallback flattening, with focused coverage proving sanitized monster fields survive restore as expected.
- Location final assembly and upload restoration now accept both canonical workflow keys like `location.spaces` and legacy simple keys like `spaces`, aligning the assembler with the canonical stage identities already used by saved-session and chunk-restore logic.
- Monster final assembly and upload restoration now also accept canonical workflow keys like `monster.combat` and `monster.stats` alongside legacy keys, with focused `workflowContentAssembler` coverage and a clean full build confirming parity across both save/restore and direct upload paths.
- Focused canonical-key regression coverage now also proves direct stage-structured upload flattening for item, encounter, story arc, and location, and the shared restore helper now guards item/encounter/story arc flattening so saved `_pipeline_stages` are not re-processed after they have already been assembled back into final content.
- Finalizer-backed non-tabletop workflows like `scene` and `nonfiction` now participate in the same shared assembler/restore path used by the stronger tabletop flows, with focused coverage proving finalizer-based assembly, saved `_pipeline_stages` restore, direct stage-structured upload flattening, and resolved completion all stay on the shared path; the updated assembler suite passed and the full build remained clean.
- Shared stage-definition ownership is now aligned with the workflow definitions for non-tabletop writing flows: `creator` and `fact_checker` explicitly cover `nonfiction`, `outline`, `chapter`, `memoir`, `journal_entry`, `diet_log_entry`, and `other_writing`, with focused registry/contract tests plus a clean full build confirming those workflows resolve through the same shared metadata layer instead of relying on generic fallback lookups.
- Shared generator stage dispatch now also routes `outline`, `chapter`, `memoir`, `journal_entry`, `diet_log_entry`, and `other_writing` through the same four-stage writing catalog as `nonfiction`, instead of incorrectly falling back to the generic six-stage pipeline; focused `generatorWorkflow` coverage and a clean full build confirmed the stage sequence now matches the workflow definitions for those non-tabletop writing flows.
- The shared workflow model for non-tabletop writing flows now reflects the real five-stage writing pipeline instead of an older generic abstraction: `workflowRegistry` defines canonical `outline_&_structure`, `draft`, and `editor_&_style` stages, the writing workflow definitions use the same five-stage sequence as the manual catalog, and `MANUAL_GENERATOR_STAGE_CATALOG.nonfictionStages` now normalizes through the shared stage adapter so saved session metadata and run definitions persist canonical writing stage keys instead of leaking raw display names.
- Shared writing-workflow orchestration is now also normalized beyond `nonfiction`: the shared assembler now treats `outline`, `chapter`, `memoir`, `journal_entry`, `diet_log_entry`, and `other_writing` as the same writing-family contract for `fact_check_report` extraction and final content fallback (`finalizer` -> `editor_&_style` -> `draft`), and shared review preparation now treats `Editor & Style` as a fact-check stage generically instead of hardcoding a nonfiction-only exception. Focused `workflowContentAssembler` and `workflowStageReview` coverage passed, and the full build remained clean.

#### Why this matters to the user goals

This is the core path to delivering a truly general-purpose content generation engine instead of a strong NPC pipeline plus a set of weaker secondary flows.

#### Validation required

- one representative happy-path run per content type
- one retry/review case per content type where possible
- regression tests around stage assembly and validation rules

### 5. Deepen NPC hardening from “structurally valid” to “reliably complete”

#### Goal

Push NPC generation from robust structure into consistently rich and decision-complete output.

#### Work to do

- Continue improving NPC rules-pack logic for:
  - casters
  - half-casters
  - warlocks
  - martial NPCs
  - noncombat NPCs
  - legendary and non-legendary variants
- Expand stage-level enforcement for fields that are commonly under-produced.
- Audit spellcasting, relationships, equipment, and combat completeness.
- Add more representative NPC fixtures to regression tests.

#### Why this matters to the user goals

This directly serves the explicit requirement that D&D NPCs must be fully fleshed out, including the details the AI often under-supplies.

#### Validation required

- matrix tests for multiple NPC archetypes
- browser QA on generated NPC quality
- manual inspection of final outputs for completeness and coherence

### 6. Add server-side validation support for location geometry where appropriate

#### Goal

Move the most important geometry correctness rules from purely client-side review into shared or server-enforced validation where that makes sense.

#### Work to do

- identify which geometry checks are deterministic and safe to enforce before acceptance
- preserve interactive review for user judgment calls
- prevent clearly broken room/door/wall outputs from being accepted silently
- align server-side geometry rules with the client geometry utilities

#### Why this matters to the user goals

The location workflow is already much stronger, but this would push it from “well-reviewed client-side” to “more strongly enforced across the whole system.” That improves architectural robustness and reduces avoidable retries.

#### Validation required

- location geometry test fixtures
- review that client and server geometry rules do not drift
- browser testing for retry flow after geometry rejection

### 7. Run a formal browser-level QA matrix

#### Goal

Confirm that the refactor is robust in real user flows, not just in unit tests and builds.

#### Work to do

- Run manual QA for:
  - NPC caster generation
  - NPC non-caster generation
  - location generation with reject/edit/retry
  - item generation
  - encounter generation
  - story arc generation
  - homebrew extraction and completion
  - session save/close/resume
  - manual copy/paste fallback
  - integrated AI flow
- Record findings and convert them into targeted fixes.

#### Why this matters to the user goals

The user’s goal is a dependable working tool. That cannot be confirmed through unit tests alone because the workflow behavior is heavily interactive and multi-step.

#### Validation required

The QA pass itself is the validation. The output should be a test matrix with pass/fail notes and follow-up issues.

### 8. Retire the remaining dependence on the old disabled orchestration model

#### Goal

Complete the transition away from the older disabled creator/orchestrator path so the new shared workflow engine becomes the clear system of record everywhere.

#### Work to do

- audit any remaining references to the older orchestration assumptions
- migrate anything still depending on the legacy model
- ensure generic workflow endpoints are the long-term path
- update documentation so future work builds on the shared engine instead of reviving legacy patterns

#### Why this matters to the user goals

This is how the system stops being “a refactor in progress” and becomes a stable unified architecture that supports general content generation cleanly.

#### Validation required

- code audit confirming no workflow-critical paths still depend on the disabled model
- endpoint and transport smoke tests
- documentation review

## Recommended Near-Term Execution Order

The recommended sequence for the next implementation phase is:

1. Server-side workflow acceptance centralization
2. Resume and saved-session standardization
3. Remaining legacy config/prompt migration
4. Broad content-type parity hardening
5. NPC completeness pass
6. Location server-side validation pass
7. Full browser QA matrix
8. Final retirement of remaining legacy orchestration dependence

## Final Assessment

The project has moved from a fragile, page-led workflow model toward a real shared generation engine.

The most important user-facing outcomes already achieved are:

- much stronger D&D NPC generation
- much stronger location generation
- preserved manual fallback capability
- improved retry, resume, and recovery behavior
- reduced duplication and drift between integrated and manual flows

The remaining work is still significant, but it is now mostly about finishing the migration and expanding parity, not discovering the architecture from scratch. That is a strong position to be in.
