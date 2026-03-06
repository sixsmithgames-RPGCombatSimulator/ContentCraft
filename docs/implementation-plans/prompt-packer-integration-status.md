# Prompt Packer Integration Status

## Completed Core Utilities (Phase 1-4)

### ✅ Phase 1: Core Utilities Created
- **promptPacker.ts**: Exact payload measurement, priority-based assembly, fail-fast enforcement
- **compactSchemaSpec.ts**: Minimal schema representations (200-500 chars vs 1500-3000+)
- **stageInputReducer.ts**: Extracts only needed fields from prior outputs
- **npcStageContracts.ts**: Stage-minimal system prompts (400-800 chars each)

**Size Targets Achieved:**
- Stats contract: ~600 chars (vs 5000+ previously)
- Character Build contract: ~800 chars (vs 6000+ previously)
- Combat contract: ~700 chars
- Equipment contract: ~500 chars
- Spellcasting contract: ~600 chars

## Remaining Integration Work (Phase 5-6)

### Phase 5: ManualGenerator.tsx Integration

**Current Challenge:**
ManualGenerator.tsx is 8,678 lines with complex prompt building logic at lines 4300-4637. The current flow uses `buildSafePrompt` which is append-only and doesn't enforce hard limits.

**Required Changes:**

1. **Add imports** (top of file):
```typescript
import { buildPackedPrompt, formatSizeBreakdown, PROMPT_SAFETY_CEILING } from '../utils/promptPacker';
import { generateCompactSchemaSpec } from '../utils/compactSchemaSpec';
import { reduceStageInputs } from '../utils/stageInputReducer';
import { getStageContract } from '../config/npcStageContracts';
```

2. **Replace buildSafePrompt call** (around line 4438):
   - Current: Uses `buildSafePrompt(systemPrompt, userPrompt, options)`
   - New: Use `buildPackedPrompt(config)` with priority-based components
   - Handle success/failure cases with structured errors

3. **Build packed prompt config** (before line 4438):
```typescript
// Check if this stage has a minimal contract
const stageContract = getStageContract(stage.id || stage.name);
const usePackedPrompt = !!stageContract && cfg.type === 'npc';

if (usePackedPrompt) {
  // Use new prompt packer
  const packConfig = {
    mustHave: {
      stageContract: stageContract!,
      outputFormat: 'Output ONLY valid JSON. NO markdown. NO prose.',
      requiredKeys: generateCompactSchemaSpec(stageSchema, requiredFields),
      stageInputs: reduceStageInputs(stage.name, results),
    },
    shouldHave: {
      canonFacts: limitedFactpack ? formatCanonFacts(limitedFactpack) : undefined,
      previousDecisionsSummary: limitedDecisions ? JSON.stringify(limitedDecisions) : undefined,
    },
    niceToHave: {
      fullPriorOutputs: cfg.flags?.includeFullContext ? results : undefined,
      verboseFlags: cfg.flags,
    },
    safetyCeiling: PROMPT_SAFETY_CEILING,
  };

  const packed = buildPackedPrompt(packConfig);

  if (!packed.success) {
    console.error('[Prompt Packer] Failed to pack prompt:', packed.error);
    console.error(formatSizeBreakdown(packed.analysis.breakdown));
    setError(`Prompt too large: ${packed.error!.overflow} chars over limit. ${packed.error!.message}`);
    return;
  }

  console.log('[Prompt Packer] Successfully packed prompt');
  console.log(formatSizeBreakdown(packed.analysis.breakdown));
  if (packed.analysis.droppedSections.length > 0) {
    console.warn('[Prompt Packer] Dropped sections:', packed.analysis.droppedSections);
  }

  setCurrentPrompt(`${packed.systemPrompt}\n\n---\n\n${packed.userPrompt}`);
  setModalMode('output');
  return;
}

// Fall back to existing buildSafePrompt for non-NPC stages or stages without contracts
```

4. **Helper function for canon facts formatting**:
```typescript
function formatCanonFacts(factpack: Factpack): string {
  return factpack.facts.map(f => `[${f.entity_name}] ${f.text}`).join('\n\n');
}
```

**Integration Strategy:**
- Add new logic BEFORE existing `buildSafePrompt` call
- Use feature flag (`usePackedPrompt`) to enable only for NPC stages with contracts
- Fall back to existing logic for other content types
- This preserves backward compatibility while enabling new system

### Phase 6: Server-Side Changes (ai.ts)

**Required Changes:**

1. **Add size breakdown logging** (before sending to Gemini):
```typescript
const systemPrompt = body.prompt.split('\n\n---\n\n')[0] || body.prompt;
const userPrompt = body.prompt.split('\n\n---\n\n')[1] || '';

const sizeBreakdown = {
  system_chars: systemPrompt.length,
  user_chars: userPrompt.length,
  total_chars: body.prompt.length,
  safety_ceiling: 7200,
  overflow: Math.max(0, body.prompt.length - 7200),
};

console.log('[AI][Gemini] Request size breakdown:', sizeBreakdown);

if (sizeBreakdown.overflow > 0) {
  return res.status(400).json({
    ok: false,
    requestId,
    stageRunId: body.stageRunId,
    error: {
      type: 'PAYLOAD_TOO_LARGE',
      message: `Prompt exceeds safety ceiling by ${sizeBreakdown.overflow} chars`,
      breakdown: sizeBreakdown,
      retryable: false,
    },
  } satisfies GeminiFailureResponse);
}
```

2. **Update retry logic for minimal patch prompts** (in validation retry loop):
```typescript
// Build minimal patch prompt instead of full regeneration
const stageContract = getStageContract(body.stageId); // Need to import contracts on server
const correctionPrompt = stageContract 
  ? `${stageContract}\n\nYour previous response was incomplete. Fix ONLY these missing fields:\n${validationErrors}\n\nPrevious JSON:\n${JSON.stringify(payload)}`
  : correctionPrompt; // Fall back to existing logic
```

## Testing Plan

1. **Unit tests for utilities**:
   - promptPacker: Test priority-based assembly, compression, fail-fast
   - compactSchemaSpec: Test schema extraction and formatting
   - stageInputReducer: Test field extraction for each stage

2. **Integration test**:
   - Run full NPC generation with Stats stage
   - Verify prompt stays under 7,200 chars
   - Verify all required fields present in output
   - Verify validation retries work with minimal patches

3. **Regression test**:
   - Run non-NPC generation (Monster, Location, etc.)
   - Verify existing flow still works
   - Verify manual copy/paste modal still works

## Success Metrics

- Stats stage prompt: < 5,000 chars (currently 13,000+)
- Character Build prompt: < 6,000 chars
- Equipment prompt: < 4,000 chars
- Zero silent truncations
- Zero 422 errors from missing required fields
- Validation retries succeed on first attempt

## Next Steps

1. Complete ManualGenerator.tsx integration (Phase 5)
2. Complete ai.ts server-side changes (Phase 6)
3. Run integration tests
4. Document any issues and iterate
5. Deploy and monitor production metrics
