import type { LiveMapSpace } from '../types/liveMapTypes';
import { buildLocationSpatialLayout } from './locationSpatialLayout';
import { requireLocationSpaceSizeFt } from './locationMapPreview';

export function generateStitchedLocationMap(
  spaces: LiveMapSpace[],
  locationName: string,
  showGridLayer: boolean = true,
  showWireframeLayer: boolean = true,
  showDetailLayer: boolean = true
): string {
  if (spaces.length === 0) return '<p>No spaces to display</p>';

  try {
    spaces.forEach((space) => {
      requireLocationSpaceSizeFt(space);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid space size_ft.';
    return `<div style="padding:12px;color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-family:Arial,sans-serif;font-size:13px;">${message}</div>`;
  }

  const pixelsPerFoot = 2;
  const gridSquareFeet = 5;
  const gridSquarePixels = gridSquareFeet * pixelsPerFoot;
  const gridLineWidth = 1;
  const scale = pixelsPerFoot;
  const gap = gridSquarePixels * 3;

  const layout = buildLocationSpatialLayout(spaces, { thickness_ft: 10, material: 'stone' });
  const rooms = layout.rooms.map((room) => ({
    index: room.index,
    name: room.name,
    widthFt: room.widthFt,
    heightFt: room.heightFt,
    floor: (
      typeof (room.originalSpace as unknown as Record<string, unknown>).floor === 'object' &&
      (room.originalSpace as unknown as Record<string, unknown>).floor !== null
    )
      ? ((room.originalSpace as unknown as Record<string, unknown>).floor as Record<string, unknown>)
      : { material: 'stone', color: '#D3D3D3' },
    x: room.positionFt.x * scale,
    y: room.positionFt.y * scale,
    originalSpace: room.originalSpace,
  }));
  const unplacedRooms = layout.rooms.filter((room) => room.placementSource === 'fallback');

  console.log(`[Spatial Layout] Starting validation of ${rooms.length} rooms`);

  if (layout.brokenConnections.length > 0) {
    console.error(`[Spatial Layout] ❌ BROKEN CONNECTIONS (${layout.brokenConnections.length}):`, layout.brokenConnections);
    console.error(`[Spatial Layout] 🔧 FIX: Update door "leads_to" values to exactly match room names`);
  }

  if (layout.externalConnections.length > 0) {
    console.warn(`[Spatial Layout] ⚠️ EXTERNAL CONNECTIONS (${layout.externalConnections.length}) - these rooms connect outside:`, layout.externalConnections);
  }

  const maxX = Math.max(...rooms.map((room) => room.x + room.widthFt * scale));
  const maxY = Math.max(...rooms.map((room) => room.y + room.heightFt * scale));
  const svgWidth = maxX + gap;
  const svgHeight = maxY + gap;

  const connectionLines = layout.connectionLines.map((connection) => `
          <line x1="${connection.fromFt.x * scale}" y1="${connection.fromFt.y * scale}" x2="${connection.toFt.x * scale}" y2="${connection.toFt.y * scale}"
                stroke="#3b82f6" stroke-width="2" stroke-dasharray="6,3" opacity="0.4" />
        `).join('');

  let wireframeContent = '';
  let detailContent = '';

  console.log('[Spatial Layout] Generating layers for', rooms.length, 'rooms');
  rooms.forEach((room) => {
    console.log(`  Room "${room.name}": position (${room.x}, ${room.y}), size ${room.widthFt}×${room.heightFt}ft = ${room.widthFt * scale}×${room.heightFt * scale}px`);
  });

  rooms.forEach((room) => {
    const roomWidth = room.widthFt * scale;
    const roomHeight = room.heightFt * scale;

    if (room.x === undefined || room.y === undefined || Number.isNaN(room.x) || Number.isNaN(room.y)) {
      console.error(`[Spatial Layout] ⚠️ Room "${room.name}" has invalid coordinates: x=${room.x}, y=${room.y}`);
    }

    const floorColor = typeof (room.floor as Record<string, unknown>).color === 'string'
      ? ((room.floor as Record<string, unknown>).color as string)
      : '#D3D3D3';
    const rgb = parseInt(floorColor.slice(1), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    const textColor = brightness > 128 ? '#1f2937' : '#ffffff';
    const dimTextColor = brightness > 128 ? '#6b7280' : '#d1d5db';

    const spaceData = spaces[room.index];
    const features = spaceData?.features || [];
    const shapeType = spaceData?.shape || room.originalSpace?.shape || 'rectangle';
    const lCutoutCorner = (spaceData?.l_cutout_corner as string | undefined) || (room.originalSpace?.l_cutout_corner as string | undefined) || 'ne';

    const getLShapePath = (): string => {
      const cutoutW = roomWidth / 2;
      const cutoutH = roomHeight / 2;

      switch (lCutoutCorner) {
        case 'ne':
          return `M 0 0 L ${roomWidth - cutoutW} 0 L ${roomWidth - cutoutW} ${cutoutH} L ${roomWidth} ${cutoutH} L ${roomWidth} ${roomHeight} L 0 ${roomHeight} Z`;
        case 'nw':
          return `M ${cutoutW} 0 L ${roomWidth} 0 L ${roomWidth} ${roomHeight} L 0 ${roomHeight} L 0 ${cutoutH} L ${cutoutW} ${cutoutH} Z`;
        case 'se':
          return `M 0 0 L ${roomWidth} 0 L ${roomWidth} ${roomHeight - cutoutH} L ${roomWidth - cutoutW} ${roomHeight - cutoutH} L ${roomWidth - cutoutW} ${roomHeight} L 0 ${roomHeight} Z`;
        case 'sw':
          return `M 0 0 L ${roomWidth} 0 L ${roomWidth} ${roomHeight} L ${cutoutW} ${roomHeight} L ${cutoutW} ${roomHeight - cutoutH} L 0 ${roomHeight - cutoutH} Z`;
        default:
          return `M 0 0 L ${roomWidth} 0 L ${roomWidth} ${roomHeight} L 0 ${roomHeight} Z`;
      }
    };

    const wireframeRoomShape = shapeType === 'circle'
      ? `<ellipse cx="${roomWidth / 2}" cy="${roomHeight / 2}" rx="${roomWidth / 2}" ry="${roomHeight / 2}"
                fill="none" stroke="#000000" stroke-width="1" />`
      : shapeType === 'L-shape'
        ? `<path d="${getLShapePath()}" fill="none" stroke="#000000" stroke-width="1" />`
        : `<rect x="0" y="0" width="${roomWidth}" height="${roomHeight}"
                fill="none" stroke="#000000" stroke-width="1" />`;

    const wireframeClipShape = shapeType === 'circle'
      ? `<ellipse cx="${roomWidth / 2}" cy="${roomHeight / 2}" rx="${roomWidth / 2}" ry="${roomHeight / 2}" />`
      : shapeType === 'L-shape'
        ? `<path d="${getLShapePath()}" />`
        : `<rect x="0" y="0" width="${roomWidth}" height="${roomHeight}" />`;

    const clipId = `room-clip-${room.index}`;

    const detailRoomShape = shapeType === 'circle'
      ? `<ellipse cx="${roomWidth / 2}" cy="${roomHeight / 2}" rx="${Math.max(0, roomWidth - 2) / 2}" ry="${Math.max(0, roomHeight - 2) / 2}"
                fill="${floorColor}" stroke="none" />`
      : shapeType === 'L-shape'
        ? `<path d="${getLShapePath()}" fill="${floorColor}" stroke="none" />`
        : `<rect x="1" y="1" width="${roomWidth - 2}" height="${roomHeight - 2}"
                fill="${floorColor}" stroke="none" />`;

    const wireframeTransform = `translate(${room.x}, ${room.y})`;
    wireframeContent += `
      <!-- Wireframe: Room #${room.index + 1} "${room.name}" at (${room.x}, ${room.y}) -->
      <g transform="${wireframeTransform}">
        <defs>
          <clipPath id="${clipId}">
            ${wireframeClipShape}
          </clipPath>
        </defs>
        ${wireframeRoomShape}

        <g clip-path="url(#${clipId})">
          ${(Array.isArray(features) ? features : []).map((featureUnknown: unknown) => {
            const feature = typeof featureUnknown === 'object' && featureUnknown !== null ? (featureUnknown as Record<string, unknown>) : {};
            const pos = typeof feature.position === 'object' && feature.position !== null ? (feature.position as Record<string, unknown>) : null;
            const fx = typeof pos?.x === 'number' ? pos.x * scale : Number.NaN;
            const fy = typeof pos?.y === 'number' ? pos.y * scale : Number.NaN;
            if (Number.isNaN(fx) || Number.isNaN(fy)) return '';

            const fw = typeof feature.width === 'number' ? feature.width * scale : Number.NaN;
            const fh = typeof feature.height === 'number' ? feature.height * scale : Number.NaN;

            if (feature.shape === 'circle') {
              const radiusFt = typeof feature.radius === 'number' ? feature.radius : Number.NaN;
              const radiusPx = !Number.isNaN(radiusFt) ? radiusFt * scale : (Number.isNaN(fw) || Number.isNaN(fh) ? Number.NaN : Math.min(fw, fh) / 2);
              if (Number.isNaN(radiusPx)) return '';
              return `<circle cx="${fx}" cy="${fy}" r="${radiusPx}"
                      fill="none" stroke="#666666" stroke-width="1" />`;
            }

            if (Number.isNaN(fw) || Number.isNaN(fh)) return '';

            return `<rect x="${fx - fw / 2}" y="${fy - fh / 2}" width="${fw}" height="${fh}"
                    fill="none" stroke="#666666" stroke-width="1" />`;
          }).join('')}
        </g>
      </g>
    `;

    const detailTransform = `translate(${room.x}, ${room.y})`;
    detailContent += `
      <!-- Detail: Room #${room.index + 1} "${room.name}" at (${room.x}, ${room.y}) -->
      <g transform="${detailTransform}" opacity="0.85">
        ${detailRoomShape}

        <text x="${roomWidth / 2}" y="${roomHeight / 2 - 8}" text-anchor="middle"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              font-size="12" font-weight="bold" fill="${textColor}">
          #${room.index + 1}
        </text>
        <text x="${roomWidth / 2}" y="${roomHeight / 2 + 6}" text-anchor="middle"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              font-size="10" fill="${textColor}">
          ${room.name.length > 18 ? room.name.substring(0, 15) + '...' : room.name}
        </text>

        <text x="${roomWidth / 2}" y="${roomHeight / 2 + 18}" text-anchor="middle"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              font-size="8" fill="${dimTextColor}">
          ${room.widthFt}×${room.heightFt} ft
        </text>
      </g>
    `;
  });

  const gridPattern = `
    <defs>
      <pattern id="grid" width="${gridSquarePixels}" height="${gridSquarePixels}" patternUnits="userSpaceOnUse">
        <path d="M ${gridSquarePixels} 0 L 0 0 0 ${gridSquarePixels}"
              fill="none" stroke="#e5e7eb" stroke-width="${gridLineWidth}" />
      </pattern>
    </defs>
  `;

  console.log('[Spatial Layout] Wireframe content preview (first 500 chars):');
  console.log(wireframeContent.substring(0, 500));
  console.log('[Spatial Layout] Detail content preview (first 500 chars):');
  console.log(detailContent.substring(0, 500));

  const compassSize = 60;
  const compassX = svgWidth - compassSize - 20;
  const compassY = svgHeight - compassSize - 20;
  const compassRose = `
    <defs>
      <filter id="compassShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
        <feOffset dx="0" dy="2" result="offsetblur"/>
        <feComponentTransfer>
          <feFuncA type="linear" slope="0.3"/>
        </feComponentTransfer>
        <feMerge>
          <feMergeNode/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <g id="compass" transform="translate(${compassX}, ${compassY})" filter="url(#compassShadow)">
      <circle cx="${compassSize / 2}" cy="${compassSize / 2}" r="${compassSize / 2}"
              fill="white" stroke="#374151" stroke-width="3" />

      <path d="M ${compassSize / 2} 10 L ${compassSize / 2 - 8} ${compassSize / 2} L ${compassSize / 2} ${compassSize / 2 - 5} L ${compassSize / 2 + 8} ${compassSize / 2} Z"
            fill="#dc2626" stroke="#991b1b" stroke-width="1" />
      <text x="${compassSize / 2}" y="8" text-anchor="middle"
            font-family="Arial" font-size="12" font-weight="bold" fill="#dc2626">N</text>

      <text x="${compassSize / 2}" y="${compassSize - 2}" text-anchor="middle"
            font-family="Arial" font-size="10" fill="#374151">S</text>

      <text x="${compassSize - 5}" y="${compassSize / 2 + 4}" text-anchor="end"
            font-family="Arial" font-size="10" fill="#374151">E</text>

      <text x="5" y="${compassSize / 2 + 4}" text-anchor="start"
            font-family="Arial" font-size="10" fill="#374151">W</text>
    </g>
  `;

  return `
    <div style="background: white; border: 2px solid #666; border-radius: 8px; padding: 20px;">
      <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #1f2937;">
        ${locationName} - Spatial Layout
      </h3>
      <p style="margin: 0 0 16px 0; font-size: 12px; color: #6b7280;">
        Showing ${rooms.length} spaces positioned by connections (Grid: ${gridSquareFeet}ft squares)
        ${unplacedRooms.length > 0 ? ` (${unplacedRooms.length} unconnected rooms on right)` : ''}
      </p>
      <div style="overflow: auto; max-height: 800px;">
        <svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
          ${gridPattern}
          ${showGridLayer ? `<rect width="${svgWidth}" height="${svgHeight}" fill="url(#grid)" />` : `<rect width="${svgWidth}" height="${svgHeight}" fill="#ffffff" />`}

          ${showWireframeLayer ? `
          <g id="wireframe">
            ${wireframeContent}
          </g>
          ` : ''}

          ${showDetailLayer ? `
          <g id="details">
            ${detailContent}
          </g>
          ` : ''}

          <g id="connections">
            ${connectionLines}
          </g>

          ${compassRose}
        </svg>
      </div>
    </div>
  `;
}
