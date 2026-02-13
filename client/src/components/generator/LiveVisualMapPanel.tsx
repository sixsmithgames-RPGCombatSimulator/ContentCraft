/**
 * Live Visual Map Panel - Displays growing location map during iterative generation
 *
 * Shows a real-time HTML visualization of the location as spaces are generated.
 * Updates after each space iteration to show the user what's being created.
 *
 * Features:
 * - Collapsible panel to save screen space
 * - Download map as HTML file
 * - Toggle between rendered and raw HTML view
 * - Visual progress indicator
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { Map, ChevronDown, ChevronUp, Download, Loader, ZoomIn, ZoomOut, Maximize2, Plus } from 'lucide-react';
import { LocationEditorProvider } from '../../contexts/LocationEditorContext';
import InteractiveLocationEditor from './InteractiveLocationEditor';
import type { Door, Space, WallSettings } from '../../contexts/locationEditorTypes';
import type { LiveMapSpace } from '../../types/liveMapTypes';

type PlacedRoom = (Space & Record<string, unknown>) & {
  position: { x: number; y: number };
  placed: boolean;
};

function requireSizeFt(space: LiveMapSpace): { width: number; height: number } {
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

function getSpaceDimsForKey(space: LiveMapSpace): { width?: number; height?: number } {
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

interface LiveVisualMapPanelProps {
  updateToken?: number;
  locationName: string;
  totalSpaces: number;
  currentSpace: number;
  spaces: LiveMapSpace[];
  isGenerating: boolean;
  onUpdateSpaces?: (updatedSpaces: LiveMapSpace[]) => void;
  onAddSpace?: () => void; // Callback when Add Space button is clicked
  /** Id (name/code) of the space that should be highlighted in the editor */
  selectedSpaceId?: string | null;
  /** Notify parent when user selects a space in the editor */
  onSelectSpace?: (spaceId: string | null) => void;
}

export default function LiveVisualMapPanel({
  updateToken,
  locationName,
  totalSpaces,
  currentSpace,
  spaces,
  isGenerating,
  onUpdateSpaces,
  onAddSpace,
  selectedSpaceId,
  onSelectSpace,
}: LiveVisualMapPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [showRawHtml, setShowRawHtml] = useState(false);
  const [showStitchedMap, setShowStitchedMap] = useState(false);
  const [showInteractiveEditor, setShowInteractiveEditor] = useState(false);
  const [zoom, setZoom] = useState(100); // Zoom percentage
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [htmlContent, setHtmlContent] = useState<string>('');

  const [globalWallSettings, setGlobalWallSettings] = useState<WallSettings>({ thickness_ft: 10, material: 'stone' });

  // Layer visibility toggles
  const [showGridLayer, setShowGridLayer] = useState(true);
  const [showWireframeLayer, setShowWireframeLayer] = useState(true);
  const [showDetailLayer, setShowDetailLayer] = useState(true);

  // Generate HTML map from spaces
  useEffect(() => {
    if (spaces.length === 0) {
      console.log('[LiveMap] No spaces yet');
      setHtmlContent('');
      return;
    }

    console.log('[LiveMap] Generating HTML for', spaces.length, 'spaces');
    // Generate full HTML for download
    const fullHtml = generateMapHTML(locationName, spaces, totalSpaces, currentSpace, false);
    setHtmlContent(fullHtml);

    // Generate inline HTML for display (without html/head/body tags)
    const inlineHtml = generateMapHTML(locationName, spaces, totalSpaces, currentSpace, true);
    console.log('[LiveMap] Inline HTML length:', inlineHtml.length);

    // Render inline HTML to container
    if (containerRef.current && !showRawHtml) {
      console.log('[LiveMap] Setting innerHTML on container');
      console.log('[LiveMap] Inline HTML preview (first 200 chars):', inlineHtml.substring(0, 200));
      containerRef.current.innerHTML = inlineHtml;
      console.log('[LiveMap] Container innerHTML set, children count:', containerRef.current.children.length);
      console.log('[LiveMap] Container first child:', containerRef.current.firstElementChild?.tagName);
    } else {
      console.log('[LiveMap] Container ref not ready or showRawHtml is true. Ref:', !!containerRef.current, 'showRawHtml:', showRawHtml);
    }
  }, [spaces, locationName, totalSpaces, currentSpace, showRawHtml, updateToken]);

  const handleDownload = () => {
    if (!htmlContent) return;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${locationName.replace(/\s+/g, '_')}_map_in_progress.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Memoize the stitched map HTML to avoid regenerating on every render
  // Use JSON hash of key space properties to ensure deep changes are detected
  const spacesHash = useMemo(() => 
    JSON.stringify(spaces.map(s => ({
      name: s.name,
      size_ft: s.size_ft,
      dimensions: s.dimensions,
      doors: s.doors?.length || 0,
      wall_thickness_ft: s.wall_thickness_ft,
      wall_material: s.wall_material,
    }))),
    [spaces, updateToken]
  );
  
  const stitchedMapHtml = useMemo(() => {
    if (!showStitchedMap || spaces.length === 0) return '';
    console.log('[useMemo] Regenerating stitched map, hash:', spacesHash.substring(0, 50));
    return generateStitchedMap(spaces, locationName, showGridLayer, showWireframeLayer, showDetailLayer);
  }, [spacesHash, locationName, showGridLayer, showWireframeLayer, showDetailLayer, showStitchedMap, spaces]);

  const toggleFullscreen = () => {
    if (!panelRef.current) return;

    if (!isFullscreen) {
      if (panelRef.current.requestFullscreen) {
        panelRef.current.requestFullscreen();
        setIsFullscreen(true);
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const progress = totalSpaces > 0 ? (currentSpace / totalSpaces) * 100 : 0;

  return (
    <div ref={panelRef} className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-green-50 border-b border-blue-200 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Map className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-semibold text-gray-900">Live Visual Map</h3>
              <p className="text-xs text-gray-600">
                {currentSpace} of {totalSpaces} spaces • {Math.round(progress)}% complete
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Left group: Status */}
            {isGenerating && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-100 rounded-full">
                <Loader className="w-3 h-3 text-blue-600 animate-spin" />
                <span className="text-xs text-blue-700 font-medium">Generating...</span>
              </div>
            )}

            {/* View mode buttons - compact group */}
            <div className="flex items-center gap-1 border border-gray-300 rounded bg-white">
              <button
                onClick={() => {
                  setShowInteractiveEditor(!showInteractiveEditor);
                  if (!showInteractiveEditor) {
                    setShowStitchedMap(false);
                    setShowRawHtml(false);
                  }
                }}
                disabled={spaces.length === 0}
                className={`px-2 py-1 text-xs rounded-l disabled:opacity-50 ${
                  showInteractiveEditor
                    ? 'text-white bg-blue-600'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
                title="Interactive editor"
              >
                Editor
              </button>
              <button
                onClick={() => {
                  setShowStitchedMap(!showStitchedMap);
                  if (!showStitchedMap) {
                    setShowInteractiveEditor(false);
                    setShowRawHtml(false);
                  }
                }}
                disabled={spaces.length === 0}
                className={`px-2 py-1 text-xs disabled:opacity-50 ${
                  showStitchedMap
                    ? 'text-white bg-purple-600'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
                title="Spatial layout"
              >
                Layout
              </button>
              <button
                onClick={() => setShowRawHtml(!showRawHtml)}
                className={`px-2 py-1 text-xs rounded-r ${
                  showRawHtml
                    ? 'text-white bg-gray-600'
                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                }`}
                title={showRawHtml ? 'Show rendered' : 'Show HTML'}
              >
                HTML
              </button>
            </div>

            {/* Wall settings - shown in editor mode */}
            {showInteractiveEditor && (
              <div className="flex items-center gap-1 px-2 py-1 border border-gray-300 rounded bg-white">
                <span className="text-xs text-gray-700">Walls:</span>
                <input
                  type="number"
                  value={globalWallSettings.thickness_ft}
                  onChange={(e) => {
                    const newValue = parseFloat(e.target.value) || 1;
                    console.log('[LiveVisualMapPanel] Wall thickness changed:', globalWallSettings.thickness_ft, '→', newValue);
                    setGlobalWallSettings({ ...globalWallSettings, thickness_ft: newValue });
                  }}
                  className="w-12 px-1 py-0.5 text-xs border border-gray-300 rounded"
                  min="0.5"
                  max="10"
                  step="0.5"
                  title="Wall thickness (ft)"
                />
                <span className="text-xs text-gray-500">ft</span>
                <select
                  value={globalWallSettings.material}
                  onChange={(e) => {
                    console.log('[LiveVisualMapPanel] Wall material changed:', globalWallSettings.material, '→', e.target.value);
                    setGlobalWallSettings({ ...globalWallSettings, material: e.target.value });
                  }}
                  className="px-1 py-0.5 text-xs border border-gray-300 rounded"
                  title="Wall material"
                >
                  <option value="stone">Stone</option>
                  <option value="brick">Brick</option>
                  <option value="wood">Wood</option>
                </select>
              </div>
            )}

            {/* Zoom controls - compact */}
            <div className="flex items-center gap-0 border border-gray-300 rounded">
              <button
                onClick={() => setZoom(Math.max(50, zoom - 10))}
                className="px-1.5 py-1 text-xs text-gray-600 hover:bg-gray-50 rounded-l"
                title="Zoom out"
              >
                <ZoomOut className="w-3 h-3" />
              </button>
              <span className="text-xs text-gray-600 px-1.5 border-x border-gray-300">{zoom}%</span>
              <button
                onClick={() => setZoom(Math.min(200, zoom + 10))}
                className="px-1.5 py-1 text-xs text-gray-600 hover:bg-gray-50"
                title="Zoom in"
              >
                <ZoomIn className="w-3 h-3" />
              </button>
              <button
                onClick={toggleFullscreen}
                className="px-1.5 py-1 text-xs text-gray-600 hover:bg-gray-50 border-l border-gray-300 rounded-r"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            </div>

            {/* Action buttons */}
            {onAddSpace && (
              <button
                onClick={onAddSpace}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                title="Add space"
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
            )}

            <button
              onClick={handleDownload}
              disabled={spaces.length === 0}
              className="p-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded hover:bg-blue-50 disabled:opacity-50"
              title="Download"
            >
              <Download className="w-3 h-3" />
            </button>

            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 text-gray-600 hover:text-gray-800 hover:bg-white rounded"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-2 bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className="bg-gradient-to-r from-blue-500 to-green-500 h-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Layer Controls - Only show when stitched map is active */}
        {showStitchedMap && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-gray-50 rounded border border-gray-200">
            <span className="text-xs font-semibold text-gray-700">Layers:</span>
            <button
              onClick={() => setShowGridLayer(!showGridLayer)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                showGridLayer
                  ? 'bg-blue-500 text-white font-semibold'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
              title="Toggle grid layer (5ft squares)"
            >
              Grid
            </button>
            <button
              onClick={() => setShowWireframeLayer(!showWireframeLayer)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                showWireframeLayer
                  ? 'bg-green-500 text-white font-semibold'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
              title="Toggle wireframe layer (room outlines and furniture)"
            >
              Wireframe
            </button>
            <button
              onClick={() => setShowDetailLayer(!showDetailLayer)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                showDetailLayer
                  ? 'bg-purple-500 text-white font-semibold'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
              title="Toggle HTML detail layer (colors and labels)"
            >
              HTML
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="flex-1 overflow-auto">
          {spaces.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <Map className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p className="text-sm">Map will appear as spaces are generated</p>
            </div>
          ) : showInteractiveEditor ? (
            (() => {
              try {
                const initialSpaces = convertSpacesForEditor(spaces, globalWallSettings);

                return (
                  <div
                    className="h-full overflow-auto bg-gray-100"
                    style={{
                      transform: `scale(${zoom / 100})`,
                      transformOrigin: 'top left',
                      width: `${10000 / zoom}%`,
                      height: `${10000 / zoom}%`,
                    }}
                  >
                  <LocationEditorProvider
                    key={`${spaces.map(s => {
                      const dims = getSpaceDimsForKey(s);
                      const doorsKey = (s.doors || []).map(d => `${d.wall}:${d.position_on_wall_ft}`).join(',');
                      return `${s.name}-${dims.width}-${dims.height}-${doorsKey}-${s.shape || 'rect'}-${s.space_type || 'room'}-${s.wall_thickness_ft ?? ''}-${s.wall_material ?? ''}`;
                    }).join('|')}`}
                    initialSpaces={initialSpaces}
                    initialGlobalWallSettings={globalWallSettings}
                    onGlobalWallSettingsChange={setGlobalWallSettings}
                  >
                    <InteractiveLocationEditor
                      locationName={locationName}
                      compactMode={true}  // Hide properties panel - all properties shown in SpaceApprovalModal (left pane)
                      selectedRoomId={selectedSpaceId}
                      onSelectionChange={onSelectSpace ? (roomId) => onSelectSpace(roomId) : undefined}
                      onSave={(updatedSpaces) => {
                  console.log('[LiveVisualMapPanel] onSave triggered with', updatedSpaces.length, 'spaces');
                  console.log('[LiveVisualMapPanel] First space sample:', updatedSpaces[0]);

                  // Convert back from editor format to live map format
                  const convertedSpaces: LiveMapSpace[] = updatedSpaces.map((space) => {
                    const normalizedSize = { width: space.size_ft.width, height: space.size_ft.height };
                    const dimensions = { width: normalizedSize.width, height: normalizedSize.height, unit: 'ft' };

                    return {
                      // Start from editor state
                      ...space,
                      // Ensure size_ft/dimensions reflect the latest numeric values
                      size_ft: normalizedSize,
                      dimensions,
                      // Normalize function/purpose field
                      function: space.purpose,
                      // Rebuild simple connections list from doors for backwards compatibility
                      connections: Array.isArray(space.doors)
                        ? space.doors
                          .map((door: Door) => door.leads_to)
                          .filter((v: string): v is string => typeof v === 'string' && v.length > 0)
                        : [],
                    };
                  });

                  console.log('[LiveVisualMapPanel] Converted spaces sample:', convertedSpaces[0]);

                  if (onUpdateSpaces) {
                    console.log('[LiveVisualMapPanel] Calling onUpdateSpaces callback');
                    onUpdateSpaces(convertedSpaces);
                    console.log('[LiveVisualMapPanel] ✓ onUpdateSpaces completed');
                  } else {
                    console.warn('[LiveVisualMapPanel] ⚠️ No onUpdateSpaces callback provided');
                  }
                      }}
                      onExportImage={undefined} // Export feature not yet implemented
                    />
                  </LocationEditorProvider>
                  </div>
                );
              } catch (e) {
                const message = e instanceof Error ? e.message : 'Invalid spaces for editor.';
                return (
                  <div className="p-4">
                    <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
                      {message}
                    </div>
                  </div>
                );
              }
            })()
          ) : showStitchedMap ? (
            <div className="h-full overflow-auto bg-gray-100">
              <div
                className="p-4"
                style={{
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: 'top left',
                  width: `${10000 / zoom}%`,
                }}
                dangerouslySetInnerHTML={{ __html: stitchedMapHtml }}
              />
            </div>
          ) : showRawHtml ? (
            <div className="p-4 bg-gray-50 h-full overflow-auto">
              <pre className="text-xs font-mono text-gray-800 whitespace-pre-wrap">
                {htmlContent}
              </pre>
            </div>
          ) : (
            <div
              className="h-full overflow-auto bg-white"
              style={{ minHeight: '200px' }}
            >
              <div
                ref={containerRef}
                className="p-4"
                style={{
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: 'top left',
                  width: `${10000 / zoom}%`, // Adjust width so content doesn't get cut off when zoomed
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Converts spaces from LiveVisualMapPanel format to InteractiveLocationEditor format
 * The editor needs spaces with position coordinates, which we calculate using the same
 * spatial layout algorithm as generateStitchedMap
 */
function convertSpacesForEditor(spaces: LiveMapSpace[], globalWallSettings: WallSettings = { thickness_ft: 1, material: 'stone' }): Space[] {
  if (spaces.length === 0) return [];

  // Use the same spatial layout logic from generateStitchedMap
  const gridSquareFeet = 5;

  // If any incoming space already has a position, we treat this as a
  // manual layout from the user and preserve those coordinates.
  const hasManualPositions = spaces.some(space =>
    space && typeof space.position === 'object' &&
    typeof space.position.x === 'number' &&
    typeof space.position.y === 'number'
  );

  const rooms: PlacedRoom[] = spaces.map((space, index) => {
    const { width: widthFt, height: heightFt } = requireSizeFt(space);

    const code = typeof space.code === 'string' && space.code.trim().length > 0
      ? space.code
      : (typeof space.id === 'string' && space.id.trim().length > 0 ? space.id : space.name);

    const hasManualPosition = !!(
      space.position &&
      typeof space.position === 'object' &&
      typeof space.position.x === 'number' &&
      Number.isFinite(space.position.x) &&
      typeof space.position.y === 'number' &&
      Number.isFinite(space.position.y)
    );

    // Extract wall data from space
    let wallThicknessFt: number | undefined;
    let wallMaterial: string | undefined;

    // Check for flat properties format (preferred)
    if (typeof (space as any).wall_thickness_ft === 'number') {
      wallThicknessFt = (space as any).wall_thickness_ft;
    }

    if (typeof (space as any).wall_material === 'string') {
      wallMaterial = (space as any).wall_material;
    }

    // If not found, check legacy walls array format
    if (wallThicknessFt === undefined || wallMaterial === undefined) {
      const walls = (space as any).walls;
      if (Array.isArray(walls) && walls.length > 0) {
        // Calculate average thickness from walls
        const validWalls = walls.filter((w: any) =>
          w.side && typeof w.thickness === 'number' && w.thickness > 0
        );

        if (validWalls.length > 0) {
          const totalThickness = validWalls.reduce((sum: number, w: any) => sum + w.thickness, 0);
          wallThicknessFt = totalThickness / validWalls.length;

          // Get material from first wall
          if (wallMaterial === undefined && typeof validWalls[0].material === 'string') {
            wallMaterial = validWalls[0].material;
          }
        }
      }
    }

    // Wall properties are now optional - rooms without explicit values use global defaults
    // This is the intended behavior, not an error

    // Build room object - only include wall properties if they were explicitly set in source data
    const room: PlacedRoom = {
      ...(space as unknown as Record<string, unknown>),
      index,
      level: 0,
      code,
      name: space.name,
      size_ft: { width: widthFt, height: heightFt },
      doors: Array.isArray(space.doors) ? (space.doors as unknown as Door[]) : undefined,
      position: hasManualPosition ? { x: space.position!.x, y: space.position!.y } : { x: 0, y: 0 },
      placed: hasManualPosition,
      // Preserve position_locked if it exists, or lock rooms that already have manual positions
      position_locked: typeof (space as any).position_locked === 'boolean'
        ? (space as any).position_locked
        : (hasManualPosition ? true : false),
      // Only include wall properties if they exist in source - don't add defaults
      // This allows global settings to work as defaults for rooms without explicit values
      ...((space as any).wall_thickness_ft !== undefined && { wall_thickness_ft: (space as any).wall_thickness_ft }),
      ...((space as any).wall_material !== undefined && { wall_material: (space as any).wall_material }),
    };

    return room;
  });

  // Only run automatic door-based layout when we DON'T already
  // have manual positions from the editor.
  if (!hasManualPositions && rooms.length > 0) {
    // Position first room
    rooms[0].position = { x: gridSquareFeet * 10, y: gridSquareFeet * 10 };
    rooms[0].placed = true;

    // Build room lookup
    const roomByName: Record<string, PlacedRoom> = {};
    rooms.forEach((room) => {
      roomByName[room.name] = room;
    });

    const snapToGrid = (value: number): number => {
      return Math.round(value / gridSquareFeet) * gridSquareFeet;
    };

    // BFS to position connected rooms
    const queue = [rooms[0]];
    const processed = new Set<string>();

    while (queue.length > 0) {
      const currentRoom = queue.shift()!;
      if (processed.has(currentRoom.name)) continue;
      processed.add(currentRoom.name);

      // Get doors from the room
      const doors = Array.isArray(currentRoom.doors) ? currentRoom.doors : [];
      doors.forEach((door: Door) => {
        if (!door.leads_to || door.leads_to === 'Pending') return;

        const targetRoom = roomByName[door.leads_to];
        if (!targetRoom || targetRoom.placed) return;

        // Calculate position based on door wall
        const fromX = currentRoom.position.x;
        const fromY = currentRoom.position.y;
        const fromWidth = currentRoom.size_ft.width;
        const fromHeight = currentRoom.size_ft.height;
        const toWidth = targetRoom.size_ft.width;
        const toHeight = targetRoom.size_ft.height;

        // Get wall thickness for proper spacing
        // Walls extend halfWallThickness outward from interior, meeting adjacent rooms in the middle
        const fromWallThickness = (currentRoom as any).wall_thickness_ft ?? globalWallSettings.thickness_ft;
        const toWallThickness = (targetRoom as any).wall_thickness_ft ?? globalWallSettings.thickness_ft;
        const wallGap = (fromWallThickness + toWallThickness) / 2;

        let x, y;
        switch (door.wall) {
          case 'north':
            x = fromX;
            y = fromY - toHeight - wallGap;
            break;
          case 'south':
            x = fromX;
            y = fromY + fromHeight + wallGap;
            break;
          case 'east':
            x = fromX + fromWidth + wallGap;
            y = fromY;
            break;
          case 'west':
            x = fromX - toWidth - wallGap;
            y = fromY;
            break;
          default:
            x = fromX + fromWidth + 20;
            y = fromY;
        }

        targetRoom.position = { x: snapToGrid(x), y: snapToGrid(y) };
        targetRoom.placed = true;
        queue.push(targetRoom);
      });
    }
  }

  // Position any unplaced rooms in a grid to the side
  const unplacedRooms = rooms.filter((r) => !r.placed);
  if (unplacedRooms.length > 0) {
    const gridCols = Math.ceil(Math.sqrt(unplacedRooms.length));
    unplacedRooms.forEach((room, idx) => {
      const col = idx % gridCols;
      const row = Math.floor(idx / gridCols);
      room.position = {
        x: 500 + col * 200,
        y: row * 200,
      };
      room.placed = true;
    });
  }

  // Normalize coordinates - shift everything to positive quadrant with padding
  const minX = Math.min(...rooms.map((r) => r.position.x));
  const minY = Math.min(...rooms.map((r) => r.position.y));
  const padding = gridSquareFeet * 2; // 10ft padding

  rooms.forEach((room) => {
    room.position.x = room.position.x - minX + padding;
    room.position.y = room.position.y - minY + padding;
  });

  return rooms.map((r) => {
    const rest: Record<string, unknown> = { ...r };
    delete rest.placed;
    return rest as unknown as Space;
  });
}

/**
 * Generates full-width floor plan for a single space (one per row)
 * Now supports rich visual JSON data from AI
 */
function generateFullWidthFloorPlan(
  space: LiveMapSpace,
  colors: { bg: string; border: string },
  index: number,
  isGenerating: boolean
): string {
  // SVG canvas configuration
  const svgHeight = 512;
  const svgWidth = 1000;
  const padding = 60;
  const scale = 8; // pixels per foot

  let roomWidthFt = 0;
  let roomHeightFt = 0;
  try {
    const roomSize = requireSizeFt(space);
    roomWidthFt = roomSize.width;
    roomHeightFt = roomSize.height;
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid space size_ft.';
    return `
      <div style="background:#fff;border:3px solid ${colors.border};border-radius:8px;overflow:hidden;margin-bottom:0;">
        <div style="padding:12px;color:#991b1b;background:#fef2f2;border:1px solid #fecaca;font-family:Arial,sans-serif;font-size:13px;">
          ${message}
        </div>
      </div>
    `;
  }

  // Calculate scaled room dimensions
  let roomWidth = roomWidthFt * scale;
  let roomHeight = roomHeightFt * scale;

  // Scale down if too large
  const maxRoomWidth = svgWidth - padding * 2;
  const maxRoomHeight = svgHeight - padding * 2;

  if (roomWidth > maxRoomWidth || roomHeight > maxRoomHeight) {
    const scaleDown = Math.min(maxRoomWidth / roomWidth, maxRoomHeight / roomHeight);
    roomWidth *= scaleDown;
    roomHeight *= scaleDown;
  }

  // Center the room
  const roomX = (svgWidth - roomWidth) / 2;
  const roomY = (svgHeight - roomHeight) / 2;
  const scaleFactor = roomWidth / roomWidthFt; // actual pixels per foot after scaling

  // Extract visual data
  const spaceRecord = space as unknown as Record<string, unknown>;

  const floorRaw = spaceRecord.floor;
  const floorRecord = typeof floorRaw === 'object' && floorRaw !== null ? (floorRaw as Record<string, unknown>) : null;
  const floor = {
    material: typeof floorRecord?.material === 'string' ? floorRecord.material : 'stone',
    color: typeof floorRecord?.color === 'string' ? floorRecord.color : '#D3D3D3',
  };

  const wallsRaw = spaceRecord.walls;
  const walls = Array.isArray(wallsRaw) ? wallsRaw : [];

  const doors = Array.isArray(space.doors) ? space.doors : [];

  const featuresRaw = spaceRecord.features;
  const features = Array.isArray(featuresRaw) ? featuresRaw : [];

  const pulseStyle = isGenerating ? 'animation:pulse 1.5s infinite;' : '';

  // Generate SVG patterns for textures
  const patterns = generateTexturePatterns();

  // Generate wall SVG (includes both patterns and rects)
  const wallResult = generateWalls(walls, space, roomX, roomY, roomWidth, roomHeight);
  const wallPatterns = wallResult.patterns;
  const wallSVG = wallResult.svg;

  // Generate door SVG
  const doorSVG = generateDoors(doors, roomX, roomY, roomWidth, roomHeight, roomWidthFt);

  // Generate features SVG
  const featuresSVG = generateFeatures(features, roomX, roomY, scaleFactor);

  return `
    <div style="background:#fff;border:3px solid ${colors.border};border-radius:8px;overflow:hidden;margin-bottom:0;${pulseStyle}">
      <svg width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet" style="background:#f9fafb;">
        <defs>
          ${patterns}
          ${wallPatterns}
        </defs>

        <!-- Space number badge -->
        <rect x="10" y="10" width="60" height="30" fill="rgba(255,255,255,0.95)" stroke="${colors.border}" stroke-width="2" rx="6" />
        <text x="40" y="30" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#1f2937">
          #${index + 1}
        </text>

        <!-- Floor -->
        <rect x="${roomX}" y="${roomY}" width="${roomWidth}" height="${roomHeight}"
              fill="${floor.color}" stroke="none" />

        <!-- Walls -->
        ${wallSVG}

        <!-- Doors -->
        ${doorSVG}

        <!-- Interior Features -->
        ${featuresSVG}

        <!-- Room name (top right) -->
        <text x="${svgWidth - 10}" y="35" text-anchor="end" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#1f2937">
          ${space.name}
        </text>

        <!-- Dimensions (below room name) -->
        <text x="${svgWidth - 10}" y="60" text-anchor="end" font-family="Arial, sans-serif" font-size="16" font-weight="600" fill="#6b7280">
          ${roomWidthFt}×${roomHeightFt} ft
        </text>

        <!-- Purpose (below dimensions) -->
        ${space.purpose ? `
          <text x="${svgWidth - 10}" y="82" text-anchor="end" font-family="Arial, sans-serif" font-size="14" fill="#9ca3af">
            ${space.purpose}
          </text>
        ` : ''}
      </svg>
    </div>
  `;
}

/**
 * Generates SVG floor plan sketch for a single space (OLD - DEPRECATED)
 */
function generateFloorPlanSVG_OLD(
  space: {
    name: string;
    dimensions?: string;
    function?: string;
    connections?: string[];
  },
  colors: { bg: string; border: string },
  _index: number
): string {
  void _index;
  // Parse dimensions (e.g., "50×30 ft", "40 ft diameter", "60x40x20")
  const parsedDims = parseDimensions(space.dimensions);
  const { width, height } = parsedDims;

  // SVG canvas size
  const svgWidth = 300;
  const svgHeight = 200;
  const padding = 20;

  // Calculate room rectangle size (fit within canvas)
  const aspectRatio = width / height;
  let roomWidth = svgWidth - padding * 2;
  let roomHeight = roomWidth / aspectRatio;

  if (roomHeight > svgHeight - padding * 2) {
    roomHeight = svgHeight - padding * 2;
    roomWidth = roomHeight * aspectRatio;
  }

  const roomX = (svgWidth - roomWidth) / 2;
  const roomY = (svgHeight - roomHeight) / 2;

  // Determine door positions from connections
  const doors = generateDoorPositions(space.connections || [], roomX, roomY, roomWidth, roomHeight);

  // Generate simple interior features (based on function)
  const features = generateRoomFeatures(space.function, roomX, roomY, roomWidth, roomHeight);

  return `
    <svg width="100%" height="100%" viewBox="0 0 ${svgWidth} ${svgHeight}" preserveAspectRatio="xMidYMid meet" style="background:${colors.bg};min-height:250px;">
      <!-- Room outline -->
      <rect x="${roomX}" y="${roomY}" width="${roomWidth}" height="${roomHeight}"
            fill="#ffffff" stroke="${colors.border}" stroke-width="4" />

      <!-- Interior features -->
      ${features}

      <!-- Doors/connections -->
      ${doors}

      <!-- Room label at bottom -->
      <text x="${svgWidth / 2}" y="${svgHeight - 12}"
            text-anchor="middle" font-family="Arial, sans-serif" font-size="14" font-weight="700" fill="#1f2937">
        ${space.name}
      </text>

      <!-- Dimensions label -->
      ${space.dimensions ? `
        <text x="${svgWidth / 2}" y="18"
              text-anchor="middle" font-family="Arial, sans-serif" font-size="12" font-weight="600" fill="#4b5563">
          ${space.dimensions}
        </text>
      ` : ''}
    </svg>
  `;
}

void generateFloorPlanSVG_OLD;

/**
 * Generate SVG pattern definitions for material textures
 */
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

/**
 * Generate wall SVG elements with hatch patterns
 */
function generateWalls(
  walls: unknown[],
  space: LiveMapSpace,
  roomX: number,
  roomY: number,
  roomWidth: number,
  roomHeight: number
): { patterns: string; svg: string } {
  if (walls.length === 0) {
    // Get wall properties from space or use defaults
    const spaceRecord = space as unknown as Record<string, unknown>;
    const defaultThicknessFt = 10; // Default 10ft walls (matches global default)
    const thicknessFt = typeof spaceRecord.wall_thickness_ft === 'number'
      ? spaceRecord.wall_thickness_ft
      : defaultThicknessFt;
    const wallThickness = thicknessFt * 2; // Convert feet to pixels (2px per foot)

    const defaultMaterial = 'stone';
    const material = typeof spaceRecord.wall_material === 'string'
      ? spaceRecord.wall_material
      : defaultMaterial;

    // Color based on material
    const wallColor = material === 'wood' ? '#8B4513' :
                     material === 'brick' ? '#A0522D' :
                     '#6B6B6B'; // stone/default

    // Create unique hatch pattern for this room
    const spaceName = typeof spaceRecord.name === 'string' ? spaceRecord.name : 'room';
    const patternId = `hatch-${spaceName.replace(/[^a-zA-Z0-9-]/g, '_')}`;

    const patterns = `
      <pattern id="${patternId}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <line x1="0" y1="0" x2="0" y2="6" stroke="${wallColor}" stroke-width="1.5" opacity="1" />
      </pattern>
    `;

    const svg = `
      <rect x="${roomX}" y="${roomY}" width="${roomWidth}" height="${wallThickness}" fill="url(#${patternId})" />
      <rect x="${roomX}" y="${roomY + roomHeight - wallThickness}" width="${roomWidth}" height="${wallThickness}" fill="url(#${patternId})" />
      <rect x="${roomX}" y="${roomY}" width="${wallThickness}" height="${roomHeight}" fill="url(#${patternId})" />
      <rect x="${roomX + roomWidth - wallThickness}" y="${roomY}" width="${wallThickness}" height="${roomHeight}" fill="url(#${patternId})" />
    `;

    return { patterns, svg };
  }

  // Deduplicate walls by side (handle data corruption with 260 duplicate entries)
  const wallsBySide: Record<string, any[]> = {};

  for (const wallUnknown of walls) {
    const wall = typeof wallUnknown === 'object' && wallUnknown !== null ? (wallUnknown as Record<string, unknown>) : {};
    const side = typeof wall.side === 'string' ? wall.side : 'unknown';

    if (!wallsBySide[side]) {
      wallsBySide[side] = [];
    }
    wallsBySide[side].push(wall);
  }

  // Log deduplication if significant
  const uniqueSides = Object.keys(wallsBySide).length;
  if (walls.length > uniqueSides * 2) {
    const spaceRecord = space as unknown as Record<string, unknown>;
    const spaceName = typeof spaceRecord.name === 'string' ? spaceRecord.name : 'Unknown';
    console.log(`[HTML Export] Room "${spaceName}": deduplicated ${walls.length} walls to ${uniqueSides} sides`);
  }

  // For each side, average the wall properties
  const uniqueWalls = Object.entries(wallsBySide).map(([side, sideWalls]) => {
    // Average thickness
    const thicknesses = sideWalls
      .map(w => typeof w.thickness === 'number' ? w.thickness : 0)
      .filter(t => t > 0);
    const avgThickness = thicknesses.length > 0
      ? thicknesses.reduce((sum, t) => sum + t, 0) / thicknesses.length
      : 3;

    // Use first wall's color and material
    const firstWall = sideWalls[0];

    return {
      side,
      thickness: avgThickness,
      color: typeof firstWall.color === 'string' ? firstWall.color : '#6B6B6B',
      material: typeof firstWall.material === 'string' ? firstWall.material : 'stone'
    };
  });

  // Create hatch pattern for this room based on material
  const spaceRecord = space as unknown as Record<string, unknown>;
  const spaceName = typeof spaceRecord.name === 'string' ? spaceRecord.name : 'room';
  const patternId = `hatch-${spaceName.replace(/[^a-zA-Z0-9-]/g, '_')}`;

  // Use first wall's material/color for the pattern
  const firstWall = uniqueWalls[0];
  const wallColor = firstWall.material === 'wood' ? '#8B4513' :
                   firstWall.material === 'brick' ? '#A0522D' :
                   firstWall.color; // Use legacy color for stone

  const patterns = `
    <pattern id="${patternId}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="${wallColor}" stroke-width="1.5" opacity="1" />
    </pattern>
  `;

  const svg = uniqueWalls.map((wall) => {
    const thicknessFt = wall.thickness;
    const thickness = thicknessFt * 2;

    let x = roomX, y = roomY, w = roomWidth, h = thickness;

    switch (wall.side) {
      case 'north':
        y = roomY;
        break;
      case 'south':
        y = roomY + roomHeight - thickness;
        break;
      case 'east':
        x = roomX + roomWidth - thickness;
        w = thickness;
        h = roomHeight;
        break;
      case 'west':
        x = roomX;
        w = thickness;
        h = roomHeight;
        break;
    }

    // Use hatch pattern instead of solid color
    return `
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#${patternId})" />
    `;
  }).join('');

  return { patterns, svg };
}

/**
 * Generate door SVG elements
 */
function generateDoors(
  doors: unknown[],
  roomX: number,
  roomY: number,
  roomWidth: number,
  roomHeight: number,
  roomWidthFt: number
): string {
  return doors.map((doorUnknown) => {
    const door = typeof doorUnknown === 'object' && doorUnknown !== null ? (doorUnknown as Record<string, unknown>) : {};
    const widthFt = typeof door.width_ft === 'number' ? door.width_ft : NaN;
    const position = typeof door.position_on_wall_ft === 'number' ? door.position_on_wall_ft : NaN; // Feet from wall start (door center)
    const doorType = typeof door.door_type === 'string' ? door.door_type : '';

    if (!Number.isFinite(widthFt) || !Number.isFinite(position) || doorType.trim().length === 0) return '';

    const doorWidthPx = widthFt * (roomWidth / roomWidthFt);
    const color = typeof door.color === 'string' ? door.color : '#8B4513';
    const style = doorType;

    let x = 0, y = 0, w = doorWidthPx, h = 8;
    let labelX = 0, labelY = 0;

    switch (door.wall) {
      case 'north':
        x = roomX + roomWidth * position - doorWidthPx / 2;
        y = roomY - 2;
        h = 10;
        labelX = x + doorWidthPx / 2;
        labelY = roomY - 12;
        break;
      case 'south':
        x = roomX + roomWidth * position - doorWidthPx / 2;
        y = roomY + roomHeight - 8;
        h = 10;
        labelX = x + doorWidthPx / 2;
        labelY = roomY + roomHeight + 18;
        break;
      case 'east':
        x = roomX + roomWidth - 8;
        y = roomY + roomHeight * position - doorWidthPx / 2;
        w = 10;
        h = doorWidthPx;
        labelX = roomX + roomWidth + 12;
        labelY = y + doorWidthPx / 2;
        break;
      case 'west':
        x = roomX - 2;
        y = roomY + roomHeight * position - doorWidthPx / 2;
        w = 10;
        h = doorWidthPx;
        labelX = roomX - 12;
        labelY = y + doorWidthPx / 2;
        break;
    }

    // Door style variations
    let doorFill = color;
    if (style === 'iron' || style === 'portcullis') {
      doorFill = '#4A4A4A';
    } else if (style === 'archway') {
      doorFill = 'none';
    }

    return `
      <rect x="${x}" y="${y}" width="${w}" height="${h}"
            fill="${doorFill}"
            stroke="#000"
            stroke-width="${style === 'archway' ? 3 : 2}"
            rx="${style === 'archway' ? w/2 : 1}" />
      ${typeof door.leads_to === 'string' && door.leads_to !== 'Pending' ? `
        <text x="${labelX}" y="${labelY}"
              text-anchor="middle"
              font-family="Arial, sans-serif"
              font-size="9"
              font-weight="600"
              fill="#1f2937">
          → ${door.leads_to.length > 15 ? door.leads_to.substring(0, 12) + '...' : door.leads_to}
        </text>
      ` : ''}
    `;
  }).join('');
}

/**
 * Generate interior feature SVG elements
 */
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

    let shapesvg = '';

    if (feature.shape === 'circle') {
      const radiusFt = typeof feature.radius === 'number' ? feature.radius : 2;
      const radius = radiusFt * scaleFactor;
      shapesvg = `
        <circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" stroke="#000" stroke-width="2" />
        <circle cx="${x}" cy="${y}" r="${radius}" fill="rgba(0,0,0,0.2)" />
      `;
    } else if (feature.shape === 'rectangle') {
      const wFt = typeof feature.width === 'number' ? feature.width : 4;
      const hFt = typeof feature.height === 'number' ? feature.height : 4;
      const w = wFt * scaleFactor;
      const h = hFt * scaleFactor;
      const fill = material === 'wood' ? 'url(#wood_grain)' : color;
      shapesvg = `
        <rect x="${x - w/2}" y="${y - h/2}" width="${w}" height="${h}"
              fill="${fill}"
              stroke="#000"
              stroke-width="2"
              rx="2" />
        <rect x="${x - w/2}" y="${y - h/2}" width="${w}" height="${h}"
              fill="rgba(0,0,0,0.15)"
              rx="2" />
      `;
    }

    // Add label (only if feature is large enough and label is short)
    if (label && label.length <= 20) {
      const base = typeof feature.radius === 'number'
        ? feature.radius
        : (typeof feature.height === 'number' ? feature.height / 2 : 5);
      const labelY = y - base * scaleFactor - 6;
      shapesvg += `
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

    return shapesvg;
  }).join('');
}

/**
 * Generate a stitched map showing all rooms positioned spatially based on connections
 */
function generateStitchedMap(
  spaces: LiveMapSpace[],
  locationName: string,
  showGridLayer: boolean = true,
  showWireframeLayer: boolean = true,
  showDetailLayer: boolean = true
): string {
  if (spaces.length === 0) return '<p>No spaces to display</p>';

  try {
    spaces.forEach((s) => {
      requireSizeFt(s);
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Invalid space size_ft.';
    return `<div style="padding:12px;color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-family:Arial,sans-serif;font-size:13px;">${message}</div>`;
  }

  // Grid-based system: 2 pixels per foot, 5ft grid squares
  const pixelsPerFoot = 2;
  const gridSquareFeet = 5;
  const gridSquarePixels = gridSquareFeet * pixelsPerFoot; // 10 pixels per grid square
  const gridLineWidth = 1;

  const scale = pixelsPerFoot;
  const gap = gridSquarePixels * 3; // 3 grid squares (15ft) between unconnected rooms

  // Step 1: Build connection graph and prepare room data
  interface RoomData {
    index: number;
    name: string;
    id: string;
    widthFt: number;
    heightFt: number;
    floor: Record<string, unknown>;
    doors: unknown[];
    connections: Array<{ wall: string; targetId: string; targetName: string; doorPosition: number }>;
    x?: number;
    y?: number;
    placed: boolean;
    positionFt?: { x: number; y: number };
    originalSpace?: LiveMapSpace;
  }

  const rooms: RoomData[] = spaces.map((space, index) => {
    const requiredSize = requireSizeFt(space);
    let widthFt = requiredSize.width;
    let heightFt = requiredSize.height;

    // NOTE: Do NOT cap dimensions - preserve user's actual sizes
    // The visual display will handle zoom/pan for large rooms

    // Ensure minimum size (allow 5ft corridors / secret passages)
    widthFt = Math.max(5, widthFt);
    heightFt = Math.max(5, heightFt);

    // Build connection list from doors
    const connections: Array<{ wall: string; targetId: string; targetName: string; doorPosition: number }> = [];
    const doors = space.doors || [];
    doors.forEach((doorUnknown) => {
      const door = typeof doorUnknown === 'object' && doorUnknown !== null ? (doorUnknown as unknown as Record<string, unknown>) : {};
      if (typeof door.leads_to === 'string' && door.leads_to !== 'Pending') {
        const wallDir = (typeof door.wall === 'string' ? door.wall : '').toLowerCase();
        const doorPosition = typeof door.position_on_wall_ft === 'number' ? door.position_on_wall_ft : NaN;
        if (!Number.isFinite(doorPosition)) return;
        connections.push({
          wall: wallDir,
          targetId: door.leads_to,
          targetName: door.leads_to,
          doorPosition,
        });
      }
    });

    return {
      index,
      name: space.name,
      id: space.id || space.name,
      widthFt,
      heightFt,
      floor: (typeof (space as unknown as Record<string, unknown>).floor === 'object' && (space as unknown as Record<string, unknown>).floor !== null
        ? ((space as unknown as Record<string, unknown>).floor as Record<string, unknown>)
        : { material: 'stone', color: '#D3D3D3' }),
      doors,
      connections,
      placed: false,
      positionFt: space.position && typeof space.position === 'object'
        ? { x: space.position.x, y: space.position.y }
        : undefined,
      // Store original space for access to code/other properties
      originalSpace: space,
    };
  });

  // Step 2: Position rooms using breadth-first layout
  const roomById: Record<string, RoomData> = {};
  const roomByName: Record<string, RoomData> = {};
  const roomByCode: Record<string, RoomData> = {};

  rooms.forEach(room => {
    roomById[room.id] = room;
    roomByName[room.name] = room;

    // Also index by code if available
    const space = room.originalSpace;
    if (space && typeof space.code === 'string') {
      roomByCode[space.code] = room;
      roomByCode[space.code.toUpperCase()] = room;
    }
    if (space && typeof (space as Record<string, unknown>).location_code === 'string') {
      const locationCode = (space as Record<string, unknown>).location_code as string;
      roomByCode[locationCode] = room;
      roomByCode[locationCode.toUpperCase()] = room;
    }
  });

  const hasManualPositions = rooms.some(room =>
    room.positionFt &&
    typeof room.positionFt.x === 'number' &&
    typeof room.positionFt.y === 'number'
  );

  // Helper: Find room by exact ID, name, or code match ONLY
  // NO fuzzy matching - connections must be exact
  const findRoom = (idOrName: string): RoomData | undefined => {
    // Try exact matches only
    if (roomById[idOrName]) return roomById[idOrName];
    if (roomByName[idOrName]) return roomByName[idOrName];
    if (roomByCode[idOrName]) return roomByCode[idOrName];
    if (roomByCode[idOrName.toUpperCase()]) return roomByCode[idOrName.toUpperCase()];

    // Try case-insensitive exact match as fallback
    const lowerTarget = idOrName.toLowerCase();
    return rooms.find(r =>
      r.id.toLowerCase() === lowerTarget ||
      r.name.toLowerCase() === lowerTarget
    );
  };

  // Helper: Snap value to grid
  const snapToGrid = (value: number): number => {
    return Math.round(value / gridSquarePixels) * gridSquarePixels;
  };

  // Helper: Calculate position based on wall direction
  // Rooms share walls (no gap) and are aligned properly
  const calculatePosition = (
    fromRoom: RoomData,
    wall: string,
    toRoomWidth: number,
    toRoomHeight: number,
    _doorPosition: number = 0.5 // Default to center (0.0 = start, 1.0 = end)
  ): { x: number; y: number } => {
    void _doorPosition;
    const fromX = fromRoom.x!;
    const fromY = fromRoom.y!;
    const fromWidth = fromRoom.widthFt * scale;
    const fromHeight = fromRoom.heightFt * scale;
    const toWidth = toRoomWidth * scale;
    const toHeight = toRoomHeight * scale;

    let x, y;
    switch (wall) {
      case 'north':
        // Place directly above, sharing the wall
        // Align west edges
        x = fromX;
        y = fromY - toHeight;
        break;
      case 'south':
        // Place directly below, sharing the wall
        // Align west edges
        x = fromX;
        y = fromY + fromHeight;
        break;
      case 'east':
        // Place directly to the right, sharing the wall
        // Align north edges
        x = fromX + fromWidth;
        y = fromY;
        break;
      case 'west':
        // Place directly to the left, sharing the wall
        // Align north edges
        x = fromX - toWidth;
        y = fromY;
        break;
      default:
        x = fromX + fromWidth;
        y = fromY;
    }

    // Snap to grid
    return { x: snapToGrid(x), y: snapToGrid(y) };
  };

  if (hasManualPositions) {
    rooms.forEach(room => {
      if (room.positionFt) {
        room.x = room.positionFt.x * scale;
        room.y = room.positionFt.y * scale;
        room.placed = true;
      }
    });
  }

  console.log(`[Spatial Layout] Starting validation of ${rooms.length} rooms`);

  const validRoomIdentifiers = new Set<string>();
  rooms.forEach(room => {
    validRoomIdentifiers.add(room.name);
    validRoomIdentifiers.add(room.id);
    const space = room.originalSpace;
    if (space && typeof space.code === 'string') validRoomIdentifiers.add(space.code);
    if (space && typeof (space as Record<string, unknown>).location_code === 'string') {
      validRoomIdentifiers.add((space as Record<string, unknown>).location_code as string);
    }
  });

  console.log(`[Spatial Layout] Valid room identifiers:`, Array.from(validRoomIdentifiers).sort());

  const brokenConnections: Array<{ from: string; to: string; wall: string }> = [];
  const externalConnections: Array<{ from: string; to: string; wall: string }> = [];

  rooms.forEach(room => {
    room.connections.forEach(conn => {
      if (conn.targetId === 'Pending') return; // Skip pending connections

      if (!validRoomIdentifiers.has(conn.targetId)) {
        // Check if it might be an external connection
        if (conn.targetId.toLowerCase().includes('exterior') ||
            conn.targetId.toLowerCase().includes('outside') ||
            conn.targetId.toLowerCase().includes('courtyard')) {
          externalConnections.push({ from: room.name, to: conn.targetId, wall: conn.wall });
        } else {
          brokenConnections.push({ from: room.name, to: conn.targetId, wall: conn.wall });
        }
      }
    });
  });

  if (brokenConnections.length > 0) {
    console.error(`[Spatial Layout] ❌ BROKEN CONNECTIONS (${brokenConnections.length}):`, brokenConnections);
    console.error(`[Spatial Layout] 🔧 FIX: Update door "leads_to" values to exactly match room names`);
  }

  if (externalConnections.length > 0) {
    console.warn(`[Spatial Layout] ⚠️ EXTERNAL CONNECTIONS (${externalConnections.length}) - these rooms connect outside:`, externalConnections);
  }

  if (!hasManualPositions) {
    // Start with first room at a good starting position (not 0,0 but with padding)
    if (rooms.length > 0) {
      rooms[0].x = gridSquarePixels * 10; // Start 10 grid squares from edge
      rooms[0].y = gridSquarePixels * 10;
      rooms[0].placed = true;

      // Debug: Show first room details
      console.log('[Spatial Layout] First room:', {
        name: rooms[0].name,
        position: `(${rooms[0].x}, ${rooms[0].y})`,
        size: `${rooms[0].widthFt}×${rooms[0].heightFt} ft = ${rooms[0].widthFt * scale}×${rooms[0].heightFt * scale} px`,
        connections: rooms[0].connections.slice(0, 3).map(c => ({
          wall: c.wall,
          target: c.targetId,
          doorPos: c.doorPosition
        }))
      });
    }

    console.log(`[Spatial Layout] Starting BFS with ${rooms.length} total rooms`);

    // BFS to position connected rooms (bidirectional)
    const queue: RoomData[] = [rooms[0]];
    const processed = new Set<string>();
    let placedCount = 1;

    while (queue.length > 0) {
      const currentRoom = queue.shift()!;
      if (processed.has(currentRoom.id)) continue;
      processed.add(currentRoom.id);

      console.log(`[BFS] Processing room "${currentRoom.name}" with ${currentRoom.connections.length} connections`);

      // Forward connections: currentRoom → targetRoom (ADJACENT placement, sharing walls)
      currentRoom.connections.forEach(connection => {
        console.log(`[BFS]   Checking connection: wall=${connection.wall}, target="${connection.targetId}"`);
        const targetRoom = findRoom(connection.targetId);

        if (!targetRoom) {
          console.warn(`[BFS]   ⚠️ Target room not found: "${connection.targetId}"`);
          return;
        }

        if (targetRoom.placed) {
          console.log(`[BFS]   ℹ️ Target room "${targetRoom.name}" already placed`);
          return;
        }

        if (targetRoom && !targetRoom.placed) {
          const pos = calculatePosition(
            currentRoom,
            connection.wall,
            targetRoom.widthFt,
            targetRoom.heightFt,
            connection.doorPosition
          );

          targetRoom.x = pos.x;
          targetRoom.y = pos.y;
          targetRoom.placed = true;
          placedCount++;

          // Debug: Log first 8 placements
          if (placedCount <= 8) {
            console.log(`[Spatial Layout #${placedCount}] Placed "${targetRoom.name}" ${connection.wall} of "${currentRoom.name}"`, {
              from: `(${currentRoom.x}, ${currentRoom.y}) ${currentRoom.widthFt}×${currentRoom.heightFt}ft`,
              wall: connection.wall,
              to: `(${targetRoom.x}, ${targetRoom.y}) ${targetRoom.widthFt}×${targetRoom.heightFt}ft`
            });
          }

          queue.push(targetRoom);
        }
      });

      // Reverse connections: find rooms that connect TO currentRoom
      rooms.forEach(otherRoom => {
        if (!otherRoom.placed) {
          for (const conn of otherRoom.connections) {
            const connectedTo = findRoom(conn.targetId);
            if (connectedTo && connectedTo.id === currentRoom.id) {
              // otherRoom connects to currentRoom, position it adjacent
              const oppositeWall = getOppositeWall(conn.wall);

              const pos = calculatePosition(
                currentRoom,
                oppositeWall,
                otherRoom.widthFt,
                otherRoom.heightFt,
                conn.doorPosition
              );

              otherRoom.x = pos.x;
              otherRoom.y = pos.y;
              otherRoom.placed = true;
              placedCount++;
              queue.push(otherRoom);
              break;
            }
          }
        }
      });
    }
  }

  // Helper: Get opposite wall direction
  function getOppositeWall(wall: string): string {
    switch (wall) {
      case 'north': return 'south';
      case 'south': return 'north';
      case 'east': return 'west';
      case 'west': return 'east';
      default: return 'east';
    }
  }

  // Step 3: Position any unplaced rooms in a grid to the side
  const unplacedRooms = rooms.filter(r => !r.placed);
  if (unplacedRooms.length > 0) {
    const gridCols = Math.ceil(Math.sqrt(unplacedRooms.length));
    unplacedRooms.forEach((room, idx) => {
      const col = idx % gridCols;
      const row = Math.floor(idx / gridCols);
      room.x = 2000 + col * (200 + gap);
      room.y = row * (200 + gap);
      room.placed = true;
    });
  }

  // REMOVED: Force-directed positioning - using grid-based adjacent placement instead

  // Step 4: Normalize coordinates (shift to positive quadrant)
  // Filter out any NaN or invalid coordinates first
  rooms.forEach(room => {
    if (!isFinite(room.x!) || !isFinite(room.y!)) {
      console.warn(`Room ${room.name} has invalid coordinates, resetting to 0,0`);
      room.x = 0;
      room.y = 0;
    }
  });

  const minX = Math.min(...rooms.map(r => r.x!));
  const minY = Math.min(...rooms.map(r => r.y!));

  rooms.forEach(room => {
    // Normalize to positive quadrant with padding
    room.x = room.x! - minX + gridSquarePixels * 2;
    room.y = room.y! - minY + gridSquarePixels * 2;
  });

  // Step 5: Calculate canvas size
  const maxX = Math.max(...rooms.map(r => r.x! + r.widthFt * scale));
  const maxY = Math.max(...rooms.map(r => r.y! + r.heightFt * scale));
  const svgWidth = maxX + gap;
  const svgHeight = maxY + gap;

  // Step 6: Generate connection lines
  let connectionLines = '';
  const drawnConnections = new Set<string>();

  rooms.forEach(room => {
    room.connections.forEach(connection => {
      const targetRoom = findRoom(connection.targetId);
      if (targetRoom && targetRoom.placed) {
        // Create unique key to avoid drawing same connection twice
        const connKey = [room.id, targetRoom.id].sort().join('|');
        if (drawnConnections.has(connKey)) return;
        drawnConnections.add(connKey);

        const fromCenterX = room.x! + (room.widthFt * scale) / 2;
        const fromCenterY = room.y! + (room.heightFt * scale) / 2;
        const toCenterX = targetRoom.x! + (targetRoom.widthFt * scale) / 2;
        const toCenterY = targetRoom.y! + (targetRoom.heightFt * scale) / 2;

        connectionLines += `
          <line x1="${fromCenterX}" y1="${fromCenterY}" x2="${toCenterX}" y2="${toCenterY}"
                stroke="#3b82f6" stroke-width="2" stroke-dasharray="6,3" opacity="0.4" />
        `;
      }
    });
  });

  // Step 7: Generate wireframe layer (room outlines only)
  let wireframeContent = '';
  let detailContent = '';

  console.log('[Spatial Layout] Generating layers for', rooms.length, 'rooms');
  rooms.forEach(r => {
    console.log(`  Room "${r.name}": position (${r.x}, ${r.y}), size ${r.widthFt}×${r.heightFt}ft = ${r.widthFt * scale}×${r.heightFt * scale}px`);
  });

  rooms.forEach(room => {
    const roomWidth = room.widthFt * scale;
    const roomHeight = room.heightFt * scale;

    // Debug: Check for invalid coordinates
    if (room.x === undefined || room.y === undefined || isNaN(room.x) || isNaN(room.y)) {
      console.error(`[Spatial Layout] ⚠️ Room "${room.name}" has invalid coordinates: x=${room.x}, y=${room.y}`);
    }

    // Determine text color based on floor color brightness
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

    // Get the actual space data to access features
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

    // WIREFRAME LAYER: Simple black outline
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

        <!-- Wireframe Features (furniture, stairs, etc.) -->
        <g clip-path="url(#${clipId})">
          ${(Array.isArray(features) ? features : []).map((featureUnknown: unknown) => {
            const feature = typeof featureUnknown === 'object' && featureUnknown !== null ? (featureUnknown as Record<string, unknown>) : {};
            const pos = typeof feature.position === 'object' && feature.position !== null ? (feature.position as Record<string, unknown>) : null;
            const fx = typeof pos?.x === 'number' ? pos.x * scale : NaN;
            const fy = typeof pos?.y === 'number' ? pos.y * scale : NaN;
            if (isNaN(fx) || isNaN(fy)) return '';

            const fw = typeof feature.width === 'number' ? feature.width * scale : NaN;
            const fh = typeof feature.height === 'number' ? feature.height * scale : NaN;

            if (feature.shape === 'circle') {
              const radiusFt = typeof feature.radius === 'number' ? feature.radius : NaN;
              const radiusPx = !isNaN(radiusFt) ? radiusFt * scale : (isNaN(fw) || isNaN(fh) ? NaN : Math.min(fw, fh) / 2);
              if (isNaN(radiusPx)) return '';
              return `<circle cx="${fx}" cy="${fy}" r="${radiusPx}"
                      fill="none" stroke="#666666" stroke-width="1" />`;
            }

            if (isNaN(fw) || isNaN(fh)) return '';

            // Positions are treated as CENTER points within the room (in feet), matching generateFeatures().
            return `<rect x="${fx - fw / 2}" y="${fy - fh / 2}" width="${fw}" height="${fh}"
                    fill="none" stroke="#666666" stroke-width="1" />`;
          }).join('')}
        </g>
      </g>
    `;

    // DETAIL LAYER: Colored floors and labels
    const detailTransform = `translate(${room.x}, ${room.y})`;
    detailContent += `
      <!-- Detail: Room #${room.index + 1} "${room.name}" at (${room.x}, ${room.y}) -->
      <g transform="${detailTransform}" opacity="0.85">
        <!-- Floor color -->
        ${detailRoomShape}

        <!-- Name label -->
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

        <!-- Dimensions -->
        <text x="${roomWidth / 2}" y="${roomHeight / 2 + 18}" text-anchor="middle"
              font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              font-size="8" fill="${dimTextColor}">
          ${room.widthFt}×${room.heightFt} ft
        </text>
      </g>
    `;
  });

  // Generate grid pattern
  const gridPattern = `
    <defs>
      <pattern id="grid" width="${gridSquarePixels}" height="${gridSquarePixels}" patternUnits="userSpaceOnUse">
        <path d="M ${gridSquarePixels} 0 L 0 0 0 ${gridSquarePixels}"
              fill="none" stroke="#e5e7eb" stroke-width="${gridLineWidth}" />
      </pattern>
    </defs>
  `;

  // Debug: Log the actual SVG content being generated
  console.log('[Spatial Layout] Wireframe content preview (first 500 chars):');
  console.log(wireframeContent.substring(0, 500));
  console.log('[Spatial Layout] Detail content preview (first 500 chars):');
  console.log(detailContent.substring(0, 500));

  // Generate compass rose (bottom-right corner to avoid blocking spaces)
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
      <!-- Background circle with white fill and strong border -->
      <circle cx="${compassSize/2}" cy="${compassSize/2}" r="${compassSize/2}"
              fill="white" stroke="#374151" stroke-width="3" />

      <!-- North arrow -->
      <path d="M ${compassSize/2} 10 L ${compassSize/2 - 8} ${compassSize/2} L ${compassSize/2} ${compassSize/2 - 5} L ${compassSize/2 + 8} ${compassSize/2} Z"
            fill="#dc2626" stroke="#991b1b" stroke-width="1" />
      <text x="${compassSize/2}" y="8" text-anchor="middle"
            font-family="Arial" font-size="12" font-weight="bold" fill="#dc2626">N</text>

      <!-- South -->
      <text x="${compassSize/2}" y="${compassSize - 2}" text-anchor="middle"
            font-family="Arial" font-size="10" fill="#374151">S</text>

      <!-- East -->
      <text x="${compassSize - 5}" y="${compassSize/2 + 4}" text-anchor="end"
            font-family="Arial" font-size="10" fill="#374151">E</text>

      <!-- West -->
      <text x="5" y="${compassSize/2 + 4}" text-anchor="start"
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

          <!-- Layer 1: Background Grid -->
          ${showGridLayer ? `<rect width="${svgWidth}" height="${svgHeight}" fill="url(#grid)" />` : `<rect width="${svgWidth}" height="${svgHeight}" fill="#ffffff" />`}

          <!-- Layer 2: Wireframe (room outlines + furniture wireframes) -->
          ${showWireframeLayer ? `
          <g id="wireframe">
            ${wireframeContent}
          </g>
          ` : ''}

          <!-- Layer 3: HTML Detail (colored floors + labels) -->
          ${showDetailLayer ? `
          <g id="details">
            ${detailContent}
          </g>
          ` : ''}

          <!-- Layer 4: Connection Lines (on top for visibility) -->
          <g id="connections">
            ${connectionLines}
          </g>

          <!-- Compass Rose -->
          ${compassRose}
        </svg>
      </div>
    </div>
  `;
}

/**
 * Parse dimension string into width/height numbers
 */
function parseDimensions(dimString?: string): { width: number; height: number } {
  if (!dimString) return { width: 30, height: 30 }; // Default square

  // Remove common units and normalize
  const cleaned = dimString.toLowerCase().replace(/ft|feet|'|"|meters?|m/g, '').trim();

  // Try to match WxH patterns (e.g., "50×30", "50x30", "50 by 30")
  const match = cleaned.match(/(\d+)\s*[x×by]+\s*(\d+)/);
  if (match) {
    return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
  }

  // Try single number (square or diameter)
  const singleMatch = cleaned.match(/(\d+)/);
  if (singleMatch) {
    const size = parseInt(singleMatch[1], 10);
    return { width: size, height: size };
  }

  return { width: 30, height: 30 }; // Fallback
}

/**
 * Generate door markers based on connections
 */
function generateDoorPositions(
  connections: string[],
  roomX: number,
  roomY: number,
  roomWidth: number,
  roomHeight: number
): string {
  if (connections.length === 0) return '';

  const doorWidth = 12;
  const doorGap = 2;

  // Distribute doors across walls (top, right, bottom, left)
  const walls = ['top', 'right', 'bottom', 'left'];
  const doorsPerWall = Math.ceil(connections.length / walls.length);

  return connections.map((conn, i) => {
    const wallIndex = Math.floor(i / doorsPerWall) % walls.length;
    const wall = walls[wallIndex];
    const positionOnWall = (i % doorsPerWall) / (doorsPerWall + 1);

    let doorX = 0;
    let doorY = 0;
    let doorW = doorWidth;
    let doorH = doorWidth;
    let labelX = 0;
    let labelY = 0;
    let labelAnchor = 'middle';

    switch (wall) {
      case 'top':
        doorX = roomX + roomWidth * (0.3 + positionOnWall * 0.4);
        doorY = roomY - doorGap;
        doorH = doorGap + 3;
        labelX = doorX + doorW / 2;
        labelY = roomY - 8;
        break;
      case 'right':
        doorX = roomX + roomWidth - doorGap;
        doorY = roomY + roomHeight * (0.3 + positionOnWall * 0.4);
        doorW = doorGap + 3;
        labelX = roomX + roomWidth + 8;
        labelY = doorY + doorH / 2;
        labelAnchor = 'start';
        break;
      case 'bottom':
        doorX = roomX + roomWidth * (0.3 + positionOnWall * 0.4);
        doorY = roomY + roomHeight - doorGap;
        doorH = doorGap + 3;
        labelX = doorX + doorW / 2;
        labelY = roomY + roomHeight + 12;
        break;
      case 'left':
        doorX = roomX - doorGap;
        doorY = roomY + roomHeight * (0.3 + positionOnWall * 0.4);
        doorW = doorGap + 3;
        labelX = roomX - 8;
        labelY = doorY + doorH / 2;
        labelAnchor = 'end';
        break;
    }

    // Extract just the room name if connection string includes extra info
    const connLabel = conn.length > 15 ? conn.substring(0, 12) + '...' : conn;

    return `
      <!-- Door to ${conn} -->
      <rect x="${doorX}" y="${doorY}" width="${doorW}" height="${doorH}"
            fill="#8B4513" stroke="#000" stroke-width="2" />
      <text x="${labelX}" y="${labelY}"
            text-anchor="${labelAnchor}" font-family="Arial, sans-serif" font-size="10" font-weight="600" fill="#1f2937">
        ${connLabel}
      </text>
    `;
  }).join('');
}

/**
 * Generate simple interior features based on room function
 */
function generateRoomFeatures(
  functionType: string | undefined,
  roomX: number,
  roomY: number,
  roomWidth: number,
  roomHeight: number
): string {
  if (!functionType) return '';

  const func = functionType.toLowerCase();
  const features: string[] = [];

  // Center point
  const centerX = roomX + roomWidth / 2;
  const centerY = roomY + roomHeight / 2;

  // Add function-specific features
  if (func.includes('throne') || func.includes('court')) {
    // Throne at back wall
    const throneSize = Math.min(roomWidth, roomHeight) * 0.15;
    features.push(`
      <rect x="${centerX - throneSize / 2}" y="${roomY + 10}"
            width="${throneSize}" height="${throneSize}"
            fill="#FFD700" stroke="#B8860B" stroke-width="2" rx="2" />
      <text x="${centerX}" y="${roomY + 10 + throneSize / 2 + 4}"
            text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#000">👑</text>
    `);
  } else if (func.includes('kitchen') || func.includes('hearth')) {
    // Fireplace on wall
    const fireplaceW = roomWidth * 0.2;
    const fireplaceH = roomHeight * 0.15;
    features.push(`
      <rect x="${roomX + 10}" y="${centerY - fireplaceH / 2}"
            width="${fireplaceW}" height="${fireplaceH}"
            fill="#8B0000" stroke="#000" stroke-width="1" />
      <text x="${roomX + 10 + fireplaceW / 2}" y="${centerY + 4}"
            text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#FFA500">🔥</text>
    `);
  } else if (func.includes('bedroom') || func.includes('quarters')) {
    // Bed
    const bedW = roomWidth * 0.3;
    const bedH = roomHeight * 0.25;
    features.push(`
      <rect x="${roomX + roomWidth - bedW - 10}" y="${roomY + 10}"
            width="${bedW}" height="${bedH}"
            fill="#8B4513" stroke="#654321" stroke-width="1" rx="2" />
      <rect x="${roomX + roomWidth - bedW - 10 + bedW * 0.1}" y="${roomY + 10 + bedH * 0.1}"
            width="${bedW * 0.8}" height="${bedH * 0.7}"
            fill="#FFFACD" stroke="#000" stroke-width="1" />
    `);
  } else if (func.includes('armory') || func.includes('weapon')) {
    // Weapon racks
    const rackW = roomWidth * 0.1;
    const rackH = roomHeight * 0.4;
    features.push(`
      <rect x="${roomX + 10}" y="${centerY - rackH / 2}"
            width="${rackW}" height="${rackH}"
            fill="#696969" stroke="#000" stroke-width="1" />
      <rect x="${roomX + roomWidth - 10 - rackW}" y="${centerY - rackH / 2}"
            width="${rackW}" height="${rackH}"
            fill="#696969" stroke="#000" stroke-width="1" />
      <text x="${centerX}" y="${centerY + 4}"
            text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#666">⚔️</text>
    `);
  } else if (func.includes('storage') || func.includes('vault')) {
    // Crates/barrels
    const crateSize = Math.min(roomWidth, roomHeight) * 0.12;
    for (let i = 0; i < 3; i++) {
      const offsetX = (i - 1) * crateSize * 1.3;
      features.push(`
        <rect x="${centerX + offsetX - crateSize / 2}" y="${centerY - crateSize / 2}"
              width="${crateSize}" height="${crateSize}"
              fill="#8B4513" stroke="#654321" stroke-width="2" rx="1" />
      `);
    }
  } else if (func.includes('hall') || func.includes('lobby') || func.includes('entrance')) {
    // Central feature (pillar, statue, etc.)
    const featureSize = Math.min(roomWidth, roomHeight) * 0.1;
    features.push(`
      <circle cx="${centerX}" cy="${centerY}" r="${featureSize}"
              fill="#D3D3D3" stroke="#A9A9A9" stroke-width="2" />
    `);
  }

  // Add a subtle center marker for empty rooms
  if (features.length === 0) {
    features.push(`
      <circle cx="${centerX}" cy="${centerY}" r="2" fill="#ccc" />
    `);
  }

  return features.join('');
}

/**
 * Generates HTML map visualization from spaces array
 * @param inline - If true, returns only the body content for inline display. If false, returns full HTML document for download.
 */
function generateMapHTML(
  locationName: string,
  spaces: LiveMapSpace[],
  totalSpaces: number,
  currentSpace: number,
  inline: boolean = false
): string {
  void currentSpace;
  // Color scheme based on function/type
  const getSpaceColor = (spaceFunction?: string): { bg: string; border: string } => {
    const func = spaceFunction?.toLowerCase() || '';

    if (func.includes('entrance') || func.includes('lobby') || func.includes('hall')) {
      return { bg: '#e3f2fd', border: '#1976d2' }; // Blue - Public
    }
    if (func.includes('private') || func.includes('bedroom') || func.includes('quarters')) {
      return { bg: '#e8f5e9', border: '#388e3c' }; // Green - Private
    }
    if (func.includes('military') || func.includes('armory') || func.includes('guard')) {
      return { bg: '#ffebee', border: '#c62828' }; // Red - Restricted
    }
    if (func.includes('kitchen') || func.includes('storage') || func.includes('workshop')) {
      return { bg: '#fff9c4', border: '#f57f17' }; // Yellow - Service
    }
    if (func.includes('throne') || func.includes('court') || func.includes('council')) {
      return { bg: '#f3e5f5', border: '#7b1fa2' }; // Purple - Important
    }

    return { bg: '#f5f5f5', border: '#9e9e9e' }; // Gray - General
  };

  // Generate individual floor plan rows (one space per row, full width)
  const spaceRows = spaces.map((space, index) => {
    const colors = getSpaceColor(space.function);
    // Don't pulse completed spaces - only the one actively being generated would pulse,
    // but that's handled by the parent component's isGenerating state
    const isPulsing = false;

    // Generate full-width SVG floor plan for this space
    const floorPlan = generateFullWidthFloorPlan(space, colors, index, isPulsing);

    return floorPlan;
  }).join('');

  // Content body (used in both inline and full HTML)
  const bodyContent = `
<style>
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
  }
</style>
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="margin-bottom:20px;">
    <h2 style="margin:0 0 8px 0;color:#1f2937;font-size:20px;">${locationName}</h2>
    <div style="display:flex;align-items:center;gap:8px;color:#6b7280;font-size:13px;">
      <span>🗺️ ${spaces.length} of ${totalSpaces} spaces generated</span>
      <span>•</span>
      <span>${Math.round((spaces.length / totalSpaces) * 100)}% complete</span>
    </div>
  </div>

  <div style="display:flex;flex-direction:column;gap:16px;margin-bottom:20px;">
    ${spaceRows}
  </div>

  <div style="background:#f9fafb;padding:12px;border-radius:6px;border:1px solid #e5e7eb;">
    <div style="font-weight:600;color:#374151;margin-bottom:8px;font-size:13px;">Legend</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:6px;">
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;">
        <div style="width:16px;height:16px;background:#e3f2fd;border:2px solid #1976d2;border-radius:3px;"></div>
        <span style="color:#666;">Public Spaces</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;">
        <div style="width:16px;height:16px;background:#e8f5e9;border:2px solid #388e3c;border-radius:3px;"></div>
        <span style="color:#666;">Private Areas</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;">
        <div style="width:16px;height:16px;background:#ffebee;border:2px solid #c62828;border-radius:3px;"></div>
        <span style="color:#666;">Restricted Zones</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;">
        <div style="width:16px;height:16px;background:#fff9c4;border:2px solid #f57f17;border-radius:3px;"></div>
        <span style="color:#666;">Service Areas</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;font-size:11px;">
        <div style="width:16px;height:16px;background:#f3e5f5;border:2px solid #7b1fa2;border-radius:3px;"></div>
        <span style="color:#666;">Important Rooms</span>
      </div>
    </div>
  </div>

  <div style="margin-top:12px;padding:10px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;font-size:11px;color:#1e40af;">
    💡 <strong>Tip:</strong> This map updates in real-time as each space is generated.
  </div>
</div>
  `.trim();

  // Return inline HTML for display in panel, or full HTML document for download
  if (inline) {
    return bodyContent;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${locationName} - Visual Map</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f9fafb;
    }
  </style>
</head>
<body>
  <div style="max-width:1200px;margin:0 auto;background:white;padding:24px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
    ${bodyContent}
  </div>
</body>
</html>
  `.trim();
}
