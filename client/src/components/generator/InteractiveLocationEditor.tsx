/**
 * Interactive Location Editor - Main component for human-in-the-loop location editing
 *
 * Features:
 * - Drag-drop room positioning with grid snapping
 * - Resize rooms with corner handles
 * - Click to select rooms
 * - Keyboard shortcuts (arrow keys, Del, Ctrl+Z)
 * - Real-time validation
 * - Layer visibility toggles
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useLocationEditor, Space } from '../../contexts/LocationEditorContext';
import { Undo2, Redo2, Grid3x3, Eye, EyeOff, Download, Save } from 'lucide-react';
import RoomPropertiesPanel from './RoomPropertiesPanel';

interface InteractiveLocationEditorProps {
  locationName?: string;
  onSave?: (spaces: Space[]) => void;
  onExportImage?: () => void;
  /** When true, hides the RoomPropertiesPanel - use when shown alongside another editing UI */
  compactMode?: boolean;
  /** Optional externally-controlled selected room id (code or name) */
  selectedRoomId?: string | null;
  /** Notify parent when user picks a room in the editor */
  onSelectionChange?: (roomId: string | null, space?: Space | null) => void;
}

export default function InteractiveLocationEditor({
  locationName,
  onSave,
  onExportImage,
  compactMode = false,
  selectedRoomId,
  onSelectionChange,
}: InteractiveLocationEditorProps) {
  const {
    state,
    dispatch,
    selectRoom,
    moveRoom,
    resizeRoom,
    deleteRoom,
    togglePositionLock,
    undo,
    redo,
    canUndo,
    canRedo,
    createSnapshot,
  } = useLocationEditor();

  const canvasRef = useRef<SVGSVGElement>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [showPropertiesPanel, setShowPropertiesPanel] = useState(!compactMode);
  const [resizeStart, setResizeStart] = useState<{
    x: number;
    y: number;
    originalSize: { width: number; height: number };
    originalPosition: { x: number; y: number };
  } | null>(null);

  // Track last saved state to detect changes
  const [lastSavedState, setLastSavedState] = useState<string>(JSON.stringify(state.spaces));
  const hasUnsavedChanges = JSON.stringify(state.spaces) !== lastSavedState;

  useEffect(() => {
    setShowPropertiesPanel(!compactMode);
  }, [compactMode]);

  // Constants
  const PIXELS_PER_FOOT = 2;
  const GRID_SIZE = state.gridSize; // 5ft

  // Calculate canvas size based on room positions and sizes with padding
  const calculateCanvasBounds = () => {
    if (state.spaces.length === 0) {
      return { width: 1000, height: 1000 };
    }

    let maxX = 0;
    let maxY = 0;

    state.spaces.forEach(space => {
      if (space.position) {
        const rightEdge = space.position.x + space.size_ft.width;
        const bottomEdge = space.position.y + space.size_ft.height;
        maxX = Math.max(maxX, rightEdge);
        maxY = Math.max(maxY, bottomEdge);
      }
    });

    // Add 100ft padding
    return {
      width: Math.max(500, maxX + 100),
      height: Math.max(500, maxY + 100)
    };
  };

  const canvasBounds = calculateCanvasBounds();
  const CANVAS_WIDTH_PX = canvasBounds.width * PIXELS_PER_FOOT;
  const CANVAS_HEIGHT_PX = canvasBounds.height * PIXELS_PER_FOOT;
  const RESIZE_HANDLE_SIZE = 8;

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  const snapToGrid = useCallback(
    (value: number): number => {
      return Math.round(value / GRID_SIZE) * GRID_SIZE;
    },
    [GRID_SIZE]
  );

  const ftToPx = (ft: number): number => ft * PIXELS_PER_FOOT;
  const pxToFt = (px: number): number => px / PIXELS_PER_FOOT;

  const getSVGCoordinates = (e: React.MouseEvent<SVGSVGElement>): { x: number; y: number } => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const svg = canvasRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
    return { x: pxToFt(svgP.x), y: pxToFt(svgP.y) };
  };

  const findRoomAtPosition = (x: number, y: number): Space | null => {
    for (const space of state.spaces) {
      if (!space.position) continue;
      const { x: rx, y: ry } = space.position;
      const { width: rw, height: rh } = space.size_ft;
      if (x >= rx && x <= rx + rw && y >= ry && y <= ry + rh) {
        return space;
      }
    }
    return null;
  };

  const getRoomId = (space: Space): string => space.code || space.name;

  // Sync external selectedRoomId prop into context selection
  useEffect(() => {
    if (selectedRoomId === undefined) return;
    if (selectedRoomId !== state.selectedRoomId) {
      selectRoom(selectedRoomId);
    }
  }, [selectedRoomId, state.selectedRoomId, selectRoom]);

  // ============================================================================
  // KEYBOARD SHORTCUTS
  // ============================================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete selected room
      if (e.key === 'Delete' && state.selectedRoomId) {
        e.preventDefault();
        deleteRoom(state.selectedRoomId);
        createSnapshot(`Deleted ${state.selectedRoomId}`);
      }

      // Undo/Redo
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (e.ctrlKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }

      // Arrow keys to move selected room
      if (state.selectedRoomId && !state.isDragging && !state.isResizing) {
        const selectedSpace = state.spaces.find(s => getRoomId(s) === state.selectedRoomId);
        if (!selectedSpace || !selectedSpace.position) return;

        let dx = 0;
        let dy = 0;
        const step = e.shiftKey ? GRID_SIZE : 1; // Shift = move by grid size, otherwise 1ft

        if (e.key === 'ArrowUp') {
          dy = -step;
          e.preventDefault();
        } else if (e.key === 'ArrowDown') {
          dy = step;
          e.preventDefault();
        } else if (e.key === 'ArrowLeft') {
          dx = -step;
          e.preventDefault();
        } else if (e.key === 'ArrowRight') {
          dx = step;
          e.preventDefault();
        }

        if (dx !== 0 || dy !== 0) {
          const newX = snapToGrid(selectedSpace.position.x + dx);
          const newY = snapToGrid(selectedSpace.position.y + dy);
          moveRoom(state.selectedRoomId, { x: newX, y: newY });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.selectedRoomId, state.spaces, state.isDragging, state.isResizing, GRID_SIZE, snapToGrid, moveRoom, deleteRoom, undo, redo, createSnapshot]);

  // ============================================================================
  // MOUSE HANDLERS
  // ============================================================================

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getSVGCoordinates(e);
    const clickedRoom = findRoomAtPosition(coords.x, coords.y);

    if (!clickedRoom) {
      selectRoom(null);
      if (onSelectionChange) {
        onSelectionChange(null, null);
      }
      return;
    }

    const roomId = getRoomId(clickedRoom);
    selectRoom(roomId);
    if (onSelectionChange) {
      onSelectionChange(roomId, clickedRoom);
    }

    // Check if clicking on a resize handle
    if (state.selectedRoomId === roomId && clickedRoom.position) {
      const { x: rx, y: ry } = clickedRoom.position;
      const { width: rw, height: rh } = clickedRoom.size_ft;

      // Define resize handle zones (8ft x 8ft squares at corners)
      const handleZone = 8;
      const handles = {
        nw: { x: rx, y: ry },
        ne: { x: rx + rw, y: ry },
        sw: { x: rx, y: ry + rh },
        se: { x: rx + rw, y: ry + rh },
      };

      for (const [handle, pos] of Object.entries(handles)) {
        if (
          Math.abs(coords.x - pos.x) <= handleZone &&
          Math.abs(coords.y - pos.y) <= handleZone
        ) {
          // Start resizing
          dispatch({
            type: 'START_RESIZE',
            payload: { roomId, handle: handle as 'nw' | 'ne' | 'sw' | 'se' },
          });
          setResizeStart({
            x: coords.x,
            y: coords.y,
            originalSize: { ...clickedRoom.size_ft },
            originalPosition: { ...clickedRoom.position },
          });
          return;
        }
      }
    }

    // Start dragging
    if (clickedRoom.position) {
      dispatch({ type: 'START_DRAG', payload: roomId });
      setDragStart({
        x: coords.x - clickedRoom.position.x,
        y: coords.y - clickedRoom.position.y,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getSVGCoordinates(e);

    // Handle dragging
    if (state.isDragging && dragStart && state.selectedRoomId) {
      const newX = snapToGrid(coords.x - dragStart.x);
      const newY = snapToGrid(coords.y - dragStart.y);
      moveRoom(state.selectedRoomId, { x: newX, y: newY });
    }

    // Handle resizing
    if (state.isResizing && resizeStart && state.selectedRoomId && state.resizeHandle) {
      const dx = coords.x - resizeStart.x;
      const dy = coords.y - resizeStart.y;

      let newWidth = resizeStart.originalSize.width;
      let newHeight = resizeStart.originalSize.height;
      let newX = resizeStart.originalPosition.x;
      let newY = resizeStart.originalPosition.y;

      switch (state.resizeHandle) {
        case 'se':
          newWidth = snapToGrid(resizeStart.originalSize.width + dx);
          newHeight = snapToGrid(resizeStart.originalSize.height + dy);
          break;
        case 'sw':
          newWidth = snapToGrid(resizeStart.originalSize.width - dx);
          newHeight = snapToGrid(resizeStart.originalSize.height + dy);
          newX = snapToGrid(resizeStart.originalPosition.x + dx);
          break;
        case 'ne':
          newWidth = snapToGrid(resizeStart.originalSize.width + dx);
          newHeight = snapToGrid(resizeStart.originalSize.height - dy);
          newY = snapToGrid(resizeStart.originalPosition.y + dy);
          break;
        case 'nw':
          newWidth = snapToGrid(resizeStart.originalSize.width - dx);
          newHeight = snapToGrid(resizeStart.originalSize.height - dy);
          newX = snapToGrid(resizeStart.originalPosition.x + dx);
          newY = snapToGrid(resizeStart.originalPosition.y + dy);
          break;
      }

      // Enforce minimum size (5ft x 5ft) to allow narrow corridors/secret passages
      newWidth = Math.max(5, newWidth);
      newHeight = Math.max(5, newHeight);

      resizeRoom(state.selectedRoomId, { width: newWidth, height: newHeight });
      if (newX !== resizeStart.originalPosition.x || newY !== resizeStart.originalPosition.y) {
        moveRoom(state.selectedRoomId, { x: newX, y: newY });
      }
    }

    // Hover detection
    const hoveredRoom = findRoomAtPosition(coords.x, coords.y);
    dispatch({ type: 'HOVER_ROOM', payload: hoveredRoom ? getRoomId(hoveredRoom) : null });
  };

  const handleMouseUp = () => {
    if (state.isDragging) {
      dispatch({ type: 'END_DRAG' });
      setDragStart(null);
      if (state.selectedRoomId) {
        createSnapshot(`Moved ${state.selectedRoomId}`);
      }
    }
    if (state.isResizing) {
      dispatch({ type: 'END_RESIZE' });
      setResizeStart(null);
      if (state.selectedRoomId) {
        createSnapshot(`Resized ${state.selectedRoomId}`);
      }
    }
  };

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  const renderGrid = () => {
    if (!state.showGridLayer) return null;

    const lines = [];
    const gridPx = ftToPx(GRID_SIZE);

    // Vertical lines
    for (let x = 0; x <= CANVAS_WIDTH_PX; x += gridPx) {
      lines.push(
        <line
          key={`v-${x}`}
          x1={x}
          y1={0}
          x2={x}
          y2={CANVAS_HEIGHT_PX}
          stroke="#e0e0e0"
          strokeWidth={0.5}
        />
      );
    }

    // Horizontal lines
    for (let y = 0; y <= CANVAS_HEIGHT_PX; y += gridPx) {
      lines.push(
        <line
          key={`h-${y}`}
          x1={0}
          y1={y}
          x2={CANVAS_WIDTH_PX}
          y2={y}
          stroke="#e0e0e0"
          strokeWidth={0.5}
        />
      );
    }

    return <g id="grid-layer">{lines}</g>;
  };

  const renderRoom = (space: Space) => {
    if (!space.position) return null;

    const roomId = getRoomId(space);
    const isSelected = state.selectedRoomId === roomId;
    const isHovered = state.hoveredRoomId === roomId;

    const isStairs = space.space_type === 'stairs';
    const isCorridor = space.space_type === 'corridor';

    // Get wall thickness - use room-specific value or fall back to global settings
    let wallThicknessFt: number;
    if (typeof space.wall_thickness_ft === 'number') {
      wallThicknessFt = space.wall_thickness_ft;
    } else {
      // Use global default (this is normal, not an error)
      wallThicknessFt = state.globalWallSettings?.thickness_ft || 10;
    }

    // Get wall material - use room-specific value or fall back to global settings
    let wallMaterial: string;
    if (typeof space.wall_material === 'string') {
      wallMaterial = space.wall_material;
    } else {
      // Use global default (this is normal, not an error)
      wallMaterial = state.globalWallSettings?.material || 'stone';
    }

    const wallThickness = wallThicknessFt * PIXELS_PER_FOOT;
    const halfWallThickness = wallThickness / 2;

    // Room interior bounds (matches size_ft exactly - this is the usable space)
    const interiorX = ftToPx(space.position.x);
    const interiorY = ftToPx(space.position.y);
    const interiorW = ftToPx(space.size_ft.width);
    const interiorH = ftToPx(space.size_ft.height);

    // Outer bounds including walls (walls extend halfWallThickness outward, meeting adjacent rooms in middle)
    const x = interiorX - halfWallThickness;
    const y = interiorY - halfWallThickness;
    const w = interiorW + wallThickness;
    const h = interiorH + wallThickness;

    // Different fill colors for different space types
    const getFillColor = () => {
      if (isSelected) return 'rgba(59, 130, 246, 0.1)';
      if (isStairs) return 'rgba(139, 90, 43, 0.15)'; // Brown tint for stairs
      if (isCorridor) return 'rgba(200, 200, 200, 0.3)'; // Gray for corridors
      return 'rgba(255, 255, 255, 0.9)';
    };
    
    const getStrokeColor = () => {
      if (isSelected) return '#3b82f6';
      if (isHovered) return '#60a5fa';
      if (isStairs) return '#8B4513'; // Brown for stairs
      if (isCorridor) return '#6b7280'; // Gray for corridors
      return '#9ca3af';
    };

    // Determine shape type
    const shapeType = space.shape || 'rectangle';

    // Generate path for L-shape
    const getLShapePath = () => {
      const cutoutW = w / 2;
      const cutoutH = h / 2;
      const corner = space.l_cutout_corner || 'ne';
      
      switch (corner) {
        case 'ne': // Cutout in northeast
          return `M ${x} ${y} L ${x + w - cutoutW} ${y} L ${x + w - cutoutW} ${y + cutoutH} L ${x + w} ${y + cutoutH} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
        case 'nw': // Cutout in northwest
          return `M ${x + cutoutW} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} L ${x} ${y + cutoutH} L ${x + cutoutW} ${y + cutoutH} Z`;
        case 'se': // Cutout in southeast
          return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h - cutoutH} L ${x + w - cutoutW} ${y + h - cutoutH} L ${x + w - cutoutW} ${y + h} L ${x} ${y + h} Z`;
        case 'sw': // Cutout in southwest
          return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x + cutoutW} ${y + h} L ${x + cutoutW} ${y + h - cutoutH} L ${x} ${y + h - cutoutH} Z`;
        default:
          return '';
      }
    };

    return (
      <g key={roomId}>
        {/* Room shape - varies by type */}
        {shapeType === 'circle' ? (
          <>
            {/* Circle room interior */}
            <ellipse
              cx={interiorX + interiorW / 2}
              cy={interiorY + interiorH / 2}
              rx={interiorW / 2}
              ry={interiorH / 2}
              fill={getFillColor()}
              stroke="none"
              className="cursor-move"
            />
            {/* Circle wall ring (centered on room boundary) - skip for staircases */}
            {!isStairs && (() => {
              const wallColor = wallMaterial === 'wood' ? '#8B4513' :
                               wallMaterial === 'brick' ? '#A0522D' :
                               '#6B6B6B';
              const hatchId = `hatch-${roomId.replace(/[^a-zA-Z0-9-]/g, '_')}`;

              return (
                <>
                  <defs>
                    <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                      <line x1="0" y1="0" x2="0" y2="6" stroke={wallColor} strokeWidth="1.5" opacity="1" />
                    </pattern>
                  </defs>
                  {/* Wall ring - hatch pattern only */}
                  <ellipse
                    cx={interiorX + interiorW / 2}
                    cy={interiorY + interiorH / 2}
                    rx={interiorW / 2 + halfWallThickness / 2}
                    ry={interiorH / 2 + halfWallThickness / 2}
                    fill="none"
                    stroke={`url(#${hatchId})`}
                    strokeWidth={halfWallThickness}
                    opacity="1"
                  />
                </>
              );
            })()}
            {/* Border for selection (only when selected or hovered) */}
            {(isSelected || isHovered) && (
              <ellipse
                cx={interiorX + interiorW / 2}
                cy={interiorY + interiorH / 2}
                rx={interiorW / 2}
                ry={interiorH / 2}
                fill="none"
                stroke={getStrokeColor()}
                strokeWidth={isSelected ? 3 : 2}
                strokeDasharray={isStairs ? '4,2' : undefined}
              />
            )}
          </>
        ) : shapeType === 'L-shape' ? (
          <>
            {/* L-shape room interior */}
            <path
              d={getLShapePath()}
              fill={getFillColor()}
              stroke="none"
              className="cursor-move"
            />
            {/* L-shape border (only when selected or hovered) */}
            {(isSelected || isHovered) && (
              <path
                d={getLShapePath()}
                fill="none"
                stroke={getStrokeColor()}
                strokeWidth={isSelected ? 3 : 2}
                strokeDasharray={isStairs ? '4,2' : undefined}
              />
            )}
          </>
        ) : (
          <>
            {/* Default: rectangle (room interior inset for shared walls) */}
            <rect
              x={interiorX}
              y={interiorY}
              width={interiorW}
              height={interiorH}
              fill={getFillColor()}
              stroke="none"
              className="cursor-move"
            />

            {/* Walls with thickness and hatch marks - skip for staircases and corridors */}
            {!isStairs && !isCorridor && (() => {
          // Get wall color based on material
          const wallColor = wallMaterial === 'wood' ? '#8B4513' :
                           wallMaterial === 'brick' ? '#A0522D' :
                           '#6B6B6B'; // stone/default

          // Create hatch pattern ID unique to this room - sanitize to avoid URL issues
          const hatchId = `hatch-${roomId.replace(/[^a-zA-Z0-9-]/g, '_')}`;

          return (
            <>
              {/* Define hatch pattern */}
              <defs>
                <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <line x1="0" y1="0" x2="0" y2="6" stroke={wallColor} strokeWidth="1.5" opacity="1" />
                </pattern>
              </defs>

              {/* North wall - extends halfWallThickness outward, includes corners */}
              <rect
                x={interiorX - halfWallThickness}
                y={interiorY - halfWallThickness}
                width={interiorW + wallThickness}
                height={halfWallThickness}
                fill={`url(#${hatchId})`}
                opacity="1"
              />

              {/* South wall - extends halfWallThickness outward, includes corners */}
              <rect
                x={interiorX - halfWallThickness}
                y={interiorY + interiorH}
                width={interiorW + wallThickness}
                height={halfWallThickness}
                fill={`url(#${hatchId})`}
                opacity="1"
              />

              {/* West wall - extends halfWallThickness outward, interior height only */}
              <rect
                x={interiorX - halfWallThickness}
                y={interiorY}
                width={halfWallThickness}
                height={interiorH}
                fill={`url(#${hatchId})`}
                opacity="1"
              />

              {/* East wall - extends halfWallThickness outward, interior height only */}
              <rect
                x={interiorX + interiorW}
                y={interiorY}
                width={halfWallThickness}
                height={interiorH}
                fill={`url(#${hatchId})`}
                opacity="1"
              />
            </>
          );
            })()}

            {/* Interior border for selection/hover (only when selected or hovered) */}
            {(isSelected || isHovered) && (
              <rect
                x={interiorX}
                y={interiorY}
                width={interiorW}
                height={interiorH}
                fill="none"
                stroke={getStrokeColor()}
                strokeWidth={isSelected ? 3 : 2}
                strokeDasharray={isStairs ? '4,2' : undefined}
              />
            )}
          </>
        )}

        {/* Stairs visualization */}
        {isStairs && (
          <>
            {space.stair_type === 'spiral' ? (
              // Spiral stairs - concentric circles
              <>
                <circle
                  cx={x + w / 2}
                  cy={y + h / 2}
                  r={Math.min(w, h) / 3}
                  fill="none"
                  stroke="#8B4513"
                  strokeWidth={1.5}
                />
                <circle
                  cx={x + w / 2}
                  cy={y + h / 2}
                  r={Math.min(w, h) / 5}
                  fill="#8B4513"
                  stroke="#5D3A1A"
                  strokeWidth={1}
                />
              </>
            ) : (
              // Straight stairs - parallel lines
              <>
                {Array.from({ length: 5 }).map((_, i) => (
                  <line
                    key={`stair-line-${i}`}
                    x1={x + 4}
                    y1={y + (h / 6) * (i + 1)}
                    x2={x + w - 4}
                    y2={y + (h / 6) * (i + 1)}
                    stroke="#8B4513"
                    strokeWidth={1.5}
                  />
                ))}
              </>
            )}
            {/* Z direction arrow */}
            <text
              x={x + w - 12}
              y={y + 14}
              fontSize={14}
              fill={space.z_direction === 'ascending' ? '#22c55e' : '#ef4444'}
              pointerEvents="none"
            >
              {space.z_direction === 'ascending' ? '↑' : '↓'}
            </text>
          </>
        )}

        {/* Room label */}
        <text
          x={x + w / 2}
          y={y + h / 2 + (isStairs && space.stair_type === 'spiral' ? Math.min(w, h) / 2.5 : 0)}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={12}
          fill="#374151"
          pointerEvents="none"
          className="select-none"
        >
          {space.name}
        </text>

        {/* Position lock toggle - clickable badge to lock/unlock room position */}
        <g
          onClick={(e) => {
            e.stopPropagation();
            togglePositionLock(space.code || space.name);
            createSnapshot(`${space.position_locked ? 'Unlocked' : 'Locked'} position for ${space.name}`);
          }}
          style={{ cursor: 'pointer' }}
        >
          <title>{space.position_locked ? 'Click to unlock position' : 'Click to lock position'}</title>
          <circle
            cx={x + w - 12}
            cy={y + 12}
            r={8}
            fill={space.position_locked ? '#FEF3C7' : '#E5E7EB'}
            stroke={space.position_locked ? '#F59E0B' : '#9CA3AF'}
            strokeWidth={1.5}
          />
          <text
            x={x + w - 12}
            y={y + 12}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={10}
            fill={space.position_locked ? '#92400E' : '#6B7280'}
            pointerEvents="none"
          >
            {space.position_locked ? '🔒' : '🔓'}
          </text>
        </g>

        {/* Doors visualization */}
        {space.doors && space.doors.map((door, doorIdx) => {
          const doorWidthPx = ftToPx(door.width_ft || 4);
          const doorThickness = 6; // pixels

          // Check if this door has validation errors
          const doorId = `${space.name}-door-${doorIdx}`;
          const doorErrors = state.validationErrors.filter(err => err.id === doorId);
          const doorWarnings = state.validationWarnings.filter(err => err.id === doorId);
          const hasError = doorErrors.length > 0;
          const hasWarning = doorWarnings.length > 0;

          // Get door visual properties based on type
          const doorStyle = (door as any).style || 'wooden';
          const getDoorProps = (style: string) => {
            switch (style) {
              case 'wooden':
                return { fill: '#8B4513', stroke: '#5D3A1A', strokeWidth: 1, opacity: 1 };
              case 'stone':
                return { fill: '#708090', stroke: '#2F4F4F', strokeWidth: 2, opacity: 1 };
              case 'metal':
                return { fill: '#4A4A4A', stroke: '#1C1C1C', strokeWidth: 2, opacity: 1 };
              case 'archway':
                return { fill: 'none', stroke: '#4A1B1B', strokeWidth: 3, opacity: 1 };
              case 'secret':
                return { fill: '#8B4513', stroke: '#FF00FF', strokeWidth: 1, opacity: 0.5 };
              case 'opening':
                return { fill: 'none', stroke: '#D2691E', strokeWidth: 2, opacity: 1, strokeDasharray: '4,2' };
              default:
                return { fill: '#8B4513', stroke: '#5D3A1A', strokeWidth: 1, opacity: 1 };
            }
          };

          const doorProps = getDoorProps(doorStyle);

          // Override door styling if there are errors or warnings
          if (hasError) {
            doorProps.stroke = '#dc2626'; // red-600
            doorProps.strokeWidth = 3;
          } else if (hasWarning) {
            doorProps.stroke = '#f59e0b'; // amber-500
            doorProps.strokeWidth = 2.5;
          }

          // Get door position as 0-1 ratio along wall for rendering
          // SINGLE SOURCE OF TRUTH: Only position_on_wall_ft is supported
          const getDoorPositionRatio = (): number => {
            const wall = door.wall?.toLowerCase();

            if (typeof door.position_on_wall_ft !== 'number') {
              throw new Error(
                `Door rendering failed: "${space.name}" on ${wall} wall has no position_on_wall_ft. ` +
                `Every door must have "position_on_wall_ft" (absolute feet representing door center).`
              );
            }

            // Convert absolute feet to 0-1 ratio for rendering
            const wallLengthFt = (wall === 'north' || wall === 'south')
              ? space.size_ft.width
              : space.size_ft.height;

            return door.position_on_wall_ft / wallLengthFt;
          };

          const wallPosition = getDoorPositionRatio();

          let doorX = 0, doorY = 0, doorW = 0, doorH = 0;

          switch (door.wall?.toLowerCase()) {
            case 'north':
              doorX = x + (w * wallPosition) - (doorWidthPx / 2);
              doorY = y + halfWallThickness / 2 - doorThickness / 2; // Center in north wall
              doorW = doorWidthPx;
              doorH = doorThickness;
              break;
            case 'south':
              doorX = x + (w * wallPosition) - (doorWidthPx / 2);
              doorY = y + h - halfWallThickness / 2 - doorThickness / 2; // Center in south wall
              doorW = doorWidthPx;
              doorH = doorThickness;
              break;
            case 'east':
              doorX = x + w - halfWallThickness / 2 - doorThickness / 2; // Center in east wall
              doorY = y + (h * wallPosition) - (doorWidthPx / 2);
              doorW = doorThickness;
              doorH = doorWidthPx;
              break;
            case 'west':
              doorX = x + halfWallThickness / 2 - doorThickness / 2; // Center in west wall
              doorY = y + (h * wallPosition) - (doorWidthPx / 2);
              doorW = doorThickness;
              doorH = doorWidthPx;
              break;
            default:
              return null;
          }
          
          // Calculate badge position (next to door)
          const badgeOffsetX = door.wall === 'east' ? 12 : door.wall === 'west' ? -12 : 0;
          const badgeOffsetY = door.wall === 'south' ? 12 : door.wall === 'north' ? -12 : 0;
          const badgeX = doorX + doorW / 2 + badgeOffsetX;
          const badgeY = doorY + doorH / 2 + badgeOffsetY;

          return (
            <g key={`door-${doorIdx}`}>
              {/* Door rectangle */}
              <rect
                x={doorX}
                y={doorY}
                width={doorW}
                height={doorH}
                fill={doorProps.fill}
                stroke={doorProps.stroke}
                strokeWidth={doorProps.strokeWidth}
                opacity={doorProps.opacity}
                strokeDasharray={(doorProps as any).strokeDasharray}
              >
                {/* Tooltip showing error messages */}
                {(hasError || hasWarning) && (
                  <title>
                    {[...doorErrors, ...doorWarnings].map(err => err.message).join('\n')}
                  </title>
                )}
              </rect>

              {/* Door label (small) - shows door type initial */}
              {isSelected && (
                <text
                  x={doorX + doorW / 2}
                  y={doorY + doorH / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={8}
                  fill={doorStyle === 'secret' ? '#FF00FF' : doorProps.fill === 'none' ? doorProps.stroke : 'white'}
                  pointerEvents="none"
                >
                  {doorStyle === 'wooden' ? 'W' : doorStyle === 'stone' ? 'St' : doorStyle === 'metal' ? 'M' : doorStyle === 'archway' ? 'A' : doorStyle === 'secret' ? 'S' : 'O'}
                </text>
              )}

              {/* Error/Warning badge */}
              {hasError && (
                <g>
                  <circle
                    cx={badgeX}
                    cy={badgeY}
                    r={8}
                    fill="#dc2626"
                    stroke="white"
                    strokeWidth={2}
                  />
                  <text
                    x={badgeX}
                    y={badgeY + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={12}
                    fontWeight="bold"
                    fill="white"
                    pointerEvents="none"
                  >
                    !
                  </text>
                </g>
              )}
              {!hasError && hasWarning && (
                <g>
                  <circle
                    cx={badgeX}
                    cy={badgeY}
                    r={7}
                    fill="#f59e0b"
                    stroke="white"
                    strokeWidth={1.5}
                  />
                  <text
                    x={badgeX}
                    y={badgeY + 1}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={10}
                    fontWeight="bold"
                    fill="white"
                    pointerEvents="none"
                  >
                    !
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Reciprocal door connection lines (only for selected room) */}
        {isSelected && space.doors && space.doors.map((door, doorIdx) => {
          // Skip if door doesn't lead to a valid room
          if (!door.leads_to || door.leads_to === 'Pending' || door.leads_to === 'Outside') {
            return null;
          }

          // Find the target space
          const targetSpace = state.spaces.find(s => s.name === door.leads_to || s.code === door.leads_to);
          if (!targetSpace || !targetSpace.position) {
            return null;
          }

          // Find reciprocal door in target space
          const reciprocalDoor = targetSpace.doors?.find(d =>
            d.leads_to === space.name || d.leads_to === space.code
          );
          if (!reciprocalDoor) {
            return null; // No reciprocal door found
          }

          // Calculate door center positions for source door
          const wallPosition = door.position_on_wall_ft / ((door.wall === 'north' || door.wall === 'south') ? space.size_ft.width : space.size_ft.height);
          let doorCenterX = 0, doorCenterY = 0;

          switch (door.wall) {
            case 'north':
              doorCenterX = x + (w * wallPosition);
              doorCenterY = y;
              break;
            case 'south':
              doorCenterX = x + (w * wallPosition);
              doorCenterY = y + h;
              break;
            case 'east':
              doorCenterX = x + w;
              doorCenterY = y + (h * wallPosition);
              break;
            case 'west':
              doorCenterX = x;
              doorCenterY = y + (h * wallPosition);
              break;
          }

          // Calculate door center positions for reciprocal door
          const targetWallPosition = reciprocalDoor.position_on_wall_ft / ((reciprocalDoor.wall === 'north' || reciprocalDoor.wall === 'south') ? targetSpace.size_ft.width : targetSpace.size_ft.height);
          const targetWallThickness = targetSpace.wall_thickness_ft || state.globalWallSettings.thickness_ft;
          const targetW = ftToPx(targetSpace.size_ft.width + targetWallThickness);
          const targetH = ftToPx(targetSpace.size_ft.height + targetWallThickness);
          const targetX = ftToPx(targetSpace.position.x);
          const targetY = ftToPx(targetSpace.position.y);

          let reciprocalCenterX = 0, reciprocalCenterY = 0;

          switch (reciprocalDoor.wall) {
            case 'north':
              reciprocalCenterX = targetX + (targetW * targetWallPosition);
              reciprocalCenterY = targetY;
              break;
            case 'south':
              reciprocalCenterX = targetX + (targetW * targetWallPosition);
              reciprocalCenterY = targetY + targetH;
              break;
            case 'east':
              reciprocalCenterX = targetX + targetW;
              reciprocalCenterY = targetY + (targetH * targetWallPosition);
              break;
            case 'west':
              reciprocalCenterX = targetX;
              reciprocalCenterY = targetY + (targetH * targetWallPosition);
              break;
          }

          // Draw connection line
          return (
            <line
              key={`connection-${doorIdx}`}
              x1={doorCenterX}
              y1={doorCenterY}
              x2={reciprocalCenterX}
              y2={reciprocalCenterY}
              stroke="#3b82f6"
              strokeWidth={2}
              strokeDasharray="4 4"
              opacity={0.4}
              pointerEvents="none"
            />
          );
        })}

        {/* Resize handles (only for selected room) */}
        {isSelected && (
          <>
            {/* Northwest */}
            <rect
              x={x - RESIZE_HANDLE_SIZE / 2}
              y={y - RESIZE_HANDLE_SIZE / 2}
              width={RESIZE_HANDLE_SIZE}
              height={RESIZE_HANDLE_SIZE}
              fill="#3b82f6"
              stroke="white"
              strokeWidth={1}
              className="cursor-nw-resize"
            />
            {/* Northeast */}
            <rect
              x={x + w - RESIZE_HANDLE_SIZE / 2}
              y={y - RESIZE_HANDLE_SIZE / 2}
              width={RESIZE_HANDLE_SIZE}
              height={RESIZE_HANDLE_SIZE}
              fill="#3b82f6"
              stroke="white"
              strokeWidth={1}
              className="cursor-ne-resize"
            />
            {/* Southwest */}
            <rect
              x={x - RESIZE_HANDLE_SIZE / 2}
              y={y + h - RESIZE_HANDLE_SIZE / 2}
              width={RESIZE_HANDLE_SIZE}
              height={RESIZE_HANDLE_SIZE}
              fill="#3b82f6"
              stroke="white"
              strokeWidth={1}
              className="cursor-sw-resize"
            />
            {/* Southeast */}
            <rect
              x={x + w - RESIZE_HANDLE_SIZE / 2}
              y={y + h - RESIZE_HANDLE_SIZE / 2}
              width={RESIZE_HANDLE_SIZE}
              height={RESIZE_HANDLE_SIZE}
              fill="#3b82f6"
              stroke="white"
              strokeWidth={1}
              className="cursor-se-resize"
            />
          </>
        )}
      </g>
    );
  };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div className="flex h-full bg-gray-50">
      {/* Properties Panel - LEFT SIDE for better visibility while editing */}
      {/* Hidden in compactMode (when used alongside SpaceApprovalModal or other editing UI) */}
      {showPropertiesPanel && (
        <RoomPropertiesPanel
          onSaveAll={onSave ? () => {
            console.log('[InteractiveLocationEditor] onSaveAll triggered from RoomPropertiesPanel');
            console.log('[InteractiveLocationEditor] Saving', state.spaces.length, 'spaces');
            onSave(state.spaces);
          } : undefined}
        />
      )}

      {/* Main editor area - uses remaining space */}
      <div className="flex-1 flex flex-col min-w-0">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="font-semibold text-gray-900">
            {locationName || 'Location Editor'}
          </h3>

          {/* Undo/Redo */}
          <div className="flex items-center gap-1">
            <button
              onClick={undo}
              disabled={!canUndo}
              className={`p-2 rounded ${
                canUndo
                  ? 'hover:bg-gray-100 text-gray-700'
                  : 'text-gray-300 cursor-not-allowed'
              }`}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              className={`p-2 rounded ${
                canRedo
                  ? 'hover:bg-gray-100 text-gray-700'
                  : 'text-gray-300 cursor-not-allowed'
              }`}
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Layer toggles */}
        <div className="flex items-center gap-2">
          {/* Hide Properties button when in compactMode - properties shown in SpaceApprovalModal */}
          {!compactMode && (
          <button
            onClick={() => setShowPropertiesPanel(v => !v)}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded border ${
              showPropertiesPanel
                ? 'bg-gray-100 text-gray-800 border-gray-300'
                : 'bg-white text-gray-600 border-gray-300'
            }`}
            title={showPropertiesPanel ? 'Hide properties panel' : 'Show properties panel'}
          >
            Properties
          </button>
          )}
          <button
            onClick={() => dispatch({ type: 'TOGGLE_GRID_LAYER' })}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded border ${
              state.showGridLayer
                ? 'bg-blue-50 text-blue-700 border-blue-300'
                : 'bg-white text-gray-600 border-gray-300'
            }`}
            title="Toggle grid layer"
          >
            <Grid3x3 className="w-3 h-3" />
            Grid
          </button>
          <button
            onClick={() => dispatch({ type: 'TOGGLE_WIREFRAME_LAYER' })}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded border ${
              state.showWireframeLayer
                ? 'bg-green-50 text-green-700 border-green-300'
                : 'bg-white text-gray-600 border-gray-300'
            }`}
            title="Toggle wireframe layer"
          >
            {state.showWireframeLayer ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            Wireframe
          </button>
          <button
            onClick={() => dispatch({ type: 'TOGGLE_DETAIL_LAYER' })}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded border ${
              state.showDetailLayer
                ? 'bg-purple-50 text-purple-700 border-purple-300'
                : 'bg-white text-gray-600 border-gray-300'
            }`}
            title="Toggle detail layer"
          >
            {state.showDetailLayer ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            Details
          </button>

          {onExportImage && (
            <button
              onClick={onExportImage}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded border border-gray-300"
              title="Export to image"
            >
              <Download className="w-3 h-3" />
              Export
            </button>
          )}

          {onSave && (
            <button
              onClick={() => {
                onSave(state.spaces);
                setLastSavedState(JSON.stringify(state.spaces));
              }}
              disabled={!hasUnsavedChanges}
              className={`flex items-center gap-1 px-3 py-1 text-xs rounded ${
                hasUnsavedChanges
                  ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
              title={hasUnsavedChanges ? 'Save changes' : 'No changes to save'}
            >
              <Save className="w-3 h-3" />
              {hasUnsavedChanges ? 'Save' : 'Saved'}
            </button>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-auto p-4">
        <svg
          ref={canvasRef}
          width={CANVAS_WIDTH_PX}
          height={CANVAS_HEIGHT_PX}
          className="bg-white border border-gray-300 shadow-sm"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {renderGrid()}
          {state.showWireframeLayer && state.spaces.map(renderRoom)}
        </svg>
      </div>

      {/* Status bar */}
      <div className="bg-white border-t border-gray-200 px-4 py-2 flex items-center justify-between text-xs text-gray-600">
        <div>
          {state.selectedRoomId ? (
            <span>
              Selected: <strong>{state.selectedRoomId}</strong> • Use arrow keys to move, Del to delete
            </span>
          ) : (
            <span>Click a room to select • Drag to move • Drag corners to resize</span>
          )}
        </div>
        <div>
          {state.spaces.length} room{state.spaces.length !== 1 ? 's' : ''} • Grid: {GRID_SIZE}ft
        </div>
      </div>
      </div>
    </div>
  );
}
