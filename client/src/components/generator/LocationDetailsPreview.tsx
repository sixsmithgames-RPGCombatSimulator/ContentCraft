/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import React from 'react';
import { Users, Swords, Eye, Gem, Scroll } from 'lucide-react';

interface LocationDetailsPreviewProps {
  data: Record<string, unknown>;
}

const LocationDetailsPreview: React.FC<LocationDetailsPreviewProps> = ({ data }) => {
  const inhabitants = data.inhabitants as Record<string, unknown> | undefined;
  const encounterAreas = (data.encounter_areas || []) as Array<Record<string, unknown>>;
  const secrets = (data.secrets || []) as Array<Record<string, unknown>>;
  const treasureLocations = (data.treasure_locations || []) as Array<Record<string, unknown>>;
  const adventureHooks = (data.adventure_hooks || []) as Array<string>;

  return (
    <div className="space-y-6 max-h-[600px] overflow-y-auto pr-2">
      {/* Inhabitants Section */}
      {inhabitants && (
        <Section title="Inhabitants" icon={<Users className="w-5 h-5" />}>
          {!!(inhabitants.permanent_residents && Array.isArray(inhabitants.permanent_residents)) && (
            <SubSection title="Permanent Residents">
              <div className="space-y-2">
                {(inhabitants.permanent_residents as Array<Record<string, unknown>>).map((resident, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm">
                    <span className="text-gray-600">•</span>
                    <div>
                      <span className="font-medium">{String(resident.type || 'Unknown')}</span>
                      {!!resident.count && <span className="text-gray-600"> (×{String(resident.count)})</span>}
                    </div>
                  </div>
                ))}
              </div>
            </SubSection>
          )}

          {!!(inhabitants.notable_npcs && Array.isArray(inhabitants.notable_npcs)) && (
            <SubSection title="Notable NPCs">
              <div className="space-y-3">
                {(inhabitants.notable_npcs as Array<Record<string, unknown>>).map((npc, idx) => (
                  <div key={idx} className="border-l-2 border-primary-400 pl-3">
                    <div className="font-semibold text-gray-900">{String(npc.name || 'Unnamed')}</div>
                    <div className="text-sm text-gray-600">{String(npc.role || '')}</div>
                    {!!npc.location && <div className="text-xs text-gray-500 mt-1">📍 {String(npc.location)}</div>}
                  </div>
                ))}
              </div>
            </SubSection>
          )}

          {!!(inhabitants.creatures && Array.isArray(inhabitants.creatures)) && (
            <SubSection title="Creatures">
              <div className="space-y-2">
                {(inhabitants.creatures as Array<string>).map((creature, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="text-gray-400">•</span>
                    <span>{creature}</span>
                  </div>
                ))}
              </div>
            </SubSection>
          )}
        </Section>
      )}

      {/* Encounter Areas Section */}
      {encounterAreas.length > 0 && (
        <Section title="Encounter Areas" icon={<Swords className="w-5 h-5" />}>
          <div className="space-y-4">
            {encounterAreas.map((encounter, idx) => (
              <div key={idx} className="bg-amber-50 border border-amber-200 rounded-md p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold text-gray-900">{String(encounter.space_id || 'Unknown Area')}</span>
                  <span className="text-xs px-2 py-1 bg-amber-200 text-amber-800 rounded">
                    {String(encounter.encounter_type || 'encounter').toUpperCase()}
                  </span>
                </div>
                <p className="text-sm text-gray-700 mb-2">{String(encounter.description || '')}</p>
                {!!encounter.tactical_notes && (
                  <div className="text-xs text-gray-600 bg-white rounded p-2 mt-2">
                    <span className="font-medium">Tactics: </span>
                    {String(encounter.tactical_notes)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Secrets & Hidden Features Section */}
      {secrets.length > 0 && (
        <Section title="Secrets & Hidden Features" icon={<Eye className="w-5 h-5" />}>
          <div className="space-y-4">
            {secrets.map((secret, idx) => (
              <div key={idx} className="bg-purple-50 border border-purple-200 rounded-md p-3">
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-xs px-2 py-1 bg-purple-200 text-purple-800 rounded font-medium">
                    {String(secret.type || 'SECRET')}
                  </span>
                  <span className="text-sm font-semibold text-gray-900 flex-1">{String(secret.location || '')}</span>
                </div>
                <p className="text-sm text-gray-700 mb-2">{String(secret.description || '')}</p>
                {!!secret.how_to_find && (
                  <div className="text-xs text-purple-700 bg-white rounded p-2 mt-2">
                    <span className="font-medium">How to find: </span>
                    {String(secret.how_to_find)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Treasure Locations Section */}
      {treasureLocations.length > 0 && (
        <Section title="Treasure Locations" icon={<Gem className="w-5 h-5" />}>
          <div className="space-y-3">
            {treasureLocations.map((treasure, idx) => (
              <div key={idx} className="bg-yellow-50 border border-yellow-300 rounded-md p-3">
                <div className="font-semibold text-gray-900 mb-1">📍 {String(treasure.location || '')}</div>
                <p className="text-sm text-gray-700 mb-2">{String(treasure.description || '')}</p>
                {!!treasure.security && (
                  <div className="text-xs text-yellow-800 bg-white rounded p-2">
                    <span className="font-medium">Security: </span>
                    {String(treasure.security)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Adventure Hooks Section */}
      {adventureHooks.length > 0 && (
        <Section title="Adventure Hooks" icon={<Scroll className="w-5 h-5" />}>
          <div className="space-y-3">
            {adventureHooks.map((hook, idx) => (
              <div key={idx} className="bg-blue-50 border-l-4 border-blue-400 p-3">
                <p className="text-sm text-gray-700">{hook}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Empty State */}
      {!inhabitants && encounterAreas.length === 0 && secrets.length === 0 && treasureLocations.length === 0 && adventureHooks.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No details generated yet.</p>
        </div>
      )}
    </div>
  );
};

// Helper Components
const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <div className="text-gray-600">{icon}</div>
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
      </div>
      <div className="p-4 space-y-4">
        {children}
      </div>
    </div>
  );
};

const SubSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => {
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 mb-2">{title}</h4>
      {children}
    </div>
  );
};

export default LocationDetailsPreview;
