# AI Character Limit Fix - Critical System Update

## Problem Statement

### The Critical Issue

The AI has a **HARD 8,000 character limit**. This is not a soft limit or guideline - the AI **silently truncates** any prompt beyond 8,000 characters. If you send a 10,000 character prompt:

- ✅ First 8,000 characters: AI receives and processes
- ❌ Last 2,000 characters: **LOST FOREVER**, AI never sees them

### What Was Broken

**Previous chunking logic** (INCORRECT):
```typescript
// OLD - WRONG
const CHUNKING_THRESHOLD = 8000;
if (totalFactChars > 8000) {
  // Chunk facts into 8000 char groups
}
```

**The problem**: This only counted FACT characters, ignoring overhead:

| Component | Size | Counted? |
|-----------|------|----------|
| System Prompt | 1500-2500 chars | ❌ NO |
| User Prompt Base | 500-800 chars | ❌ NO |
| Accumulated Answers | 0-1500 chars | ❌ NO |
| NPC Schema | 600 chars | ❌ NO |
| Formatting | 200-500 chars | ❌ NO |
| **Canon Facts** | Variable | ✅ YES (only this) |

**Result**: A "chunk" of 8,000 chars of facts became a 11,000+ char total prompt, causing the AI to truncate ~3,000 characters and lose critical data.

### Real-World Impact

**Example Planner Stage Prompt**:
- System prompt: 2,100 chars (stage instructions)
- User prompt base: 650 chars (config, type, flags)
- Accumulated answers: 1,200 chars (previous decisions)
- Formatting: 350 chars (JSON structure, separators)
- **Overhead total**: 4,300 chars
- **Facts**: 8,000 chars (old chunking limit)
- **TOTAL**: 12,300 chars

**What the AI received**: 8,000 chars total (65% of the prompt)
**What was lost**: 4,300 chars (35% of the prompt, including the last ~4,000 chars of facts)

## Solution

### New Architecture: Calculate Available Space

**NEW - CORRECT**:
```typescript
// Step 1: Calculate overhead
const overhead = systemPrompt.length + userPromptBase.length +
                 accumulatedAnswers.length + npcSchema.length + formatting;

// Step 2: Calculate available space for facts
const availableForFacts = AI_HARD_LIMIT (8000) - overhead;

// Step 3: Limit facts to fit
if (totalFactChars > availableForFacts) {
  trimOrChunk(facts, availableForFacts);
}

// Step 4: Verify total prompt
if (totalPrompt.length > 8000) {
  ERROR: "Prompt exceeds AI hard limit, will be truncated";
}
```

### Implementation Details

#### 1. Calculate Available Fact Space (New Function)

```typescript
// client/src/utils/promptLimits.ts
export function calculateAvailableFactSpace(
  systemPrompt: string,
  userPromptBase: string,
  options?: {
    accumulatedAnswers?: Record<string, string>;
    npcSchemaGuidance?: string;
    forceIncludeSchema?: boolean;
  }
): {
  availableForFacts: number;
  overhead: number;
  breakdown: { /* detailed breakdown */ };
}
```

**What it does**:
1. Measures every component of the prompt
2. Calculates total overhead
3. Returns available space: `8000 - overhead`

**Example output**:
```
📐 Available Fact Space Calculation for Planner:
├─ System Prompt: 2,100 chars
├─ User Prompt Base: 650 chars
├─ Formatting: 350 chars
├─ Accumulated Answers: 1,200 chars
├─ NPC Schema: 0 chars
├─ Total Overhead: 4,300 chars
└─ Available for Facts: 3,700 chars
```

#### 2. Trim Facts Before Building Prompt

```typescript
// ManualGenerator.tsx (lines 2407-2467)
// BEFORE building user prompt:
const spaceCalculation = calculateAvailableFactSpace(
  stage.systemPrompt,
  userPromptBaseEstimate,
  { accumulatedAnswers, npcSchemaGuidance, forceIncludeSchema }
);

// Trim facts to fit
let limitedFactpack = factpack;
if (totalFactChars > spaceCalculation.availableForFacts) {
  // Trim facts, keeping as many as possible
  trimmedFacts = facts.slice(0, maxFitCount);
  limitedFactpack = { ...factpack, facts: trimmedFacts };
}

// THEN build user prompt with trimmed facts
const context = { config, stageResults, factpack: limitedFactpack };
const userPrompt = stage.buildUserPrompt(context);
```

#### 3. Update Chunking Logic

```typescript
// OLD chunking (WRONG):
const CHUNKING_THRESHOLD = 8000; // Only counted facts

// NEW chunking (CORRECT):
const estimatedOverhead = 2000 + 800 + 1000 + npcSchema + 200; // All components
const availableForFacts = 8000 - estimatedOverhead; // ~4000 chars

if (totalFactChars > availableForFacts) {
  // Chunk facts into groups that fit within available space
  groupFactsIntelligently(factpack, availableForFacts);
}
```

#### 4. Validate Total Prompt

```typescript
// After building complete prompt:
const analysis = analyzePrompt(systemPrompt, userPrompt, accumulatedAnswers, npcSchema);

if (analysis.totalChars > PROMPT_LIMITS.AI_HARD_LIMIT) {
  ERROR: "🚨 CRITICAL: Prompt exceeds AI hard limit by X chars. AI will truncate!";
  // Block generation, force chunking
}
```

## Console Logging

### Available Space Calculation (New)

Every stage now logs:

```
📐 Available Fact Space Calculation for Creator:
├─ System Prompt: 2,450 chars
├─ User Prompt Base: 720 chars
├─ Formatting: 200 chars
├─ Accumulated Answers: 856 chars
├─ NPC Schema: 600 chars
├─ Total Overhead: 4,826 chars
└─ Available for Facts: 2,974 chars
```

### Prompt Analysis (Enhanced)

```
📊 Prompt Analysis: Prompt is 7,345 chars (91.8% of AI hard limit: 8,000)
├─ System Prompt: 2,450 chars
├─ User Prompt: 3,695 chars
├─ Accumulated Answers: 600 chars
├─ NPC Schema: 600 chars
└─ Total: 7,345 chars (91.8% of AI hard limit: 8,000)
```

### Critical Error (If Exceeds Limit)

```
🚨 CRITICAL: Prompt EXCEEDS AI HARD LIMIT (9,234 > 8,000) - AI will truncate!
⚠️ WARNING: 1,234 characters will be LOST to AI truncation!
```

### Chunking Check (Updated)

```
[Fact Chunking Check] Stage: Planner
├─ Total Facts: 287 facts, 15,234 chars
├─ Estimated Overhead: 4,300 chars
├─ Available for Facts: 3,700 chars
└─ Needs Chunking: YES

⚠️ [Fact Chunking] Facts (15,234) exceed available space (3,700). Showing chunking modal.
```

## Per-Stage Behavior

### Planner Stage

**Old behavior**:
- Sent up to 8,000 chars of facts
- Total prompt: ~12,000 chars
- AI truncated last 4,000 chars
- **Lost**: ~30% of facts

**New behavior**:
- Calculates: 2,100 (system) + 650 (user) + 1,200 (answers) + 350 (format) = 4,300 overhead
- Available: 8,000 - 4,300 = 3,700 chars for facts
- Limits facts to 3,700 chars
- Total prompt: ~8,000 chars
- **AI receives 100% of prompt**

### Creator Stage (NPC)

**Old behavior**:
- System: 2,500 chars
- User: 800 chars
- Facts: 8,000 chars
- Total: 11,300 chars
- **AI truncated 3,300 chars of facts**

**New behavior**:
- Calculates: 2,500 (system) + 800 (user) + 600 (NPC schema) + 200 (format) = 4,100 overhead
- Available: 8,000 - 4,100 = 3,900 chars for facts
- Limits facts to 3,900 chars OR chunks if more
- Total: ~8,000 chars
- **AI receives 100% of prompt**

### Fact Checker Stage

**Old behavior**:
- Used `createMinimalFactpack(factpack, 6000)` for facts
- But overhead was 3,000+ chars
- Total: 9,000+ chars
- **AI truncated last 1,000+ chars**

**New behavior**:
- Calculates overhead: ~3,200 chars
- Available: 8,000 - 3,200 = 4,800 chars
- Limits facts to 4,800 chars (previously was trying to send 6,000)
- Total: ~8,000 chars
- **AI receives 100% of prompt**

## Error Messages

### Critical Error (Hard Limit Exceeded)

```
🚨 CRITICAL: Prompt is 9,234 chars, exceeding AI hard limit of 8,000 by 1,234 chars.
The AI will truncate 1,234 characters, losing data. This stage MUST be chunked.
```

**User Action**: Generation is blocked. User must:
1. Approve chunking when modal appears
2. Or reduce canon facts manually

### Warning (Approaching Limit)

```
⚠️ Prompt is 92.4% of AI hard limit
```

**User Action**: Optional - generation continues but user is warned

### Facts Trimmed

```
⚠️ Trimmed 45 facts to fit within AI character limit

Warning: 45 facts were omitted to stay within the 8000 character AI limit.
Consider chunking this stage.
```

**User Action**: Generation continues with trimmed facts. User can:
1. Accept trimmed generation
2. Cancel and manually chunk via modal

## Migration Guide

### For Existing Generations

Existing progress files and factpacks will automatically use the new calculation. No migration needed.

### For Custom Stages

If you add custom stages, ensure:

1. **System prompt size**: Keep under 2,500 chars if possible
2. **Use standard helpers**: Use `buildSafePrompt()` and `calculateAvailableFactSpace()`
3. **Don't hardcode limits**: Use `PROMPT_LIMITS.AI_HARD_LIMIT` instead of magic numbers

### Testing New Stages

1. Check console logs for "Available Fact Space Calculation"
2. Verify available space is reasonable (>2000 chars)
3. Test with large factpacks to ensure chunking triggers
4. Confirm total prompt never exceeds 8,000 chars

## FAQ

### Q: Why not just chunk everything into smaller pieces?

**A**: Chunking has trade-offs:
- ✅ Ensures all facts sent to AI
- ❌ AI must maintain context across chunks
- ❌ User must answer duplicate proposals
- ❌ Longer generation time

We want to send as much as possible in one prompt, only chunking when necessary.

### Q: Why 7,800 instead of 8,000?

**A**: Safety buffer for:
- JSON formatting variations
- Newlines and whitespace
- UTF-8 encoding differences
- Edge cases in character counting

Better to stay under limit than risk truncation.

### Q: What if a single fact is >8,000 chars?

**A**: System will:
1. Log error: "Single fact exceeds AI limit"
2. Skip that fact (cannot be sent)
3. Continue with remaining facts
4. Show warning to user

**User Action**: Edit canon fact to be shorter, or split into multiple facts.

### Q: Does this affect old saved generations?

**A**: No. This only affects NEW generations. Old generations used whatever facts were available at the time.

### Q: Can I see the exact prompt sent to AI?

**A**: Yes! The Copy-Paste modal shows the EXACT prompt. Check console logs for character breakdown.

## Related Files

- **Utilities**: `client/src/utils/promptLimits.ts`
- **Integration**: `client/src/pages/ManualGenerator.tsx` (lines 2407-2505, 1973-2001)
- **Constants**: `PROMPT_LIMITS.AI_HARD_LIMIT = 8000`
- **Documentation**: `docs/PROMPT_CHARACTER_LIMITS.md` (general overview)

## Summary of Changes

| Component | Before | After |
|-----------|--------|-------|
| **Fact chunking limit** | 8,000 chars (facts only) | ~3,000-4,000 chars (calculated available space) |
| **Overhead accounting** | ❌ Not considered | ✅ Fully calculated per stage |
| **Prompt validation** | ⚠️ After building | ✅ Before AND after building |
| **Truncation risk** | 🚨 HIGH (30-40% data loss) | ✅ ZERO (always under limit) |
| **Console logging** | Basic | Comprehensive with breakdowns |
| **Error handling** | Silent truncation | Explicit errors and warnings |
| **Chunking accuracy** | Incorrect (didn't account for overhead) | Correct (based on available space) |

**Result**: The AI now receives 100% of every prompt, with zero silent data loss.
