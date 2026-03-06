# Prompt Packing System Implementation Plan

## Overview
Replace the current append-only prompt construction with a hard-capped, priority-based prompt packer that enforces the 8,000-character limit as an engineering constraint.

## Core Principles
1. **Hard size enforcement**: 7,200-char safety ceiling (not 7,999)
2. **Exact payload measurement**: Measure final serialized request, not string lengths
3. **Fail-fast on overflow**: Return structured error with size breakdown
4. **Stage-minimal contracts**: System prompts 800–1,500 chars max
5. **Compact schema specs**: Required keys + type hints, not full JSON dumps
6. **Context budgets**: Pass only what each stage needs from prior outputs
7. **Priority-based assembly**: Must-have → Should-have → Nice-to-have
8. **Payload-driven chunking**: Split stages when instructions overflow, not just facts

## Implementation Steps

### 1. Prompt Packer Utility (`client/src/utils/promptPacker.ts`)

**Purpose**: Central utility for measuring, assembling, and enforcing prompt size limits.

**Key Functions**:
- `measurePromptSize(systemPrompt: string, userPrompt: string): number`
  - Simulates Gemini SDK serialization (JSON quoting/escapes)
  - Returns exact character count of final payload
  
- `buildPackedPrompt(config: PromptPackConfig): PackedPromptResult`
  - Assembles prompt in priority order
  - Enforces safety ceiling (7,200 chars)
  - Returns success with prompt OR failure with size breakdown
  
- `generateSizeBreakdown(components: PromptComponents): SizeBreakdown`
  - Logs per-component character counts
  - Identifies what was dropped/compressed

**Types**:
```typescript
interface PromptPackConfig {
  mustHave: {
    stageContract: string;           // Stage-minimal system prompt
    outputFormat: string;             // JSON-only requirement
    requiredKeys: string;             // Compact schema spec
    stageInputs: Record<string, unknown>; // Reduced prior outputs
  };
  shouldHave: {
    canonFacts?: string;              // Relevant facts only
    previousDecisionsSummary?: string; // Compressed summary
  };
  niceToHave: {
    fullPriorOutputs?: Record<string, unknown>;
    verboseFlags?: Record<string, unknown>;
    examples?: string;
  };
  safetyCeiling: number;              // Default 7200
}

interface PackedPromptResult {
  success: boolean;
  prompt?: string;
  analysis: {
    totalChars: number;
    breakdown: SizeBreakdown;
    droppedSections: string[];
  };
  error?: {
    message: string;
    breakdown: SizeBreakdown;
    overflow: number;
  };
}

interface SizeBreakdown {
  mustHave: {
    stageContract: number;
    outputFormat: number;
    requiredKeys: number;
    stageInputs: number;
  };
  shouldHave: {
    canonFacts: number;
    previousDecisions: number;
  };
  niceToHave: {
    fullPriorOutputs: number;
    verboseFlags: number;
    examples: number;
  };
  total: number;
}
```

### 2. Stage-Minimal Contracts (`client/src/config/npcStageContracts.ts`)

**Purpose**: Replace long system prompts with compact, stage-specific contracts.

**Structure**:
```typescript
export const STAGE_CONTRACTS = {
  STATS: `Output valid JSON only. No markdown, no prose.

Required keys:
- ability_scores: {str, dex, con, int, wis, cha} (integers 1-30)
- proficiency_bonus: integer +2 to +9
- speed: {walk: integer >= 0, fly?, swim?, climb?}
- armor_class: integer or {value, source}
- hit_points: integer or {average, formula}
- senses: array of strings

Naming rules:
- Ability scores: LOWERCASE only (str, dex, con, int, wis, cha)
- No null values unless schema allows
- All required keys must be present`,

  CHARACTER_BUILD: `Output valid JSON only. No markdown, no prose.

Required keys:
- class_features: array of {name, description, level, source}
- subclass_features: array of {name, description, level, source}
- racial_features: array of {name, description, source}
- feats: array of {name, description, source?, prerequisite?}
- asi_choices: array of {level, choice, details}
- background_feature: {background_name, feature_name, description}
- abilities: array of {name, description}
- ability_scores: {str, dex, con, int, wis, cha}
- skill_proficiencies: array of {name, value}
- saving_throws: array of {name, value}
- fighting_styles: array of {name, description, source?}

Completeness requirement:
- Include ALL class features from level 1 to character level
- Include ALL subclass features
- Include ALL racial traits
- Do not use placeholder values or empty arrays`,

  EQUIPMENT: `Output valid JSON only. No markdown, no prose.

Required keys:
- equipment: array of strings or {name, quantity?, notes?}
- attuned_items: array of {name, rarity, effects, attunement_requirement?}

Rules:
- Basic gear appropriate to class/species/level
- Magic items respect rarity cap and level appropriateness
- Attuned effects must be incorporated into final stats/abilities
- No more than 3 attuned items (D&D 5e limit)`
};
```

**Size targets**:
- Stats: ~600 chars
- Character Build: ~800 chars
- Equipment: ~400 chars

### 3. Compact Schema Specs (`client/src/utils/compactSchemaSpec.ts`)

**Purpose**: Generate minimal schema representations instead of full JSON dumps.

**Key Function**:
```typescript
export function generateCompactSchemaSpec(
  schema: SchemaObject,
  requiredFields: string[]
): string {
  // Extract only required keys and their types
  // Format as compact list, not full JSON
  // Example output:
  // "ability_scores: {str, dex, con, int, wis, cha} (integers 1-30)
  //  speed: {walk} (integer >= 0)
  //  senses: array of strings"
}
```

**Size target**: 200–500 chars vs 1,500–3,000+ for full schema

### 4. Stage Input Reducer (`client/src/utils/stageInputReducer.ts`)

**Purpose**: Extract only the fields each stage needs from prior outputs.

**Key Function**:
```typescript
export function reduceStageInputs(
  stageName: string,
  priorResults: StageResults
): Record<string, unknown> {
  // Stats stage needs: concept tags, type, size, level, role
  // Build stage needs: final stats, role, class/feature constraints
  // Equipment stage needs: proficiencies, role, environment, loot tier
  
  const reducers: Record<string, (results: StageResults) => Record<string, unknown>> = {
    stats: (results) => ({
      concept: results.basicInfo?.concept,
      race: results.basicInfo?.race,
      class_levels: results.coreDetails?.class_levels,
      challenge_rating: results.coreDetails?.challenge_rating,
      role: results.coreDetails?.role,
    }),
    characterBuild: (results) => ({
      ability_scores: results.stats?.ability_scores,
      proficiency_bonus: results.stats?.proficiency_bonus,
      class_levels: results.coreDetails?.class_levels,
      race: results.basicInfo?.race,
      role: results.coreDetails?.role,
    }),
    equipment: (results) => ({
      class_levels: results.coreDetails?.class_levels,
      ability_scores: results.stats?.ability_scores,
      proficiencies: results.characterBuild?.skill_proficiencies,
      role: results.coreDetails?.role,
      environment: results.basicInfo?.environment,
    }),
  };
  
  return reducers[stageName]?.(priorResults) || {};
}
```

**Size savings**: Pass 8 fields (~200 chars) instead of 50+ fields (2,000+ chars)

### 5. Priority-Based Assembly in ManualGenerator

**Update `showStageOutput`**:
```typescript
// Replace current buildSafePrompt call with:
const packConfig: PromptPackConfig = {
  mustHave: {
    stageContract: STAGE_CONTRACTS[stage.id] || stage.systemPrompt,
    outputFormat: 'Output ONLY valid JSON. NO markdown. NO prose.',
    requiredKeys: generateCompactSchemaSpec(stageSchema, requiredFields),
    stageInputs: reduceStageInputs(stage.name, stageResults),
  },
  shouldHave: {
    canonFacts: limitedFactpack ? formatCanonFacts(limitedFactpack) : undefined,
    previousDecisionsSummary: limitedDecisions ? summarizeDecisions(limitedDecisions) : undefined,
  },
  niceToHave: {
    fullPriorOutputs: cfg.flags?.includeFullContext ? stageResults : undefined,
    verboseFlags: cfg.flags,
    examples: stage.examples,
  },
  safetyCeiling: 7200,
};

const packed = buildPackedPrompt(packConfig);

if (!packed.success) {
  // Fail-fast with structured error
  setError(`Prompt too large: ${packed.error.overflow} chars over limit. Breakdown: ${JSON.stringify(packed.error.breakdown)}`);
  return;
}

setCurrentPrompt(packed.prompt);
```

### 6. Payload-Driven Chunking

**Add to `showStageOutput`**:
```typescript
// If packed prompt still too large after reductions:
if (packed.analysis.totalChars > safetyCeiling && !isMultiPartGeneration) {
  // Split into skeleton + refinement calls
  const skeletonConfig = {
    mustHave: {
      stageContract: STAGE_CONTRACTS[stage.id] + '\n\nGenerate minimal valid skeleton with all required fields. Use safe defaults.',
      outputFormat: 'Output ONLY valid JSON.',
      requiredKeys: generateCompactSchemaSpec(stageSchema, requiredFields),
      stageInputs: reduceStageInputs(stage.name, stageResults),
    },
    shouldHave: {},
    niceToHave: {},
    safetyCeiling: 7200,
  };
  
  // Call 1: Generate skeleton
  // Call 2: Refine with additional context
  setIsMultiPartGeneration(true);
  // ... trigger two-part flow
}
```

### 7. Size Breakdown Logging

**Add to ai.ts server route**:
```typescript
// Before sending to Gemini:
const sizeBreakdown = {
  system_chars: systemPrompt.length,
  user_chars: userPrompt.length,
  total_chars: systemPrompt.length + userPrompt.length,
  safety_ceiling: 7200,
  overflow: Math.max(0, (systemPrompt.length + userPrompt.length) - 7200),
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

### 8. Minimal Patch Retries

**Update retry logic in ai.ts**:
```typescript
// On validation failure, build minimal patch prompt:
const correctionPrompt = `You previously returned incomplete JSON. Fix ONLY the missing/invalid fields listed below.

Missing fields:
${validationErrors}

Return the COMPLETE corrected JSON with all fields from your previous response, plus the missing fields.

Previous JSON (minified):
${JSON.stringify(payload)}

Stage contract:
${STAGE_CONTRACTS[body.stageId]}`;

// This is ~500-1000 chars vs 5000+ for full regeneration
```

## Migration Strategy

1. **Phase 1**: Implement core utilities (promptPacker, compactSchemaSpec, stageInputReducer)
2. **Phase 2**: Create stage-minimal contracts for Stats, Character Build, Equipment
3. **Phase 3**: Update ManualGenerator to use packed prompts
4. **Phase 4**: Update ai.ts with size breakdown logging and minimal patch retries
5. **Phase 5**: Add payload-driven chunking for oversized stages
6. **Phase 6**: Test full NPC generation pipeline

## Success Criteria

- All stage prompts stay under 7,200 chars
- Stats stage prompt: ~4,000–5,000 chars (down from 13,000+)
- Character Build prompt: ~5,000–6,000 chars
- Equipment prompt: ~3,000–4,000 chars
- Zero silent truncations
- Validation retries succeed on first attempt (minimal patch works)
- Full NPC sheets with all required fields populated

## Files to Create/Modify

**New files**:
- `client/src/utils/promptPacker.ts`
- `client/src/config/npcStageContracts.ts`
- `client/src/utils/compactSchemaSpec.ts`
- `client/src/utils/stageInputReducer.ts`

**Modified files**:
- `client/src/pages/ManualGenerator.tsx` (use packed prompts)
- `src/server/routes/ai.ts` (size breakdown logging, minimal patch retries)
- `client/src/config/npcCreatorStages.ts` (reference contracts instead of long prompts)

## Estimated Effort

- Core utilities: 4–6 hours
- Stage contracts: 2–3 hours
- ManualGenerator integration: 3–4 hours
- Server-side changes: 2–3 hours
- Testing and refinement: 4–6 hours
- **Total**: 15–22 hours

## Risks and Mitigations

**Risk**: Compact schema specs may be too terse, model misunderstands requirements
**Mitigation**: Include type hints and constraints; validate with test runs; iterate on format

**Risk**: Stage input reducer drops fields that later stages actually need
**Mitigation**: Start conservative (include more fields); refine based on actual failures

**Risk**: Payload-driven chunking adds complexity to already complex flow
**Mitigation**: Implement as last resort; prioritize size reductions first

**Risk**: Breaking changes to existing manual copy/paste workflow
**Mitigation**: Gate new logic behind `assistMode === 'integrated'` flag if needed
