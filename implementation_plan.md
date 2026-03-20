# Implementation Plan – Cross-Workflow App-Owned Memory & Canon Protection

## Intent
Refactor generation workflows so the app, not AI chat/session continuity, is the authoritative memory and canon system. Every workflow should compile stateless stage requests from typed app-owned memory, validate returned content against contracts and semantic rules, compare candidate facts against canon, and require review when conflicts or unsupported claims appear.

## Current Behavior
- compiled stage requests and shared runtime behavior are materially better, especially for NPC, scene, story arc, and location workflows
- shared assembly and restore behavior improved reliability, but final acceptance still focuses more on structural validity than canon alignment
- factpacks can be retrieved and scoped, but weak or empty grounding can still lead to plausible drift
- conflict detection, new-claim tracking, and user review decisions are not yet shared first-class workflow state across all content types
- resume and finalization paths preserve more workflow context, but they do not yet reconstruct a single canonical memory and conflict-ledger model

## Target Behavior
1. Every workflow runs from one typed memory model containing request, decisions, stage outputs/summaries, canon scope, conflict ledger, and execution state.
2. `ManualGenerator` and integrated execution publish and consume only compiled stage requests derived from that canonical memory.
3. AI stages operate as stateless transforms over explicit memory slices and scoped canon; chat/session continuity is never required for correctness.
4. Every stage response runs through shared deterministic repair, contract validation, semantic validation, and canon conflict analysis before acceptance.
5. Candidate claims are classified as aligned, additive, ambiguous, conflicting, or unsupported/ungrounded, and workflow progression follows those states.
6. Save, resume, and final assembly reconstruct the same memory, canon, and conflict state the user last saw.
7. Users can inspect canon used, review contradictions, accept proposed canon additions, or retry with app-generated correction guidance.

## Scope & Files
- `src/shared/generation/`
  - add typed workflow-memory, canon-scope, conflict, and acceptance-state contracts
  - declare workflow memory dependencies and domain adapters per workflow family
- `client/src/pages/ManualGenerator.tsx`
  - publish compiled stage requests from canonical workflow memory
  - preserve memory and conflict state through manual, retry, review, and accept flows
- `client/src/components/ai-assistant/AiAssistantPanel.tsx`
  - consume only authoritative compiled stage requests and shared acceptance metadata
- `client/src/contexts/AiAssistantContext.tsx`
  - expose typed compiled request, stage memory summaries, canon state, and conflict summaries
- `client/src/services/stagePromptShared.ts`
  - derive outbound prompts strictly from canonical workflow memory
- `client/src/services/workflowContentAssembler.ts`
  - rebuild final content from canonical stage memory and preserve canon/conflict provenance
- `client/src/services/workflowResume.ts`
  - restore the same canonical workflow memory and review state the user last saw
- `client/src/services/workflowStageReview.ts`
  - prepare shared review states for canon conflicts, ambiguities, and additions
- `src/server/routes/ai.ts`
  - return canonical acceptance state, canon grounding status, conflict summary, and retry context
- shared workflow execution services
  - enforce server-side acceptance and canon conflict analysis
- `docs/unified-generation-work-statement.md`
  - stay aligned with the authoritative roadmap
- `NPC_architecture.md`
  - continue serving as the NPC-specific reference for stateless app-memory rules

## Impact Analysis
- **Consumers**
  - manual and integrated generation flows across all workflow families
  - stage review and correction UX
  - save/resume/finalization paths
  - server execution responses consumed by the client runtime
- **Dependent Events / State**
  - compiled request readiness must depend on canonical workflow memory being current
  - acceptance states now include canon grounding and conflict results, not just structural validity
  - retries and resume must preserve conflict ledgers and adopted review decisions
- **Visual / UX Impacts**
  - integrated mode may pause for review when canon is conflicting or ambiguous
  - users need visible canon grounding and memory state, not just stage output
  - ungrounded generation must warn explicitly instead of appearing equivalent to canon-grounded generation

## Approach
1. **Shared Memory Model**
   - Add typed contracts for request memory, decision memory, stage memory, canon scope, conflict ledger, and execution state.
2. **Stateless Compiled Request Path**
   - Ensure every compiled stage request is derived only from canonical workflow memory and shared prompt compilation.
3. **Canon Scope and Conflict Analysis**
   - Formalize grounding status, scoped canon payloads, deterministic claim adapters, and conflict classification.
4. **Server Acceptance Centralization**
   - Move acceptance, retry classification, canon conflict state, and progression metadata into the shared server execution path.
5. **Review and Restore Alignment**
   - Persist memory, canon, and conflict state through save/resume and expose shared review actions for additions, ambiguities, and conflicts.
6. **Cross-Workflow Rollout**
   - Start with NPC, scene, and story arc fixtures, then extend the same acceptance model across location, writing, homebrew, item, encounter, and monster workflows.

## Risks & Mitigations
- **Conflict analysis becomes too fuzzy**
  - Mitigation: start with deterministic field and claim adapters plus explicit confidence/status states.
- **Empty canon blocks productive workflows**
  - Mitigation: support explicit ungrounded mode with warnings and policy-controlled acceptance states.
- **Resume flows drift from visible review state**
  - Mitigation: persist canon grounding status, conflict ledger, and adopted review decisions alongside stage outputs.
- **Client and server classify stages differently**
  - Mitigation: define shared contracts and make server acceptance metadata authoritative for the client.

## Verification
- shared type and unit tests for workflow memory, canon scope, conflict classification, and acceptance-state mapping
- route and service tests for `accepted_with_additions`, `review_required_conflict`, `review_required_ambiguity`, `accepted_ungrounded_warning`, and `invalid_response`
- restore and assembler tests proving saved sessions reconstruct the same memory, canon, and conflict state across NPC, scene, story arc, writing, and tabletop workflows
- manual verification checklist:
  - integrated runner waits for compiled requests derived from canonical memory
  - empty canon is surfaced visibly instead of silently treated as grounded
  - conflicting canon pauses acceptance and exposes review actions
  - additive claims can be accepted as proposed canon without losing provenance
  - retry and resume preserve canon/conflict context and final assembly remains consistent
