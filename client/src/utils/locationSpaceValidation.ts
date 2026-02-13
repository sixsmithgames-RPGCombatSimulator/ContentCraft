/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

type JsonRecord = Record<string, unknown>;

type ValidationIssue = {
  path: string;
  message: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getRoomSizeFt(space: JsonRecord, issues: ValidationIssue[]): { width: number; height: number } | null {
  const sizeFt = space.size_ft;
  if (isRecord(sizeFt)) {
    const w = getNumber(sizeFt.width);
    const h = getNumber(sizeFt.height);
    if (w !== null && h !== null) return { width: w, height: h };
    issues.push({
      path: 'size_ft',
      message: `Expected size_ft to be { width:number, height:number } (got ${JSON.stringify(sizeFt)})`,
    });
    return null;
  }

  const dims = space.dimensions;
  if (isRecord(dims)) {
    const w = getNumber(dims.width);
    const h = getNumber(dims.height);
    if (w !== null && h !== null) return { width: w, height: h };
    issues.push({
      path: 'dimensions',
      message: `Expected dimensions to be { width:number, height:number, unit?:"ft" } (got ${JSON.stringify(dims)})`,
    });
    return null;
  }

  issues.push({
    path: 'size_ft',
    message: 'Missing size_ft. Provide size_ft { width, height } in feet (required for map rendering).',
  });
  return null;
}

function formatIssues(title: string, issues: ValidationIssue[]): string {
  const lines: string[] = [title, ''];
  issues.forEach((i) => {
    lines.push(`- ${i.path}: ${i.message}`);
  });
  return lines.join('\n');
}

export type LocationSpaceValidationOptions = {
  requireFeaturePositionAnchor?: boolean;
};

export function validateIncomingLocationSpace(
  space: unknown,
  options: LocationSpaceValidationOptions = {}
): { ok: true } | { ok: false; error: string } {
  if (!isRecord(space)) {
    return {
      ok: false,
      error: `Invalid space: expected a JSON object but got ${typeof space}.`,
    };
  }

  const issues: ValidationIssue[] = [];

  const name = space.name;
  if (typeof name !== 'string' || name.trim().length === 0) {
    issues.push({ path: 'name', message: 'Name is required and must be a non-empty string.' });
  }

  const roomSize = getRoomSizeFt(space, issues);

  const doors = space.doors;
  if (doors !== undefined) {
    if (!Array.isArray(doors)) {
      issues.push({ path: 'doors', message: 'Doors must be an array.' });
    } else {
      doors.forEach((d, idx) => {
        if (!isRecord(d)) {
          issues.push({ path: `doors[${idx}]`, message: 'Door must be an object.' });
          return;
        }

        const wall = d.wall;
        if (wall !== 'north' && wall !== 'south' && wall !== 'east' && wall !== 'west') {
          issues.push({
            path: `doors[${idx}].wall`,
            message: 'wall must be one of: north|south|east|west.',
          });
        }

        if (d.position !== undefined) {
          issues.push({
            path: `doors[${idx}].position`,
            message: 'Do not use `position`. Use `position_on_wall_ft` (absolute feet from wall start, representing door center).',
          });
        }

        if (d.width !== undefined) {
          issues.push({
            path: `doors[${idx}].width`,
            message: 'Do not use `width`. Use `width_ft` (feet).',
          });
        }

        // Note: Both 'style' and 'door_type' are accepted for backward compatibility
        // 'style' is preferred for internal use, 'door_type' for AI generation
        const doorType = d.style || d.door_type;
        if (typeof doorType !== 'string' || doorType.trim().length === 0) {
          issues.push({
            path: `doors[${idx}].style or door_type`,
            message: 'Door must have "style" or "door_type" (e.g., "wooden", "stone", "metal", "archway", "secret", "opening").',
          });
        }

        const pos = getNumber(d.position_on_wall_ft);
        if (pos === null) {
          issues.push({
            path: `doors[${idx}].position_on_wall_ft`,
            message: 'position_on_wall_ft is required and must be a number representing feet from wall start (door center position).',
          });
        } else if (pos < 0) {
          issues.push({
            path: `doors[${idx}].position_on_wall_ft`,
            message: `position_on_wall_ft cannot be negative (got ${pos}ft).`,
          });
        }
        // Note: Upper bound validation requires knowing wall length, which is validated at runtime in reducer

        const widthFt = getNumber(d.width_ft);
        if (widthFt === null) {
          issues.push({
            path: `doors[${idx}].width_ft`,
            message: 'width_ft is required and must be a number (feet).',
          });
        } else if (widthFt <= 0) {
          issues.push({
            path: `doors[${idx}].width_ft`,
            message: `width_ft must be > 0 (got ${widthFt}ft).`,
          });
        }

        const leadsTo = d.leads_to;
        if (typeof leadsTo !== 'string' || leadsTo.trim().length === 0) {
          issues.push({
            path: `doors[${idx}].leads_to`,
            message: 'leads_to is required and must be a non-empty string (or "Pending").',
          });
        }
      });
    }
  }

  const features = space.features;
  if (features !== undefined) {
    if (!Array.isArray(features)) {
      issues.push({ path: 'features', message: 'Features must be an array.' });
    } else {
      features.forEach((f, idx) => {
        if (!isRecord(f)) {
          issues.push({ path: `features[${idx}]`, message: 'Feature must be an object.' });
          return;
        }

        if (f.position_ft !== undefined) {
          issues.push({
            path: `features[${idx}].position_ft`,
            message: 'Do not use position_ft in AI output. Use position: { x, y } (feet) relative to room top-left.',
          });
        }

        const posAnchor = f.position_anchor;
        if (options.requireFeaturePositionAnchor && posAnchor === undefined) {
          issues.push({
            path: `features[${idx}].position_anchor`,
            message: 'position_anchor is required for features and must be "center" (prevents top-left vs center ambiguity).',
          });
        }

        if (posAnchor !== undefined && posAnchor !== 'center') {
          issues.push({
            path: `features[${idx}].position_anchor`,
            message: 'If provided, position_anchor must be "center". This app interprets position as the feature CENTER point.',
          });
        }

        const pos = f.position;
        if (!isRecord(pos)) {
          issues.push({
            path: `features[${idx}].position`,
            message: 'position is required and must be { x:number, y:number } in feet, relative to room top-left.',
          });
          return;
        }

        const x = getNumber(pos.x);
        const y = getNumber(pos.y);

        if (x === null || y === null) {
          issues.push({
            path: `features[${idx}].position`,
            message: `position.x and position.y must be finite numbers (got ${JSON.stringify(pos)}).`,
          });
          return;
        }

        if (roomSize) {
          if (x < 0 || x > roomSize.width || y < 0 || y > roomSize.height) {
            issues.push({
              path: `features[${idx}].position`,
              message: `Feature center must be within room bounds: x in [0,${roomSize.width}], y in [0,${roomSize.height}] (got x=${x}, y=${y}).`,
            });
          }
        }

        const shape = f.shape;
        if (shape !== 'rectangle' && shape !== 'circle') {
          issues.push({
            path: `features[${idx}].shape`,
            message: 'shape is required and must be "rectangle" or "circle".',
          });
          return;
        }

        if (shape === 'circle') {
          const radiusFt = getNumber(f.radius);
          if (radiusFt === null) {
            issues.push({
              path: `features[${idx}].radius`,
              message: 'Circle features must include radius (feet). Do not use width/height for circles.',
            });
            return;
          }

          if (roomSize) {
            if (x - radiusFt < 0 || x + radiusFt > roomSize.width || y - radiusFt < 0 || y + radiusFt > roomSize.height) {
              issues.push({
                path: `features[${idx}]`,
                message: `Circle must fit inside room when center-anchored. Require x in [r, W-r], y in [r, H-r] (W=${roomSize.width}, H=${roomSize.height}, r=${radiusFt}, x=${x}, y=${y}).`,
              });
            }
          }
          return;
        }

        const wFt = getNumber(f.width);
        const hFt = getNumber(f.height);
        if (wFt === null || hFt === null) {
          issues.push({
            path: `features[${idx}]`,
            message: 'Rectangle features must include width and height (feet).',
          });
          return;
        }

        if (roomSize) {
          if (x - wFt / 2 < 0 || x + wFt / 2 > roomSize.width || y - hFt / 2 < 0 || y + hFt / 2 > roomSize.height) {
            issues.push({
              path: `features[${idx}]`,
              message: `Rectangle must fit inside room when center-anchored. Require x in [w/2, W-w/2], y in [h/2, H-h/2] (W=${roomSize.width}, H=${roomSize.height}, w=${wFt}, h=${hFt}, x=${x}, y=${y}). If you used top-left anchoring, recompute using the rectangle center.`,
            });
          }
        }
      });
    }
  }

  if (issues.length > 0) {
    return {
      ok: false,
      error: formatIssues(
        'Incoming space JSON failed strict validation. Fix the fields below or regenerate with the updated prompt.',
        issues
      ),
    };
  }

  return { ok: true };
}
