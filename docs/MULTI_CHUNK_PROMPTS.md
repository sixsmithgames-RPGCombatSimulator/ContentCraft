# Multi-Chunk Prompt Strategy

## Problem

The original chunking approach was creating excessive chunks (61 chunks for 217 facts) because it was sending the FULL prompt for every chunk.

### What Was Wrong

**Every chunk sent:**
- Full system prompt: 7,214 chars (Creator stage)
- Full user prompt: 4,844 chars
- NPC schema guidance: 1,050 chars
- **Total overhead: 13,108 chars per chunk**
- Available for facts: ~0 chars (exceeded limit!)

**Result**: Facts had to be split into 61 tiny chunks just to fit.

## Solution

### New Multi-Chunk Strategy

**Chunk 1 (First):**
- Full system prompt: ~7,214 chars
- Full user prompt: ~4,844 chars
- NPC schema: ~1,050 chars
- **Overhead: ~13,300 chars** (but adds multi-part instructions)
- Available for facts: ~485 chars

**Chunks 2-60 (Middle):**
- Minimal system prompt: ~300 chars ("Continuing chunk X of Y...")
- Minimal user prompt: ~200 chars ("Continuing canon facts...")
- No schema (already sent in chunk 1)
- No accumulated answers (already sent in chunk 1)
- **Overhead: ~900 chars**
- **Available for facts: ~7,100 chars**

**Chunk 61 (Last):**
- Minimal system prompt: ~300 chars ("Final chunk, now generate...")
- Minimal user prompt: ~200 chars ("Final canon facts...")
- **Overhead: ~900 chars**
- **Available for facts: ~7,100 chars**

## Impact

### Before Fix
- 217 facts = 25,253 chars
- Grouped using 485 char limit (chunk 1's space)
- **Result: 61 chunks**

### After Fix
- 217 facts = 25,253 chars
- Chunk 1: 485 chars (with full prompt)
- Chunks 2+: 7,100 chars each (with minimal prompts)
- Estimated: (25,253 - 485) / 7,100 ≈ 3.5 chunks
- **Result: 4-5 chunks total**

## User Instructions

### Chunk 1
The first chunk includes prominent instructions:

```
🔔 MULTI-PART GENERATION NOTICE:

CRITICAL INSTRUCTIONS FOR USER:
1. ⚠️ You MUST use the SAME AI chat session for all N parts
2. Do NOT start a new chat/session between chunks - you will lose all context
3. Copy each prompt into the SAME ongoing conversation
4. The AI will acknowledge each chunk and wait for the next
5. After the final chunk, the AI will generate the output
```

### Chunks 2-N (Middle)
Minimal prompt:

```
You are continuing a multi-part generation. This is chunk X of Y.

📦 More data will follow in the next chunk. Do NOT generate output yet -
just acknowledge receipt and wait for the next chunk.

IMPORTANT: You MUST use the SAME chat session for all chunks.
```

### Final Chunk
Minimal prompt with generation trigger:

```
You are continuing a multi-part generation. This is chunk X of X.

🎯 THIS IS THE FINAL CHUNK. After receiving this data, generate the
complete output based on ALL canon facts provided across all chunks.

IMPORTANT: You MUST use the SAME chat session for all chunks.
```

## Technical Implementation

### Lines 2556-2584 (ManualGenerator.tsx)

```typescript
const isSubsequentChunk = chunkInfo && chunkInfo.currentChunk > 1;
const isLastChunk = chunkInfo && chunkInfo.currentChunk === chunkInfo.totalChunks;

if (chunkInfo && chunkInfo.currentChunk === 1 && chunkInfo.totalChunks > 1) {
  // Chunk 1: Add multi-part instructions to full prompt
  systemPromptToUse = `${stage.systemPrompt}\n\n--- MULTI-PART NOTICE ---`;
} else if (isSubsequentChunk) {
  // Chunks 2+: Use minimal prompts
  systemPromptToUse = `Continuing chunk ${chunkInfo.currentChunk} of ${chunkInfo.totalChunks}...`;
  userPromptToUse = `${isLastChunk ? 'Final' : 'Continuing'} canon facts...`;

  // Don't send schema/answers again (already in chunk 1)
  npcSchemaGuidance = undefined;
  accumulatedAnswers = undefined;
}
```

### Lines 2473-2536 (Chunking Strategy)

```typescript
// Calculate different limits for chunk 1 vs chunks 2+
const minimalPromptOverhead = 900; // For chunks 2+
const availableForSubsequentChunks = 8000 - 900 = 7100 chars;

// Group facts using the larger limit (for chunks 2+)
const groups = groupFactsIntelligently(factpack, 7100);

// If first group exceeds chunk 1's space, split it
if (groups[0].characterCount > chunk1AvailableSpace) {
  // Split first group: some facts go in chunk 1, rest in chunk 2
}
```

## Benefits

✅ **Drastically fewer chunks**: 4-5 instead of 61
✅ **Efficient data transfer**: Chunks 2+ use 89% of space for facts (not repeated instructions)
✅ **Clear user guidance**: Instructions to use same chat session
✅ **AI context preserved**: All data flows through one conversation
✅ **Faster generation**: User pastes 4-5 prompts instead of 61

## Validation

Check console logs during chunking:

```
📊 Chunking Strategy:
   Chunk 1 space: 485 chars (with full prompt)
   Chunks 2+ space: 7,100 chars each (with minimal prompts)

📦 Split into 4 groups for efficient chunking
```

## Related Files

- **Implementation**: `client/src/pages/ManualGenerator.tsx` (lines 2473-2584)
- **Grouping logic**: `ManualGenerator.tsx` (lines 1765-1893)
- **Character limits**: `client/src/utils/promptLimits.ts`
- **Problem analysis**: `docs/AI_CHARACTER_LIMIT_FIX.md`
