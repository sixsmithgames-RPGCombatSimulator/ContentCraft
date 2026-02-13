/**
 * Castle State View - Displays accumulated location state during iterative generation
 *
 * Shows the "Castle State" (Purpose + Foundation + existing Spaces) during the Spaces stage
 * to help users understand what has been generated so far.
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { Building2, MapPin, Ruler, Link2 } from 'lucide-react';

interface CastleStateViewProps {
  stageResults: {
    location_purpose?: Record<string, unknown>;
    location_foundation?: Record<string, unknown>;
    location_spaces?: Record<string, unknown>;
  };
}

interface LocationSpace {
  id: string;
  name: string;
  purpose?: string;
  description?: string;
  geometry?: {
    dimensions?: {
      length?: string;
      width?: string;
      height?: string;
    };
    position?: unknown;
    connections?: Array<{ to: string; type: string }>;
  };
  mesh_anchors?: {
    connects_to?: string[];
    connection_types?: string[];
    spatial_relationship?: string;
  };
  floor_level?: number;
}

const ensureString = (value: unknown): string => {
  if (typeof value === 'string') return value;
  return '';
};

const ensureNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return value;
  return undefined;
};

const ensureObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
};

const ensureArray = <T,>(value: unknown, mapper: (item: unknown) => T | undefined): T[] => {
  if (!Array.isArray(value)) return [];
  return value.map(mapper).filter((item): item is T => item !== undefined);
};

export default function CastleStateView({ stageResults }: CastleStateViewProps) {
  const purpose = ensureObject(stageResults.location_purpose);
  const foundation = ensureObject(stageResults.location_foundation);
  const spacesData = ensureObject(stageResults.location_spaces);

  const existingSpaces = ensureArray(
    spacesData.spaces,
    (space): LocationSpace | undefined => {
      const obj = ensureObject(space);
      const id = ensureString(obj.id);
      const name = ensureString(obj.name);

      if (!id && !name) return undefined;

      return {
        id: id || `space_${Math.random()}`,
        name: name || 'Unnamed Space',
        purpose: ensureString(obj.purpose) || undefined,
        description: ensureString(obj.description) || undefined,
        geometry: ensureObject(obj.geometry) as LocationSpace['geometry'],
        mesh_anchors: ensureObject(obj.mesh_anchors) as LocationSpace['mesh_anchors'],
        floor_level: ensureNumber(obj.floor_level),
      };
    }
  );

  // Extract purpose data
  const locationName = ensureString(purpose.name) || 'Unnamed Location';
  const locationType = ensureString(purpose.location_type) || 'location';
  const scale = ensureString(purpose.scale) || 'moderate';
  const estimatedSpaces = ensureNumber(purpose.estimated_spaces) || 0;
  const locationDescription = ensureString(purpose.description);

  // Extract foundation data
  const layout = ensureObject(foundation.layout);
  const layoutDescription = ensureString(layout.description);
  const chunkMeshMetadata = ensureObject(foundation.chunk_mesh_metadata);
  const spatialHierarchy = ensureString(chunkMeshMetadata.spatial_hierarchy);

  // Calculate progress
  const progress = estimatedSpaces > 0 ? (existingSpaces.length / estimatedSpaces) * 100 : 0;

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-gray-200 px-6 py-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="w-6 h-6 text-blue-600" />
              <h2 className="text-2xl font-bold text-gray-900">{locationName}</h2>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span className="capitalize">{locationType}</span>
              <span className="px-2 py-0.5 bg-white rounded border border-gray-300 text-xs font-medium uppercase">
                {scale}
              </span>
            </div>
          </div>

          {/* Progress Indicator */}
          <div className="text-right">
            <div className="text-3xl font-bold text-blue-600">
              {existingSpaces.length}<span className="text-gray-400">/{estimatedSpaces}</span>
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Spaces Generated</div>
            <div className="mt-1 w-32 bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>
        </div>

        {locationDescription && (
          <p className="mt-3 text-sm text-gray-700 leading-relaxed">{locationDescription}</p>
        )}
      </div>

      {/* Foundation Summary */}
      {layoutDescription && (
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="flex items-start gap-2">
            <Ruler className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-1">Layout</h3>
              <p className="text-sm text-gray-600">{layoutDescription}</p>
            </div>
          </div>
        </div>
      )}

      {/* Spatial Hierarchy */}
      {spatialHierarchy && (
        <div className="px-6 py-3 bg-blue-50 border-b border-blue-100">
          <div className="flex items-start gap-2">
            <Link2 className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <h3 className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">
                Meshing Protocol
              </h3>
              <p className="text-sm text-blue-900">{spatialHierarchy}</p>
            </div>
          </div>
        </div>
      )}

      {/* Existing Spaces */}
      <div className="px-6 py-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-gray-500" />
          Generated Spaces ({existingSpaces.length})
        </h3>

        {existingSpaces.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <MapPin className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No spaces generated yet. Starting first space...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {existingSpaces.map((space, index) => (
              <div
                key={space.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                        {index + 1}
                      </span>
                      <h4 className="font-semibold text-gray-900">{space.name}</h4>
                    </div>
                    {space.purpose && (
                      <p className="text-xs text-gray-500 mt-1 ml-8">{space.purpose}</p>
                    )}
                  </div>

                  {space.floor_level !== undefined && (
                    <span className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-600">
                      Floor {space.floor_level}
                    </span>
                  )}
                </div>

                {space.description && (
                  <p className="text-sm text-gray-600 mb-3 ml-8">{space.description}</p>
                )}

                {/* Geometry Info */}
                {space.geometry?.dimensions && (
                  <div className="ml-8 mb-2">
                    <div className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <Ruler className="w-3 h-3" />
                      <span>
                        {space.geometry.dimensions.length || '?'} × {space.geometry.dimensions.width || '?'}
                        {space.geometry.dimensions.height && ` × ${space.geometry.dimensions.height}`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Connections */}
                {space.geometry?.connections && space.geometry.connections.length > 0 && (
                  <div className="ml-8 flex flex-wrap gap-1">
                    {space.geometry.connections.map((conn, connIndex) => (
                      <span
                        key={connIndex}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-green-50 border border-green-200 rounded text-xs text-green-700"
                      >
                        <Link2 className="w-3 h-3" />
                        {conn.type} → {conn.to}
                      </span>
                    ))}
                  </div>
                )}

                {/* Mesh Anchors */}
                {space.mesh_anchors?.spatial_relationship && (
                  <div className="ml-8 mt-2 pt-2 border-t border-gray-100">
                    <div className="flex items-start gap-1 text-xs text-blue-600">
                      <Link2 className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span className="font-mono">{space.mesh_anchors.spatial_relationship}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
        <div className="flex items-center justify-between">
          <span>
            {existingSpaces.length > 0
              ? `${estimatedSpaces - existingSpaces.length} space(s) remaining`
              : 'Beginning space generation...'}
          </span>
          <span className="text-gray-400">Castle State • Live View</span>
        </div>
      </div>
    </div>
  );
}
