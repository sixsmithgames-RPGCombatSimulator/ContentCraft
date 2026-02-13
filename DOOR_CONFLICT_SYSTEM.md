# Door Conflict Notification System

© 2025 Sixsmith Games. All rights reserved.

## Overview

This system surfaces door conflicts to users in a clear, actionable format and provides one-click fixes to resolve conflicts. Previously, door conflicts were only visible in console logs, leaving users to discover problems indirectly when "the doors don't look right."

## What Was Implemented

### 1. **DoorConflictPanel Component** (`client/src/components/generator/DoorConflictPanel.tsx`)

A new reusable component that:
- **Displays door conflicts** in user-friendly language
- **Parses validation errors** to extract conflict details:
  - Which space has the conflict
  - Which door (by index)
  - Wall location and position
  - Conflicting door positions
- **Provides actionable fixes**:
  - "Remove Door" button - removes the conflicting door
  - "Move to Xft" button - relocates door to a non-conflicting position
- **Two display modes**:
  - **Compact mode** - Simple alert banner for review mode
  - **Full mode** - Detailed conflict list with fix buttons for edit mode

### 2. **SpaceApprovalModal Integration** (`client/src/components/generator/SpaceApprovalModal.tsx`)

Enhanced the Space Approval Modal to:
- **Import door conflict components and utilities**:
  - `DoorConflictPanel` component
  - `convertDoorValidationToErrors` from doorSync
  - `ValidationError` type

- **Track validation state**:
  - Added `validationErrors` state to store current conflicts
  - Validates doors whenever space changes or doors are edited

- **Real-time validation**:
  - Validates on space load/change
  - Re-validates when doors are edited in the form
  - Re-validates after applying fixes (remove/relocate)

- **Display conflicts prominently**:
  - **Review mode**: Compact conflict banner above the warning section
  - **Edit mode**: Full conflict panel with fix buttons above the form tabs

- **Added conflict resolution handlers**:
  - `handleRemoveDoor(spaceName, doorIndex)` - Removes a door and re-validates
  - `handleRelocateDoor(spaceName, doorIndex, newPosition)` - Moves door to new position and re-validates

## How It Works

### Conflict Detection Flow

1. **Space is loaded/changed** → Validation runs automatically
2. **Validation results** are converted to `ValidationError[]` format
3. **DoorConflictPanel** parses error messages to extract:
   - Space name
   - Door index (0-based)
   - Wall direction
   - Position and width
   - Conflicting door positions
4. **Conflicts are displayed** to user with clear explanations

### Conflict Resolution Flow

**Option 1: Remove Door**
1. User clicks "Remove Door" button
2. `handleRemoveDoor()` removes door from `editedDoors`
3. Validation runs on updated door list
4. Conflict panel updates to show remaining conflicts (if any)

**Option 2: Relocate Door**
1. System suggests non-conflicting position (25%, 75%, or 50% of wall)
2. User clicks "Move to Xft" button
3. `handleRelocateDoor()` updates door position
4. Validation runs on updated door list
5. Conflict panel updates to show remaining conflicts (if any)

### Validation Integration Points

The system validates doors at these key moments:
1. **Space loaded** - Initial validation when modal opens
2. **Space changed** - When navigating between spaces
3. **Door edited** - Real-time validation as doors are modified in the form
4. **Conflict fixed** - After removing or relocating a door
5. **Form saved** - Final validation before accepting changes

## User Experience

### Before (Console-Only Errors)
```
User: "The doors don't look right..."
Console: [doorSync] ✗ Cannot create reciprocal door: South Great Hallway → Grand Banquet Hall
Console: [doorSync]   Door conflicts with existing door(s) on north wall: ...
User: *Has no idea what's wrong or how to fix it*
```

### After (UI Notifications with Fixes)
```
┌─────────────────────────────────────────────────────────────┐
│ ⚠️ Door Conflicts Detected                                  │
│ 2 conflicts found - doors overlap on the same wall         │
├─────────────────────────────────────────────────────────────┤
│ Grand Banquet Hall: Door 2                                  │
│ north wall at 150.0ft → leads to South Great Hallway      │
│ Width: 4ft                                                  │
│                                                             │
│ Conflicts with:                                             │
│ • North Great Hallway at 150.0ft                           │
│                                                             │
│ [Remove Door]  [Move to 75.0ft]                            │
└─────────────────────────────────────────────────────────────┘
```

## Benefits

1. **Immediate visibility** - Users see conflicts as soon as they occur
2. **Clear explanations** - Conflicts are explained in plain language
3. **Actionable fixes** - One-click buttons to resolve conflicts
4. **Real-time feedback** - Conflicts update as user makes changes
5. **Prevents bad saves** - Validation before accepting changes
6. **No more trial and error** - Users know exactly what's wrong and how to fix it

## Technical Details

### Conflict Parsing Logic

The system parses validation error messages to extract conflict details:

```typescript
// Error message format:
// "Room Name: Door X (wall wall at Yft, width Zft) conflicts with existing door(s)..."

parseConflictError(error: ValidationError) => {
  spaceName: string;
  doorIndex: number;
  wall: string;
  position: number;
  width: number;
  leadsTo: string;
  conflictingDoors: Array<{ leadsTo: string; position: number }>;
}
```

### Position Suggestion Algorithm

When relocating doors, the system suggests positions in this order:
1. **25% of wall length** - Near start of wall
2. **75% of wall length** - Near end of wall
3. **50% of wall length** - Center of wall

Each candidate position is checked to ensure:
- It fits within wall bounds (accounting for door width)
- It doesn't conflict with other doors (2ft buffer)

### Validation State Management

```typescript
// State
const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

// Validation on space change
useEffect(() => {
  const validationResults = validateAllDoors([space]);
  const errors = convertDoorValidationToErrors(validationResults);
  setValidationErrors(errors);
}, [space]);

// Real-time validation on door edits
useEffect(() => {
  const tempSpace = { ...space, doors: editedDoors };
  const validationResults = validateAllDoors([tempSpace]);
  const errors = convertDoorValidationToErrors(validationResults);
  setValidationErrors(errors);
}, [editedDoors, isEditing]);
```

## Future Enhancements

Possible improvements for future iterations:

1. **Bulk conflict resolution** - Fix all conflicts with one click
2. **Smart positioning** - AI-suggested door positions based on room layout
3. **Visual conflict indicators** - Highlight conflicting doors on the map
4. **Conflict preview** - Show what the fix will look like before applying
5. **Undo/redo for fixes** - Allow reverting conflict resolutions
6. **Context-aware suggestions** - Consider room adjacency when suggesting positions

## Files Modified

- **Created**: `client/src/components/generator/DoorConflictPanel.tsx` (249 lines)
- **Modified**: `client/src/components/generator/SpaceApprovalModal.tsx` (added validation state, handlers, and conflict panel display)

## Testing Recommendations

1. **Test conflict detection**:
   - Create a space with overlapping doors on the same wall
   - Verify conflict panel appears with correct details

2. **Test conflict resolution**:
   - Click "Remove Door" - verify door is removed and conflicts update
   - Click "Move to Xft" - verify door moves and conflicts update

3. **Test real-time validation**:
   - Edit door position in form - verify conflicts update immediately
   - Add new door that conflicts - verify conflict appears immediately

4. **Test edge cases**:
   - No conflicts - verify panel doesn't appear
   - Multiple conflicts - verify all are shown
   - No space to relocate - verify "No space to relocate" message appears

## Console Logs

The system maintains console logging for debugging while also showing UI notifications:

```
[SpaceApprovalModal] Form synced with space prop: Grand Banquet Hall
[SpaceApprovalModal] Validation: 2 error(s) found
[SpaceApprovalModal] Removed door 1 from Grand Banquet Hall. 1 error(s) remaining.
[SpaceApprovalModal] Relocated door 0 in Grand Banquet Hall to 75.0ft. 0 error(s) remaining.
```

This dual approach ensures developers can still debug while users get clear UI feedback.
