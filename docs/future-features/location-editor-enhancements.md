# Location Editor - Future Feature Enhancements

> **Status**: Future Roadmap  
> **Created**: December 7, 2025  
> **Primary Use Case**: Narrative reference with accurate wireframe mapping for quick space design, serving as sketches for future VTT-ready battle map creation.

---

## Overview

This document outlines potential enhancements to the location generation and editing feature that would significantly level up the tool. These features are noted for future development as the location tool potentially evolves into its own major feature or standalone app.

---

## Feature Levels

### Level 1: Descriptive Fixtures (Low Effort - 2-3 days)

**Goal**: Add fixture/furniture data to spaces without visual rendering.

- Add `fixtures[]` array to space data model
- AI generates fixture names, descriptions, and rough positions
- Display as text list in space details panel
- Schema example:
  ```typescript
  interface Fixture {
    type: 'furniture' | 'decoration' | 'natural' | 'structural';
    name: string;
    description?: string;
    position?: { x: number; y: number }; // rough placement
  }
  ```

**Pros**: Quick implementation, useful for narrative  
**Cons**: No visual map enhancement

---

### Level 2: Icon-Based Map Overlay (Medium Effort - 1-2 weeks)

**Goal**: Visual fixtures on the map with interactive editing.

#### Phase 1 - Data & AI (3-4 days)
- Extend space schema with `fixtures[]` and `surfaceType`
- Add fixture generation to Spaces stage prompts
- Store: `{ type, name, position: {x, y}, rotation?, description }`

#### Phase 2 - Visual Rendering (4-5 days)
- Curate ~30-40 SVG icons for common fixtures:
  - **Indoor**: table, chair, bed, shelf, hearth/fireplace, throne, altar, chest, barrel, crate, bookshelf, desk, wardrobe, rug, chandelier
  - **Outdoor**: tree, bush, fountain, well, boulder, campfire, tent, cart, fence, statue
  - **Structural**: pillar, stairs, trapdoor, ladder, brazier
- Render fixtures on existing canvas at stored positions
- Surface type rendering:
  - Stone (gray pattern)
  - Wood (brown grain)
  - Grass (green)
  - Cobblestone (gray circles)
  - Dirt (brown speckled)
  - Water (blue waves)

#### Phase 3 - Editing UX (3-4 days)
- Click to select fixture on map
- Drag to reposition within room bounds
- Right-click context menu: delete, duplicate, rotate
- Fixture palette/toolbar for adding new fixtures
- Snap-to-grid option

**Pros**: Professional appearance, interactive, visually impressive  
**Cons**: Requires icon assets and positioning logic

---

### Level 3: Full Battle Map Quality (High Effort - 1+ month)

**Goal**: Publication-ready maps suitable for VTT export.

- Detailed furniture with precise dimensions and rotation
- Collision detection between fixtures
- Floor textures and patterns
- Wall decorations and thickness
- Lighting indicators (torches, windows)
- Multi-floor support with connections
- Export formats:
  - PNG/SVG at various resolutions
  - Foundry VTT module
  - Roll20 compatible
  - Owlbear Rodeo
  - Universal VTT format

**Pros**: Publication-ready, professional maps  
**Cons**: Significant development effort, approaches dedicated map tools (Dungeondraft, etc.)

---

## Icon Asset Sources

Potential sources for fixture icons:
1. **Lucide Icons** - Already in project, has some relevant icons
2. **Game-icons.net** - CC-BY licensed game icons
3. **FontAwesome** - Limited but some useful icons
4. **Custom SVGs** - Create simple line-art icons matching current style

---

## Technical Considerations

### Data Model Extension
```typescript
interface Space {
  // ... existing fields
  fixtures?: Fixture[];
  surfaceType?: 'stone' | 'wood' | 'grass' | 'cobblestone' | 'dirt' | 'water' | 'carpet';
  lighting?: 'bright' | 'dim' | 'dark';
}

interface Fixture {
  id: string;
  type: FixtureType;
  name: string;
  description?: string;
  position: { x: number; y: number }; // relative to room origin, in feet
  rotation?: number; // degrees
  size?: { width: number; height: number }; // in feet
  icon?: string; // icon identifier
}

type FixtureType = 
  | 'furniture' 
  | 'storage' 
  | 'lighting' 
  | 'natural' 
  | 'structural' 
  | 'decorative';
```

### AI Prompt Additions
For Spaces stage, add to the prompt:
```
For each space, also include:
- surfaceType: The floor/ground material
- fixtures: Array of key furniture/objects with approximate positions
```

---

## Priority Notes

Before implementing fixture features, the following should be addressed:
1. **UI/UX Overhaul** - Current editor layout needs improvement (see separate task)
2. **Door Placement** - Improve door editing workflow
3. **Add Room** - Allow adding rooms post-generation
4. **Save/Resume** - Ensure stability before adding complexity

---

## Related Documents

- `NPC_architecture.md` - For encounter integration
- `encounter_architecture.md` - For location-encounter linking

---

*This document will be updated as priorities and requirements evolve.*
