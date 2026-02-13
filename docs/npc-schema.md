# NPC Schema Documentation

**Version:** v1
**Schema Location:** `schema/npc/v1-flat.json`
**Generated Types:** `client/src/types/npc/generated.ts`
**Validator:** `src/server/validation/npcValidator.ts`

## Overview

The NPC schema defines the complete structure for D&D 5th Edition Non-Player Characters (NPCs), including combat statistics, personality traits, narrative details, and metadata for content generation pipelines.

## Schema Philosophy

1. **Completeness**: Capture all D&D 5E NPC data - combat stats, narrative details, and provenance
2. **Validation First**: Strict validation prevents invalid data from entering the system
3. **No Silent Coercion**: Reject bad data with clear errors instead of auto-correcting
4. **Versioned Evolution**: Schema migrations preserve data through version upgrades
5. **Audit Trail**: Track sources, assumptions, and generation metadata

## Required Fields

### Core Identity
- `name` (string, min 2 chars): Canonical name of the NPC
- `description` (string, min 20 chars): Physical appearance, demeanor, and narrative summary
- `race` (string): Character race (e.g., "Human", "Elf", "Tiefling")

### Combat Statistics
- `class_levels` (array): At least one class/level pair
  - `class` (string): Class name (e.g., "Fighter", "Wizard")
  - `level` (integer, 1-20): Class level
  - `subclass` (string, optional): Subclass/archetype
  - `notes` (string, optional): Special notes

- `ability_scores` (object): The six ability scores
  - `str`, `dex`, `con`, `int`, `wis`, `cha` (integers, 1-30)

- `proficiency_bonus` (integer 2-10 OR string): Proficiency bonus

### Personality
- `personality` (object): Four personality dimensions
  - `traits` (string array): Personality traits
  - `ideals` (string array): Core ideals and values
  - `bonds` (string array): Connections and loyalties
  - `flaws` (string array): Weaknesses and flaws

- `motivations` (string array): Character goals and drives

### Generation Metadata
- `rule_base` (enum): Rules version ("2024RAW" | "2014RAW")
- `sources_used` (string array): Canon chunk IDs referenced
- `assumptions` (string array): Assumptions made during generation
- `proposals` (array): Unresolved questions requiring user input
- `canon_update` (string, min 20 chars): Summary of canon changes

## Optional Fields

### Extended Identity
- `title` (string): Title or role (e.g., "Knight Commander", "Master Thief")
- `aliases` (string array): Alternative names, nicknames
- `role` (string): Narrative role in the story
- `appearance` (string): Detailed physical description
- `background` (string): Personal history and backstory
- `size` (string): Creature size ("Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan")
- `creature_type` (string): Creature type ("Humanoid", "Undead", "Fiend", etc.)
- `subtype` (string): Creature subtype
- `alignment` (string): Alignment ("Lawful Good", "Chaotic Evil", etc.)
- `affiliation` (string): Faction or organization
- `location` (string): Current or home location
- `era` (string): Time period or era

### Combat Stats (Continued)
- `armor_class` (integer 5-30 OR array of AC objects): AC value(s)
- `hit_points` (integer OR object): HP as number or {average, formula, notes}
- `hit_dice` (string): Hit dice formula (e.g., "8d8+16")
- `speed` (object): Movement speeds by type (walk, fly, swim, climb, burrow, hover)
- `saving_throws` (array): Saving throw proficiencies with bonuses
- `skill_proficiencies` (array): Skill proficiencies with bonuses
- `senses` (string array): Special senses (darkvision, blindsight, etc.)
- `passive_perception` (integer): Passive Perception score
- `languages` (string array): Languages known
- `damage_resistances` (string array): Damage types resisted
- `damage_immunities` (string array): Damage types immune to
- `damage_vulnerabilities` (string array): Damage types vulnerable to
- `condition_immunities` (string array): Conditions immune to

### Abilities and Actions
- `abilities` (array): Special abilities and traits
- `additional_traits` (array): Additional traits not listed elsewhere
- `actions` (array): Combat actions
- `bonus_actions` (array): Bonus actions
- `reactions` (array): Reactions
- `legendary_actions` (object): Legendary actions with summary and options
- `mythic_actions` (object): Mythic actions with summary and options
- `lair_actions` (string array): Lair actions
- `regional_effects` (string array): Regional effects around lair

Each ability/action object contains:
- `name` (string, required): Ability name
- `description` (string, required): Full description
- `uses` (string, optional): Usage limitations (e.g., "3/day", "Recharge 5-6")
- `recharge` (string, optional): Recharge condition
- `notes` (string, optional): Additional GM notes

### Narrative Details
- `hooks` (string array): Story hooks and adventure seeds
- `tactics` (string): Combat tactics and strategy
- `equipment` (string array): Equipment carried
- `relationships` (array): Relationships with other entities
  - `entity` (string): Related entity name
  - `relationship` (string): Nature of relationship
  - `notes` (string, optional): Additional context

### Spellcasting
- `spellcasting` (object): Spellcasting details
  - `type` (string): Spellcasting type (e.g., "Innate", "Prepared")
  - `ability` (string): Spellcasting ability
  - `save_dc` (integer): Spell save DC
  - `attack_bonus` (integer): Spell attack bonus
  - `notes` (string): Additional spellcasting notes
  - `spell_slots` (object): Spell slots by level
  - `prepared_spells` (object): Prepared spells by level
  - `innate_spells` (object): Innate spells by frequency
  - `known_spells` (string array): Known spells

### Metadata
- `challenge_rating` (string): CR for encounters
- `experience_points` (integer): XP awarded
- `notes` (string array): Additional notes and GM guidance
- `sources` (string array): Source books and references
- `stat_block` (object): Raw stat block data from generator

## Field Semantics

### Ability Scores
Ability scores follow standard D&D 5E rules:
- **Range**: 1-30 (3-18 typical for mortals, 19+ for exceptional beings)
- **Modifier Calculation**: (score - 10) / 2, rounded down
- **Usage**: Affects attack rolls, saving throws, skill checks, spell DCs

### Proficiency Bonus
Based on character level or Challenge Rating:
- Levels 1-4: +2
- Levels 5-8: +3
- Levels 9-12: +4
- Levels 13-16: +5
- Levels 17-20: +6
- CR scaling: varies by monster type

Can be string for special cases (e.g., "+2 (double for Intimidation)")

### Armor Class
Two formats supported:
1. **Simple**: Integer value (e.g., 15)
2. **Detailed**: Array of AC objects for multiple armor types or conditions
   ```json
   [
     { "value": 15, "type": "natural armor" },
     { "value": 18, "type": "with shield", "notes": "AC 16 without shield" }
   ]
   ```

### Hit Points
Two formats supported:
1. **Simple**: Integer value (e.g., 84)
2. **Detailed**: Object with average/formula/notes
   ```json
   {
     "average": 84,
     "formula": "8d10+32",
     "notes": "doubled when bloodied"
   }
   ```

### Speed
Object keyed by movement type:
```json
{
  "walk": "30 ft.",
  "fly": "60 ft. (hover)",
  "swim": "30 ft."
}
```

### Proposals
Proposals represent unresolved questions during generation:
```json
{
  "question": "Should this NPC have the Alert feat?",
  "options": ["Yes, grant Alert feat", "No, use standard perception", "Grant Observant instead"],
  "rule_impact": "Alert would grant +5 initiative and prevent surprise. Observant would grant +5 passive Perception.",
  "recommendation": "Alert fits the character's military background better"
}
```

## UI Responsibilities

### Display Components
- `NpcContentView.tsx`: Read-only display of all NPC fields
- `NpcContentForm.tsx`: Editable form with validation
- Section components for organizing related fields

### Validation Feedback
- Display inline validation errors from AJV
- Show missing required fields clearly
- Indicate optional fields
- Provide tooltips with field semantics

### Editing Workflow
1. Load NPC data
2. Validate with `validateNpcStrict()`
3. If invalid, show errors and reject edit
4. If valid, normalize with `normalizeNpc()`
5. User edits in form
6. On save, convert with `normalizedNpcToRecord()`
7. Validate again before persisting
8. Update `schemaVersion` and `updated_at`

## Validation Rules

### String Constraints
- `name`: min 2 characters
- `description`: min 20 characters (should be descriptive)
- `canon_update`: min 20 characters (should be meaningful)
- `rule_base`: must be "2024RAW" or "2014RAW"

### Numeric Constraints
- Ability scores: 1-30
- Proficiency bonus: 2-10
- Armor Class: 5-30
- Hit Points: minimum 1
- Level: 1-20 per class

### Array Constraints
- `proposals.options`: 2-5 options (enough choice, not overwhelming)
- All arrays can be empty unless marked required

### Object Constraints
- `personality` requires all four dimensions (traits, ideals, bonds, flaws)
- `ability_scores` requires all six scores
- `class_levels` requires at least one entry

## Migration Strategy

When schema changes:

1. **Create Migration Script**: `scripts/migrations/npc/vN_to_vN+1.ts`
2. **Document Changes**: List added, removed, renamed fields
3. **Provide Defaults**: Supply reasonable defaults for new required fields
4. **Test Thoroughly**: Use real production data for testing
5. **Update Version**: Bump `schemaVersion` field
6. **Maintain Compatibility**: Support reading old versions during transition

## Common Patterns

### Creating a New NPC
```typescript
import { validateNpcStrict } from '../server/validation/npcValidator';

const rawData = {
  name: "Elara Moonshadow",
  description: "A graceful elf with silver hair and piercing green eyes",
  race: "Elf",
  class_levels: [{ class: "Ranger", level: 5, subclass: "Hunter" }],
  ability_scores: { str: 12, dex: 18, con: 14, int: 13, wis: 16, cha: 10 },
  proficiency_bonus: 3,
  personality: {
    traits: ["Cautious", "Observant"],
    ideals: ["Nature must be protected"],
    bonds: ["Sworn to defend the forest"],
    flaws: ["Distrusts cities and crowds"]
  },
  motivations: ["Protect the wilderness", "Track the Shadow Cult"],
  rule_base: "2024RAW",
  sources_used: [],
  assumptions: [],
  proposals: [],
  canon_update: "New ranger NPC for forest encounters"
};

// Validate before any processing
validateNpcStrict(rawData); // Throws if invalid

// Now safe to use
const npc = normalizeNpc(rawData);
```

### Updating an Existing NPC
```typescript
// Load from database
const existing = await db.npcs.findOne({ _id: npcId });

// Validate current data
validateNpcStrict(existing);

// Normalize for editing
const normalized = normalizeNpc(existing);

// User edits...
normalized.hit_points = { average: 45, formula: "5d10+10" };
normalized.abilities.push({
  name: "Hunter's Mark",
  description: "Cast Hunter's Mark as a bonus action 3/day",
  uses: "3/day",
  notes: "Doesn't require concentration"
});

// Convert back to raw format
const updated = normalizedNpcToRecord(normalized, existing);

// Validate before saving
validateNpcStrict(updated);

// Save to database
await db.npcs.updateOne({ _id: npcId }, { $set: updated });
```

## Testing Requirements

### Unit Tests
- Schema validation with valid/invalid payloads
- Mapper round-trip: `normalizedNpcToRecord(normalizeNpc(raw))` === `raw`
- Field adapters for complex structures
- Default value handling

### Fixtures
- Create real-world NPC examples (Goran Varus, Elara Moonshadow)
- Test edge cases (legendary NPCs, commoners, monsters)
- Include NPCs from different eras and regions

### Integration Tests
- Full workflow: ingest → validate → normalize → edit → validate → save
- Schema upgrade migrations
- Cross-schema references (NPC → Location, NPC → Item)

## Troubleshooting

### "Validation failed: missing required property"
**Cause**: Required field is missing or undefined
**Fix**: Ensure all required fields are present before validation
**Prevention**: Use TypeScript types to catch at compile time

### "Type mismatch: expected integer, got string"
**Cause**: Field has wrong type (common with form inputs)
**Fix**: Convert types explicitly (parseInt, Number(), etc.)
**Prevention**: Use typed form libraries that handle conversion

### "Array does not meet minItems constraint"
**Cause**: Required array is empty or too short
**Fix**: Populate array with at least required number of items
**Example**: `proposals.options` needs 2-5 items

### "Pattern does not match"
**Cause**: String field doesn't match regex pattern
**Fix**: Check pattern in schema and format string correctly
**Example**: `rule_base` must be exactly "2024RAW" or "2014RAW"

## Related Documentation
- [NPC Architecture Specification](../NPC_architecture.md)
- [Encounter Schema](./encounter-schema.md)
- [Migration Guide](../scripts/migrations/npc/README.md)
- [Type Generation](../scripts/generateTypes.ts)

## Changelog

### v1 (2025-01-16)
- Initial schema version
- Complete D&D 5E NPC coverage
- Validation layer implemented
- Type generation configured
- Migration framework established
