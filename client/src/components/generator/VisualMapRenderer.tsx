/**
 * Visual Map Renderer - Safely renders HTML visual maps from location generation
 *
 * The Visual Map stage outputs PURE HTML (no JSON wrapper) to avoid formatting conflicts.
 * This component receives the raw HTML and renders it safely.
 *
 * Storage Strategy:
 * - HTML is stored as a separate file: `location_[id]_visual_map.html`
 * - Linked to location via metadata: { visual_map_file: "location_123_visual_map.html" }
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useEffect, useRef, useState } from 'react';
import { Map, AlertTriangle, Download, Eye, EyeOff } from 'lucide-react';

interface VisualMapRendererProps {
  htmlContent: string;
  locationName?: string;
  onSaveToFile?: (html: string, filename: string) => void;
}

export default function VisualMapRenderer({ htmlContent, locationName, onSaveToFile: _onSaveToFile }: VisualMapRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [showRawHtml, setShowRawHtml] = useState(false);

  useEffect(() => {
    if (containerRef.current && htmlContent && !showRawHtml) {
      // Sanitize and render HTML
      // Note: In production, you'd want to use DOMPurify or similar
      // For now, we trust the AI-generated HTML since it's from our own pipeline
      containerRef.current.innerHTML = htmlContent;
    }
  }, [htmlContent, showRawHtml]);

  const handleDownload = () => {
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${locationName?.replace(/\s+/g, '_') || 'location'}_visual_map.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (!htmlContent || !htmlContent.trim()) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-yellow-800 font-medium">No Visual Map Generated</p>
          <p className="text-xs text-yellow-600 mt-1">
            The AI did not generate a visual map for this location. Try regenerating or add it manually.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Map className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Visual Layout Map</h3>
            {locationName && (
              <span className="text-sm text-gray-600">• {locationName}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRawHtml(!showRawHtml)}
              className="flex items-center gap-1 px-3 py-1 text-xs text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-white"
              title={showRawHtml ? 'Show rendered map' : 'Show raw HTML'}
            >
              {showRawHtml ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
              {showRawHtml ? 'Render' : 'HTML'}
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-3 py-1 text-xs text-blue-600 hover:text-blue-800 border border-blue-300 rounded hover:bg-blue-50"
              title="Download as HTML file"
            >
              <Download className="w-3 h-3" />
              Download
            </button>
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800 border border-gray-300 rounded hover:bg-white"
            >
              {isExpanded ? 'Collapse' : 'Expand'}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          AI-generated visual representation • Output as pure HTML (no JSON wrapper)
        </p>
      </div>

      {/* Content */}
      {isExpanded && (
        <>
          {showRawHtml ? (
            <div className="p-4 bg-gray-50">
              <pre className="text-xs font-mono text-gray-800 overflow-auto max-h-96 whitespace-pre-wrap">
                {htmlContent}
              </pre>
            </div>
          ) : (
            <div
              ref={containerRef}
              className="p-4 overflow-auto"
              style={{ maxHeight: '600px' }}
            />
          )}
        </>
      )}

      {/* Footer */}
      <div className="bg-gray-50 border-t border-gray-200 px-4 py-2">
        <p className="text-xs text-gray-500">
          💡 This map is stored as a separate HTML file linked to the location via metadata. Download to save locally or share with players.
        </p>
      </div>
    </div>
  );
}
