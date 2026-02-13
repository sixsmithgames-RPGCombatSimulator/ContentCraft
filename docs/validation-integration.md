# Validation Integration Guide

This guide shows how to integrate the strict NPC validation layer into existing code.

## Quick Start

```typescript
import { validateNpcStrict, validateNpcSafe, NpcValidationError } from '../src/server/validation/npcValidator';
```

## Integration Patterns

### Pattern 1: Validate and Throw (Server-Side)

Use when you want to reject invalid data immediately:

```typescript
import { validateNpcStrict } from '../server/validation/npcValidator';

async function saveNpc(rawData: unknown) {
  // Validate first - throws if invalid
  validateNpcStrict(rawData);

  // Now safe to proceed
  const normalized = normalizeNpc(rawData);
  await db.npcs.insert(normalized);
}
```

### Pattern 2: Validate and Display Errors (Client-Side)

Use in UI components to show validation feedback:

```typescript
import { validateNpcSafe } from '../../../src/server/validation/npcValidator';

function NpcEditor() {
  const [validationErrors, setValidationErrors] = useState<string | null>(null);

  const handleSave = () => {
    const result = validateNpcSafe(npcData);

    if (!result.valid) {
      setValidationErrors(result.details);
      return; // Don't save
    }

    // Proceed with save
    saveToDatabase(npcData);
  };

  return (
    <>
      {validationErrors && (
        <div className="error-box">
          <pre>{validationErrors}</pre>
        </div>
      )}
      <button onClick={handleSave}>Save</button>
    </>
  );
}
```

### Pattern 3: Validate AI Responses

Use when processing AI-generated content:

```typescript
import { validateNpcSafe } from '../../../src/server/validation/npcValidator';

async function handleAIResponse(aiJsonString: string) {
  let parsed: unknown;

  try {
    parsed = JSON.parse(aiJsonString);
  } catch (e) {
    throw new Error('Invalid JSON from AI');
  }

  // Validate structure
  const validation = validateNpcSafe(parsed);

  if (!validation.valid) {
    console.error('AI generated invalid NPC:', validation.details);

    // Show user what's wrong and ask AI to fix
    const fixPrompt = `The NPC data has validation errors:\n${validation.details}\n\nPlease regenerate with these issues fixed.`;

    return { needsRetry: true, prompt: fixPrompt };
  }

  // Validation passed
  return { needsRetry: false, data: parsed };
}
```

## Specific File Updates

### 1. ManualGenerator.tsx

**Location:** `client/src/pages/ManualGenerator.tsx`
**Function:** `handleSubmit()` around line 546

**Before:**
```typescript
const handleSubmit = async (aiResponse: string) => {
  setError(null);

  try {
    const parsed = JSON.parse(aiResponse);
    const currentStage = STAGES[currentStageIndex];

    // ... rest of logic
  } catch (err) {
    setError(`Failed to parse: ${err.message}`);
  }
};
```

**After:**
```typescript
import { validateNpcSafe } from '../../../src/server/validation/npcValidator';

const handleSubmit = async (aiResponse: string) => {
  setError(null);

  try {
    const parsed = JSON.parse(aiResponse);
    const currentStage = STAGES[currentStageIndex];

    // Validate NPC data after Creator or Stylist stages
    if (currentStage.name === 'Creator' || currentStage.name === 'Stylist') {
      const deliverable = inferDeliverableType(parsed, config!.type);

      if (deliverable === 'npc') {
        const validation = validateNpcSafe(parsed);

        if (!validation.valid) {
          setError(`NPC validation failed:\n\n${validation.details}\n\nPlease ask the AI to fix these issues.`);
          return; // Don't proceed
        }
      }
    }

    // ... rest of logic
  } catch (err) {
    setError(`Failed to parse: ${err.message}`);
  }
};
```

### 2. SaveContentModal.tsx

**Location:** `client/src/components/generator/SaveContentModal.tsx`
**Function:** `extractEntities()` around line 73

**Before:**
```typescript
const extractEntities = () => {
  const entities: Array<...> = [];

  if (contentType.includes('npc')) {
    entities.push({
      id: 'main_npc',
      name: generatedContent.canonical_name || 'Unnamed NPC',
      // ... rest
    });
  }

  return entities;
};
```

**After:**
```typescript
import { validateNpcSafe } from '../../../src/server/validation/npcValidator';

const extractEntities = () => {
  const entities: Array<...> = [];

  if (contentType.includes('npc')) {
    // Validate before extraction
    const validation = validateNpcSafe(generatedContent);

    if (!validation.valid) {
      console.warn('NPC validation warnings during extraction:', validation.details);
      // Still proceed but log warnings
    }

    entities.push({
      id: 'main_npc',
      name: generatedContent.canonical_name || 'Unnamed NPC',
      // ... rest
    });
  }

  return entities;
};
```

### 3. GeneratedContentModal.tsx

**Location:** `client/src/components/generator/GeneratedContentModal.tsx`
**Function:** `useEffect()` around line 62

**Before:**
```typescript
useEffect(() => {
  if (!content) return;
  setEditedTitle(content.title || '');
  setEditedContent(JSON.stringify(content.generated_content, null, 2));

  if (isNpcContent(content.metadata?.deliverable, content.content_type)) {
    const npcRecord = structuredData ? (structuredData as Record<string, unknown>) : content.generated_content;
    setEditingNpc(normalizeNpc(npcRecord));
  }
}, [content, structuredData]);
```

**After:**
```typescript
import { validateNpcSafe } from '../../../src/server/validation/npcValidator';

useEffect(() => {
  if (!content) return;
  setEditedTitle(content.title || '');
  setEditedContent(JSON.stringify(content.generated_content, null, 2));

  if (isNpcContent(content.metadata?.deliverable, content.content_type)) {
    const npcRecord = structuredData ? (structuredData as Record<string, unknown>) : content.generated_content;

    // Validate before normalization
    const validation = validateNpcSafe(npcRecord);

    if (!validation.valid) {
      setError(`This NPC has validation issues:\n${validation.details}`);
      // Still try to display, but show warning
    }

    try {
      setEditingNpc(normalizeNpc(npcRecord));
    } catch (normError) {
      setError(`Failed to load NPC: ${normError.message}`);
    }
  }
}, [content, structuredData]);
```

### 4. NpcContentForm.tsx (Before Save)

**Location:** `client/src/components/generator/NpcContentForm.tsx`

**Add validation before onChange callback:**

```typescript
import { validateNpcSafe, normalizedNpcToRecord } from './npcUtils';
import { validateNpcSafe as validateStrict } from '../../../src/server/validation/npcValidator';

const handleSave = () => {
  // Convert normalized NPC back to raw format
  const rawNpc = normalizedNpcToRecord(value);

  // Validate before saving
  const validation = validateStrict(rawNpc);

  if (!validation.valid) {
    alert(`Cannot save - validation failed:\n\n${validation.details}`);
    return;
  }

  // Proceed with onChange callback
  onChange(value);
};
```

## Error Display Components

### Validation Error Alert

```typescript
interface ValidationErrorProps {
  details: string;
  onDismiss: () => void;
}

function ValidationError({ details, onDismiss }: ValidationErrorProps) {
  return (
    <div className="p-4 bg-red-50 border-2 border-red-300 rounded-lg">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-red-800 mb-2">
            Validation Failed
          </h3>
          <pre className="text-sm text-red-700 whitespace-pre-wrap font-mono bg-red-100 p-3 rounded">
            {details}
          </pre>
        </div>
        <button
          onClick={onDismiss}
          className="ml-4 text-red-600 hover:text-red-800"
        >
          ✕
        </button>
      </div>
      <p className="text-sm text-red-600 mt-3">
        Please fix these issues before proceeding.
      </p>
    </div>
  );
}
```

### Inline Field Validation

```typescript
function ValidatedTextField({
  value,
  onChange,
  fieldPath,
  validationErrors
}: ValidatedTextFieldProps) {
  const fieldError = validationErrors?.find(err =>
    err.instancePath === fieldPath
  );

  return (
    <div>
      <input
        value={value}
        onChange={onChange}
        className={fieldError ? 'border-red-500' : 'border-gray-300'}
      />
      {fieldError && (
        <p className="text-sm text-red-600 mt-1">
          {fieldError.message}
        </p>
      )}
    </div>
  );
}
```

## Testing Your Integration

### 1. Test with Valid Data

```typescript
const validNpc = {
  name: "Test NPC",
  description: "A test character for validation",
  race: "Human",
  class_levels: [{ class: "Fighter", level: 5 }],
  ability_scores: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 11 },
  proficiency_bonus: 3,
  personality: {
    traits: ["Brave"],
    ideals: ["Honor"],
    bonds: ["Family"],
    flaws: ["Stubborn"]
  },
  motivations: ["Protect the innocent"],
  rule_base: "2024RAW",
  sources_used: [],
  assumptions: [],
  proposals: [],
  canon_update: "Test NPC for validation"
};

// Should pass
validateNpcStrict(validNpc); // No error
```

### 2. Test with Invalid Data

```typescript
const invalidNpc = {
  name: "X", // Too short (min 2)
  description: "Short", // Too short (min 20)
  // Missing required fields: race, class_levels, ability_scores, etc.
};

// Should fail with detailed errors
try {
  validateNpcStrict(invalidNpc);
} catch (error) {
  console.log(error.details);
  // Shows:
  // 1. At /name: must NOT have fewer than 2 characters (current length: 1)
  // 2. At /description: must NOT have fewer than 20 characters (current length: 5)
  // 3. At /: must have required property 'race' (missing required property: race)
  // ... etc
}
```

### 3. Test with Partial Data

```typescript
const partialNpc = {
  name: "Partial NPC",
  description: "This NPC has some fields but not all required ones",
  race: "Elf",
  // Missing: class_levels, ability_scores, proficiency_bonus, personality, motivations
  // Missing: rule_base, sources_used, assumptions, proposals, canon_update
};

const result = validateNpcSafe(partialNpc);
console.log(result.valid); // false
console.log(result.details); // Shows all missing fields
```

## Common Validation Errors

### 1. Missing Required Fields
```
At /: must have required property 'class_levels'
At /: must have required property 'ability_scores'
```

**Fix:** Ensure all required fields are present

### 2. Type Mismatches
```
At /proficiency_bonus: must be integer (expected integer, got string)
```

**Fix:** Convert types correctly (`parseInt()`, `Number()`)

### 3. String Length Constraints
```
At /name: must NOT have fewer than 2 characters (current length: 1)
At /description: must NOT have fewer than 20 characters (current length: 10)
```

**Fix:** Ensure strings meet minimum length requirements

### 4. Enum Violations
```
At /rule_base: must be equal to one of the allowed values (allowed values: 2024RAW, 2014RAW)
```

**Fix:** Use exact enum values from schema

### 5. Array Constraints
```
At /proposals/0/options: must NOT have fewer than 2 items
At /proposals/0/options: must NOT have more than 5 items
```

**Fix:** Ensure arrays meet min/max item constraints

## Rollout Strategy

### Phase 1: Soft Validation (Current)
- Add validation calls
- Log errors to console
- Show warnings to users
- **Don't block operations**

### Phase 2: Hard Validation (Next Release)
- Reject invalid data
- Block save operations
- Require fixes before proceeding

### Phase 3: Strict Mode (Future)
- Remove all fallbacks
- Validate at every boundary
- Zero tolerance for invalid data

## Monitoring

### What to Track
- Validation failure rate
- Most common validation errors
- User feedback on error messages
- Performance impact (validation time)

### Alerts
- Alert if validation failure rate > 5%
- Alert if validation time > 50ms
- Alert on new error types (schema changes)

## Support

If you encounter issues:

1. Check `docs/npc-schema.md` for field requirements
2. Review validation error messages (they're actionable!)
3. Test with `validateNpcSafe()` to see all errors
4. Check schema at `schema/npc/v1-flat.json`
5. Consult `ARCHITECTURE_FIXES.md` for context

---

**Remember:** The goal is to catch errors early and provide clear feedback. Validation should help developers, not frustrate them!
