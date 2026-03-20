# Unified Generation Workflow Work Statement

## Purpose

This document captures:

- the user goals behind the workflow refactor
- the work completed so far
- the architectural approach and why that approach was chosen
- the updated implementation steps needed to finish the migration to a robust, unified generation engine with app-owned memory, canon protection, and stateless AI execution across all workflows

This is intended to function as both a status report and a practical handoff document for continued implementation.

## User Goals Restated

The requested outcomes for this work are:

1. Build a robust AI-assisted workflow for content generation across the app, not just for one narrow content type.
2. Make D&D NPC generation especially strong, so the AI reliably produces the data needed to fully flesh out an NPC.
3. Preserve a manual copy/paste workflow as a first-class fallback so generation can continue even if the integrated AI path fails, is unavailable, or becomes unreliable.
4. Reduce fragility caused by duplicated client-only logic, provider-specific behavior, and page-level orchestration living in one large component.
5. Ensure canon retrieval, validation, retry, resume, and completion behavior are all predictable, explainable, and resilient.
6. Improve specialized workflows, including location generation, where geometry, paired doors, and wall thickness were producing unreliable outputs.
7. Make the app the authoritative memory and canon brain for every workflow so AI outputs are treated as stateless proposals that can be validated against canon, conflicts can be detected, and contradictions can be handled gracefully instead of being silently accepted.

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

The main remaining gap is no longer basic workflow plumbing.
It is turning canon from “retrieved context when available” into an app-owned, inspectable, enforceable memory layer that can detect when structurally valid AI output conflicts with established project truth.

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

### 7. Canon retrieval, grounding, and fallback behavior were improved

The workflow now treats canon grounding as explicit state rather than an implicit assumption.

Implemented behavior includes:

- project canon first
- library fallback second
- ungrounded generation last
- visible warnings instead of silent failure
- shared factpack merge/dedup/narrowing logic
- retrieval hints integrated into the same workflow model

This means content generation can continue when canon is missing, while still making that limitation visible and actionable.
What it does not yet guarantee is cross-workflow canon enforcement: a workflow can still complete with structurally valid output that drifts from canon if retrieval is weak, empty, or contradictory.

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

### 10. Scene, story arc, and NPC hardening exposed the next shared requirement

Recent fixes across scene, story arc, and NPC generation clarified the same lesson from different angles:

- the app succeeds when it owns stage memory, canon payloads, retries, and final assembly
- the AI succeeds when it is treated as a stateless structured generator, not as a continuity system
- structurally valid completion is not the same thing as canon-safe completion
- canon retrieval alone is not enough if the app does not also classify conflicts, surface drift risk, and preserve user decisions about new facts

This means the next major phase is not another prompt-only tuning pass.
It is building shared app-owned memory and shared canon conflict handling for every generation workflow.

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

The current approach improves correctness without forcing a destabilizing backend rewrite before the shared model is ready. The long-term direction is still to move more acceptance and orchestration responsibility into the server runtime, but that migration now needs to include shared workflow memory and canon conflict handling rather than only structural validation.

## Current State Assessment

### What is now strong

- shared workflow definitions, stage identity, and prompt compilation
- manual and integrated execution parity
- shared assembly, restore, and finalization for more workflows, including scene and story arc
- bounded deterministic repair and retry behavior
- NPC data retention and structure preservation
- location geometry hardening and retry guidance

### What is improved but not fully finished

- server-side orchestration centralization
- entity grounding and retrieval-hint quality
- canon scope selection and review visibility
- resume/session restore standardization across every edge case
- workflow-specific semantic completeness and continuity validation

### What is now the main risk

- structurally valid output can still drift from canon
- empty or weak canon retrieval can produce plausible but unsupported content
- canon conflicts are not yet classified and surfaced consistently across workflows
- users do not yet have one shared surface to inspect memory, canon usage, new claims, and contradictions

## Updated Cross-Workflow Direction

### 1. The app must own workflow memory for every content type

Every workflow should run from a typed app-owned memory object containing:

- request memory
- decision memory
- stage memory (full outputs plus distilled summaries)
- canon memory (facts, entities, provenance, grounding confidence)
- conflict memory (new claims, ambiguities, contradictions, adopted decisions)
- execution memory (current stage, retries, chunk state, autosave state)

Saved sessions, retries, resume, and final assembly should reconstruct from this model rather than from prompt text or ad hoc UI state.

### 2. AI responses must be treated as proposals, not truth

The AI should be treated as a stateless structured generator.
Its responses are candidate patches against app-owned memory, not authoritative continuity.

That means acceptance should be a shared pipeline:

1. deterministic repair
2. contract/schema validation
3. semantic/workflow validation
4. canon consistency analysis
5. acceptance, retry, or review classification

### 3. Canon must be app-managed, scoped, and inspectable

Canon cannot remain a prompt-only convenience field.
The app has to decide:

- what canon is relevant to the current stage
- how grounded the stage actually is
- whether the returned content is aligned with canon, additive, ambiguous, or conflicting

If relevant canon is empty or low-confidence, that must be explicit in both runtime state and UI, not silently treated as equivalent to grounded generation.

### 4. Canon conflict handling must become a first-class shared system

Every workflow needs a shared way to classify returned claims against scoped canon.
The target shared statuses are:

- `aligned`
- `additive_unverified`
- `ambiguous`
- `conflicting`
- `unsupported_ungrounded`

Those classifications should drive workflow behavior:

- `aligned` → accept normally
- `additive_unverified` → accept with reviewable proposed canon additions
- `ambiguous` → pause for review or targeted correction
- `conflicting` → block silent acceptance and require review/correction
- `unsupported_ungrounded` → allow only if the workflow policy permits ungrounded generation, while making drift risk visible

### 5. This must apply to all workflows, with domain-specific adapters

The shared pattern stays the same, but each workflow gets its own semantic adapters:

- NPC: identity, species/subspecies, relationships, equipment, spellcasting, mechanical completeness, canon entity conflicts
- Scene: participants, location anchors, chronology, objectives, discoveries, canon event continuity
- Story arc: character roles, secrets, major beats, unresolved threads, chronology, canon history alignment
- Location: deterministic geometry plus canon identity of rooms, occupants, regions, and references
- Writing/nonfiction/homebrew: named entity continuity, citation/source expectations, story-bible alignment, contradiction surfacing

### 6. Review UX must expose memory and canon state directly

Users need a shared review surface that shows:

- what canon was used
- what canon was missing
- which claims are new
- which claims are ambiguous or conflicting
- what decisions were already made

The app should let users accept new canon, reject conflicts, or retry a stage with explicit correction instructions derived from that shared state.

## Next Steps

The next steps below are ordered by architectural leverage and user impact.

### 1. Formalize shared app-owned workflow memory and canon state

#### Goal

Define one cross-workflow memory model so the app is the authoritative source of continuity, not chat history or prompt text.

#### Work to do

- Define shared workflow-memory contracts for request, decisions, stage outputs, stage summaries, canon scope, conflict ledger, and execution state.
- Persist and restore that memory model through autosave, resume, and finalization paths.
- Ensure compiled stage requests are derived only from that canonical memory model.
- Make every workflow declare which memory slices it depends on.

#### Why this matters to the user goals

This is the core requirement behind “the app is the memory and the brains.” Without a formal shared memory model, canon and continuity will keep leaking through ad hoc prompt construction and local UI state.

#### Validation required

- shared workflow-memory unit tests
- prompt-compiler tests proving outbound prompts match the memory-derived request
- save/resume tests showing memory reconstructs identically after reload

### 2. Add shared canon conflict detection and response classification

#### Goal

Make canon protection a separate, explicit acceptance phase for every workflow instead of an implicit hope that retrieval happened.

#### Work to do

- Define a shared conflict-result model and workflow-specific claim adapters.
- Compare accepted candidate output to scoped canon before final acceptance.
- Introduce canonical workflow response states such as:
  - accepted
  - accepted_with_additions
  - review_required_conflict
  - review_required_ambiguity
  - accepted_ungrounded_warning
  - invalid_response
- Persist conflict findings and user decisions as part of workflow memory.

#### Why this matters to the user goals

This is the missing piece between “canon-aware prompts exist” and “the app actually prevents undesirable contradictions.”

#### Validation required

- NPC, scene, and story arc conflict fixtures
- shared service tests for classification and acceptance-state mapping
- review-preparation tests for conflict-driven pauses and correction prompts

### 3. Finish moving workflow acceptance and orchestration guarantees into the server runtime

#### Goal

Make the server the authoritative executor of stage acceptance, retry state, canon conflict status, and progression metadata.

#### Work to do

- Expand the generic workflow execution service so memory-aware acceptance rules are enforced server-side.
- Ensure the server returns canonical stage identity, workflow identity, acceptance state, canon grounding state, conflict summary, and retry context for every execution.
- Move more acceptance logic out of page-level branches and into the shared runtime.

#### Why this matters to the user goals

This reduces browser-local correctness decisions and makes cross-workflow behavior predictable, explainable, and testable.

#### Validation required

- server route/service tests for accepted, review-required, ungrounded-warning, and invalid responses
- client transport tests that consume the new metadata
- manual verification that integrated and manual runs still behave consistently from the user’s perspective

### 4. Standardize saved-session, restore, and final assembly around the canonical memory model

#### Goal

Make save/resume/final assembly reconstruct the same workflow memory and canon state the user last saw, not just a content blob.

#### Work to do

- Ensure `_pipeline_stages`, pending prompts, finalizers, and direct upload restores rebuild canonical workflow memory.
- Preserve canon grounding state, conflict records, and user review decisions across resume.
- Keep scene, story arc, writing, and tabletop workflows on the same assembler/restore path.

#### Why this matters to the user goals

The manual fallback is only truly first-class if the workflow can be resumed with the same memory, canon, and review context intact.

#### Validation required

- restore tests for scene, story arc, nonfiction/writing, and tabletop workflows
- save/close/resume tests that preserve canon/conflict state
- browser QA for retry, review, and completion after resume

### 5. Finish broad workflow parity and retire remaining bespoke prompt/assembly islands

#### Goal

Make all workflows rely on the same shared prompt, contract, assembly, and restore primitives instead of preserving content-type-specific mini-engines.

#### Work to do

- Audit remaining config islands for bespoke prompt assembly, restore assumptions, or workflow progression logic.
- Move reusable behavior behind shared prompt/compiler and assembler interfaces.
- Keep domain-specific exceptions explicit, but isolate them as adapters instead of page-owned branches.

#### Recent progress

- Story arc prompt construction was moved behind shared stage-prompt services.
- Shared assembly/restore now covers story arc, scene, nonfiction, and stronger tabletop workflows through the same core path.
- Writing-family workflows now use canonical shared stage definitions and shared finalization behavior instead of drifting through older generic fallbacks.

#### Why this matters to the user goals

This is how the architecture becomes genuinely general-purpose rather than “strong in NPCs plus improving elsewhere.”

#### Validation required

- prompt-shape tests for migrated workflows
- parity smoke tests across item, encounter, monster, scene, story arc, writing, homebrew, and location
- regression tests around assembly, restore, and completion states

### 6. Add workflow-specific semantic completeness and continuity passes

#### Goal

Move from structurally valid output to meaningfully complete, canon-safe output per workflow.

#### Work to do

- Continue NPC completeness hardening for spellcasting, relationships, equipment, identity, and under-produced fields.
- Add scene continuity checks for participants, location anchors, chronology, and discoveries.
- Add story arc continuity checks for character roles, secrets, beats, unresolved threads, and chronology.
- Add location checks for deterministic geometry plus canon-linked occupants/regions where relevant.
- Add writing/nonfiction continuity and source-quality checks where those workflows depend on known entities or facts.

#### Why this matters to the user goals

This is where the product becomes dependable for real creative work instead of merely structurally shaped.

#### Validation required

- representative fixtures per workflow family
- browser QA of generated quality and continuity
- manual inspection of final outputs for completeness and coherence

### 7. Build visible memory, canon, and conflict review UX

#### Goal

Expose the app-owned memory layer so users can see what the workflow knows, what it used, and why a review/correction is being requested.

#### Work to do

- Add a shared context inspector for canon used, canon missing, stage summaries, and grounding confidence.
- Add review actions to accept new canon, reject conflicts, retry with correction, or keep an explicitly ungrounded draft.
- Surface when a stage is operating with empty canon or unresolved ambiguity.

#### Why this matters to the user goals

If the app is supposed to be the memory and the brain, users need to see and control that memory layer directly.

#### Validation required

- component tests for inspector and review actions
- browser QA for user decision flows
- documentation updates for memory/canon review semantics

### 8. Run a formal browser QA matrix and retire the remaining legacy orchestration model

#### Goal

Confirm the shared architecture holds up in real user workflows and remove the last legacy assumptions that no longer fit the new model.

#### Work to do

- Run manual QA for NPC, scene, story arc, location, item, encounter, homebrew, writing, save/resume, manual fallback, and integrated AI flows.
- Audit remaining legacy orchestration references and remove or quarantine them.
- Update documentation so future work builds on the shared memory/canon-protection architecture instead of reviving older prompt-led patterns.

#### Why this matters to the user goals

The user’s goal is a dependable tool. That requires both real-flow QA and a clean architectural system of record.

#### Validation required

- completed QA matrix with pass/fail notes and follow-ups
- code audit confirming no workflow-critical paths still depend on the older orchestration model
- endpoint and transport smoke tests

## Recommended Near-Term Execution Order

The recommended sequence for the next implementation phase is:

1. Shared app-owned workflow memory and canon state
2. Shared canon conflict detection and response classification
3. Server-side workflow acceptance centralization
4. Memory-aware save/resume/restore standardization
5. Broad workflow parity and remaining prompt/assembly migration
6. Workflow-specific semantic completeness and continuity passes
7. Visible memory/canon/conflict review UX
8. Full browser QA matrix and final legacy orchestration retirement

## Final Assessment

The project has moved from a fragile, page-led workflow model toward a real shared generation engine.

The most important user-facing outcomes already achieved are:

- much stronger D&D NPC generation
- much stronger story arc and scene assembly/recovery behavior
- much stronger location generation
- preserved manual fallback capability
- improved retry, resume, and recovery behavior
- reduced duplication and drift between integrated and manual flows

The biggest remaining architectural gap is no longer discovering how to stage prompts or repair JSON.
It is turning canon from “retrieved context when available” into “app-owned memory with enforced conflict handling and explicit user review” across every workflow.

That is now the correct roadmap for the next phase.
