# Location Spatial Layout Fix

## Problem Identified

The location generator's spatial layout feature was not working because:

1. **Broken Door Connections**: All door `leads_to` values were using location codes (e.g., "CBF-G-SEOW") instead of exact space names (e.g., "Southeast Outer Ward")
2. **Root Cause**: The AI prompt in `locationCreatorStages.ts` line 249 was instructing the AI to use short codes instead of full names
3. **Impact**: No rooms could connect to each other, causing the spatial layout to show only isolated rooms

## Solution Implemented

### 1. Fixed AI Prompt Instructions (locationCreatorStages.ts)

**Stage 3: Spaces - System Prompt (lines 247-252)**
```typescript
LABEL RULES:
- Feature labels: Max 3 words (e.g., "Stone Forge", "Guard Bunk")
- Door leads_to: MUST use the EXACT space name as it appears in the "name" field, NOT a code or abbreviation
  * Example: leads_to: "Southeast Outer Ward" (correct)
  * Example: leads_to: "CBF-G-SEOW" (WRONG - will break spatial layout)
  * For ungenerated spaces, use: leads_to: "Pending"
```

**Stage 3: Spaces - User Prompt Instructions (lines 283-287)**
```typescript
CRITICAL: All door "leads_to" values MUST use exact space names from the "name" field
(e.g., "Southeast Outer Ward"), NOT codes or abbreviations.
This is required for spatial layout to work.
```

**Stage 5: Accuracy Refinement - System Prompt (lines 472-474)**
```typescript
2. CONNECTION CONSISTENCY: Ensure all doors/passages "leads_to" values use EXACT space names (not codes)
   - Must match the "name" field exactly
   - Invalid: "CBF-G-SEOW" → Valid: "Southeast Outer Ward"
```

### 2. Added Connection Validation (LiveVisualMapPanel.tsx)

**Validation System (lines 975-1016)**
- Validates all connections before attempting spatial layout
- Reports broken connections with clear error messages
- Distinguishes between broken connections and intentional external connections
- Provides actionable fix instructions

**Example Console Output:**
```
❌ BROKEN CONNECTIONS (25):
  {from: 'South Wall Grand Gatehouse', to: 'CBF-G-SEOW', wall: 'north'}
  ...

🔧 FIX: Update door "leads_to" values to exactly match room names

Valid room identifiers:
  ['Castle Storage Ward (Sub-Level 1)', 'Central Inner Ward (South)', ...]
```

### 3. Implemented Layer Toggle Controls

**UI Features:**
- Grid layer toggle (blue) - Shows 5ft grid squares
- Wireframe layer toggle (green) - Shows room outlines and furniture
- HTML layer toggle (purple) - Shows colored floors and labels
- Toggles only appear when "Layout" view is active

### 4. Simplified Spatial Algorithm

**Approach:**
- Rooms share walls when connected (no gaps, no collision detection)
- Simple edge alignment: North/South align west edges, East/West align north edges
- Grid snapping to 5ft grid for consistency
- BFS traversal starting from first room

## Testing New Generations

When generating new locations, verify:
1. **Check console for validation errors** - Should show 0 broken connections
2. **Door connections use exact names** - e.g., `"leads_to": "Southeast Outer Ward"`
3. **Spatial layout shows connected rooms** - Rooms positioned based on door directions
4. **Layer toggles work** - Can show/hide Grid, Wireframe, and HTML layers independently

## Files Modified

1. `client/src/config/locationCreatorStages.ts` - Fixed AI prompts
2. `client/src/components/generator/LiveVisualMapPanel.tsx` - Added validation and layer controls

## Next Steps for Existing Data

For locations already generated with broken connections:
1. Option A: **Regenerate** - Use updated prompts to generate new locations
2. Option B: **Manual fix** - Edit door data to replace codes with exact room names
3. Option C: **Accuracy Refinement** - Run the Accuracy Refinement stage which now includes connection validation

## Architecture Notes

The validation approach is superior to fuzzy matching because:
- ✅ **No guessing** - Only exact matches allowed
- ✅ **Clear error messages** - Shows exactly what's wrong
- ✅ **Self-documenting** - AI sees validation errors and learns correct format
- ✅ **Maintainable** - Simple matching logic vs complex fuzzy algorithms
- ✅ **Predictable** - Always know what will happen
