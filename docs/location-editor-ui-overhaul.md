# Location Editor UI/UX Overhaul Plan

> **Status**: Active Development  
> **Created**: December 7, 2025  
> **Priority**: High - Blocking usability issues

---

## Current Issues Identified

### 1. Layout Problems
- **RoomPropertiesPanel Off-Screen**: The 260px min-width panel appears to the right of the map canvas, causing horizontal scroll
- **User loses map visibility** when scrolling to access property editor
- **Competing editing experiences**: SpaceApprovalModal (left) vs InteractiveLocationEditor (right)

### 2. Door Placement UX
- Doors edited through form fields only (wall dropdown + position slider 0-1)
- No visual indication of door position on the map during editing
- Unintuitive position input (what does "0.5" mean to the user?)
- No ability to click on a wall to place a door

### 3. Missing "Add Room" Capability
- `ADD_SPACE` action exists in LocationEditorContext but no UI to trigger it
- Users cannot add rooms discovered during editing
- Blocks workflow when AI misses a room from the description

### 4. Modal/Map Disconnect
- SpaceApprovalModal has its own form editor separate from InteractiveLocationEditor
- Changes in one may not sync to the other
- Two different editing paradigms confuse users

---

## Proposed Layout Redesign

### New Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  [Header Bar]                                                    │
├──────────────────────┬──────────────────────────────────────────┤
│                      │                                          │
│   LEFT PANEL         │        RIGHT PANEL                       │
│   (300-400px)        │        (Flexible)                        │
│                      │                                          │
│  ┌────────────────┐  │   ┌────────────────────────────────────┐ │
│  │ Room List      │  │   │                                    │ │
│  │ + Add Room     │  │   │                                    │ │
│  ├────────────────┤  │   │         INTERACTIVE MAP            │ │
│  │                │  │   │                                    │ │
│  │ Selected Room  │  │   │    (Zoom, Pan, Grid controls)      │ │
│  │ Properties     │  │   │                                    │ │
│  │                │  │   │    Click room = select             │ │
│  │ - Name         │  │   │    Drag room = move                │ │
│  │ - Dimensions   │  │   │    Drag corner = resize            │ │
│  │ - Purpose      │  │   │    Click wall = add door           │ │
│  │                │  │   │                                    │ │
│  ├────────────────┤  │   │                                    │ │
│  │ Doors          │  │   │                                    │ │
│  │ + Add Door     │  │   └────────────────────────────────────┘ │
│  │ [Door 1]       │  │                                          │
│  │ [Door 2]       │  │   ┌────────────────────────────────────┐ │
│  │                │  │   │ Status: 5 rooms • Grid: 5ft        │ │
│  └────────────────┘  │   └────────────────────────────────────┘ │
│                      │                                          │
├──────────────────────┴──────────────────────────────────────────┤
│  [Footer: Save | Export | Done Editing]                          │
└─────────────────────────────────────────────────────────────────┘
```

### Key Changes

1. **Map on Right** (always visible, maximized space)
2. **Editing on Left** (collapsible panel, persistent during editing)
3. **Room List** at top of left panel for quick navigation
4. **Selected Room Properties** below room list
5. **Door Editor** integrated with visual feedback

---

## Implementation Phases

### Phase 1: Layout Restructure (Priority: High)
**Goal**: Fix the off-screen panel issue

**Tasks**:
1. Move RoomPropertiesPanel from right side to left side
2. Make map canvas use remaining space (flex-grow)
3. Add collapsible behavior to left panel
4. Ensure map stays visible while editing

**Files to modify**:
- `InteractiveLocationEditor.tsx` - Restructure flex layout
- `RoomPropertiesPanel.tsx` - Adjust width constraints
- `LiveVisualMapPanel.tsx` - Update container layout

### Phase 2: Visual Door Placement (Priority: High)
**Goal**: Click-on-wall door placement

**Tasks**:
1. Render door indicators on room walls in SVG
2. Add click handler on wall segments to add door
3. Drag door marker to reposition along wall
4. Show door position in feet (not 0-1 ratio)
5. Connect door to destination room dropdown

**Files to modify**:
- `InteractiveLocationEditor.tsx` - Add door rendering & handlers
- `RoomPropertiesPanel.tsx` - Update door form to show feet position
- `LocationEditorContext.tsx` - Add ADD_DOOR, MOVE_DOOR actions (may exist)

### Phase 3: Add Room Capability (Priority: Medium)
**Goal**: Allow users to add rooms post-generation

**Tasks**:
1. Add "+ Add Room" button to left panel
2. Create AddRoomModal with name, dimensions, purpose
3. Place new room at default position (auto-layout or user click)
4. Sync new room to accumulated results
5. Update save/resume to handle added rooms

**Files to create/modify**:
- `AddRoomModal.tsx` - New component
- `InteractiveLocationEditor.tsx` - Add button and handler
- `ManualGenerator.tsx` - Handle room additions in save flow

### Phase 4: Room List Navigation (Priority: Medium)
**Goal**: Quick room selection from list

**Tasks**:
1. Add scrollable room list above property editor
2. Click room in list = select + pan to room on map
3. Show mini-status per room (doors count, validation status)
4. Drag-reorder rooms in list (optional)

**Files to modify**:
- `RoomPropertiesPanel.tsx` or new `RoomListPanel.tsx`
- `LocationEditorContext.tsx` - Add room ordering if needed

### Phase 5: Save/Resume Hardening (Priority: High - Before Phase 3)
**Goal**: Ensure stability before adding complexity

**Tasks**:
1. Review current save/resume flow for location editing
2. Ensure all room properties are persisted
3. Test resume after partial completion
4. Verify door connections survive round-trip

**Files to review**:
- `ManualGenerator.tsx` - handleResumeSession, saveStateAndSession
- `generationProgress.ts` - Session schema

---

## Door Placement UX Details

### Current Flow (Form-Based)
```
1. Click "Add Door" button
2. Select wall from dropdown (North/South/East/West)
3. Enter position (0-1 ratio) - confusing!
4. Enter width in feet
5. Type destination room name
```

### Proposed Flow (Visual)
```
1. Select a room on the map
2. Hover over a wall → wall highlights
3. Click on wall → door marker appears at click position
4. Drag door marker along wall to adjust position
5. Click door marker → mini popup with:
   - Width input (in feet)
   - Destination dropdown (list of other rooms)
   - Door type (standard, double, secret, etc.)
   - Delete button
6. Position shown in feet from wall start
```

### Visual Door Indicators
```svg
<!-- Door marker on North wall -->
<rect x="100" y="0" width="8" height="4" fill="#3b82f6" />
<text x="104" y="-5" font-size="8">→ Kitchen</text>
```

---

## Technical Notes

### State Synchronization
- InteractiveLocationEditor uses LocationEditorContext
- SpaceApprovalModal uses local state synced from props
- Need to ensure bidirectional sync when user edits from either place

### Door Position Calculation
Currently: `position_on_wall_ft` is a 0-1 ratio
Better: `position_from_start_ft` in actual feet from wall start

```typescript
// Convert ratio to feet for display
const wallLength = wall === 'north' || wall === 'south' 
  ? room.size_ft.width 
  : room.size_ft.height;
const positionInFeet = position_on_wall_ft * wallLength;
```

### Add Room Default Position
```typescript
// Find empty space for new room
function findEmptyPosition(spaces: Space[], newSize: { width: number; height: number }) {
  // Strategy: Place to the right of rightmost room
  const maxX = Math.max(...spaces.map(s => (s.position?.x || 0) + s.size_ft.width));
  return { x: maxX + 10, y: 0 }; // 10ft gap
}
```

---

## Success Criteria

1. **No horizontal scroll** when editing room properties
2. **Map always visible** during all editing operations
3. **Click-to-place doors** on room walls
4. **Add new rooms** without restarting generation
5. **Resume works reliably** with all edits preserved
6. **Professional appearance** matching rest of app

---

## Dependencies

- Must complete Phase 5 (Save/Resume) before Phase 3 (Add Room)
- Phase 2 (Doors) can proceed independently
- Phase 1 (Layout) should be first

---

## Related Documents

- `location-editor-enhancements.md` - Future fixture features
- `NPC_architecture.md` - For encounter integration
