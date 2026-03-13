/**
 * Specialized Location Creator Stages
 *
 * Flexible system for generating ANY type of location (taverns, castles, dungeons, cities, etc.)
 * with appropriate complexity based on scale.
 *
 * Key Features:
 * - Purpose-driven: Determines complexity level first
 * - Adaptive foundation: Simple for taverns, complex for castles
 * - Iterative spaces: Uses chunking with metadata linking for perfect meshing
 * - Scale-aware: From single rooms to entire cities
 * - Template-driven: Optional architectural templates with constraints and style guidance
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import {
  buildWorkflowStagePrompt,
  type GeneratorStagePromptContext as StageContext,
} from '../services/stagePromptShared';
import {
  buildLocationAccuracyRefinementPrompt,
  buildLocationDetailsPrompt,
  buildLocationFoundationPrompt,
  buildLocationSpacesChunkPlan,
  buildLocationSpacesPrompt,
  buildLocationVisualMapPrompt,
} from '../services/locationStagePrompt';

/**
 * Stage 1: Purpose
 * Determines what to generate and establishes complexity level
 */
export const LOCATION_CREATOR_PURPOSE = {
  id: 'location_purpose',
  name: 'Purpose',
  systemPrompt: `You are creating a D&D location. This is stage 1/5: Purpose & Scope.

Your task is to determine WHAT needs to be generated and HOW complex it should be.

Focus ONLY on these fields:
- name: The location's name (required)
- location_type: Type of location (required) - Examples:
  * Buildings: "tavern", "inn", "shop", "temple", "guild hall", "manor", "castle", "fortress", "tower"
  * Settlements: "village", "town", "city", "district", "neighborhood"
  * Dungeons: "cave", "dungeon", "crypt", "ruins", "underground complex"
  * Outdoor: "forest", "mountain pass", "docks", "marketplace", "battlefield"
  * Other: "ship", "airship", "demiplane", "pocket dimension"
- description: Overall description (2-3 sentences, required)
- purpose: Primary function (e.g., "adventurer's tavern", "thieves' guild hideout", "merchant district")
- scale: Complexity indicator (required)
  "simple" = Single room or small building (1-5 spaces)
  "moderate" = Multi-room building or small complex (6-20 spaces)
  "complex" = Large multi-floor structure (21-50 spaces)
  "massive" = Entire settlement or sprawling complex (50+ spaces)
- estimated_spaces: Approximate number of distinct spaces/rooms to generate (required)
  ⚠️ IMPORTANT: If the user explicitly lists specific rooms in their request, COUNT THEM and use that exact number.
  Do NOT inflate this number by adding unlisted rooms. The user's room list is the authoritative count.
- architectural_style: Style/theme appropriate to the type
- setting: Where this exists in the world
- key_features: Array of 3-5 must-have features that define this location

CRITICAL: The scale and estimated_spaces will determine how the generation proceeds.
The estimated_spaces MUST match the user's specifications if they provided a specific room count or list.

Return ONLY a JSON object with the specified fields. No markdown, no explanation.`,

  buildUserPrompt: (context: StageContext) => {
    return buildWorkflowStagePrompt({
      context,
      deliverable: 'location',
      stage: 'purpose',
      promptKey: 'request',
      payload: {
      instructions: `Analyze the request and determine:
1. What type of location this is
2. How complex it should be (scale: simple/moderate/complex/massive)
3. Approximately how many distinct spaces need to be generated

Examples:
- "A cozy tavern" → simple, 3-5 spaces (main room, kitchen, cellar, rooms)
- "A thieves' guild hideout" → moderate, 10-15 spaces (entrance, meeting rooms, vaults, escape routes)
- "Castle Bloodforge" → complex, 40+ spaces (halls, chambers, towers, dungeons)
- "The city of Waterdeep's Dock Ward" → massive, 50+ spaces (districts, key buildings, landmarks)

Be realistic about scope based on the request.`,
      },
    });
  },
};

/**
 * Stage 2: Foundation
 * Establishes structure appropriate to the scale
 */
export const LOCATION_CREATOR_FOUNDATION = {
  id: 'location_foundation',
  name: 'Foundation',
  systemPrompt: `You are creating a D&D location. This is stage 2/5: Foundation.

You are building upon the Purpose stage which determined the scale and type.

⚠️ IMPORTANT: Pay close attention to the user's original request. If they specified:
- Exact room counts or types → Use that count exactly
- Specific dimensions → Match those dimensions
- Particular layout → Follow that layout
Your role is to SUPPORT the user's vision, not override it with your own ideas.

Your task is to establish the structural foundation appropriate to the location's scale.

FOR SIMPLE/MODERATE LOCATIONS (taverns, shops, small dungeons):
Focus on these fields:
- layout: Object describing overall arrangement
  {
    description: "Overall layout description",
    dimensions: { length: "60 ft", width: "40 ft", height: "15 ft" } (if applicable),
    levels: Array of level descriptions (e.g., ["main floor", "cellar", "upstairs rooms"])
  }
- spatial_organization: How spaces relate to each other (e.g., "main room with kitchen in back, stairs to rooms above")
- access_points: Entrances/exits

FOR COMPLEX/MASSIVE LOCATIONS (castles, cities, mega-dungeons):
Add advanced structural fields:
- wings: Array of major sections (if applicable)
- floors: Detailed floor structure with elevations
- locking_points: Fixed structural anchors for geometry validation
- load_bearing_walls: Critical structural elements
- vertical_connections: Stairs, ramps, lifts
- constraints: Binding rules for space generation

METADATA LINKING SYSTEM (ALL SCALES):
- chunk_mesh_metadata: Object for seamless chunk integration (REQUIRED)
  {
    connection_protocol: "How chunks connect" (e.g., "doors", "hallways", "adjacency"),
    boundary_markers: Array of connection points for other chunks,
    spatial_hierarchy: "How chunks nest" (e.g., "floor > wing > room" or "area > sub-area > feature"),
    coordinate_system: "Coordinate reference" (e.g., "relative", "absolute grid", "narrative only")
  }

This metadata ensures chunks mesh perfectly when generated iteratively.

Return ONLY a JSON object with the specified fields. No markdown, no explanation.`,

  buildUserPrompt: (context: StageContext) => {
    return buildLocationFoundationPrompt(context);
  },
};

/**
 * Stage 3: Spaces (ITERATIVE WITH CHUNKING)
 * Generates individual spaces with metadata linking for perfect meshing
 */
export const LOCATION_CREATOR_SPACES = {
  id: 'location_spaces',
  name: 'Spaces',
  shouldChunk: (context: StageContext): { shouldChunk: boolean; totalChunks: number; chunkSize: number } => {
    return buildLocationSpacesChunkPlan(context);
  },
  systemPrompt: `D&D Location Generator - Stage 3/5: Spaces (Iterative)

⚠️ CRITICAL: Your primary goal is to generate EXACTLY what the user requested.
- If the user specified specific rooms, generate ONLY those rooms
- Do NOT add extra rooms, guard posts, storage, or any spaces not explicitly requested
- Review the user's "request" field carefully before generating each space
- Match the user's specifications for dimensions, placement, and features

Generate ONE space at a time with these REQUIRED fields:

BASIC: id, name, purpose, description
SPACE TYPE: space_type: "room"|"stairs"|"corridor" (default: "room")
SHAPE: shape: "rectangle"|"circle"|"L-shape" (default: "rectangle")
- For L-shape: add l_cutout_corner: "ne"|"nw"|"se"|"sw" to specify which corner is cut out

STAIRS (when space_type is "stairs"):
- stair_type: "spiral"|"straight"
- z_direction: "ascending"|"descending"
- z_connects_to: "Name of space on other floor" (e.g., "Upper Landing", "Basement Entry")

DIMENSIONS:
- dimensions: {width: number, height: number, unit: "ft"}
- size_ft: {width: number, height: number} (REQUIRED, numeric feet)
- floor_height: number
- wall_thickness_ft: number (REQUIRED, shared wall thickness in feet for layout/rendering)
- wall_material: string (REQUIRED, primary wall material such as "stone", "wood", or "brick")
VISUAL DATA:
- floor: {material: "stone"|"wood"|"dirt"|"tile", color: "#hexcode"}
- walls: [{side: "north"|"south"|"east"|"west", material: "stone"|"wood"|"brick", color: "#hexcode", thickness: number}]
  * If you include walls[], each wall.thickness should agree with wall_thickness_ft unless there is a deliberate special-case wall.
- doors: [{wall: "north"|"south"|"east"|"west", position_on_wall_ft: number (feet), width_ft: number, door_type: string, leads_to: "Name or Pending", color: "#hexcode"}]
  * MULTIPLE DOORS: A wall can have multiple doors. Use position_on_wall_ft in FEET representing door CENTER from wall start.
  * For initial placement: use 50% of wall length (e.g., 30ft wall → position_on_wall_ft: 15)
  * Example: Two doors on 40ft north wall: position_on_wall_ft: 10 (at 25%) and position_on_wall_ft: 30 (at 75%)
  * If a door connects to an already-generated space, prefer a clean reciprocal pair: opposite wall, matching doorway, and compatible wall thickness.
- features: [{type: "furniture"|"architectural"|"fixture", label: "Name", shape: "rectangle"|"circle", position_anchor: "center", position: {x: number, y: number}, width?: number, height?: number, radius?: number, color: "#hexcode", material: "wood"|"stone"|"metal"|"cloth"}]
  * FEATURE COORDINATE SYSTEM (CRITICAL):
    - Units: FEET.
    - Origin: (0,0) is the TOP-LEFT CORNER of the space.
    - position is the CENTER POINT of the feature.
    - You MUST include position_anchor: "center" for every feature.
    - Rectangles: require width + height (feet) and MUST fit in room when center-anchored.
    - Circles: require radius (feet) and MUST NOT include width/height.
    - Features MUST fit fully within the room bounds.
  * FORBIDDEN FIELDS:
    - Do NOT output door.position or door.width.
    - Do NOT output feature.position_ft.
ATMOSPHERE: lighting: "torch"|"natural"|"magical"|"dark", ambient_color: "#hexcode"
MESHING: mesh_anchors: {connects_to: [], connection_types: [], boundary_interface: "", spatial_relationship: ""}

LABEL RULES:
- Feature labels: Max 3 words (e.g., "Stone Forge", "Guard Bunk")
- Door leads_to: MUST use the EXACT space name as it appears in the "name" field, NOT a code or abbreviation
  * Example: leads_to: "Southeast Outer Ward" (correct)
  * Example: leads_to: "CBF-G-SEOW" (WRONG - will break spatial layout)
  * For ungenerated spaces, use: leads_to: "Pending"

CONFLICTS: Add proposals[] if geometry conflicts detected.

Return JSON only. No markdown.`,

  buildUserPrompt: (context: StageContext) => {
    return buildLocationSpacesPrompt(context);
  },
};

/**
 * Stage 4: Details
 * Adds narrative enrichment and usability features
 */
export const LOCATION_CREATOR_DETAILS = {
  id: 'location_details',
  name: 'Details',
  systemPrompt: `You are creating a D&D location. This is stage 4/5: Details.

The structure is now complete. Add rich narrative details that bring the location to life.

Focus on these fields:
- materials: Construction materials used
- lighting_scheme: Overall lighting approach
- atmosphere: Mood and feeling (2-3 sentences)
- inhabitants: Who lives/works/visits here
  {
    permanent_residents: Array of {type, count},
    notable_npcs: Array of {name, role, location},
    visitors: Array of typical visitor types,
    creatures: Array of any monsters/animals
  }
- encounter_areas: Spaces suitable for encounters
  Each area: {
    space_id: string,
    encounter_type: "combat"|"social"|"puzzle"|"trap"|"exploration",
    description: string,
    tactical_notes: string (if combat)
  }
- secrets: Secret features (passages, rooms, compartments, doors)
  Each secret: {type, location, description, how_to_find}
- treasure_locations: Hidden or secured treasure spots
- history: Narrative history (2-3 paragraphs)
- current_events: What's happening now (plot hooks)
- adventure_hooks: Array of adventure seeds
- special_features: Unique or magical features
- cinematic_walkthrough: Narrative walkthrough of exploring the location (3-4 paragraphs)

Return ONLY a JSON object with the specified fields. No markdown, no explanation.`,

  buildUserPrompt: (context: StageContext) => {
    return buildLocationDetailsPrompt(context);
  },
};

/**
 * Stage 5: Visual Map
 * Creates a simple HTML visual representation of the current space layout
 */
export const LOCATION_CREATOR_VISUAL_MAP = {
  id: 'location_visual_map',
  name: 'Visual Map',
  systemPrompt: `You are creating a visual representation of a D&D location. This is stage 5/6: Visual Map.

Your task is to create a simple, clear HTML-based visual map of the location's current layout.

⚠️ CRITICAL OUTPUT REQUIREMENT ⚠️
Output PURE HTML ONLY. NO JSON. NO markdown code blocks. NO explanations.
Start your response with <!DOCTYPE html> or <div> and end with </html> or </div>.
Do NOT wrap the HTML in JSON or any other format.

The HTML should:
1. Use simple HTML/CSS (inline styles only - no external stylesheets)
2. Show the layout as a top-down view with colored boxes
3. Label each space with its name and dimensions
4. Show connections between spaces (doors, hallways, stairs)
5. Include a legend for space types/functions
6. Be responsive and readable
7. Use a simple grid-based layout (CSS Grid or Flexbox)

Example structure:
<div style="max-width:900px;margin:20px auto;font-family:Arial,sans-serif;background:#fff;padding:20px;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
  <h3 style="margin:0 0 15px 0;color:#333;">Location Layout Map</h3>
  <div style="display:grid;grid-template-columns:repeat(10,1fr);gap:4px;background:#ddd;padding:10px;border-radius:4px;">
    <div style="grid-column:span 3;background:#e3f2fd;border:2px solid #1976d2;padding:8px;border-radius:4px;">
      <strong style="color:#1565c0;">Main Hall</strong><br/>
      <small style="color:#666;">60×40 ft</small>
    </div>
    <!-- More spaces here -->
  </div>
  <div style="margin-top:15px;display:flex;gap:15px;flex-wrap:wrap;">
    <span style="display:flex;align-items:center;gap:5px;font-size:14px;">
      <div style="width:20px;height:20px;background:#e3f2fd;border:2px solid #1976d2;border-radius:3px;"></div>
      Public Spaces
    </span>
    <!-- More legend items -->
  </div>
</div>

Color-code spaces by function:
- Public/Common: Light Blue (#e3f2fd, border #1976d2)
- Private/Residential: Light Green (#e8f5e9, border #388e3c)
- Restricted/Military: Light Red (#ffebee, border #c62828)
- Service/Industrial: Light Yellow (#fff9c4, border #f57f17)

Output ONLY the HTML. No JSON wrapper. No markdown. No explanations.`,

  buildUserPrompt: (context: StageContext) => {
    return buildLocationVisualMapPrompt(context);
  },
};

/**
 * Stage 6: Accuracy Refinement
 * Provides super-accurate depiction after all details are complete
 */
export const LOCATION_CREATOR_ACCURACY_REFINEMENT = {
  id: 'location_accuracy',
  name: 'Accuracy Refinement',
  systemPrompt: `You are refining a D&D location for maximum accuracy. This is stage 5/5: Accuracy Refinement.

The location is complete. Your task is to review and refine for accuracy, consistency, and usability.

VALIDATION CHECKS (CRITICAL - OUTPUT AS proposals[] FOR USER DECISION):

1. DIMENSIONAL ACCURACY:
   - Check all space dimensions fit within overall footprint
   - Flag overlapping spaces (same coordinates or exceeding boundaries)
   - Report: dimensional_issues[] with {space_id, issue, recommendation}
   - For CRITICAL issues: Create proposal with options ["Resize to fit", "I'll fix in map editor", "Ignore (override)"]

2. CONNECTION CONSISTENCY:
   - Verify all door "leads_to" values reference valid space names (must match "name" field exactly)
   - Check for orphaned connections (doors leading to nonexistent spaces)
   - Report: connection_issues[] with {from_space, to_space, issue}
   - For CRITICAL issues: Create proposal with options ["Fix connection", "I'll fix in map editor", "Remove door"]

3. BASIC GEOMETRY:
   - Ensure door positions are on valid walls (north/south/east/west)
   - Check door widths are reasonable (3-10 ft typical for D&D)
   - Report: geometry_issues[] with {space_id, feature, issue}
   - For CRITICAL issues: Create proposal with options ["Auto-fix", "I'll fix in map editor", "Ignore"]

4. ACCESSIBILITY:
   - Verify all spaces are reachable from at least one entrance
   - Check for isolated spaces with no doors or connections
   - Report: accessibility_issues[] with {space_id, issue}
   - For CRITICAL issues: Create proposal with options ["Add suggested door", "I'll fix in map editor", "Intentionally isolated"]

OUTPUT FORMAT:
{
  "accuracy_report": {
    "dimensional_issues": [],
    "connection_issues": [],
    "geometry_issues": [],
    "accessibility_issues": [],
    "recommendations": []
  },
  "proposals": [
    // ONLY for CRITICAL issues that require user decision
    {
      "type": "error",
      "category": "dimensions|connections|geometry|accessibility",
      "question": "Specific issue description (e.g., 'Space "Great Hall" (60x80) exceeds foundation footprint (50x70). How to fix?')",
      "options": [
        "Option 1 (e.g., 'Resize to fit (50x70)')",
        "I'll fix in map editor",
        "Ignore (override)"
      ],
      "context": "Additional helpful context about the issue"
    }
  ],
  "refined_spaces": [],  // Auto-corrected spaces (if user chooses auto-fix option)
  "refined_details": {},
  "gm_notes": [],
  "tactical_summary": {
    "choke_points": [],
    "escape_routes": [],
    "defensible_positions": [],
    "hazards": []
  }
}

VALIDATION SCOPE:
- Focus ONLY on structural/geometric validation
- DO NOT validate physics, canon alignment, or lore consistency
- DO NOT create proposals for minor/informational issues - only CRITICAL problems
- Informational findings go in accuracy_report only

REFINEMENT FOCUS:
- Apply automatic corrections where safe (e.g., formatting, minor description fixes)
- Update refined_spaces with corrections
- Update refined_details with improvements
- Add tactical_summary to help GMs run encounters
- Provide GM notes for important location features

Return ONLY a JSON object with the specified fields. No markdown, no explanation.`,

  buildUserPrompt: (context: StageContext) => {
    return buildLocationAccuracyRefinementPrompt(context);
  },
};

/**
 * Complete Location Creator Pipeline (5 Stages)
 * Visual map is now generated incrementally during Spaces stage
 */
export const LOCATION_CREATOR_STAGES = [
  LOCATION_CREATOR_PURPOSE,
  LOCATION_CREATOR_FOUNDATION,
  LOCATION_CREATOR_SPACES,
  LOCATION_CREATOR_DETAILS,
  LOCATION_CREATOR_ACCURACY_REFINEMENT,
];
