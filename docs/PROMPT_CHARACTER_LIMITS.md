# Prompt Character Limit Management

## Overview

All AI prompts in the generation workflow are monitored and constrained to stay within the 8,000 character limit. This document explains how character limits are managed throughout the system.

## Character Limit Constants

Defined in `client/src/utils/promptLimits.ts`:

```typescript
PROMPT_LIMITS = {
  MAX_PROMPT_CHARS: 7500,           // Main limit (8000 - 500 buffer)
  WARNING_THRESHOLD: 6375,          // 85% warning threshold
  MAX_CANON_FACTS_CHARS: 4000,      // Canon facts section limit
  MAX_ACCUMULATED_ANSWERS_CHARS: 2000,  // Previous answers limit
  SYSTEM_PROMPT_RESERVE: 1500,     // Reserve for system instructions
}
```

## How It Works

### 1. **Prompt Building Process**

Every stage prompt is built using `buildSafePrompt()` which:

1. **Measures** all prompt components:
   - System prompt (stage instructions)
   - User prompt (context, config, facts)
   - Accumulated answers (from previous stages)
   - NPC schema guidance (for NPC stages only)

2. **Analyzes** total character count:
   ```
   Total = System + User + Answers + Schema
   ```

3. **Trims** if necessary:
   - Accumulated answers trimmed first (keeps most recent)
   - Canon facts already limited per-stage
   - Schema guidance included for NPC stages (forced priority)

4. **Validates** final prompt:
   - Returns error if exceeds 7,500 chars
   - Shows warning if exceeds 6,375 chars (85%)
   - Logs detailed breakdown to console

### 2. **Per-Stage Canon Fact Limits**

Each stage has custom canon fact limits based on needs:

| Stage | Canon Limit | Reason |
|-------|------------|---------|
| Planner | No limit | Needs full context for planning |
| Creator | Default | Full fact access for generation |
| Fact Checker | 6000 chars | Large context for validation |
| Stylist | 6000 chars | Full context for polishing |
| Canon Delta | 5000 chars | Checking against canon |
| Physics Magic | 4000 chars | Rules validation only |

**Implementation**: `createMinimalFactpack(factpack, maxChars)` in `ManualGenerator.tsx:371`

### 3. **NPC Schema Guidance**

For NPC generation stages (Creator, Stylist):

```typescript
// Automatically injected when type === 'npc'
npcSchemaGuidance = `
⚠️ CRITICAL: NPC OUTPUT SCHEMA ⚠️
- ability_scores: {str, dex, con, int, wis, cha} - LOWERCASE ONLY
- personality: {traits[], ideals[], bonds[], flaws[]}
- Use "abilities" field (NOT "traits")
...
`;

// Schema is ~600 chars and force-included even if space is tight
buildSafePrompt(..., {
  npcSchemaGuidance,
  forceIncludeSchema: true
});
```

**Why Force Include**: Field name alignment is critical - incorrect names cause validation failures and data loss.

### 4. **Accumulated Answers Management**

Previous stage decisions are accumulated to prevent duplicate questions:

```typescript
// Trimmed to fit remaining space (max 2000 chars)
const { trimmedAnswers, originalCount, trimmedCount } =
  trimAccumulatedAnswers(accumulatedAnswers, maxChars);

// Shows warning if answers were omitted
if (trimmedCount < originalCount) {
  warning: `Trimmed ${originalCount - trimmedCount} older answers`
}
```

**Priority**: Most recent answers kept first (processed in reverse order).

## Integration Points

### ManualGenerator.tsx (Lines 2386-2437)

```typescript
// 1. Check if NPC stage needs schema
const isNpcStage = cfg.type === 'npc' &&
                  (stage.name === 'Creator' || stage.name === 'Stylist');

// 2. Build safe prompt with all components
const { prompt, analysis, warnings } = buildSafePrompt(
  stage.systemPrompt,
  stage.buildUserPrompt(context),
  {
    accumulatedAnswers,
    npcSchemaGuidance,
    forceIncludeSchema: isNpcStage,
  }
);

// 3. Log analysis to console
console.log(formatPromptAnalysis(analysis));

// 4. Block generation if exceeds limit
if (analysis.exceedsLimit) {
  setError(`Prompt exceeds limit: ${analysis.totalChars} chars`);
  return;
}

// 5. Use the safe prompt
setCurrentPrompt(prompt);
```

## Console Logging

Every prompt shows detailed analysis:

```
📊 Prompt Analysis: Prompt is 5,234 chars (69.8% of limit)
├─ System Prompt: 1,850 chars
├─ User Prompt: 2,400 chars
├─ Accumulated Answers: 384 chars
├─ NPC Schema Guidance: 600 chars
└─ Total: 5,234 chars (69.8% of 7,500)
```

**Warning Example** (85%+ usage):
```
⚠️ WARNING: Prompt is 87.3% of limit (952 chars remaining)
⚠️ Prompt Warnings: [
  'Trimmed 3 older answers to fit character limit'
]
```

**Error Example** (exceeds limit):
```
⚠️ PROMPT TOO LONG: 8,127 chars exceeds limit by 627 chars. Must trim content.
```

## Preventing Character Limit Issues

### For Developers

1. **Always use `buildSafePrompt()`** when constructing prompts
2. **Check console logs** during testing to monitor prompt sizes
3. **Use `PROMPT_LIMITS` constants** instead of magic numbers
4. **Add character counting** when adding new prompt sections

### For Users

The system handles limits automatically, but users can:

1. **Reduce canon facts** using the "Max Canon Facts" setting
2. **Narrow canon search** if prompted
3. **Simplify requests** if generation shows character limit errors

### For Content Types

**NPCs** have special handling:
- Schema guidance auto-included (~600 chars)
- Always validated against schema
- Field name corrections applied automatically

**Other types** use standard limits without schema overhead.

## Testing Character Limits

### Test Case 1: Normal Prompt
```typescript
Config: type='npc', prompt='Create vampire overseer'
Expected: ~4000-5000 chars total, no warnings
```

### Test Case 2: Large Canon Context
```typescript
Config: max_canon_facts=150, complex multi-stage
Expected: Fact trimming, possible "trimmed N answers" warning
```

### Test Case 3: Multi-Chunk Planner
```typescript
Config: Many canon facts (chunked into 3 parts)
Expected: Each chunk <7500 chars, unanswered proposals carried forward
```

### Test Case 4: Prompt Exceeds Limit
```typescript
Scenario: System prompt (2000) + User (4000) + Canon (3000) + Answers (1000) = 10,000
Expected: Error shown, generation blocked, suggestions provided
```

## Character Count Breakdown

### Typical NPC Generation Prompt:

| Component | Size | Notes |
|-----------|------|-------|
| System Prompt | 1500-2000 | Stage instructions |
| User Prompt (base) | 500-800 | Config, type, flags |
| Canon Facts | 2000-4000 | Variable by stage |
| Accumulated Answers | 0-1500 | Grows over stages |
| NPC Schema Guidance | 600 | NPC stages only |
| Formatting/JSON | 300-500 | Whitespace, delimiters |
| **TOTAL** | **4900-9400** | Must stay under 7500 |

### How Trimming Works:

If total would exceed 7500:

1. ✅ **System Prompt**: Never trimmed (required instructions)
2. ✅ **User Prompt Core**: Never trimmed (user's request)
3. ✅ **NPC Schema**: Never trimmed for NPC stages (critical)
4. ⚠️ **Accumulated Answers**: Trimmed (oldest removed first)
5. ⚠️ **Canon Facts**: Pre-limited per stage
6. ❌ **User Prompt Canon**: If still too big, show error

## Error Messages

### User-Facing Errors

**Character Limit Exceeded**:
```
Prompt exceeds 7,500 character limit (8,127 chars).
Please reduce canon facts or simplify request.
```

**What User Should Do**:
1. Click "Narrow Canon Search" to reduce facts
2. Reduce "Max Canon Facts" setting from 50 to 30
3. Simplify the generation request
4. Split complex requests into multiple generations

### Developer Warnings

**Trimming Applied**:
```
⚠️ Prompt Warnings:
- Trimmed 5 older answers to fit character limit
- NPC schema guidance omitted due to character limit (non-forced)
```

**Critical Warnings**:
```
CRITICAL: Prompt still exceeds limit after trimming (8,234 chars)
```

## Future Improvements

1. **Dynamic System Prompts**: Shorten stage instructions for complex requests
2. **Smarter Fact Selection**: Prioritize most relevant facts instead of first N
3. **Answer Compression**: Summarize old answers instead of dropping them
4. **Multi-Model Support**: Different limits for different AI models
5. **Prompt Caching**: Cache common sections to reduce repetition

## Related Files

- **Utilities**: `client/src/utils/promptLimits.ts`
- **Integration**: `client/src/pages/ManualGenerator.tsx` (lines 2386-2437)
- **Schema Guidance**: `src/server/services/npcSchemaMapper.ts`
- **Fact Limiting**: `ManualGenerator.tsx` (createMinimalFactpack, line 371)

## Summary

✅ **All prompts checked** before sending to AI
✅ **7,500 char limit** enforced (with 500 char safety buffer)
✅ **NPC schema guidance** auto-included and prioritized
✅ **Detailed logging** shows exact character breakdown
✅ **Automatic trimming** of lower-priority sections
✅ **User-friendly errors** with actionable suggestions

The system ensures no prompt exceeds limits while maximizing the information included in each stage.
