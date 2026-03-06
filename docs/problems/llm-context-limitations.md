# LLM Context Limitations for NPC Generation Workflow

## Summary
The current AI pipeline issues **stateless, single-call prompts** to Gemini. Each stage sends a fresh request containing:
- A large system prompt (base NPC rules + stage-specific schema guidance)
- The stage user prompt (prior stage outputs, canon reference, flags)
- Optional inline schema blocks (formatted JSON)

There is **no persistent chat session**. Any continuity (“memory”) is only what we re-embed in the next prompt. This is constrained by the **hard 8,000-character limit** (Gemini truncates beyond it). When system + user content exceed this limit, the model silently drops trailing content, leading to incomplete outputs and schema failures.

## Key Constraints
- **Hard prompt limit:** 8,000 characters. Content beyond this is truncated without warning by the model.
- **Large system prompts:** Stats, Character Build, and Equipment stages carry long base instructions plus schema guidance, consuming ~5–6k chars before user context.
- **Accumulated context:** User prompt includes prior stage outputs and sometimes canon references. This can push the total over 8k even when no canon facts are embedded.
- **Schema inline blocks:** `formatSchemaForPrompt(...)` adds hundreds to >1k chars per stage.
- **No session memory:** Each call is independent; earlier chunks/stages are “remembered” only if re-included in the prompt, which competes with the 8k limit.
- **Fact-based chunking gaps:** Stages with few/no canon facts (e.g., Stats) can still overflow due to system/user content. Fact chunking does not help there.

## Impact on Goals
- **Missing required fields:** When prompts truncate, required fields (e.g., ability_scores, speed) never reach the model, causing 422 validation errors despite retries.
- **Inconsistent canon application:** Large canon sets cannot be fully embedded; without multi-turn chat, we cannot “stream” context unless we chunk and stitch across calls.
- **Incomplete NPC sheets:** Large schema + context crowds out the actual generation content, leading to sparse or “lazy” responses.

## Current Mitigations (partial)
- **Fact-based chunking:** Splits canon facts into chunks with a modal workflow. Helps when facts are large, but not when system/user payload alone exceeds limits.
- **Section-based chunking (NPC Creator):** Forces chunking by NPC sections, but still uses the same 8k cap per section.
- **Validation retries:** On schema failure, the server retries with AJV error feedback (2 attempts). Cannot fix truncation when the model never saw the required fields.

## Recommended Robust Approach
- **Adaptive prompt sizing:** Before sending, measure total size; if over a buffer (e.g., 7.2k), auto-reduce:
  - Swap to **condensed system prompts** per stage (Stats/Build/Equipment) that keep only required-field mandates and naming rules.
  - Cap/truncate **previousDecisions/accumulatedAnswers** to a strict budget (e.g., 1.5–2k).
  - Drop or summarize low-value sections (verbose flags, redundant canon_reference) before sending.
- **Force chunking even without big facts:** If total prompt exceeds limit and facts are minimal, push context into multi-part flow: chunk 1 lean, later chunks carry bulk context with minimal system prompts.
- **Stage-aware schema inclusion:** Include only the minimal schema slice per stage; avoid full JSON dumps when already near the limit.
- **Explicit size logging and fail-fast:** If still over the hard limit after reductions, block and surface a clear error with size breakdown instead of sending a doomed prompt.

## Why this matters
Without adaptive sizing and chunking for non-fact-heavy stages, the pipeline cannot reliably “remember” canon or prior outputs. Given the stateless API and strict 8k cap, we must aggressively control prompt size and structure to ensure the model receives all required instructions and context for a complete, rule-compliant NPC.
