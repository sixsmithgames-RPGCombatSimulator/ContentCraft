# Schema-Driven NPC Generation

## Overview

This document describes the schema-driven architecture for NPC generation that ensures data consistency and eliminates field name mismatches.

## Architecture Principles

1. **Schema as Single Source of Truth**: `schema/npc/v1-flat.json` defines all canonical field names
2. **AI Prompt Guidance**: AI is told explicitly what field names to use during generation
3. **Intelligent Mapping**: Field variations are mapped to canonical names automatically
4. **Strict Validation**: All NPC data is validated against the schema before storage
5. **No Silent Fallbacks**: Errors are reported clearly instead of using default values

## Components

### 1. Schema Files

- **Location**: `schema/npc/v1-flat.json`
- **Purpose**: Defines the canonical NPC data structure with all field names, types, and constraints
- **Usage**: Used by validators, mappers, and prompt generators

### 2. Server-Side Schema Mapper

- **Location**: `src/server/services/npcSchemaMapper.ts`
- **Key Functions**:
  - `mapToCanonicalStructure(rawData)`: Maps field variations to canonical names
  - `mapAndValidateNpc(rawData)`: Maps and validates in one step
  - `generateSchemaPromptSection()`: Generates schema guidance for AI prompts
  - `getSchemaFieldDefinitions()`: Returns required/optional fields from schema

### 3. Client-Side Schema Mapper

- **Location**: `client/src/utils/npcSchemaMapper.ts`
- **Purpose**: Maps field variations in the browser when displaying/editing NPCs
- **Key Functions**:
  - `mapToCanonicalStructure(rawData)`: Client-side field mapping
  - `logMappingResult(result, context)`: Logs mapping warnings/errors

### 4. Server-Side Validator

- **Location**: `src/server/validation/npcValidator.ts`
- **Purpose**: Strict schema validation using AJV
- **Key Functions**:
  - `validateNpcStrict(data)`: Throws error if invalid
  - `validateNpcSafe(data)`: Returns validation result without throwing
  - `isValidNpc(data)`: Boolean check

### 5. Content Routes with Validation

- **Location**: `src/server/routes/content.ts`
- **Integration Points**:
  - `POST /api/content/generated/save`: Validates NPCs before saving
  - `PUT /api/content/generated/:contentId`: Validates NPCs before updating

## Integration Guide

### Step 1: Add Schema Guidance to AI Prompts

When generating NPCs, the AI prompt should include schema guidance. The system that builds AI prompts should import and use the schema guidance:

```typescript
import { generateSchemaPromptSection } from '../services/npcSchemaMapper.js';

// In your prompt builder (wherever AI prompts are constructed):
const systemPrompt = `
You are generating D&D 5E NPC content.

${generateSchemaPromptSection()}

... rest of your system prompt ...
`;
```

**Where to Integrate** (based on generation progress JSON analysis):

The generation system appears to use a multi-stage process (Keyword Extractor → Planner → Generator). The schema guidance should be added to:

1. **Planner Stage**: Add schema guidance to help the planner understand what fields are required
2. **Final Generator Stage**: Add schema guidance before the AI generates the actual NPC data

**Example Integration**:

```typescript
// In the stage that generates the final NPC output
const npcGeneratorPrompt = `
${generateSchemaPromptSection()}

Based on the design brief and user decisions, generate a complete NPC with the following requirements:
- User Request: ${userPrompt}
- Rule Base: ${ruleBase}
- Previous Decisions: ${JSON.stringify(decisions)}

Generate a complete NPC stat block following the schema above.
Output ONLY valid JSON conforming to the schema.
`;
```

### Step 2: Validate Before Storage

The validation is already integrated in `content.ts`:

```typescript
// POST /api/content/generated/save
if (isNpcContent) {
  const validation = mapAndValidateNpc(generated_content);

  if (!validation.success) {
    return res.status(400).json({
      success: false,
      error: 'NPC validation failed',
      details: validation
    });
  }

  // Use validated content
  validatedContent = validation.data!;
}
```

### Step 3: Map on Client Side

The client-side mapper is already integrated in `npcUtils.ts`:

```typescript
import { mapToCanonicalStructure, logMappingResult } from '../../../utils/npcSchemaMapper';

export const normalizeNpc = (record: PrimitiveRecord): NormalizedNpc => {
  // Map field variations to canonical structure
  const mappingResult = mapToCanonicalStructure(record);
  logMappingResult(mappingResult, 'normalizeNpc');

  // Use mapped data
  const sourceData = mappingResult.success ? mappingResult.mapped : record;
  // ... rest of normalization
};
```

## Field Mapping Rules

The schema mapper intelligently maps common variations:

### Ability Scores
- **Canonical**: `{str: 18, dex: 16, ...}` (lowercase)
- **Mapped From**: `STR`, `Str`, `strength`, etc.

### Special Abilities
- **Canonical**: `abilities` array
- **Mapped From**: `traits`, `special_abilities`, `features`

### Equipment
- **Canonical**: Flat string array `["Sword", "Shield"]`
- **Mapped From**: `equipment.carried`, `gear`, nested structures

### Magic Items
- **Canonical**: String array `["Ring of Protection"]`
- **Mapped From**: Object arrays `[{name: "Ring of Protection", rarity: "uncommon"}]`

### Personality
- **Canonical**: Nested object `{personality: {traits: [], ideals: [], bonds: [], flaws: []}}`
- **Mapped From**: Top-level `personality_traits`, `ideals`, `bonds`, `flaws`

### Allies/Foes
- **Canonical**: `allies`, `foes`
- **Mapped From**: `allies_and_contacts`, `allies_friends`, `enemies`

## Error Handling

### Validation Errors

When validation fails, the system returns detailed errors:

```json
{
  "success": false,
  "error": "NPC validation failed",
  "details": {
    "errors": ["Missing ability scores: str, dex, con"],
    "warnings": ["Mapped uppercase ability scores to lowercase"],
    "validationErrors": "At /ability_scores: must have required property 'str'"
  }
}
```

### Mapping Warnings

Non-critical mapping changes are logged as warnings:

```
[normalizeNpc] Field mapping warnings:
- Mapped uppercase ability scores (STR, DEX, etc.) to lowercase (str, dex, etc.)
- Mapped "traits" field to canonical "abilities" field
- Normalized nested equipment.carried to flat equipment array
```

## Testing the System

### Test 1: Valid NPC with Canonical Fields

```json
{
  "name": "Test Character",
  "description": "A test character",
  "race": "Human",
  "class_levels": [{"class": "Fighter", "level": 5}],
  "ability_scores": {"str": 18, "dex": 16, "con": 14, "int": 10, "wis": 12, "cha": 8},
  "proficiency_bonus": 3,
  "personality": {
    "traits": ["Brave"],
    "ideals": ["Honor"],
    "bonds": ["Family"],
    "flaws": ["Stubborn"]
  },
  "motivations": ["Protect the realm"],
  "rule_base": "2024RAW",
  "sources_used": ["PHB 2024"],
  "assumptions": ["Standard array used"],
  "proposals": [],
  "canon_update": "New character added to the roster"
}
```

**Expected Result**: ✅ Passes validation, stored as-is

### Test 2: NPC with Uppercase Ability Scores

```json
{
  "ability_scores": {"STR": 18, "DEX": 16, "CON": 14, "INT": 10, "WIS": 12, "CHA": 8},
  // ... other fields
}
```

**Expected Result**: ⚠️ Mapped to lowercase, warning logged, validation passes

### Test 3: NPC with "traits" Instead of "abilities"

```json
{
  "traits": [
    {"name": "Dark Vision", "description": "Can see in the dark"}
  ],
  // ... other fields
}
```

**Expected Result**: ⚠️ Mapped to `abilities`, warning logged, validation passes

### Test 4: Missing Required Fields

```json
{
  "name": "Test Character"
  // Missing: description, race, class_levels, ability_scores, etc.
}
```

**Expected Result**: ❌ Validation fails with detailed error listing missing fields

## Monitoring and Debugging

### Server Logs

The validation system logs all operations:

```
[Generated Content] Detected NPC content, applying schema validation...
[Generated Content] NPC validation warnings: Mapped uppercase ability scores
[Generated Content] NPC validation successful
```

### Client Logs

The mapper logs all transformations:

```
[normalizeNpc] Field mapping warnings:
- Mapped "canonical_name" to "name"
- Extracted magic item names from object array
```

### Validation Details

When validation fails, full details are returned to help debugging:

```json
{
  "errors": ["Mapping failed"],
  "warnings": ["Multiple field variations detected"],
  "validationErrors": "1. At /ability_scores/str: must be number\n2. At /name: must be string"
}
```

## Future Improvements

1. **Auto-Generated Types**: Generate TypeScript types from the JSON schema
2. **Schema Versioning**: Support multiple schema versions for backwards compatibility
3. **Prompt Optimization**: Refine AI prompt guidance based on common errors
4. **Error Recovery**: Suggest fixes for common validation errors
5. **Schema Evolution**: Track schema changes and provide migration paths

## Related Files

- Schema: `schema/npc/v1-flat.json`
- Server Mapper: `src/server/services/npcSchemaMapper.ts`
- Client Mapper: `client/src/utils/npcSchemaMapper.ts`
- Validator: `src/server/validation/npcValidator.ts`
- Content Routes: `src/server/routes/content.ts`
- NPC Utils: `client/src/components/generator/npcUtils.ts`
