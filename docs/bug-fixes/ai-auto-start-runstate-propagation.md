# AI Auto-Start RunState Propagation Bug

## Summary
The integrated AI workflow stopped auto-starting after prompt compilation. The assistant panel remained open and the compiled stage request existed, but the runner kept reporting gate skips such as `awaiting compiled stage request`, `attempt not ready (none)`, and later repeated stale gate states even after a compiled attempt had been created.

## Root Cause
- `AiAssistantPanel.tsx` could create a compiled stage attempt in `workflowRunState` when the current compiled request had no recorded attempt.
- `ManualGenerator.tsx` republishes AI workflow state through `setWorkflowContext(...)`.
- That publish effect depended on `workflowRunState`, but its `shouldUpdate` guard did not treat `workflowRunState` changes as a reason to republish.
- As a result, `AiAssistantPanel` wrote the repaired attempt state, but continued reading stale `workflowContext.runState` with `attemptStatus: null`.

## Fix Implemented
1. `ManualGenerator.tsx`
   - Added workflow run-state change tracking to the workflow-context publishing effect.
   - Republish now occurs when `workflowRunState` changes, not just when stage results, config, factpack, or compiled request data change.

2. `AiAssistantPanel.tsx`
   - Kept the compiled-attempt sync behavior so integrated mode can self-heal when the compiled request exists without a recorded attempt.
   - Deduplicated repeated gate logs so identical skip states are logged once per unique gate signature instead of flooding the console on every render/effect pass.

3. `ResourcesPanel.tsx`
   - Removed non-actionable informational console logs that were generating fetch/status spam.
   - Preserved warnings and errors for failed parsing and failed requests.

## Scope
- `client/src/pages/ManualGenerator.tsx`
- `client/src/components/ai-assistant/AiAssistantPanel.tsx`
- `client/src/components/generator/ResourcesPanel.tsx`

## Risk Assessment
- Low to medium.
- The `workflowContext` effect now republishes more often because it includes run-state changes.
- AI runner gate logging is less noisy, but still preserves distinct state transitions and failure diagnostics.
- No server contracts or schema behavior changed.

## Verification
- Confirmed integrated auto-start resumes after prompt compilation.
- Confirmed the panel sees the compiled attempt once `workflowRunState` updates.
- Ran TypeScript type-check:
  - `npx tsc --noEmit --pretty false`

## Known Limitations
- Gate logs are deduplicated only for identical signatures. Legitimate state transitions still log.
- `ResourcesPanel` still logs warnings and errors for malformed responses and failed operations, by design.
