/**
 * Location Content View - Displays complete location data
 *
 * Renders finalized location with all stages combined:
 * Purpose, Foundation, Spaces, and Details
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import React, { type FC } from 'react';
import { Building2, MapPin, Users, Key, Gem, History, Zap, Map } from 'lucide-react';

interface LocationSpace {
  id: string;
  name: string;
  purpose?: string;
  description?: string;
  floor_level?: number;
  geometry?: {
    dimensions?: {
      length: string;
      width: string;
      height: string;
    };
    position?: unknown;
    connections?: Array<{ to: string; type: string; position?: string }>;
    locking_points?: string[];
    walls?: Array<{ direction: string; length: string; load_bearing?: boolean; material?: string }>;
  };
  features?: string[];
  lighting?: string;
  inhabitants?: string;
  mesh_anchors?: {
    chunk_id?: string;
    connects_to?: string[];
    connection_types?: string[];
    boundary_interface?: string;
    spatial_relationship?: string;
  };
}

interface LocationData {
  name?: string;
  location_type?: string;
  description?: string;
  purpose?: string;
  scale?: string;
  estimated_spaces?: number;
  architectural_style?: string;
  setting?: string;
  key_features?: string[];

  // Foundation
  layout?: {
    description?: string;
    dimensions?: {
      length?: string;
      width?: string;
      height?: string;
    };
    levels?: string[];
  };
  spatial_organization?: string;
  access_points?: string[];
  overall_dimensions?: {
    footprint?: {
      length?: string;
      width?: string;
    };
    height?: {
      total?: string;
      floors?: number;
    };
  };
  wings?: Array<{
    name: string;
    dimensions?: { length?: string; width?: string };
    purpose?: string;
    position?: string;
  }>;
  floors?: Array<{
    level: number;
    name: string;
    elevation?: string;
    ceiling_height?: string;
    purpose?: string;
  }>;
  chunk_mesh_metadata?: {
    connection_protocol?: string;
    boundary_markers?: string[];
    spatial_hierarchy?: string;
    coordinate_system?: string;
  };

  // Spaces
  spaces?: LocationSpace[];
  hallways?: Array<{
    id: string;
    name?: string;
    connects: string[];
    dimensions?: { length?: string; width?: string; height?: string };
    features?: string[];
  }>;
  doors?: Array<{
    id: string;
    connects: [string, string];
    type?: string;
    position?: string;
    security?: string;
  }>;
  staircases?: Array<{
    id: string;
    type: string;
    connects_floors: number[];
    position?: string;
    features?: string[];
  }>;

  // Details
  materials?: string;
  lighting_scheme?: string;
  atmosphere?: string;
  inhabitants?: {
    permanent_residents?: Array<{ type: string; count: number }>;
    notable_npcs?: Array<{ name: string; role: string; location: string }>;
    visitors?: string[];
    creatures?: string[];
  };
  encounter_areas?: Array<{
    space_id: string;
    encounter_type: string;
    description?: string;
    tactical_notes?: string;
  }>;
  secrets?: Array<{
    type: string;
    location: string;
    description?: string;
    how_to_find?: string;
  }>;
  treasure_locations?: Array<{
    location: string;
    description?: string;
    difficulty?: string;
  }>;
  history?: string;
  current_events?: string;
  adventure_hooks?: string[];
  special_features?: string[];
  cinematic_walkthrough?: string;
}

interface LocationContentViewProps {
  location: LocationData;
}

const Section: FC<{ title: string; children: React.ReactNode; icon?: React.ReactNode; className?: string }> = ({
  title,
  children,
  icon,
  className = ''
}) => {
  if (children === null || children === undefined) return null;
  if (typeof children === 'string' && !children.trim()) return null;

  return (
    <section className={`mb-6 ${className}`}>
      <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2 border-b-2 border-blue-600 pb-2">
        {icon}
        {title}
      </h3>
      <div className="space-y-3 text-sm text-gray-800">{children}</div>
    </section>
  );
};

const InfoRow: FC<{ label: string; value?: string | number; className?: string }> = ({ label, value, className = '' }) => {
  if (!value) return null;
  return (
    <div className={`flex items-baseline gap-2 ${className}`}>
      <span className="font-semibold text-gray-700 min-w-[120px]">{label}:</span>
      <span className="text-gray-900">{value}</span>
    </div>
  );
};

const List: FC<{ items?: string[]; emptyMessage?: string; className?: string }> = ({
  items,
  emptyMessage = 'None specified',
  className = ''
}) => {
  if (!items || items.length === 0) {
    return <p className="text-sm text-gray-500 italic">{emptyMessage}</p>;
  }

  return (
    <ul className={`list-disc list-inside space-y-1 ${className}`}>
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className="text-sm text-gray-800">{item}</li>
      ))}
    </ul>
  );
};

const SpaceCard: FC<{ space: LocationSpace; index: number }> = ({ space, index }) => (
  <div className="border border-gray-300 rounded-lg p-4 bg-white hover:border-blue-400 transition-colors">
    <div className="flex items-start justify-between mb-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold">
          {index + 1}
        </span>
        <div>
          <h4 className="font-bold text-gray-900">{space.name}</h4>
          {space.purpose && <p className="text-xs text-gray-600">{space.purpose}</p>}
        </div>
      </div>

      {space.floor_level !== undefined && (
        <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium text-gray-700">
          Floor {space.floor_level}
        </span>
      )}
    </div>

    {space.description && (
      <p className="text-sm text-gray-700 mb-3 pl-9">{space.description}</p>
    )}

    {/* Geometry */}
    {space.geometry && (
      <div className="pl-9 space-y-2">
        {space.geometry.dimensions && (
          <div className="text-xs text-gray-600 flex items-center gap-2">
            <Map className="w-3 h-3" />
            <span>
              {space.geometry.dimensions.length} × {space.geometry.dimensions.width}
              {space.geometry.dimensions.height && ` × ${space.geometry.dimensions.height}`}
            </span>
          </div>
        )}

        {space.geometry.connections && space.geometry.connections.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {space.geometry.connections.map((conn, connIndex) => (
              <span
                key={connIndex}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 border border-green-200 rounded text-xs text-green-700"
              >
                {conn.type} → {conn.to}
              </span>
            ))}
          </div>
        )}
      </div>
    )}

    {/* Features */}
    {space.features && space.features.length > 0 && (
      <div className="pl-9 mt-2">
        <p className="text-xs font-semibold text-gray-700 mb-1">Features:</p>
        <ul className="list-disc list-inside text-xs text-gray-600 space-y-0.5">
          {space.features.map((feature, fIndex) => (
            <li key={fIndex}>{feature}</li>
          ))}
        </ul>
      </div>
    )}

    {/* Lighting & Inhabitants */}
    <div className="pl-9 mt-2 flex gap-4 text-xs text-gray-600">
      {space.lighting && <span>💡 {space.lighting}</span>}
      {space.inhabitants && <span>👥 {space.inhabitants}</span>}
    </div>
  </div>
);

export default function LocationContentView({ location }: LocationContentViewProps) {
  return (
    <article className="space-y-6">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <Building2 className="w-8 h-8 text-blue-600" />
              <h2 className="text-3xl font-bold text-gray-900">{location.name || 'Unnamed Location'}</h2>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-600 mb-3">
              {location.location_type && (
                <span className="px-2 py-1 bg-white rounded border border-gray-300 capitalize">
                  {location.location_type}
                </span>
              )}
              {location.scale && (
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded font-medium uppercase text-xs">
                  {location.scale}
                </span>
              )}
              {location.architectural_style && (
                <span className="text-gray-600">{location.architectural_style}</span>
              )}
            </div>
          </div>
        </div>

        {location.description && (
          <p className="text-gray-700 leading-relaxed">{location.description}</p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-4">
          {location.purpose && <InfoRow label="Purpose" value={location.purpose} />}
          {location.setting && <InfoRow label="Setting" value={location.setting} />}
        </div>
      </header>

      {/* Key Features */}
      {location.key_features && location.key_features.length > 0 && (
        <Section title="Key Features" icon={<Zap className="w-5 h-5 text-yellow-600" />}>
          <List items={location.key_features} />
        </Section>
      )}

      {/* Dimensions & Layout */}
      {(location.overall_dimensions || location.layout) && (
        <Section title="Dimensions & Layout" icon={<Map className="w-5 h-5 text-gray-600" />}>
          {location.overall_dimensions?.footprint && (
            <InfoRow
              label="Footprint"
              value={`${location.overall_dimensions.footprint.length || '?'} × ${location.overall_dimensions.footprint.width || '?'}`}
            />
          )}
          {location.overall_dimensions?.height?.total && (
            <InfoRow label="Height" value={location.overall_dimensions.height.total} />
          )}
          {location.overall_dimensions?.height?.floors && (
            <InfoRow label="Floors" value={location.overall_dimensions.height.floors} />
          )}
          {location.layout?.description && (
            <div className="mt-2">
              <p className="text-sm text-gray-700">{location.layout.description}</p>
            </div>
          )}
          {location.spatial_organization && (
            <div className="mt-2 p-3 bg-gray-50 rounded border border-gray-200">
              <p className="text-xs font-semibold text-gray-700 mb-1">Organization:</p>
              <p className="text-sm text-gray-700">{location.spatial_organization}</p>
            </div>
          )}
        </Section>
      )}

      {/* Access Points */}
      {location.access_points && location.access_points.length > 0 && (
        <Section title="Access Points" className="col-span-1">
          <List items={location.access_points} />
        </Section>
      )}

      {/* Wings */}
      {location.wings && location.wings.length > 0 && (
        <Section title="Wings & Sections">
          <div className="space-y-2">
            {location.wings.map((wing, index) => (
              <div key={index} className="p-3 bg-gray-50 rounded border border-gray-200">
                <div className="font-semibold text-gray-900">{wing.name}</div>
                {wing.purpose && <p className="text-xs text-gray-600 mt-1">{wing.purpose}</p>}
                {wing.dimensions && (
                  <p className="text-xs text-gray-500 mt-1">
                    {wing.dimensions.length} × {wing.dimensions.width}
                  </p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Floors */}
      {location.floors && location.floors.length > 0 && (
        <Section title="Floor Levels">
          <div className="space-y-2">
            {location.floors.map((floor, index) => (
              <div key={index} className="p-3 bg-gray-50 rounded border border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-gray-900">
                    Floor {floor.level}: {floor.name}
                  </div>
                  {floor.ceiling_height && (
                    <span className="text-xs text-gray-500">{floor.ceiling_height} ceiling</span>
                  )}
                </div>
                {floor.purpose && <p className="text-xs text-gray-600 mt-1">{floor.purpose}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Spaces */}
      {location.spaces && location.spaces.length > 0 && (
        <Section title={`Spaces (${location.spaces.length})`} icon={<MapPin className="w-5 h-5 text-blue-600" />}>
          <div className="space-y-3">
            {location.spaces.map((space, index) => (
              <SpaceCard key={space.id || index} space={space} index={index} />
            ))}
          </div>
        </Section>
      )}

      {/* Materials & Atmosphere */}
      {(location.materials || location.lighting_scheme || location.atmosphere) && (
        <Section title="Atmosphere & Materials">
          {location.materials && <InfoRow label="Materials" value={location.materials} />}
          {location.lighting_scheme && <InfoRow label="Lighting" value={location.lighting_scheme} />}
          {location.atmosphere && (
            <div className="mt-2 p-3 bg-gray-50 rounded border border-gray-200">
              <p className="text-sm text-gray-700">{location.atmosphere}</p>
            </div>
          )}
        </Section>
      )}

      {/* Inhabitants */}
      {location.inhabitants && (
        <Section title="Inhabitants" icon={<Users className="w-5 h-5 text-purple-600" />}>
          {location.inhabitants.permanent_residents && location.inhabitants.permanent_residents.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-700 mb-1">Permanent Residents:</p>
              <ul className="list-disc list-inside text-sm text-gray-800 space-y-1">
                {location.inhabitants.permanent_residents.map((resident, index) => (
                  <li key={index}>
                    {resident.count} {resident.type}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {location.inhabitants.notable_npcs && location.inhabitants.notable_npcs.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-semibold text-gray-700 mb-1">Notable NPCs:</p>
              <div className="space-y-2">
                {location.inhabitants.notable_npcs.map((npc, index) => (
                  <div key={index} className="p-2 bg-gray-50 rounded border border-gray-200">
                    <div className="font-semibold text-gray-900">{npc.name}</div>
                    <p className="text-xs text-gray-600">
                      {npc.role} • Located in: {npc.location}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {location.inhabitants.visitors && <List items={location.inhabitants.visitors} />}
        </Section>
      )}

      {/* Encounter Areas */}
      {location.encounter_areas && location.encounter_areas.length > 0 && (
        <Section title="Encounter Areas" icon={<Zap className="w-5 h-5 text-red-600" />}>
          <div className="space-y-2">
            {location.encounter_areas.map((area, index) => (
              <div key={index} className="p-3 bg-red-50 rounded border border-red-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 bg-red-600 text-white rounded text-xs font-bold uppercase">
                    {area.encounter_type}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{area.space_id}</span>
                </div>
                {area.description && <p className="text-sm text-gray-700 mb-1">{area.description}</p>}
                {area.tactical_notes && (
                  <p className="text-xs text-gray-600 italic">⚔️ {area.tactical_notes}</p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Secrets */}
      {location.secrets && location.secrets.length > 0 && (
        <Section title="Secrets" icon={<Key className="w-5 h-5 text-amber-600" />}>
          <div className="space-y-2">
            {location.secrets.map((secret, index) => (
              <div key={index} className="p-3 bg-amber-50 rounded border border-amber-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 bg-amber-600 text-white rounded text-xs font-bold uppercase">
                    {secret.type}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{secret.location}</span>
                </div>
                {secret.description && <p className="text-sm text-gray-700 mb-1">{secret.description}</p>}
                {secret.how_to_find && (
                  <p className="text-xs text-gray-600">🔍 {secret.how_to_find}</p>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Treasure */}
      {location.treasure_locations && location.treasure_locations.length > 0 && (
        <Section title="Treasure Locations" icon={<Gem className="w-5 h-5 text-yellow-600" />}>
          <div className="space-y-2">
            {location.treasure_locations.map((treasure, index) => (
              <div key={index} className="p-3 bg-yellow-50 rounded border border-yellow-200">
                <div className="font-semibold text-gray-900">{treasure.location}</div>
                {treasure.description && <p className="text-sm text-gray-700 mt-1">{treasure.description}</p>}
                {treasure.difficulty && (
                  <span className="inline-block mt-1 px-2 py-0.5 bg-yellow-600 text-white rounded text-xs font-bold">
                    {treasure.difficulty}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* History */}
      {location.history && (
        <Section title="History" icon={<History className="w-5 h-5 text-gray-600" />}>
          <div className="prose prose-sm max-w-none">
            <p className="text-gray-700 leading-relaxed whitespace-pre-line">{location.history}</p>
          </div>
        </Section>
      )}

      {/* Current Events */}
      {location.current_events && (
        <Section title="Current Events">
          <div className="prose prose-sm max-w-none">
            <p className="text-gray-700 leading-relaxed whitespace-pre-line">{location.current_events}</p>
          </div>
        </Section>
      )}

      {/* Adventure Hooks */}
      {location.adventure_hooks && location.adventure_hooks.length > 0 && (
        <Section title="Adventure Hooks">
          <List items={location.adventure_hooks} />
        </Section>
      )}

      {/* Special Features */}
      {location.special_features && location.special_features.length > 0 && (
        <Section title="Special Features">
          <List items={location.special_features} />
        </Section>
      )}

      {/* Cinematic Walkthrough */}
      {location.cinematic_walkthrough && (
        <Section title="Cinematic Walkthrough" className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border-2 border-blue-200">
          <div className="prose prose-sm max-w-none">
            <p className="text-gray-800 leading-relaxed whitespace-pre-line italic">
              {location.cinematic_walkthrough}
            </p>
          </div>
        </Section>
      )}
    </article>
  );
}
