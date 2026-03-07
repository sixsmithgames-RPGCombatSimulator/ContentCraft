# Implementation Plan – NPC App-as-Memory Stage Execution Refactor

## Intent
Refactor NPC multi-stage generation so the app, not the AI chat session, is the authoritative memory. The integrated AI runner must execute only precompiled, budgeted stage requests produced by `ManualGenerator`, and every retry or stage continuation must flow through the same deterministic prompt compiler.

## Current Behavior
- `ManualGenerator` builds carefully budgeted stage prompts, but integrated execution can drift if the runner rebuilds context separately.
- Prompt budgeting and actual provider requests can diverge, producing safety-ceiling failures that are not visible in the page-level analysis.
- Some transitions and retries can bypass the normal stage compiler by mutating `currentPrompt` directly.
- Stage continuity partially depends on prompt text and chat/session flow instead of a formal app-owned memory model.

## Target Behavior
1. `ManualGenerator` produces an authoritative `compiledStageRequest` for each stage prompt shown to the user.
2. `AiAssistantPanel` integrated mode executes only that compiled request; it does not rebuild prompts from `workflowContext.currentData`.
3. Workflow context includes a distilled stage memory summary so stage execution is stateless and traceable.
4. Retries and accept-with-issues transitions are routed back through `showStageOutput`, ensuring the same compilation, budgeting, and memory rules apply.
5. Stage keys remain stable even when stage metadata is missing an explicit router key.

## Scope & Files
- `client/src/pages/ManualGenerator.tsx`
  - add compiled stage request state
  - publish app-owned stage memory summaries
  - unify prompt generation across normal, retry, and acceptance flows
- `client/src/components/ai-assistant/AiAssistantPanel.tsx`
  - consume only authoritative compiled stage requests
  - gate auto-start until a compiled request exists
- `client/src/contexts/AiAssistantContext.tsx`
  - add typed compiled stage request + stage memory summary contracts
- `src/server/routes/ai.ts`
  - optional observability alignment for prompt budget metadata
- `NPC_architecture.md`
  - document the architecture shift

## Impact Analysis
- **Consumers**
  - Integrated AI stage automation
  - workflow context consumers in the AI panel
  - autosave/resume prompt handoff behavior
- **Dependent Events / State**
  - stage router key changes now also depend on compiled request readiness
  - stage retries and accept-with-issues now re-enter the stage compiler path
- **Visual / UX Impacts**
  - integrated mode may wait briefly for compiled request publication before auto-starting
  - over-budget stages should fail earlier and more consistently

## Approach
1. **Types & Context**
   - Add `AiCompiledStageRequest` and `AiStageMemorySummary` to AI assistant context.
2. **Authoritative Prompt Publication**
   - In `ManualGenerator`, publish a compiled request whenever a stage prompt is built.
   - Use exact outbound prompt length for the published budget measurement.
3. **Runner Lockdown**
   - In `AiAssistantPanel`, remove prompt rebuilding from integrated stage execution.
   - Require `compiledStageRequest` before auto-start.
4. **Unified Stage Re-entry**
   - Route retry/acceptance flows back through `showStageOutput`.
   - Clear stale compiled requests for manual/homebrew prompt paths.
5. **Observability**
   - Log stage key, prompt mode, and measured chars from the compiled request.

## Risks & Mitigations
- **Prompt mismatch persists**
  - Mitigation: use the exact outbound prompt string as the authoritative request payload and budget metric.
- **Stage stalls when compiled request is not ready**
  - Mitigation: explicit runner gate `skip: awaiting compiled stage request` instead of silent rebuilds.
- **Resume/manual prompt paths carry stale automation state**
  - Mitigation: clear `compiledStageRequest` for manual resume/homebrew flows.

## Verification
- Filtered TypeScript check for:
  - `ManualGenerator.tsx`
  - `AiAssistantPanel.tsx`
  - `AiAssistantContext.tsx`
- Manual verification checklist:
  - integrated runner waits for compiled request
  - stage request logs show the same stage key/prompt mode as the page
  - retry path rebuilds via `showStageOutput`
  - accept-with-issues advances to next stage through compiled request path
  - over-budget stages fail before send with consistent counts
