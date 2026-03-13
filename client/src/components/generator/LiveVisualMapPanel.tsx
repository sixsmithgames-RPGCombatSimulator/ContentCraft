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
import type { WallSettings } from '../../contexts/locationEditorTypes';
import type { LiveMapSpace } from '../../types/liveMapTypes';
import {
  buildLocationEditorProviderKey,
  buildLocationMapSpacesHash,
  generateLocationMapHtml,
} from '../../utils/locationMapHtml';
import {
  convertEditorSpacesToLiveMapSpaces,
  convertLiveMapSpacesToEditorSpaces,
} from '../../utils/locationEditorSpaceAdapter';
import { generateStitchedLocationMap } from '../../utils/locationStitchedMap';

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
    const fullHtml = generateLocationMapHtml(locationName, spaces, totalSpaces, currentSpace, false);
    setHtmlContent(fullHtml);

    // Generate inline HTML for display (without html/head/body tags)
    const inlineHtml = generateLocationMapHtml(locationName, spaces, totalSpaces, currentSpace, true);
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
  const spacesHash = useMemo(() => buildLocationMapSpacesHash(spaces), [spaces, updateToken]);
  
  const stitchedMapHtml = useMemo(() => {
    if (!showStitchedMap || spaces.length === 0) return '';
    console.log('[useMemo] Regenerating stitched map, hash:', spacesHash.substring(0, 50));
    return generateStitchedLocationMap(spaces, locationName, showGridLayer, showWireframeLayer, showDetailLayer);
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
                const initialSpaces = convertLiveMapSpacesToEditorSpaces(spaces, globalWallSettings);

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
                    key={buildLocationEditorProviderKey(spaces)}
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

                  const convertedSpaces = convertEditorSpacesToLiveMapSpaces(updatedSpaces);

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
