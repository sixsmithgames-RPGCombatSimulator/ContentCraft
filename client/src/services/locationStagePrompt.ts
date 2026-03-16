import {
  createWorkflowStagePromptPayload,
  buildWorkflowStagePrompt,
  stripStageOutput,
  type GeneratorStagePromptContext as StageContext,
} from './stagePromptShared';
import { getTemplateById, type LocationTemplate } from '../config/locationTemplates';
import { getNormalizedWallMetadata } from '../utils/locationWallMetadata';

type PromptSpaceRecord = Record<string, unknown>;

function buildConstraintsPromptSection(template: LocationTemplate): string {
  let text = '\n## ARCHITECTURAL CONSTRAINTS\n\n';

  text += '### Room Size Guidelines\n';
  const roomTypes = Object.keys(template.constraints.room_size_constraints);
  for (const roomType of roomTypes) {
    const constraint = template.constraints.room_size_constraints[roomType];
    text += `- ${roomType}: ${constraint.min_width}-${constraint.max_width}ft wide, ${constraint.min_height}-${constraint.max_height}ft long\n`;
  }
  text += '\n';

  text += '### Door Specifications\n';
  text += `- Width: ${template.constraints.door_constraints.min_width}-${template.constraints.door_constraints.max_width}ft\n`;
  text += `- Position doors at least ${template.constraints.door_constraints.position_rules.min_from_corner}ft from corners\n`;
  text += `- Snap to ${template.constraints.door_constraints.position_rules.snap_to_grid}ft grid\n`;
  text += '\n';

  if (template.constraints.adjacency_rules.length > 0) {
    text += '### Adjacency Rules\n';
    for (const rule of template.constraints.adjacency_rules) {
      const relationshipText =
        rule.relationship === 'must_be_adjacent'
          ? 'MUST be adjacent to'
          : rule.relationship === 'should_be_adjacent'
            ? 'should be near'
            : 'MUST NOT be adjacent to';
      const reason = rule.reason ? ` (${rule.reason})` : '';
      text += `- ${rule.room_type_a} ${relationshipText} ${rule.room_type_b}${reason}\n`;
    }
    text += '\n';
  }

  if (template.constraints.structural_rules.length > 0) {
    text += '### Structural Requirements\n';
    for (const rule of template.constraints.structural_rules) {
      text += `- ${rule.constraint}\n`;
    }
    text += '\n';
  }

  return text;
}

function buildStylePromptSection(template: LocationTemplate): string {
  const style = template.architectural_style;
  let text = '\n## ARCHITECTURAL STYLE\n\n';

  text += '### Materials\n';
  text += `- Primary: ${style.materials.primary.join(', ')}\n`;
  text += `- Floors: ${style.materials.floors.join(', ')}\n`;
  text += `- Walls: ${style.materials.walls.join(', ')}\n`;
  text += '\n';

  text += '### Aesthetic\n';
  text += `- Door style: ${style.door_style}\n`;
  text += `- Lighting: ${style.lighting}\n`;
  text += `- Decorative elements: ${style.decorative_elements.join(', ')}\n`;
  text += '\n';

  return text;
}

function buildRoomTypeGuidance(template: LocationTemplate, currentIteration: number): string {
  const roomTypes = template.room_types;
  if (roomTypes.length === 0) return '';

  const roomType = roomTypes[currentIteration % roomTypes.length];

  let text = '\n## ROOM TYPE GUIDANCE\n';
  text += `For space #${currentIteration}, consider creating a **${roomType.type}**:\n\n`;
  text += `**Typical names**: ${roomType.typical_names.join(', ')}\n`;
  text += `**Purpose**: ${roomType.purpose}\n`;
  text += `**Common features**: ${roomType.features.join(', ')}\n`;

  if (roomType.adjacency_preferences.prefer_near.length > 0) {
    text += `**Should be near**: ${roomType.adjacency_preferences.prefer_near.join(', ')}\n`;
  }

  if (roomType.adjacency_preferences.avoid_near.length > 0) {
    text += `**Avoid placing near**: ${roomType.adjacency_preferences.avoid_near.join(', ')}\n`;
  }

  text += '\n';

  return text;
}

function isRecord(value: unknown): value is PromptSpaceRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getLocationTemplate(context: StageContext): LocationTemplate | undefined {
  const templateId = context.config.flags?.template_id as string | undefined;
  return getTemplateById(templateId) ?? undefined;
}

function getSpaceName(space: PromptSpaceRecord): string | undefined {
  return typeof space.name === 'string' && space.name.trim().length > 0 ? space.name.trim() : undefined;
}

function getSpaceType(space: PromptSpaceRecord): string | undefined {
  return typeof space.space_type === 'string' && space.space_type.trim().length > 0
    ? space.space_type.trim()
    : undefined;
}

function getSpaceSizeFtForPrompt(space: PromptSpaceRecord): { width?: number; height?: number } | undefined {
  if (isRecord(space.size_ft)) {
    return {
      width: getFiniteNumber(space.size_ft.width),
      height: getFiniteNumber(space.size_ft.height),
    };
  }

  if (isRecord(space.dimensions)) {
    return {
      width: getFiniteNumber(space.dimensions.width),
      height: getFiniteNumber(space.dimensions.height),
    };
  }

  return undefined;
}

function getOppositeWallForPrompt(wall: string): string | undefined {
  switch (wall) {
    case 'north':
      return 'south';
    case 'south':
      return 'north';
    case 'east':
      return 'west';
    case 'west':
      return 'east';
    default:
      return undefined;
  }
}

function getDoorsForPrompt(space: PromptSpaceRecord): Array<{
  wall: string;
  position_on_wall_ft: number;
  width_ft: number;
  leads_to: string;
}> {
  if (!Array.isArray(space.doors)) {
    return [];
  }

  return space.doors
    .filter(isRecord)
    .map((door) => {
      const wall = typeof door.wall === 'string' ? door.wall : undefined;
      const position_on_wall_ft = getFiniteNumber(door.position_on_wall_ft);
      const width_ft = getFiniteNumber(door.width_ft);
      const leads_to = typeof door.leads_to === 'string' ? door.leads_to.trim() : '';

      if (!wall || typeof position_on_wall_ft !== 'number' || typeof width_ft !== 'number' || leads_to.length === 0) {
        return null;
      }

      return {
        wall,
        position_on_wall_ft,
        width_ft,
        leads_to,
      };
    })
    .filter((door): door is NonNullable<typeof door> => door !== null);
}

function findReturnDoorStatus(
  sourceSpaceName: string,
  door: ReturnType<typeof getDoorsForPrompt>[number],
  allSpaces: PromptSpaceRecord[],
): {
  reciprocal_status: 'pending_target' | 'missing_target' | 'missing_return_door' | 'paired';
  expected_return_wall?: string;
} {
  if (door.leads_to === 'Pending') {
    return { reciprocal_status: 'pending_target' };
  }

  const targetSpace = allSpaces.find((space) => getSpaceName(space)?.toLowerCase() === door.leads_to.toLowerCase());
  if (!targetSpace) {
    return { reciprocal_status: 'missing_target' };
  }

  const expected_return_wall = getOppositeWallForPrompt(door.wall);
  const hasReturnDoor = getDoorsForPrompt(targetSpace).some((targetDoor) =>
    targetDoor.leads_to.toLowerCase() === sourceSpaceName.toLowerCase() &&
    (!expected_return_wall || targetDoor.wall === expected_return_wall)
  );

  return hasReturnDoor
    ? { reciprocal_status: 'paired', expected_return_wall }
    : { reciprocal_status: 'missing_return_door', expected_return_wall };
}

function getDominantWallThicknessFt(spaces: PromptSpaceRecord[]): number | undefined {
  const counts = new Map<number, number>();

  for (const space of spaces) {
    const thickness = getNormalizedWallMetadata(space).wallThicknessFt;
    if (typeof thickness !== 'number') continue;
    counts.set(thickness, (counts.get(thickness) || 0) + 1);
  }

  let bestValue: number | undefined;
  let bestCount = 0;
  for (const [value, count] of counts.entries()) {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  }

  return bestValue;
}

export function getLocationPromptSpaces(stageResults: StageContext['stageResults']): PromptSpaceRecord[] {
  const rawSpaces = stageResults.spaces
    ? (stageResults.spaces as Record<string, unknown>).spaces || []
    : [];

  return Array.isArray(rawSpaces)
    ? rawSpaces.filter(isRecord)
    : [];
}

export function buildLocationSpacesSpatialContext(allSpaces: PromptSpaceRecord[]): Record<string, unknown> | undefined {
  if (allSpaces.length === 0) {
    return undefined;
  }

  const recentSpaces = allSpaces.slice(-5);
  const connectionGaps: Array<Record<string, unknown>> = [];

  const recentSpaceSummary = recentSpaces.map((space) => {
    const name = getSpaceName(space) || 'Unnamed Space';
    const wallMetadata = getNormalizedWallMetadata(space);
    const size_ft = getSpaceSizeFtForPrompt(space);
    const doors = getDoorsForPrompt(space).map((door) => {
      const returnStatus = findReturnDoorStatus(name, door, allSpaces);

      if (returnStatus.reciprocal_status !== 'paired') {
        connectionGaps.push({
          from_space: name,
          wall: door.wall,
          position_on_wall_ft: door.position_on_wall_ft,
          width_ft: door.width_ft,
          leads_to: door.leads_to,
          issue: returnStatus.reciprocal_status,
          expected_return_wall: returnStatus.expected_return_wall,
        });
      }

      return {
        wall: door.wall,
        position_on_wall_ft: door.position_on_wall_ft,
        width_ft: door.width_ft,
        leads_to: door.leads_to,
        reciprocal_status: returnStatus.reciprocal_status,
        expected_return_wall: returnStatus.expected_return_wall,
      };
    });

    return {
      name,
      purpose: typeof space.purpose === 'string' ? space.purpose : undefined,
      size_ft,
      wall_thickness_ft: wallMetadata.wallThicknessFt,
      wall_material: wallMetadata.wallMaterial,
      doors,
    };
  });

  return {
    generated_space_count: allSpaces.length,
    generated_space_names: allSpaces.map((space) => getSpaceName(space)).filter((name): name is string => !!name),
    dominant_wall_thickness_ft: getDominantWallThicknessFt(allSpaces),
    recent_space_summary: recentSpaceSummary,
    connection_gaps: connectionGaps,
  };
}

export function buildLocationSpacesPromptBase(context: StageContext): {
  userPrompt: Record<string, unknown>;
  scale: string;
  spatialContext?: Record<string, unknown>;
} {
  const purpose = stripStageOutput(context.stageResults.purpose || {});
  const foundation = stripStageOutput(context.stageResults.foundation || {});
  const scale = typeof purpose.scale === 'string' ? purpose.scale : 'moderate';
  const allSpaces = getLocationPromptSpaces(context.stageResults);
  const spatialContext = buildLocationSpacesSpatialContext(allSpaces);

  const userPrompt = createWorkflowStagePromptPayload({
    context,
    deliverable: 'location',
    stage: 'spaces',
    promptKey: 'request',
    previousDecisionsKey: 'decisions',
    payload: {
      purpose: { name: purpose.name, location_type: purpose.location_type, scale: purpose.scale },
      foundation: { layout: foundation.layout, key_areas: foundation.key_areas },
      recent_spaces: spatialContext ? spatialContext.recent_space_summary : [],
      spatial_context: spatialContext,
      instructions: '',
    },
  });

  return { userPrompt, scale, spatialContext };
}

export function buildLocationFoundationPrompt(context: StageContext): string {
  const purpose = stripStageOutput(context.stageResults.purpose || {});
  const scale = purpose.scale || 'moderate';
  const locationType = purpose.location_type || 'location';
  const template = getLocationTemplate(context);

  let instructions = `Generate the structural foundation for this ${locationType} (scale: ${scale}).

${scale === 'simple' || scale === 'moderate'
  ? 'Keep it simple - just layout, dimensions, and spatial organization. No complex topology needed.'
  : 'This is complex - provide detailed topology with wings, floors, locking points, and constraints for geometric validation.'
}

CRITICAL: Include chunk_mesh_metadata to enable seamless integration when spaces are generated iteratively.`;

  if (template) {
    instructions += buildConstraintsPromptSection(template);
    instructions += buildStylePromptSection(template);
    instructions += `\n## LAYOUT PHILOSOPHY\n${template.layout_philosophy}\n`;
  }

  return buildWorkflowStagePrompt({
    context,
    deliverable: 'location',
    stage: 'foundation',
    promptKey: 'request',
    payload: {
      purpose,
      instructions,
    },
  });
}

export function buildLocationSpacesChunkPlan(context: StageContext): {
  shouldChunk: boolean;
  totalChunks: number;
  chunkSize: number;
} {
  const purpose = context.stageResults.purpose as Record<string, unknown> | undefined;

  let estimatedSpaces: number | undefined;

  if (purpose?.estimated_spaces !== undefined) {
    if (typeof purpose.estimated_spaces === 'number') {
      estimatedSpaces = purpose.estimated_spaces;
    } else if (typeof purpose.estimated_spaces === 'string') {
      estimatedSpaces = parseInt(purpose.estimated_spaces, 10);
    }
  }

  if (!estimatedSpaces && purpose?.scale) {
    const scale = String(purpose.scale).toLowerCase();
    if (scale.includes('simple')) estimatedSpaces = 3;
    else if (scale.includes('moderate')) estimatedSpaces = 12;
    else if (scale.includes('complex')) estimatedSpaces = 30;
    else if (scale.includes('massive')) estimatedSpaces = 50;
  }

  if (estimatedSpaces && estimatedSpaces > 1) {
    return {
      shouldChunk: true,
      totalChunks: estimatedSpaces,
      chunkSize: 1,
    };
  }

  return {
    shouldChunk: false,
    totalChunks: 1,
    chunkSize: 1,
  };
}

export function buildLocationSpacesPrompt(context: StageContext): string {
  const { userPrompt, scale, spatialContext } = buildLocationSpacesPromptBase(context);
  const template = getLocationTemplate(context);
  const rejectionFeedback = context.config.flags?.rejection_feedback as string | undefined;
  const rejectionContext = isRecord(context.config.flags?.rejection_context)
    ? context.config.flags.rejection_context
    : undefined;

  if (rejectionContext) {
    userPrompt.rejection_context = rejectionContext;
  }

  if (context.chunkInfo) {
    const spaceNumber = context.chunkInfo.currentChunk;
    const totalSpaces = context.chunkInfo.totalChunks;

    userPrompt.chunk_info = `Space ${spaceNumber}/${totalSpaces}`;

    let instructions = `Generate space #${spaceNumber}. Review recent_spaces${spatialContext ? ' and spatial_context' : ''} for context. Use mesh_anchors to link.

CRITICAL: All door "leads_to" values MUST use exact space names from the "name" field (e.g., "Southeast Outer Ward"), NOT codes or abbreviations. This is required for spatial layout to work.
- If you connect to an existing space, place the new door so a reciprocal door can exist on the opposite wall with aligned center points.

${scale === 'complex' || scale === 'massive' ? 'Add proposals[] if conflicts.' : ''}`;

    if (spatialContext) {
      instructions += `
- Use spatial_context.generated_space_names as the canonical list of already-created rooms.
- If spatial_context.connection_gaps shows a pending or missing return connection, prefer resolving one of those gaps when it fits this next space.
- Unless the request or prior rooms clearly justify an exception, match spatial_context.dominant_wall_thickness_ft for new connected rooms.`;
    }

    if (rejectionFeedback) {
      instructions = rejectionFeedback + '\n\n' + instructions;
    }

    if (rejectionContext) {
      instructions += `
- The rejection_context object contains the exact issues from the rejected room. Address those issues directly.
- Use rejection_context.retry_focus to avoid repeating the same geometry or door mistake.
- Replace the rejected room with a better fit for this chunk instead of resubmitting the same layout with cosmetic changes.`;
    }

    const strictRoomAdherence = context.config.flags?.strict_room_adherence as boolean | undefined;
    if (strictRoomAdherence) {
      instructions = `
⚠️ STRICT MODE ENABLED ⚠️
You MUST ONLY generate rooms that are EXPLICITLY listed in the user's request.
DO NOT add any extra rooms, guard posts, storage areas, or any other spaces that were not specifically requested.
If the user listed 3 rooms, you generate EXACTLY 3 rooms - no more, no less.
Review the "request" field carefully to identify which rooms the user wants.

` + instructions;
    }

    if (template) {
      instructions += buildRoomTypeGuidance(template, spaceNumber);
      instructions += '\n## CONSTRAINT REMINDERS\n';
      instructions += `- Door widths: ${template.constraints.door_constraints.min_width}-${template.constraints.door_constraints.max_width}ft\n`;
      instructions += `- Door positions: at least ${template.constraints.door_constraints.position_rules.min_from_corner}ft from corners\n`;
      instructions += '- Follow room size guidelines from Foundation stage\n';
    }

    userPrompt.instructions = instructions;
  } else {
    userPrompt.instructions = 'Generate next space with mesh_anchors.';
  }

  return JSON.stringify(userPrompt, null, 2);
}

export function buildLocationDetailsPrompt(context: StageContext): string {
  const purpose = stripStageOutput(context.stageResults.purpose || {});
  const foundation = stripStageOutput(context.stageResults.foundation || {});
  const spacesResult = stripStageOutput(context.stageResults.spaces || {});
  const allSpaces = Array.isArray(spacesResult.spaces)
    ? (spacesResult.spaces as Record<string, unknown>[])
    : [];
  const spaceSummary = allSpaces.map((space) => ({
    id: space.id,
    name: space.name,
    purpose: space.purpose,
    dimensions: space.dimensions,
  }));

  return buildWorkflowStagePrompt({
    context,
    deliverable: 'location',
    stage: 'details',
    promptKey: 'request',
    payload: {
      structure: {
        name: purpose.name,
        type: purpose.location_type,
        scale: purpose.scale,
        layout: foundation.layout,
        total_spaces: spaceSummary.length,
        space_list: spaceSummary,
      },
      instructions: 'Add rich narrative details. Include: materials, lighting, atmosphere, inhabitants, encounter areas, secrets, treasure, history, current events, adventure hooks, cinematic walkthrough.',
    },
  });
}

export function buildLocationAccuracyRefinementPrompt(context: StageContext): string {
  const purpose = stripStageOutput(context.stageResults.purpose || {});
  const foundation = stripStageOutput(context.stageResults.foundation || {});
  const spaces = stripStageOutput(context.stageResults.spaces || {});
  const details = stripStageOutput(context.stageResults.details || {});

  const layout = (foundation as Record<string, unknown>).layout;
  const layoutObj = typeof layout === 'object' && layout !== null ? (layout as Record<string, unknown>) : null;
  const dims = layoutObj ? layoutObj.dimensions : null;
  const dimsObj = typeof dims === 'object' && dims !== null ? (dims as Record<string, unknown>) : null;
  const footprintLength = dimsObj?.length;
  const footprintWidth = dimsObj?.width;
  const spaceCount = Array.isArray(spaces.spaces) ? spaces.spaces.length : 0;

  return buildWorkflowStagePrompt({
    context,
    deliverable: 'location',
    stage: 'accuracy_refinement',
    promptKey: 'request',
    payload: {
      complete_location: {
        purpose,
        foundation,
        spaces,
        details,
      },
      instructions: `Perform geometric validation and accuracy refinement on this ${purpose.location_type || 'location'}.

VALIDATION TASKS (Review ALL ${spaceCount} spaces):

1. DIMENSIONAL ACCURACY:
   - Footprint: ${typeof footprintLength === 'string' ? footprintLength : (typeof footprintLength === 'number' ? String(footprintLength) : 'Unknown')} × ${typeof footprintWidth === 'string' ? footprintWidth : (typeof footprintWidth === 'number' ? String(footprintWidth) : 'Unknown')}
   - Check each space fits within boundaries
   - Flag overlapping coordinates
   - Create proposals[] for CRITICAL conflicts

2. CONNECTION CONSISTENCY:
   - Verify door "leads_to" values match actual space names
   - Check for orphaned connections (leading nowhere)
   - Create proposals[] for broken connections

3. BASIC GEOMETRY:
   - Door positions valid for walls (north/south/east/west)
   - Door widths reasonable (3-10 ft)
   - Create proposals[] for impossible geometry

4. ACCESSIBILITY:
   - All spaces reachable from entrance
   - No isolated spaces (unless intentional)
   - Create proposals[] for unreachable areas

OUTPUTS REQUIRED:
1. accuracy_report: Detailed findings for all validation checks
2. proposals: ONLY for CRITICAL issues requiring user decision
   - Include 3 options: auto-fix, manual fix in editor, or ignore
   - Be specific about the issue and consequences
3. refined_spaces: Auto-corrected spaces (apply safe fixes)
4. refined_details: Improved details section
5. gm_notes: Important notes for running this location
6. tactical_summary: Combat/encounter guidance (choke points, escapes, hazards)

VALIDATION SCOPE:
- Structural/geometric only
- DO NOT validate physics, canon, or lore
- Focus on playability and correctness

Be thorough and precise - this is the final quality check before delivery.`,
    },
  });
}

function formatSpaceSizeLabel(space: PromptSpaceRecord): string {
  const size = getSpaceSizeFtForPrompt(space);
  if (typeof size?.width === 'number' && typeof size?.height === 'number') {
    return `${size.width} x ${size.height} ft`;
  }

  return 'size unknown';
}

function buildVisualMapSpaceLine(space: PromptSpaceRecord): string {
  const name = getSpaceName(space) || 'Unnamed Space';
  const type = getSpaceType(space) || 'room';
  const purpose = typeof space.purpose === 'string' && space.purpose.trim().length > 0
    ? space.purpose.trim()
    : undefined;
  const doorSummary = getDoorsForPrompt(space)
    .map((door) => `${door.wall} -> ${door.leads_to}`)
    .join('; ');
  const wallMetadata = getNormalizedWallMetadata(space);

  const parts = [`${name} [${type}]`, `size ${formatSpaceSizeLabel(space)}`];
  if (purpose) parts.push(`purpose: ${purpose}`);
  if (typeof wallMetadata.wallThicknessFt === 'number') {
    parts.push(`walls: ${wallMetadata.wallThicknessFt} ft ${wallMetadata.wallMaterial || 'unknown material'}`);
  }
  if (doorSummary.length > 0) {
    parts.push(`doors: ${doorSummary}`);
  }

  return `- ${parts.join(' | ')}`;
}

function buildVisualMapConnectionLines(allSpaces: PromptSpaceRecord[]): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];

  for (const space of allSpaces) {
    const fromName = getSpaceName(space);
    if (!fromName) continue;

    for (const door of getDoorsForPrompt(space)) {
      const key = `${fromName}|${door.wall}|${door.position_on_wall_ft}|${door.leads_to}`;
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(`- ${fromName}: ${door.wall} door at ${door.position_on_wall_ft} ft -> ${door.leads_to}`);
    }
  }

  return lines;
}

function buildLimitedVisualMapSection(lines: string[], maxChars: number, emptyMessage: string): string {
  if (lines.length === 0) {
    return emptyMessage;
  }

  const selected: string[] = [];
  let currentChars = 0;

  for (const line of lines) {
    const nextChars = currentChars + line.length + 1;
    if (selected.length > 0 && nextChars > maxChars) {
      break;
    }
    selected.push(line);
    currentChars = nextChars;
  }

  if (selected.length < lines.length) {
    selected.push(`- ...and ${lines.length - selected.length} more entries`);
  }

  return selected.join('\n');
}

export function buildLocationVisualMapPrompt(context: StageContext): string {
  const purpose = stripStageOutput(context.stageResults.purpose || {});
  const allSpaces = getLocationPromptSpaces(context.stageResults);
  const spaceLines = allSpaces.map((space) => buildVisualMapSpaceLine(space));
  const connectionLines = buildVisualMapConnectionLines(allSpaces);

  const spacesSection = buildLimitedVisualMapSection(spaceLines, 2800, '- No generated spaces yet.');
  const connectionsSection = buildLimitedVisualMapSection(connectionLines, 1600, '- No explicit door connections recorded yet.');

  return `Create a simple HTML visual map showing the ${purpose.location_type || 'location'} layout.

LOCATION: ${purpose.name || 'Unnamed Location'}
SCALE: ${purpose.scale || 'moderate'}
TOTAL SPACES: ${allSpaces.length}

Use the ACTUAL generated spaces below. Do not invent replacement names, omit listed rooms, or change dimensions unless the source data is missing.

SPACES
${spacesSection}

CONNECTIONS
${connectionsSection}

Use a grid-based or top-down layout where each space is represented by a colored box with its name and dimensions.
Color-code by function:
- Public/Common spaces: Light Blue
- Private/Residential areas: Light Green
- Restricted/Military zones: Light Red
- Service/Industrial areas: Light Yellow

If doors or stairs are listed in CONNECTIONS, reflect those relationships in the layout using arrows, labels, or lines.
Include a legend. Keep the result readable for a GM at a glance.

CRITICAL: Output PURE HTML ONLY. NO JSON wrapper. NO markdown code blocks. NO explanations.
Start immediately with <div> and end with </div>.`;
}
