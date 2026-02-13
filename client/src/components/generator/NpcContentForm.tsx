/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { type FC, useMemo } from 'react';
import {
  AbilityScores,
  Feature,
  NormalizedNpc,
  SpellcastingSummary,
  featuresToMultiline,
  listToMultiline,
  multilineToFeatures,
  multilineToList,
  multilineToRelationships,
  relationshipsToMultiline,
} from './npcUtils';

interface NpcContentFormProps {
  value: NormalizedNpc;
  onChange: (updated: NormalizedNpc) => void;
}

const ListTextarea: FC<{
  label: string;
  value: string[];
  onChange: (items: string[]) => void;
  helper?: string;
  rows?: number;
}> = ({ label, value, onChange, helper, rows = 3 }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <textarea
      value={listToMultiline(value)}
      onChange={(e) => onChange(multilineToList(e.target.value))}
      rows={rows}
      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
    />
    {helper && <p className="text-xs text-gray-500 mt-1">{helper}</p>}
  </div>
);

const FeatureTextarea: FC<{
  label: string;
  value: Feature[];
  onChange: (items: Feature[]) => void;
  helper?: string;
  rows?: number;
}> = ({ label, value, onChange, helper, rows = 4 }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
    <textarea
      value={featuresToMultiline(value)}
      onChange={(e) => onChange(multilineToFeatures(e.target.value))}
      rows={rows}
      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
    />
    {helper && <p className="text-xs text-gray-500 mt-1">{helper}</p>}
  </div>
);

const AbilityScoresSection: FC<{
  scores: AbilityScores;
  onChange: (scores: AbilityScores) => void;
}> = ({ scores, onChange }) => (
  <div className="grid grid-cols-3 gap-4">
    {(Object.entries(scores) as Array<[keyof AbilityScores, number]>).map(([ability, score]) => (
      <div key={ability}>
        <label className="block text-sm font-medium text-gray-700 mb-1 uppercase">{ability}</label>
        <input
          type="number"
          value={score}
          onChange={(e) => onChange({ ...scores, [ability]: Number.parseInt(e.target.value, 10) || 0 })}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
    ))}
  </div>
);

const normalizeSpellcasting = (spellcasting?: SpellcastingSummary | null): SpellcastingSummary | undefined => {
  if (!spellcasting) return undefined;
  const normalized: SpellcastingSummary = {
    type: spellcasting.type?.trim() || undefined,
    ability: spellcasting.ability?.trim() || undefined,
    saveDc: spellcasting.saveDc ?? undefined,
    attackBonus: spellcasting.attackBonus ?? undefined,
    knownSpells: [...(spellcasting.knownSpells ?? [])].map((spell) => spell.trim()).filter(Boolean),
    spellSlots: Object.fromEntries(
      Object.entries(spellcasting.spellSlots ?? {}).filter(([, amount]) => Number.isFinite(amount)),
    ),
    notes: spellcasting.notes?.trim() || undefined,
  };

  const hasData =
    normalized.type ||
    normalized.ability ||
    normalized.notes ||
    normalized.knownSpells.length > 0 ||
    Object.keys(normalized.spellSlots).length > 0 ||
    normalized.saveDc !== undefined ||
    normalized.attackBonus !== undefined;

  return hasData ? normalized : undefined;
};

const spellSlotsToText = (slots?: Record<string, number>): string =>
  Object.entries(slots ?? {})
    .map(([level, amount]) => `${level}: ${amount}`)
    .join('\n');

const textToSpellSlots = (value: string): Record<string, number> => {
  const result: Record<string, number> = {};
  multilineToList(value).forEach((line) => {
    const [level, amount] = line.split(':').map((part) => part.trim());
    if (!level) return;
    const parsed = Number.parseInt(amount ?? '', 10);
    if (Number.isFinite(parsed)) result[level] = parsed;
  });
  return result;
};

const speedToMultiline = (speed: Record<string, string>): string =>
  Object.entries(speed)
    .map(([type, distance]) => `${type}: ${distance}`.trim())
    .join('\n');

const multilineToSpeed = (value: string): Record<string, string> => {
  const entries: Record<string, string> = {};
  multilineToList(value).forEach((line) => {
    const [typePart, ...rest] = line.split(':');
    const type = typePart.trim();
    if (!type) return;
    const distance = rest.join(':').trim();
    entries[type] = distance;
  });
  return entries;
};

const armorClassToInput = (armorClass: NormalizedNpc['armorClass']): string => {
  if (armorClass === undefined || armorClass === null) return '';
  if (typeof armorClass === 'number') return armorClass.toString();
  return armorClass
    .map((entry) => {
      const parts = [String(entry.value ?? 0)];
      if (entry.type) parts.push(`(${entry.type})`);
      if (entry.notes) parts.push(entry.notes);
      return parts.filter(Boolean).join(' ');
    })
    .join(', ');
};

const inputToArmorClass = (value: string): NormalizedNpc['armorClass'] => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const segments = trimmed.split(',').map((segment) => segment.trim()).filter(Boolean);
  if (segments.length === 1) {
    const [segment] = segments;
    const match = segment.match(/(\d+)/);
    if (match) return Number.parseInt(match[1], 10);
    return [{ value: 0, notes: segment }];
  }

  return segments.map((segment) => {
    const match = segment.match(/(\d+)/);
    const numeric = match ? Number.parseInt(match[1], 10) : 0;
    const remainder = segment.replace(/(\d+)/, '').trim();
    const typeMatch = remainder.match(/\(([^)]*)\)/);
    const type = typeMatch ? typeMatch[1].trim() : undefined;
    const notes = remainder.replace(/\(([^)]*)\)/, '').trim();

    return {
      value: Number.isFinite(numeric) ? numeric : 0,
      ...(type ? { type } : {}),
      ...(notes ? { notes } : {}),
    };
  });
};

const NpcContentForm: FC<NpcContentFormProps> = ({ value, onChange }) => {
  const spellcasting = useMemo(() => normalizeSpellcasting(value.spellcasting), [value.spellcasting]);

  const updateField = <K extends keyof NormalizedNpc>(field: K, newValue: NormalizedNpc[K]) => {
    onChange({ ...value, [field]: newValue });
  };

  const updatePersonality = (key: keyof NormalizedNpc['personality'], items: string[]) => {
    updateField('personality', { ...value.personality, [key]: items });
  };

  const updateSpellcasting = (changes: Partial<SpellcastingSummary>) => {
    const merged: SpellcastingSummary = {
      type: spellcasting?.type,
      ability: spellcasting?.ability,
      saveDc: spellcasting?.saveDc,
      attackBonus: spellcasting?.attackBonus,
      knownSpells: [...(spellcasting?.knownSpells ?? [])],
      spellSlots: { ...(spellcasting?.spellSlots ?? {}) },
      notes: spellcasting?.notes,
      ...changes,
    };

    updateField('spellcasting', normalizeSpellcasting(merged));
  };

  return (
    <div className="space-y-6">
      {/* Basics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
          <input
            type="text"
            value={value.name}
            onChange={(e) => updateField('name', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            type="text"
            value={value.title ?? ''}
            onChange={(e) => updateField('title', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
          <input
            type="text"
            value={value.role ?? ''}
            onChange={(e) => updateField('role', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Race</label>
          <input
            type="text"
            value={value.race ?? ''}
            onChange={(e) => updateField('race', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Alignment</label>
          <input
            type="text"
            value={value.alignment ?? ''}
            onChange={(e) => updateField('alignment', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Affiliation</label>
          <input
            type="text"
            value={value.affiliation ?? ''}
            onChange={(e) => updateField('affiliation', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <input
            type="text"
            value={value.location ?? ''}
            onChange={(e) => updateField('location', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Challenge Rating</label>
          <input
            type="text"
            value={value.challengeRating ?? ''}
            onChange={(e) => updateField('challengeRating', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Experience Points</label>
          <input
            type="number"
            value={value.experiencePoints ?? ''}
            onChange={(e) =>
              updateField('experiencePoints', e.target.value ? Number.parseInt(e.target.value, 10) || 0 : undefined)
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <ListTextarea
        label="Aliases"
        value={value.aliases}
        onChange={(items) => updateField('aliases', items)}
        helper="One alias per line"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Era</label>
          <input
            type="text"
            value={value.era ?? ''}
            onChange={(e) => updateField('era', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Region</label>
          <input
            type="text"
            value={value.region ?? ''}
            onChange={(e) => updateField('region', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus-border-blue-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={value.description}
            onChange={(e) => updateField('description', e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Appearance</label>
          <textarea
            value={value.appearance ?? ''}
            onChange={(e) => updateField('appearance', e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Background</label>
        <textarea
          value={value.background ?? ''}
          onChange={(e) => updateField('background', e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ListTextarea
          label="Motivations"
          value={value.motivations}
          onChange={(items) => updateField('motivations', items)}
          helper="One motivation per line"
        />
        <ListTextarea
          label="Hooks"
          value={value.hooks}
          onChange={(items) => updateField('hooks', items)}
          helper="One hook per line"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ListTextarea
          label="Personality Traits"
          value={value.personality.traits}
          onChange={(items) => updatePersonality('traits', items)}
          helper="One trait per line"
        />
        <ListTextarea
          label="Ideals"
          value={value.personality.ideals}
          onChange={(items) => updatePersonality('ideals', items)}
          helper="One ideal per line"
        />
        <ListTextarea
          label="Bonds"
          value={value.personality.bonds}
          onChange={(items) => updatePersonality('bonds', items)}
          helper="One bond per line"
        />
        <ListTextarea
          label="Flaws"
          value={value.personality.flaws}
          onChange={(items) => updatePersonality('flaws', items)}
          helper="One flaw per line"
        />
      </div>

      <AbilityScoresSection
        scores={value.abilityScores}
        onChange={(scores) => updateField('abilityScores', scores)}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Armor Class</label>
          <input
            type="text"
            value={armorClassToInput(value.armorClass)}
            onChange={(e) => updateField('armorClass', inputToArmorClass(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">Accepts a single value or comma-separated list</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hit Dice</label>
          <input
            type="text"
            value={value.hitDice ?? ''}
            onChange={(e) => updateField('hitDice', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Hit Points (average or formula)</label>
          <input
            type="text"
            value={value.hitPoints?.formula ?? (value.hitPoints?.average?.toString() ?? '')}
            onChange={(e) =>
              updateField('hitPoints', {
                ...value.hitPoints,
                formula: e.target.value,
                average: Number.parseInt(e.target.value, 10) || value.hitPoints?.average,
              })
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Passive Perception</label>
          <input
            type="number"
            value={value.passivePerception ?? ''}
            onChange={(e) =>
              updateField(
                'passivePerception',
                e.target.value ? Number.parseInt(e.target.value, 10) || 0 : undefined,
              )
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Speed</label>
        <textarea
          value={speedToMultiline(value.speed)}
          onChange={(e) => updateField('speed', multilineToSpeed(e.target.value))}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
        <p className="text-xs text-gray-500 mt-1">Format: type: distance</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ListTextarea
          label="Senses"
          value={value.senses}
          onChange={(items) => updateField('senses', items)}
        />
        <ListTextarea
          label="Languages"
          value={value.languages}
          onChange={(items) => updateField('languages', items)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tactics</label>
        <textarea
          value={value.tactics ?? ''}
          onChange={(e) => updateField('tactics', e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ListTextarea
          label="Damage Resistances"
          value={value.damageResistances}
          onChange={(items) => updateField('damageResistances', items)}
        />
        <ListTextarea
          label="Damage Immunities"
          value={value.damageImmunities}
          onChange={(items) => updateField('damageImmunities', items)}
        />
        <ListTextarea
          label="Damage Vulnerabilities"
          value={value.damageVulnerabilities}
          onChange={(items) => updateField('damageVulnerabilities', items)}
        />
        <ListTextarea
          label="Condition Immunities"
          value={value.conditionImmunities}
          onChange={(items) => updateField('conditionImmunities', items)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Schema Version</label>
          <input
            type="text"
            value={value.schemaVersion ?? ''}
            onChange={(e) => updateField('schemaVersion', e.target.value || undefined)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fact Check Report (JSON)</label>
          <textarea
            value={value.factCheckReport ? JSON.stringify(value.factCheckReport, null, 2) : ''}
            onChange={(e) => {
              const text = e.target.value;
              if (!text.trim()) {
                updateField('factCheckReport', undefined);
                return;
              }
              try {
                updateField('factCheckReport', JSON.parse(text));
              } catch {
                // keep previous value; validation handled on save
              }
            }}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-xs"
          />
        </div>
      </div>

      <FeatureTextarea
        label="Abilities"
        value={value.abilities}
        onChange={(items) => updateField('abilities', items)}
        helper="Format lines as 'Name | Description | Notes'"
      />

      <FeatureTextarea
        label="Additional Traits"
        value={value.additionalTraits}
        onChange={(items) => updateField('additionalTraits', items)}
        helper="Format lines as 'Name | Description | Notes'"
      />

      <FeatureTextarea
        label="Actions"
        value={value.actions}
        onChange={(items) => updateField('actions', items)}
        helper="Format lines as 'Name | Description | Notes'"
      />

      <FeatureTextarea
        label="Bonus Actions"
        value={value.bonusActions}
        onChange={(items) => updateField('bonusActions', items)}
        helper="Format lines as 'Name | Description | Notes'"
      />

      <FeatureTextarea
        label="Reactions"
        value={value.reactions}
        onChange={(items) => updateField('reactions', items)}
        helper="Format lines as 'Name | Description | Notes'"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ListTextarea
          label="Lair Actions"
          value={value.lairActions}
          onChange={(items) => updateField('lairActions', items)}
        />
        <ListTextarea
          label="Regional Effects"
          value={value.regionalEffects}
          onChange={(items) => updateField('regionalEffects', items)}
        />
      </div>

      <ListTextarea
        label="Notes"
        value={value.notes}
        onChange={(items) => updateField('notes', items)}
      />

      <ListTextarea
        label="Sources"
        value={value.sources}
        onChange={(items) => updateField('sources', items)}
      />

      <ListTextarea
        label="Sources Used"
        value={value.sourcesUsed}
        onChange={(items) => updateField('sourcesUsed', items)}
      />

      <ListTextarea
        label="Assumptions"
        value={value.assumptions}
        onChange={(items) => updateField('assumptions', items)}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ListTextarea
          label="Allies"
          value={value.allies}
          onChange={(items) => updateField('allies', items)}
        />
        <ListTextarea
          label="Foes"
          value={value.foes}
          onChange={(items) => updateField('foes', items)}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Relationships</label>
          <textarea
            value={relationshipsToMultiline(value.relationships)}
            onChange={(e) => updateField('relationships', multilineToRelationships(e.target.value))}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">Format lines as 'Name | Relationship | Notes'</p>
        </div>
      </div>

      <div className="border border-gray-200 rounded-md p-4 space-y-4">
        <h3 className="text-base font-semibold text-gray-800">Spellcasting</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Spellcasting Type</label>
            <input
              type="text"
              value={spellcasting?.type ?? ''}
              onChange={(e) => updateSpellcasting({ type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Spellcasting Ability</label>
            <input
              type="text"
              value={spellcasting?.ability ?? ''}
              onChange={(e) => updateSpellcasting({ ability: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Spell Save DC</label>
            <input
              type="number"
              value={spellcasting?.saveDc ?? ''}
              onChange={(e) =>
                updateSpellcasting({ saveDc: e.target.value ? Number.parseInt(e.target.value, 10) || 0 : undefined })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Spell Attack Bonus</label>
            <input
              type="number"
              value={spellcasting?.attackBonus ?? ''}
              onChange={(e) =>
                updateSpellcasting({ attackBonus: e.target.value ? Number.parseInt(e.target.value, 10) || 0 : undefined })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <ListTextarea
          label="Known Spells"
          value={spellcasting?.knownSpells ?? []}
          onChange={(items) => updateSpellcasting({ knownSpells: items })}
          helper="One spell per line"
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Spell Slots (Format: level: count)</label>
          <textarea
            value={spellSlotsToText(spellcasting?.spellSlots)}
            onChange={(e) => updateSpellcasting({ spellSlots: textToSpellSlots(e.target.value) })}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Spellcasting Notes</label>
          <textarea
            value={spellcasting?.notes ?? ''}
            onChange={(e) => updateSpellcasting({ notes: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Stat Block (JSON)</label>
        <textarea
          value={JSON.stringify(value.statBlock, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              updateField('statBlock', parsed);
            } catch {
              // keep previous value; validation handled on save
            }
          }}
          rows={8}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-xs"
        />
      </div>
    </div>
  );
};

export default NpcContentForm;
