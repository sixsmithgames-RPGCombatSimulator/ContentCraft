# D&D Generation Workflow Improvements

> Created: 2025-02-13
> Status: In Progress

## Overview

This document tracks all identified improvements to the D&D content generation workflows.
The NPC pipeline is the most mature; other content types need similar treatment.

---

## 1. Encounter Creator Pipeline (HIGH PRIORITY)

**Current state:** Falls through to generic one-shot Creator stage. Schema `schema/encounter/v1.json` exists (269 lines) but is never referenced by any specialized stage.

### Tasks

- [ ] **1a.** Create `schema/encounter/v1.1-client.json` — modernize encounter schema with proper field definitions, matching NPC schema patterns (additionalProperties, detailed descriptions)
- [ ] **1b.** Create `schema/encounter/v1.1-server.json` — permissive server-side encounter validation schema
- [ ] **1c.** Create `client/src/utils/encounterSchemaExtractor.ts` — schema extraction functions for each encounter sub-stage (getEncounterConceptSchema, getEnemyCompositionSchema, getTerrainSchema, getTacticsSchema, getRewardsSchema)
- [ ] **1d.** Create `client/src/config/encounterCreatorStages.ts` — 5 specialized encounter stages:
  - Stage 1: **Concept & Setup** — title, description, objectives, difficulty_tier, party level, narrative context
  - Stage 2: **Enemy Composition** — monsters (with CR budget), NPC combatants, count, positioning, initiative
  - Stage 3: **Terrain & Environment** — terrain features, hazards, cover, lighting, elevation, weather, traps
  - Stage 4: **Tactics & Event Clock** — opening moves, phase triggers, fallback plans, escalation, expected_duration_rounds
  - Stage 5: **Rewards & Aftermath** — treasure, XP, story hooks, consequences, fact_check_report
- [ ] **1e.** Create `client/src/config/encounterSectionChunks.ts` — section-based chunking for encounter generation (mirrors npcSectionChunks.ts pattern)
- [ ] **1f.** Create `client/src/utils/encounterStageMerger.ts` — merge logic for encounter sub-stage outputs
- [ ] **1g.** Update `client/src/pages/ManualGenerator.tsx` — add `config.type === 'encounter'` branch in `getStages()` to use new encounter stages
- [ ] **1h.** Update `src/server/services/generatedContentMapper.ts` — add `normalizeEncounter()` improvements and `formatEncounterContent()` using new schema fields
- [ ] **1i.** Update `src/server/validation/` — add encounter validation using new schema

---

## 2. Magic Item Creator Pipeline (HIGH PRIORITY)

**Current state:** Falls through to generic one-shot Creator. No dedicated schema exists.

### Tasks

- [ ] **2a.** Create `schema/item/v1.1-client.json` — comprehensive magic item schema covering:
  - Core: name, type (weapon/armor/wondrous/potion/scroll/ring/rod/staff/wand), rarity, attunement
  - Properties: effects, charges, DCs, activation, bonus/penalty, scaling, recharge
  - Flavor: description, appearance, history, creator, previous owners, lore, quirks
  - Curse/sentience: curse effects, sentience properties, communication, alignment, purpose
- [ ] **2b.** Create `schema/item/v1.1-server.json` — permissive server-side item validation schema
- [ ] **2c.** Create `client/src/utils/itemSchemaExtractor.ts` — schema extraction for item sub-stages
- [ ] **2d.** Create `client/src/config/itemCreatorStages.ts` — 3 specialized item stages:
  - Stage 1: **Concept & Rarity** — name, type, rarity, attunement, basic description, source material
  - Stage 2: **Properties & Mechanics** — effects, charges, DCs, activation, scaling, recharge, combat/utility use
  - Stage 3: **History & Flavor** — creator, previous owners, lore, curse/sentience, quirks, campaign hooks
- [ ] **2e.** Create `client/src/config/itemSectionChunks.ts` — section-based chunking for item generation
- [ ] **2f.** Create `client/src/utils/itemStageMerger.ts` — merge logic for item sub-stage outputs
- [ ] **2g.** Update `client/src/pages/ManualGenerator.tsx` — add `config.type === 'item'` branch in `getStages()`
- [ ] **2h.** Update `src/server/services/generatedContentMapper.ts` — enhance `normalizeItem()` and `formatItemContent()`

---

## 3. Monster Creator Pipeline Enhancements (MEDIUM PRIORITY)

**Current state:** Has 5 specialized stages in `monsterCreatorStages.ts` but lacks schema, extractors, routing, and merger.

### Tasks

- [ ] **3a.** Create `schema/monster/v1.1-client.json` — comprehensive monster schema (mirrors NPC schema patterns)
- [ ] **3b.** Create `schema/monster/v1.1-server.json` — permissive server-side monster validation
- [ ] **3c.** Create `client/src/utils/monsterSchemaExtractor.ts` — schema extraction for monster sub-stages
- [ ] **3d.** Update `client/src/config/monsterCreatorStages.ts` — integrate schema extractors into stage prompts
- [ ] **3e.** Add **Spellcasting** stage (Stage 3b) for innate/class spellcasting monsters
- [ ] **3f.** Create `client/src/config/monsterStageRouter.ts` — smart routing (skip Legendary for low-CR, skip Spellcasting for non-casters)
- [ ] **3g.** Create `client/src/utils/monsterStageMerger.ts` — merge logic for monster sub-stage outputs
- [ ] **3h.** Update `src/server/services/generatedContentMapper.ts` — add dedicated `normalizeMonster()` and `formatMonsterContent()`

---

## 4. Story Arc Creator Pipeline (MEDIUM PRIORITY)

**Current state:** Falls through to generic one-shot Creator. No dedicated schema.

### Tasks

- [ ] **4a.** Create `schema/story_arc/v1.1-client.json` — story arc schema covering:
  - Core: title, synopsis, themes, tone, stakes, setting
  - Structure: acts, major beats, turning points, climax, resolution
  - Characters: key NPCs, factions, motivations, goals, relationships
  - Encounters: key combat/social/exploration scenes, decision points, consequences
- [ ] **4b.** Create `schema/story_arc/v1.1-server.json` — permissive server-side validation
- [ ] **4c.** Create `client/src/config/storyArcCreatorStages.ts` — 4 specialized stages:
  - Stage 1: **Premise & Theme** — synopsis, central conflict, tone, stakes, setting context
  - Stage 2: **Act Structure** — acts, major beats, turning points, climax, resolution
  - Stage 3: **Characters & Factions** — key NPCs, motivations, goals, barriers, alliances
  - Stage 4: **Key Encounters & Decision Points** — scenes, branching, consequences, rewards
- [ ] **4d.** Update `client/src/pages/ManualGenerator.tsx` — add `config.type === 'story_arc'` branch in `getStages()`
- [ ] **4e.** Update `src/server/services/generatedContentMapper.ts` — enhance `normalizeStoryArc()` and `formatStoryArcContent()`

---

## 5. Scene/Adventure Workflows (LOW PRIORITY — Future)

**Current state:** Both fall through to generic Creator. These are complex composite types.

- [ ] **5a.** Scene: Decide whether scenes should be encounter-like (focused) or story-arc-like (narrative)
- [ ] **5b.** Adventure: Composite type that ties together story arcs, encounters, NPCs, locations — may need a multi-deliverable orchestrator rather than a single pipeline

---

## Architecture Patterns (Reference)

All new pipelines should follow the NPC pattern:

1. **Schema** — `schema/{type}/v1.1-client.json` + `v1.1-server.json`
2. **Schema Extractors** — `client/src/utils/{type}SchemaExtractor.ts` with per-stage extraction functions
3. **Creator Stages** — `client/src/config/{type}CreatorStages.ts` with focused sub-stages
4. **Section Chunks** — `client/src/config/{type}SectionChunks.ts` for section-based chunking (optional)
5. **Stage Router** — `client/src/config/{type}StageRouter.ts` for smart conditional routing (optional)
6. **Stage Merger** — `client/src/utils/{type}StageMerger.ts` for multi-stage output merging
7. **Server Normalization** — `src/server/services/generatedContentMapper.ts` normalize + format functions
8. **Server Validation** — `src/server/validation/{type}Validator.ts` using server schema
9. **ManualGenerator Integration** — `getStages()` branch + stage key list in `handleAcceptWithIssues`

---

## Coding Standards

- Follow existing patterns in NPC pipeline files
- Use TypeScript strict mode compatible types
- Include JSDoc comments on exported functions
- Use `ensureString`, `ensureArray`, `ensureObject` helpers from generatedContentMapper
- Schema extractors return `SchemaObject` type
- Stage prompts must include `⚠️ CRITICAL OUTPUT REQUIREMENT` JSON-only instruction
- All stage `buildUserPrompt` must include `previous_decisions` and `canon_reference` handling
- Section chunks must define `outputFields` for merger field provenance
