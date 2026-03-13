import type { LiveMapSpace } from '../types/liveMapTypes';
import {
  buildRoomPreviewDoorRender,
  buildRoomPreviewLayout,
} from './locationRoomPreview';
import type { SpaceColorScheme } from './locationMapDocument';

export function requireLocationSpaceSizeFt(space: LiveMapSpace): { width: number; height: number } {
  const sizeFt = space.size_ft;
  if (sizeFt && typeof sizeFt === 'object') {
    const width = (sizeFt as { width?: unknown }).width;
    const height = (sizeFt as { height?: unknown }).height;
    if (typeof width === 'number' && Number.isFinite(width) && typeof height === 'number' && Number.isFinite(height)) {
      return { width, height };
    }
  }

  const dims = space.dimensions;
  if (dims && typeof dims === 'object') {
    const width = (dims as { width?: unknown }).width;
    const height = (dims as { height?: unknown }).height;
    if (typeof width === 'number' && Number.isFinite(width) && typeof height === 'number' && Number.isFinite(height)) {
      return { width, height };
    }
  }

  if (typeof dims === 'string') {
    const numbers = dims.match(/\d+(?:\.\d+)?/g);
    if (numbers && numbers.length >= 2) {
      const width = Number(numbers[0]);
      const height = Number(numbers[1]);
      if (Number.isFinite(width) && Number.isFinite(height)) {
        return { width, height };
      }
    }
  }

  throw new Error(
    `Space "${space.name}" is missing valid size_ft or dimensions { width, height } (feet). ` +
      `Got size_ft=${JSON.stringify(space.size_ft)} dimensions=${JSON.stringify(space.dimensions)}`
  );
}

export function getLocationSpaceDimsForKey(space: LiveMapSpace): { width?: number; height?: number } {
  if (space.size_ft) {
    return { width: space.size_ft.width, height: space.size_ft.height };
  }

  const dims = space.dimensions;
  if (dims && typeof dims === 'object') {
    const width = typeof dims.width === 'number' ? dims.width : undefined;
    const height = typeof dims.height === 'number' ? dims.height : undefined;
    return { width, height };
  }

  return { width: undefined, height: undefined };
}

function generateTexturePatterns(): string {
  return `
    <!-- Stone texture -->
    <pattern id="stone_texture" width="20" height="20" patternUnits="userSpaceOnUse">
      <rect width="20" height="20" fill="#999" />
      <path d="M 0 5 L 5 0 L 10 0 L 15 5 L 10 10 L 5 10 Z" fill="#AAA" opacity="0.3" />
      <path d="M 10 15 L 15 10 L 20 10 L 20 15 L 15 20 L 10 20 Z" fill="#888" opacity="0.3" />
    </pattern>

    <!-- Wood grain -->
    <pattern id="wood_grain" width="40" height="40" patternUnits="userSpaceOnUse">
      <rect width="40" height="40" fill="#8B4513" />
      <path d="M 0 10 Q 20 8 40 10" stroke="#654321" stroke-width="1" fill="none" opacity="0.4" />
      <path d="M 0 25 Q 20 27 40 25" stroke="#654321" stroke-width="1" fill="none" opacity="0.4" />
    </pattern>

    <!-- Cobblestone -->
    <pattern id="cobblestone" width="30" height="30" patternUnits="userSpaceOnUse">
      <ellipse cx="7" cy="7" rx="6" ry="5" fill="#888" />
      <ellipse cx="22" cy="7" rx="5" ry="6" fill="#999" />
      <ellipse cx="7" cy="22" rx="6" ry="5" fill="#999" />
      <ellipse cx="22" cy="22" rx="5" ry="6" fill="#AAA" />
    </pattern>

    <!-- Tile -->
    <pattern id="tile_pattern" width="20" height="20" patternUnits="userSpaceOnUse">
      <rect width="20" height="20" fill="#DDD" />
      <rect x="0" y="0" width="19" height="19" fill="none" stroke="#AAA" stroke-width="0.5" />
    </pattern>
  `;
}

function generateWalls(
  walls: unknown[],
  space: LiveMapSpace,
  previewLayout: ReturnType<typeof buildRoomPreviewLayout>
): { patterns: string; svg: string } {
  if (walls.length === 0) {
    const spaceRecord = space as unknown as Record<string, unknown>;
    const material = typeof spaceRecord.wall_material === 'string'
      ? spaceRecord.wall_material
      : 'stone';

    const wallColor = material === 'wood' ? '#8B4513' :
      material === 'brick' ? '#A0522D' :
      '#6B6B6B';

    const spaceName = typeof spaceRecord.name === 'string' ? spaceRecord.name : 'room';
    const patternId = `hatch-${spaceName.replace(/[^a-zA-Z0-9-]/g, '_')}`;

    const patterns = `
      <pattern id="${patternId}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke="${wallColor}" stroke-width="1.5" opacity="1" />
      </pattern>
    `;

    const svg = `
      <rect x="${previewLayout.outerX}" y="${previewLayout.outerY}" width="${previewLayout.outerWidthPx}" height="${previewLayout.wallThicknessPx}" fill="url(#${patternId})" />
      <rect x="${previewLayout.outerX}" y="${previewLayout.outerY + previewLayout.outerHeightPx - previewLayout.wallThicknessPx}" width="${previewLayout.outerWidthPx}" height="${previewLayout.wallThicknessPx}" fill="url(#${patternId})" />
      <rect x="${previewLayout.outerX}" y="${previewLayout.outerY}" width="${previewLayout.wallThicknessPx}" height="${previewLayout.outerHeightPx}" fill="url(#${patternId})" />
      <rect x="${previewLayout.outerX + previewLayout.outerWidthPx - previewLayout.wallThicknessPx}" y="${previewLayout.outerY}" width="${previewLayout.wallThicknessPx}" height="${previewLayout.outerHeightPx}" fill="url(#${patternId})" />
    `;

    return { patterns, svg };
  }

  const wallsBySide: Record<string, Array<Record<string, unknown>>> = {};
  for (const wallUnknown of walls) {
    const wall = typeof wallUnknown === 'object' && wallUnknown !== null ? (wallUnknown as Record<string, unknown>) : {};
    const side = typeof wall.side === 'string' ? wall.side : 'unknown';
    if (!wallsBySide[side]) {
      wallsBySide[side] = [];
    }
    wallsBySide[side].push(wall);
  }

  const uniqueSides = Object.keys(wallsBySide).length;
  if (walls.length > uniqueSides * 2) {
    const spaceRecord = space as unknown as Record<string, unknown>;
    const spaceName = typeof spaceRecord.name === 'string' ? spaceRecord.name : 'Unknown';
    console.log(`[HTML Export] Room "${spaceName}": deduplicated ${walls.length} walls to ${uniqueSides} sides`);
  }

  const uniqueWalls = Object.entries(wallsBySide).map(([side, sideWalls]) => {
    const thicknesses = sideWalls
      .map((wall) => typeof wall.thickness === 'number' ? wall.thickness : 0)
      .filter((thickness) => thickness > 0);
    const avgThickness = thicknesses.length > 0
      ? thicknesses.reduce((sum, thickness) => sum + thickness, 0) / thicknesses.length
      : 3;

    const firstWall = sideWalls[0];

    return {
      side,
      thickness: avgThickness,
      color: typeof firstWall.color === 'string' ? firstWall.color : '#6B6B6B',
      material: typeof firstWall.material === 'string' ? firstWall.material : 'stone',
    };
  });

  const spaceRecord = space as unknown as Record<string, unknown>;
  const spaceName = typeof spaceRecord.name === 'string' ? spaceRecord.name : 'room';
  const patternId = `hatch-${spaceName.replace(/[^a-zA-Z0-9-]/g, '_')}`;
  const firstWall = uniqueWalls[0];
  const wallColor = firstWall.material === 'wood' ? '#8B4513' :
    firstWall.material === 'brick' ? '#A0522D' :
    firstWall.color;

  const patterns = `
    <pattern id="${patternId}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="${wallColor}" stroke-width="1.5" opacity="1" />
    </pattern>
  `;

  const svg = uniqueWalls.map((wall) => {
    const thickness = wall.thickness * previewLayout.scaleFactor;

    let x = previewLayout.outerX;
    let y = previewLayout.outerY;
    let width = previewLayout.outerWidthPx;
    let height = thickness;

    switch (wall.side) {
      case 'north':
        y = previewLayout.outerY;
        break;
      case 'south':
        y = previewLayout.outerY + previewLayout.outerHeightPx - thickness;
        break;
      case 'east':
        x = previewLayout.outerX + previewLayout.outerWidthPx - thickness;
        width = thickness;
        height = previewLayout.outerHeightPx;
        break;
      case 'west':
        x = previewLayout.outerX;
        width = thickness;
        height = previewLayout.outerHeightPx;
        break;
    }

    return `
      <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="url(#${patternId})" />
    `;
  }).join('');

  return { patterns, svg };
}

function generateDoors(
  doors: unknown[],
  previewLayout: ReturnType<typeof buildRoomPreviewLayout>
): string {
  return doors.map((doorUnknown) => {
    const doorRender = buildRoomPreviewDoorRender(doorUnknown, previewLayout);
    if (!doorRender) {
      return '';
    }

    return `
      <rect x="${doorRender.x}" y="${doorRender.y}" width="${doorRender.width}" height="${doorRender.height}"
            fill="${doorRender.fill}"
            stroke="#000"
            stroke-width="${doorRender.strokeWidth}"
            rx="${doorRender.rx}" />
      ${doorRender.leadsTo ? `
        <text x="${doorRender.labelX}" y="${doorRender.labelY}"
              text-anchor="${doorRender.labelAnchor}"
              font-family="Arial, sans-serif"
              font-size="9"
              font-weight="600"
              fill="#1f2937">
          → ${doorRender.leadsTo.length > 15 ? doorRender.leadsTo.substring(0, 12) + '...' : doorRender.leadsTo}
        </text>
      ` : ''}
    `;
  }).join('');
}

function generateFeatures(
  features: unknown[],
  roomX: number,
  roomY: number,
  scaleFactor: number
): string {
  return features.map((featureUnknown) => {
    const feature = typeof featureUnknown === 'object' && featureUnknown !== null ? (featureUnknown as Record<string, unknown>) : {};
    const pos = typeof feature.position === 'object' && feature.position !== null ? (feature.position as Record<string, unknown>) : null;
    const px = typeof pos?.x === 'number' ? pos.x : 0;
    const py = typeof pos?.y === 'number' ? pos.y : 0;
    const x = roomX + px * scaleFactor;
    const y = roomY + py * scaleFactor;
    const color = typeof feature.color === 'string' ? feature.color : '#999';
    const material = typeof feature.material === 'string' ? feature.material : 'stone';
    const label = typeof feature.label === 'string' ? feature.label : '';

    let shapeSvg = '';

    if (feature.shape === 'circle') {
      const radiusFt = typeof feature.radius === 'number' ? feature.radius : 2;
      const radius = radiusFt * scaleFactor;
      shapeSvg = `
        <circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" stroke="#000" stroke-width="2" />
        <circle cx="${x}" cy="${y}" r="${radius}" fill="rgba(0,0,0,0.2)" />
      `;
    } else if (feature.shape === 'rectangle') {
      const widthFt = typeof feature.width === 'number' ? feature.width : 4;
      const heightFt = typeof feature.height === 'number' ? feature.height : 4;
      const width = widthFt * scaleFactor;
      const height = heightFt * scaleFactor;
      const fill = material === 'wood' ? 'url(#wood_grain)' : color;
      shapeSvg = `
        <rect x="${x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}"
              fill="${fill}"
              stroke="#000"
              stroke-width="2"
              rx="2" />
        <rect x="${x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}"
              fill="rgba(0,0,0,0.15)"
              rx="2" />
      `;
    }

    if (label && label.length <= 20) {
      const base = typeof feature.radius === 'number'
        ? feature.radius
        : (typeof feature.height === 'number' ? feature.height / 2 : 5);
      const labelY = y - base * scaleFactor - 6;
      shapeSvg += `
        <text x="${x}" y="${labelY}"
              text-anchor="middle"
              font-family="Arial, sans-serif"
              font-size="8"
              font-weight="600"
              fill="#374151">
          ${label.length > 15 ? label.substring(0, 12) + '...' : label}
        </text>
      `;
    }

    return shapeSvg;
  }).join('');
}

export function generateFullWidthLocationFloorPlan(
  space: LiveMapSpace,
  colors: SpaceColorScheme,
  index: number,
  isGenerating: boolean
): string {
  const svgHeight = 512;
  const svgWidth = 1000;
  const padding = 60;

  let roomWidthFt = 0;
  let roomHeightFt = 0;
  try {
    const roomSize = requireLocationSpaceSizeFt(space);
    roomWidthFt = roomSize.width;
    roomHeightFt = roomSize.height;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid space size_ft.';
    return `
      <div style="background:#fff;border:3px solid ${colors.border};border-radius:8px;overflow:hidden;margin-bottom:0;">
        <div style="padding:12px;color:#991b1b;background:#fef2f2;border:1px solid #fecaca;font-family:Arial,sans-serif;font-size:13px;">
          ${message}
        </div>
      </div>
    `;
  }

  const spaceRecord = space as unknown as Record<string, unknown>;
  const floorRaw = spaceRecord.floor;
  const floorRecord = typeof floorRaw === 'object' && floorRaw !== null ? (floorRaw as Record<string, unknown>) : null;
  const floorColor = typeof floorRecord?.color === 'string' ? floorRecord.color : '#D3D3D3';
  const walls = Array.isArray(spaceRecord.walls) ? spaceRecord.walls : [];
  const doors = Array.isArray(space.doors) ? space.doors : [];
  const features = Array.isArray(spaceRecord.features) ? spaceRecord.features : [];
  const pulseStyle = isGenerating ? 'animation:pulse 1.5s infinite;' : '';
  const patterns = generateTexturePatterns();
  const previewLayout = buildRoomPreviewLayout(
    space,
    walls,
    roomWidthFt,
    roomHeightFt,
    svgWidth,
    svgHeight,
    padding
  );
  const wallResult = generateWalls(walls, space, previewLayout);
  const doorSvg = generateDoors(doors, previewLayout);
  const featuresSvg = generateFeatures(features, previewLayout.interiorX, previewLayout.interiorY, previewLayout.scaleFactor);

  return `
    <div style="background:#fff;border:3px solid ${colors.border};border-radius:8px;overflow:hidden;margin-bottom:0;${pulseStyle}">
      <svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet" style="background:#f9fafb;">
        <defs>
          ${patterns}
          ${wallResult.patterns}
        </defs>

        <rect x="10" y="10" width="60" height="30" fill="rgba(255,255,255,0.95)" stroke="${colors.border}" stroke-width="2" rx="6" />
        <text x="40" y="30" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#1f2937">
          #${index + 1}
        </text>

        <rect x="${previewLayout.interiorX}" y="${previewLayout.interiorY}" width="${previewLayout.interiorWidthPx}" height="${previewLayout.interiorHeightPx}"
              fill="${floorColor}" stroke="none" />

        ${wallResult.svg}
        ${doorSvg}
        ${featuresSvg}

        <text x="${svgWidth - 10}" y="35" text-anchor="end" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#1f2937">
          ${space.name}
        </text>

        <text x="${svgWidth - 10}" y="60" text-anchor="end" font-family="Arial, sans-serif" font-size="16" font-weight="600" fill="#6b7280">
          ${roomWidthFt}×${roomHeightFt} ft
        </text>

        ${space.purpose ? `
          <text x="${svgWidth - 10}" y="82" text-anchor="end" font-family="Arial, sans-serif" font-size="14" fill="#9ca3af">
            ${space.purpose}
          </text>
        ` : ''}
      </svg>
    </div>
  `;
}
