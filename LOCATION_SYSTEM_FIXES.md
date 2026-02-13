# Location System Fixes - Stage Results Key Naming Bug

## Problem Discovered

The Location Generation System was not working due to a critical naming inconsistency:

### Root Cause
Stage results are stored by `stage.name`, not `stage.id`. The code was looking for:
- `stageResults.location_purpose` (wrong)
- `stageResults.location_foundation` (wrong)
- `stageResults.location_spaces` (wrong)

But the actual keys are:
- `stageResults.purpose` ✓
- `stageResults.foundation` ✓
- `stageResults.spaces` ✓

This is because ManualGenerator stores results using (line 3901):
```typescript
[currentStage.name.toLowerCase().replace(/\s+/g, '_')]: parsed
```

So "Purpose" becomes `purpose`, not `location_purpose`.

## Files Fixed

### 1. `client/src/config/locationCreatorStages.ts`

**Line 187 - shouldChunk function**
Changed:
```typescript
const purpose = context.stageResults.location_purpose as Record<string, unknown> | undefined;
```
To:
```typescript
const purpose = context.stageResults.purpose as Record<string, unknown> | undefined;
```

**Lines 112, 255, 364, 476 - buildUserPrompt functions (all stages)**
Changed all occurrences from:
```typescript
const purpose = stripStageOutput(context.stageResults.location_purpose || {});
const foundation = stripStageOutput(context.stageResults.location_foundation || {});
const spaces = stripStageOutput(context.stageResults.location_spaces || {});
```
To:
```typescript
const purpose = stripStageOutput(context.stageResults.purpose || {});
const foundation = stripStageOutput(context.stageResults.foundation || {});
const spaces = stripStageOutput(context.stageResults.spaces || {});
```

### 2. `client/src/pages/ManualGenerator.tsx`

**Lines 554-560 - normalizeLocationData function**
Changed:
```typescript
const purpose = (stageResults.location_purpose as JsonRecord) || {};
const foundation = (stageResults.location_foundation as JsonRecord) || {};
const spaces = (stageResults.location_spaces as JsonRecord) || (stageResults.spaces as JsonRecord) || {};
const details = (stageResults.location_details as JsonRecord) || {};
const accuracy = (stageResults.location_accuracy as JsonRecord) || {};
```
To:
```typescript
const purpose = (stageResults.purpose as JsonRecord) || {};
const foundation = (stageResults.foundation as JsonRecord) || {};
const spaces = (stageResults.spaces as JsonRecord) || {};
const details = (stageResults.details as JsonRecord) || {};
const accuracy = (stageResults.accuracy_refinement as JsonRecord) || {};
```

**Lines 619-623 - normalizeLocationData cleanup**
Changed:
```typescript
delete normalized.location_purpose;
delete normalized.location_foundation;
delete normalized.location_spaces;
delete normalized.location_details;
delete normalized.location_accuracy;
```
To:
```typescript
delete normalized.purpose;
delete normalized.foundation;
delete normalized.spaces;
delete normalized.details;
delete normalized.accuracy_refinement;
```

**Line 4031 - Geometry validation foundation reference**
Changed:
```typescript
const foundation = stageResults.location_foundation as Record<string, unknown> | undefined;
```
To:
```typescript
const foundation = stageResults.foundation as Record<string, unknown> | undefined;
```

**Line 5913 - Live map panel location name**
Changed:
```typescript
locationName={String(stageResults.location_purpose?.name || config.prompt).slice(0, 50)}
```
To:
```typescript
locationName={String(stageResults.purpose?.name || config.prompt).slice(0, 50)}
```

**Line 3313 - Removed obsolete debug logging**
Removed:
```typescript
console.log(`[Stage Chunking] Context.stageResults.location_purpose:`, context.stageResults.location_purpose);
```

## Additional Improvement

### Auto-Save During Chunking (Line 4093-4104)

Added automatic saving after each space is generated to prevent data loss during lengthy iterations:

```typescript
// Auto-save progress after each chunk to prevent data loss during long iterations
if (autoSaveEnabled && progressSession) {
  const savedSession = {
    ...progressSession,
    lastUpdatedAt: new Date().toISOString(),
    stageResults: updatedResults as unknown as Record<string, unknown>,
    currentStageIndex: currentStageIndex,
  };
  setProgressSession(savedSession);
  await saveProgress(savedSession);
  console.log(`[Auto-Save] Saved chunk ${currentStageChunk + 1}/${totalStageChunks} for ${currentStage.name}`);
}
```

**Why This Matters:**
- 55-space iteration = 55 AI calls
- Could take 30+ minutes
- Browser crash or navigation would lose all progress
- Now saves after each space, allowing safe resumption

## Impact

### Before Fixes
❌ Stage chunking not triggering (shouldChunk returned false)
❌ No iteration through spaces
❌ Live visual map not displaying
❌ Geometry validation using wrong data
❌ EditContentModal showing empty data
❌ No auto-save during chunking (data loss risk)

### After Fixes
✅ Stage chunking triggers correctly
✅ Iterates through all estimated_spaces
✅ Live visual map displays and updates
✅ Geometry validation works with correct parent structure
✅ EditContentModal displays normalized location data
✅ Auto-saves after each space generation

## Stage Names Reference

For future reference, the 5 location stages are:

| Stage Name | stage.id | Stored As | Description |
|------------|----------|-----------|-------------|
| Purpose | `location_purpose` | `stageResults.purpose` | Determines scale, type, estimated_spaces |
| Foundation | `location_foundation` | `stageResults.foundation` | Establishes floors, area, layout |
| Spaces | `location_spaces` | `stageResults.spaces` | **ITERATIVE** - Generates each space |
| Details | `location_details` | `stageResults.details` | Adds atmosphere, NPCs, encounters |
| Accuracy Refinement | `location_accuracy` | `stageResults.accuracy_refinement` | Reviews for consistency |

## Testing Verification

User confirmed after fixes:
> "OK, spaces are being processed. I am iterating through them."

## Console Logging Added

For debugging future issues, extensive logging added:
- `[Stage Chunking Debug]` - Stage detection
- `[shouldChunk]` - Chunking decision logic
- `[Live Map Render]` - Map display conditions
- `[Live Map]` - Space extraction and updates
- `[Auto-Save]` - Save operations during chunks

## Lessons Learned

1. **Always verify actual data structure** - Don't assume stage.id === storage key
2. **Global search-and-replace risks** - This bug affected 8+ locations across 2 files
3. **Consistent naming is critical** - Mixed use of stage.id vs stage.name causes confusion
4. **Auto-save during iterations** - Long-running processes need incremental saves
5. **Console logging saves time** - Comprehensive logging quickly revealed the root cause
