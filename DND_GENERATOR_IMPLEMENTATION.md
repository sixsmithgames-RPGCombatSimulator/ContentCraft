# D&D Content Generator - Implementation Guide

## Overview

This document tracks the implementation of a multi-stage AI pipeline for generating D&D content with strict canon and rules compliance.

## Architecture Summary

### Core Components

1. **MongoDB Database** - Stores canon entities, chunks, runs, and artifacts
2. **Multi-Stage Pipeline** - 10 sequential stages with validation gates
3. **OpenAI Integration** - LLM calls for content generation
4. **Validation System** - AJV schemas + custom guards

### Data Flow

```
User Prompt → Planner → Retriever → WorldCoherence(pre) → Creator →
RulesVerifier → PhysicsChecker → BalanceLints → WorldCoherence(post) →
Stylist → Finalizer → Approved Content
```

## Implementation Status

### ✅ Completed

#### Configuration & Setup
- [x] MongoDB connection (`src/server/config/mongo.ts`)
- [x] OpenAI configuration (`src/server/config/openai.ts`)
- [x] Environment config (`src/server/config/env.ts`)

#### Data Models
- [x] Authority model (`src/server/models/Authority.ts`)
- [x] CanonEntity model (`src/server/models/CanonEntity.ts`)
- [x] CanonChunk model (`src/server/models/CanonChunk.ts`)
- [x] Run model (`src/server/models/Run.ts`)
- [x] Artifact model (`src/server/models/Artifact.ts`)

#### JSON Schemas (AJV Validation)
- [x] Base schema (`src/server/schemas/base.schema.json`)
- [x] Encounter schema (`src/server/schemas/encounter.schema.json`)
- [x] NPC schema (`src/server/schemas/npc.schema.json`)
- [x] Item schema (`src/server/schemas/item.schema.json`)
- [x] Scene schema (`src/server/schemas/scene.schema.json`)
- [x] Adventure schema (`src/server/schemas/adventure.schema.json`)

#### Utilities
- [x] Logger (`src/server/utils/logger.ts`)
- [x] Embeddings (`src/server/utils/embeddings.ts`)
- [x] Chunking (`src/server/utils/chunk.ts`)
- [x] Citations (`src/server/utils/citations.ts`)
- [x] Diff tool (`src/server/utils/diff.ts`)

#### Validators
- [x] AJV validator (`src/server/orchestration/validators/AJV.ts`)
- [x] Canon guard (`src/server/orchestration/validators/CanonGuard.ts`)

#### Orchestration
- [x] Main Orchestrator (`src/server/orchestration/Orchestrator.ts`)

### 🚧 In Progress / TODO

#### Validators (Remaining)
- [ ] Rules guard (`src/server/orchestration/validators/RulesGuard.ts`)
- [ ] Physics guard (`src/server/orchestration/validators/PhysicsGuard.ts`)
- [ ] Balance guard (`src/server/orchestration/validators/BalanceGuard.ts`)
- [ ] Coherence guard (`src/server/orchestration/validators/CoherenceGuard.ts`)

#### Pipeline Stages
- [ ] Planner (`src/server/orchestration/stages/Planner.ts`)
- [ ] Retriever (`src/server/orchestration/stages/Retriever.ts`)
- [ ] WorldCoherence (`src/server/orchestration/stages/WorldCoherence.ts`)
- [ ] Creator (`src/server/orchestration/stages/Creator.ts`)
- [ ] RulesVerifier (`src/server/orchestration/stages/RulesVerifier.ts`)
- [ ] PhysicsMagic (`src/server/orchestration/stages/PhysicsMagic.ts`)
- [ ] BalanceLints (`src/server/orchestration/stages/BalanceLints.ts`)
- [ ] Stylist (`src/server/orchestration/stages/Stylist.ts`)
- [ ] Finalizer (`src/server/orchestration/stages/Finalizer.ts`)

#### API Routes
- [ ] Runs routes (`src/server/routes/runs.ts`)
- [ ] Canon routes (`src/server/routes/canon.ts`)
- [ ] Config routes (`src/server/routes/config.ts`)
- [ ] Update main server file (`src/server/index.ts`)

#### Frontend Components
- [ ] RunnerPanel (`client/src/components/generator/RunnerPanel.tsx`)
- [ ] FactPackView (`client/src/components/generator/FactPackView.tsx`)
- [ ] ValidatorResults (`client/src/components/generator/ValidatorResults.tsx`)
- [ ] DraftReview (`client/src/components/generator/DraftReview.tsx`)
- [ ] CanonClerk (`client/src/components/generator/CanonClerk.tsx`)
- [ ] RunHistory (`client/src/components/runs/RunHistory.tsx`)

#### Seed Data
- [ ] Authority bootstrap script
- [ ] Sample canon entities
- [ ] Sample chunks
- [ ] Embedding generation script

## Database Collections

### `authority` (1 document)
```typescript
{
  _id: "authority",
  source_order: ["campaign", "homebrew", "raw_2024", "raw_2014"],
  rule_toggles: { ... },
  invention_policy_default: "cosmetic",
  forbidden_inventions: [...]
}
```

### `canon_entities`
```typescript
{
  _id: "npc.rhylar_frinac",
  type: "npc",
  canonical_name: "Rhylar Frinac",
  aliases: [...],
  era: "post-sundering",
  region: "sword-coast",
  relationships: [...],
  claims: [{ text: "...", source: "PHB p.123" }],
  version: "1.0.0"
}
```

### `canon_chunks`
```typescript
{
  _id: "npc.rhylar_frinac#c1",
  entity_id: "npc.rhylar_frinac",
  text: "Rhylar is a human wizard...",
  metadata: { region: "sword-coast", era: "post-sundering" },
  embedding: [0.123, ...]
}
```

### `runs`
```typescript
{
  _id: "abc123",
  type: "encounter",
  prompt: "Create a boss fight...",
  flags: { rule_base: "2024RAW", ... },
  status: "running",
  stages: {
    planner: { status: "ok", artifact_id: "...", notes: [] },
    // ...
  },
  current_stage: "creator"
}
```

### `artifacts`
```typescript
{
  _id: "artifact123",
  run_id: "abc123",
  stage: "creator",
  data: { /* draft JSON */ },
  created_at: "2025-01-15T..."
}
```

## API Endpoints

### Runs
- `POST /api/runs` - Create new run
- `GET /api/runs/:id` - Get run status
- `GET /api/runs/:id/artifacts/:stage` - Get stage artifact
- `POST /api/runs/:id/advance` - Manually advance stage
- `GET /api/runs` - List all runs (with filters)

### Canon
- `GET /api/canon/entities` - Search entities
- `GET /api/canon/entities/:id` - Get entity
- `POST /api/canon/entities` - Create entity
- `PUT /api/canon/entities/:id` - Update entity
- `POST /api/canon/apply-delta` - Apply approved changes
- `GET /api/canon/search` - Full-text search

### Config
- `GET /api/config/authority` - Get authority doc
- `PUT /api/config/authority` - Update authority
- `GET /api/config/schemas` - List available schemas

## Stage Details

### 1. Planner
**Input**: User prompt + run flags
**Output**: Brief with retrieval hints, story clock, deliverable
**LLM**: Yes (chat or assistant)

### 2. Retriever
**Input**: Brief
**Output**: FactPack (10 chunks max, entity IDs, gaps)
**Logic**: Keyword + vector search on canon_chunks

### 3. World Coherence (Pre)
**Input**: FactPack
**Output**: Validation result
**Logic**: Check entity resolution, era/region conflicts

### 4. Creator
**Input**: Brief + FactPack
**Output**: Draft JSON (must match schema)
**LLM**: Yes (strict JSON mode)
**Critical**: All claims must cite chunk_ids, unknowns → proposals

### 5. Rules Verifier
**Input**: Draft
**Output**: Validation result
**Logic**: AC/HP math, proficiency, action economy, spell legality

### 6. Physics vs Magic
**Input**: Draft
**Output**: Validation result
**Logic**: Physics constraints unless magic explicitly overrides

### 7. Balance & Logic Lints
**Input**: Draft
**Output**: Validation result with flags
**Logic**: DPR ceilings, save DC sanity, treasure budgets

### 8. World Coherence (Post)
**Input**: Draft
**Output**: Validation result
**Logic**: Re-check consistency, no accidental retcons

### 9. Stylist
**Input**: Draft
**Output**: Styled draft (same structure, better prose)
**LLM**: Yes
**Note**: No new facts, only formatting/tone

### 10. Finalizer
**Input**: Styled draft
**Output**: Continuity ledger + canon delta
**Logic**: Summarize what changed, don't auto-apply

## Environment Variables

```bash
# MongoDB
MONGODB_URI=mongodb://127.0.0.1:27017/dndgen

# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o
OPENAI_ASSISTANT_PLANNER=asst_xxx  # optional
OPENAI_ASSISTANT_CREATOR=asst_xxx  # optional
OPENAI_ASSISTANT_STYLIST=asst_xxx  # optional

# Server
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

## Next Steps

### Immediate (Critical Path)
1. Implement remaining validators (Rules, Physics, Balance, Coherence)
2. Implement all 10 pipeline stages
3. Create API routes for runs and canon
4. Update server index to use MongoDB + new routes

### Phase 2
1. Create frontend components
2. Bootstrap seed data
3. Test end-to-end pipeline

### Phase 3
1. Embeddings generation script
2. Admin UI for canon management
3. Performance optimization
4. Error recovery & retry logic

## Testing Strategy

1. **Unit Tests**: Each validator and stage in isolation
2. **Integration Tests**: Full pipeline with mock data
3. **Acceptance Tests**:
   - "Longbow of Detect Thoughts" → proposals, not inventory
   - "3 miles in 10 min on foot" → physics fail
   - "Ring adds necrotic to bites" → rules fail

## Notes

- All stage implementations must be idempotent
- Never auto-apply canon changes - require Canon Clerk approval
- Temperature should be low (0.2) for Creator stage
- Proposals must include rule_impact and 2-3 options
- Embeddings are optional but strongly recommended for retrieval

## Files Created

### Configuration (3 files)
- `src/server/config/mongo.ts`
- `src/server/config/openai.ts`
- `src/server/config/env.ts`

### Models (5 files)
- `src/server/models/Authority.ts`
- `src/server/models/CanonEntity.ts`
- `src/server/models/CanonChunk.ts`
- `src/server/models/Run.ts`
- `src/server/models/Artifact.ts`

### Schemas (6 files)
- `src/server/schemas/base.schema.json`
- `src/server/schemas/encounter.schema.json`
- `src/server/schemas/npc.schema.json`
- `src/server/schemas/item.schema.json`
- `src/server/schemas/scene.schema.json`
- `src/server/schemas/adventure.schema.json`

### Utils (5 files)
- `src/server/utils/logger.ts`
- `src/server/utils/embeddings.ts`
- `src/server/utils/chunk.ts`
- `src/server/utils/citations.ts`
- `src/server/utils/diff.ts`

### Validators (2 files)
- `src/server/orchestration/validators/AJV.ts`
- `src/server/orchestration/validators/CanonGuard.ts`

### Orchestration (1 file)
- `src/server/orchestration/Orchestrator.ts`

**Total: 22 core files created**
