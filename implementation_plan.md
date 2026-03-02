# Implementation Plan – NPC Legendary Actions Prompt

## Intent
Add an explicit user decision gate for NPC legendary actions that:
- Reminds creators they can generate legendary actions now and discard them later.
- Automatically opts strong characters (CR ≥ 11, legendary keywords, or explicit requests) into generating legendary actions even if the user doesn’t opt in manually.
- Propagates the decision through `previous_decisions`, dynamic stage routing, and review/discard flows.

## Current Behavior
- `determineRequiredStages()` sets `legendary.required` based solely on CR/keywords/request.
- `ManualGenerator` builds `dynamicNpcStages` immediately after Basic Info without additional user input.
- If `legendary.required` is true, the “Creator: Legendary” stage always runs; otherwise it’s skipped with no prompt.
- Users cannot explicitly request or decline legendary actions mid-flow, nor discard generated legendary content separately.

## Target Behavior
1. After Basic Info routing completes, surface a modal explaining the benefits of legendary actions. Options: `Generate them` vs `Skip for now`. Include reminder about discarding later.
2. Default selection:
   - Strong character (CR ≥ 11 or routing reason indicates legendary) → default to `Generate` and auto-confirm if user closes modal without choosing.
   - Otherwise default to `Skip` but allow opting in.
3. Persist choice in new `legendary_actions_choice` field within `accumulatedAnswers`/`previousDecisions`.
4. Respect choice when constructing `dynamicNpcStages`:
   - If choice is `skip`, remove Legendary stage even if router marked required, unless strong auto-enforcement demands it.
   - If choice is `generate`, ensure stage stays included even if router marked optional.
5. During review/save, expose a “Discard legendary actions” toggle (only when legendary data exists) that clears the corresponding stage output before final merge.

## Scope & Files
- `client/src/pages/ManualGenerator.tsx`: state, modal UI, stage routing adjustments, decision persistence, discard toggle in Review modal.
- `client/src/config/npcStageRouter.ts`: expose helper to classify “strong character” metadata (e.g., `legendary.reason`).
- `client/src/config/npcCreatorStages.ts`: ensure stage metadata keyed for gating (likely no changes unless additional helper needed).
- Potential shared UI components for modals (reuse `ReviewAdjustModal` styling or create inline modal block inside `ManualGenerator`).

## Approach
1. **State & Types**
   - Extend `StageRoutingDecision` or add helper to mark `legendary.autoRecommended` bool (derived from CR/reason).
   - In `ManualGenerator`, add `legendaryPromptState` (e.g., `{ shown: boolean; decision?: 'generate' | 'skip'; auto: boolean }`).
   - Track `legendaryDecisionReason` (router reason string) for modal messaging.

2. **Prompt Trigger**
   - After `determineRequiredStages` resolves (post Basic Info accept), evaluate `routingDecision.legendary` and stored prior decision.
   - If `legendaryDecision` absent, show modal with message + two CTA buttons.
   - Auto-confirm to `generate` if `legendary.required` true AND reason indicates strong character; otherwise wait for user selection.

3. **Stage List Filtering**
   - When building `dynamicNpcStages`, filter `NPC_CREATOR_STAGES` based on `legendaryDecision` (skip stage if user declined and not forced).
   - Persist decision into `accumulatedAnswers.legendary_actions_choice` for downstream prompts.

4. **Review/Discard Support**
   - When `currentStageOutput` or review data includes `creator:_legendary`, add checkbox/action to drop this block before merging final results.
   - Ensure `stageResults` cleanup occurs (delete stage key) when discarding.

5. **AI Prompt Context**
   - Include `legendary_actions_choice` inside `previousDecisions` sent to subsequent stages (existing plumbing should pick it up once stored in `accumulatedAnswers`).

6. **Testing / Verification**
   - Manual flows: low CR skip, high CR auto-include, user opt-in/out toggles, discard path.
   - Verify stage routing summary reflects final inclusion/exclusion, and final JSON lacks legendary block when discarded.

## Risks & Mitigations
- **Stage ordering disruption**: Ensure `dynamicNpcStages` rebuild maintains original order except optional removal of legendary stage.
- **State desync after resume**: Save the decision into progress sessions (already persists via `accumulatedAnswers`). Validate resume path uses stored decision to avoid re-prompting.
- **User confusion**: Provide clear copy referencing discard ability and highlight auto-recommended rationale.

## Acceptance & Tests
- Manual smoke test for each scenario listed above.
- Confirm `legendary_actions_choice` surfaces in prompts (log or console).
- Checklist recorded in final summary per coding standards section 8/9.
