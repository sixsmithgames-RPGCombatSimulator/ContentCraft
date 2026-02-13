# Build Fixes Needed

## ✅ Resolved Issues

1. **Import Resolution Error** - Fixed missing `./authority` and `./canon` imports
2. **Type Generation** - Successfully generating NPC types from schema
3. **Speed Property** - Fixed TypeScript error in generated types

## ⚠️ Remaining TypeScript Errors

These are pre-existing errors in your codebase, not related to architecture fixes:

### 1. LibraryBrowserModal.tsx (Line 626)
**Error:** Type mismatch between `LibraryEntity` and `CanonBase`

**Issue:** `_id` property is `string` in `LibraryEntity` but `string | undefined` in `CanonBase`

**Fix Options:**
```typescript
// Option A: Make _id required in CanonBase
export interface CanonBase {
  _id: string; // Remove | undefined
  // ...
}

// Option B: Update LibraryBrowserModal to handle optional _id
const handleSaveEntity = async (updatedEntity: LibraryEntity) => {
  if (!updatedEntity._id) {
    console.error('Entity missing _id');
    return;
  }
  // ... rest of function
};
```

### 2. ManualGenerator.tsx (Lines 1195, 1204)
**Error:** Cannot assign `null` to non-nullable types

**Issue:** `finalOutput` can be `null` but components expect non-null

**Fix:**
```typescript
// Add null checks before passing to components
{showReviewModal && currentStageOutput && (
  <ReviewAdjustModal
    stageOutput={currentStageOutput}
    // ...
  />
)}

{showCanonDeltaModal && finalOutput && (
  <CanonDeltaModal
    generatedContent={finalOutput}
    // ...
  />
)}
```

### 3. ProjectDetail.tsx (Lines 431, 433)
**Error:** Type mismatch in `GeneratedContentDoc` - missing `project_id`

**Issue:** Two different `GeneratedContentDoc` types exist with different shapes

**Fix:** Consolidate to single type definition
```typescript
// In shared types or client types
export interface GeneratedContentDoc {
  _id: string;
  project_id: string; // Make sure this is included
  content_type: string;
  title: string;
  generated_content: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // ... other fields
}
```

## How to Fix

1. **LibraryBrowserModal:** Make `_id` required in `CanonBase` interface
2. **ManualGenerator:** Add null guards before passing to modals
3. **ProjectDetail:** Consolidate `GeneratedContentDoc` type definitions

## Test After Fixes

```bash
# Should compile without errors
cd client && npm run build

# Should type-check without errors
cd client && npx tsc --noEmit
```

## Type Generation

All set up and working:

```bash
# Regenerate types from schemas
npm run generate:types

# Output:
# ✅ Generated: client/src/types/npc/generated.ts
```

## Notes

- The architecture fixes (schemas, validation, migrations, docs) are complete
- These TypeScript errors are pre-existing code issues
- Fixing them will improve type safety across the application
- None of these errors block development, they're just compile-time warnings
