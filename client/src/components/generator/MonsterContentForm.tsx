/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { type FC } from 'react';

interface MonsterData {
  name?: string;
  description?: string;
  size?: string;
  creature_type?: string;
  subtype?: string;
  alignment?: string;
  challenge_rating?: string;
  experience_points?: number;
  location?: string;
  ability_scores?: {
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  };
  armor_class?: number | Array<{ value: number; type?: string; notes?: string }>;
  hit_points?: number | { average: number; formula: string };
  hit_dice?: string;
  proficiency_bonus?: number | string;
  speed?: {
    walk?: string;
    fly?: string;
    swim?: string;
    climb?: string;
    burrow?: string;
    hover?: boolean;
  };
  [key: string]: unknown;
}

interface MonsterContentFormProps {
  value: MonsterData;
  onChange: (updated: MonsterData) => void;
}

const MonsterContentForm: FC<MonsterContentFormProps> = ({ value, onChange }) => {
  const updateField = (field: string, val: unknown) => {
    onChange({ ...value, [field]: val });
  };

  const updateNestedField = (parent: string, field: string, val: unknown) => {
    const parentObj = (value[parent] as Record<string, unknown>) || {};
    onChange({ ...value, [parent]: { ...parentObj, [field]: val } });
  };

  return (
    <div className="space-y-6">
      {/* Basic Info Section */}
      <section className="border-b pb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Basic Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={value.name || ''}
              onChange={(e) => updateField('name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Size *</label>
            <select
              value={value.size || ''}
              onChange={(e) => updateField('size', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            >
              <option value="">Select size</option>
              <option value="Tiny">Tiny</option>
              <option value="Small">Small</option>
              <option value="Medium">Medium</option>
              <option value="Large">Large</option>
              <option value="Huge">Huge</option>
              <option value="Gargantuan">Gargantuan</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Creature Type *</label>
            <input
              type="text"
              value={value.creature_type || ''}
              onChange={(e) => updateField('creature_type', e.target.value)}
              placeholder="e.g., Dragon, Beast, Undead"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subtype</label>
            <input
              type="text"
              value={value.subtype || ''}
              onChange={(e) => updateField('subtype', e.target.value)}
              placeholder="e.g., Red Dragon, Shapechanger"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Alignment</label>
            <input
              type="text"
              value={value.alignment || ''}
              onChange={(e) => updateField('alignment', e.target.value)}
              placeholder="e.g., Chaotic Evil, Unaligned"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Challenge Rating *</label>
            <input
              type="text"
              value={value.challenge_rating || ''}
              onChange={(e) => updateField('challenge_rating', e.target.value)}
              placeholder="e.g., 1/4, 1/2, 1, 5, 20"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Experience Points</label>
            <input
              type="number"
              value={value.experience_points || ''}
              onChange={(e) => updateField('experience_points', parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location/Habitat</label>
            <input
              type="text"
              value={value.location || ''}
              onChange={(e) => updateField('location', e.target.value)}
              placeholder="e.g., Arctic tundra, Underground caverns"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
          <textarea
            value={value.description || ''}
            onChange={(e) => updateField('description', e.target.value)}
            rows={3}
            placeholder="Physical appearance and behavior summary (minimum 20 characters)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>
      </section>

      {/* Combat Stats Section */}
      <section className="border-b pb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Combat Statistics</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Armor Class</label>
            <input
              type="text"
              value={(() => {
                if (typeof value.armor_class === 'number') return value.armor_class;
                if (Array.isArray(value.armor_class) && value.armor_class.length > 0) {
                  const ac = value.armor_class[0];
                  if (ac && typeof ac === 'object' && 'value' in ac) {
                    return `${ac.value}${ac.type ? ` (${ac.type})` : ''}`;
                  }
                }
                return '';
              })()}
              onChange={(e) => {
                const val = e.target.value;
                // Try to parse "15 (natural armor)" format
                const match = val.match(/^(\d+)\s*(?:\(([^)]+)\))?$/);
                if (match) {
                  const acValue = parseInt(match[1]);
                  const acType = match[2];
                  if (acType) {
                    updateField('armor_class', [{ value: acValue, type: acType }]);
                  } else {
                    updateField('armor_class', acValue);
                  }
                } else if (/^\d+$/.test(val)) {
                  updateField('armor_class', parseInt(val));
                } else {
                  updateField('armor_class', val);
                }
              }}
              placeholder="e.g., 15 or 15 (natural armor)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hit Points</label>
            <input
              type="text"
              value={(() => {
                if (typeof value.hit_points === 'number') return value.hit_points;
                if (typeof value.hit_points === 'object' && value.hit_points && 'average' in value.hit_points) {
                  const hp = value.hit_points as { average: number; formula?: string };
                  return `${hp.average}${hp.formula ? ` (${hp.formula})` : ''}`;
                }
                return '';
              })()}
              onChange={(e) => {
                const val = e.target.value;
                const match = val.match(/^(\d+)\s*\(([^)]+)\)$/);
                if (match) {
                  updateField('hit_points', { average: parseInt(match[1]), formula: match[2] });
                } else if (/^\d+$/.test(val)) {
                  updateField('hit_points', parseInt(val));
                } else {
                  updateField('hit_points', val);
                }
              }}
              placeholder="e.g., 138 (12d12+60)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Proficiency Bonus</label>
            <input
              type="text"
              value={value.proficiency_bonus || ''}
              onChange={(e) => {
                const val = e.target.value;
                updateField('proficiency_bonus', /^\d+$/.test(val) ? parseInt(val) : val);
              }}
              placeholder="e.g., +3 or 3"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </section>

      {/* Ability Scores Section */}
      <section className="border-b pb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Ability Scores *</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {['str', 'dex', 'con', 'int', 'wis', 'cha'].map((ability) => (
            <div key={ability}>
              <label className="block text-sm font-medium text-gray-700 mb-1 uppercase">{ability}</label>
              <input
                type="number"
                min="1"
                max="30"
                value={value.ability_scores?.[ability as keyof typeof value.ability_scores] || 10}
                onChange={(e) => updateNestedField('ability_scores', ability, parseInt(e.target.value) || 10)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>
          ))}
        </div>
      </section>

      {/* Speed Section */}
      <section className="border-b pb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Speed</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Walk</label>
            <input
              type="text"
              value={value.speed?.walk || ''}
              onChange={(e) => updateNestedField('speed', 'walk', e.target.value)}
              placeholder="e.g., 30 ft."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fly</label>
            <input
              type="text"
              value={value.speed?.fly || ''}
              onChange={(e) => updateNestedField('speed', 'fly', e.target.value)}
              placeholder="e.g., 60 ft."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Swim</label>
            <input
              type="text"
              value={value.speed?.swim || ''}
              onChange={(e) => updateNestedField('speed', 'swim', e.target.value)}
              placeholder="e.g., 40 ft."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Climb</label>
            <input
              type="text"
              value={value.speed?.climb || ''}
              onChange={(e) => updateNestedField('speed', 'climb', e.target.value)}
              placeholder="e.g., 30 ft."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={value.speed?.hover || false}
              onChange={(e) => updateNestedField('speed', 'hover', e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-gray-700">Hover</span>
          </label>
        </div>
      </section>

      {/* Defenses Section */}
      <section className="border-b pb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Defenses & Immunities</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Damage Vulnerabilities</label>
            <input
              type="text"
              value={Array.isArray(value.damage_vulnerabilities) ? value.damage_vulnerabilities.join(', ') : ''}
              onChange={(e) => updateField('damage_vulnerabilities', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="e.g., Fire, Thunder"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Damage Resistances</label>
            <input
              type="text"
              value={Array.isArray(value.damage_resistances) ? value.damage_resistances.join(', ') : ''}
              onChange={(e) => updateField('damage_resistances', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="e.g., Cold, Nonmagical weapons"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Damage Immunities</label>
            <input
              type="text"
              value={Array.isArray(value.damage_immunities) ? value.damage_immunities.join(', ') : ''}
              onChange={(e) => updateField('damage_immunities', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="e.g., Poison, Psychic"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Condition Immunities</label>
            <input
              type="text"
              value={Array.isArray(value.condition_immunities) ? value.condition_immunities.join(', ') : ''}
              onChange={(e) => updateField('condition_immunities', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="e.g., Charmed, Frightened, Paralyzed"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </section>

      {/* Senses & Languages Section */}
      <section className="border-b pb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Senses & Languages</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Senses</label>
            <input
              type="text"
              value={Array.isArray(value.senses) ? value.senses.join(', ') : ''}
              onChange={(e) => updateField('senses', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="e.g., Darkvision 60 ft., Passive Perception 14"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Languages</label>
            <input
              type="text"
              value={Array.isArray(value.languages) ? value.languages.join(', ') : ''}
              onChange={(e) => updateField('languages', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="e.g., Common, Giant"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </section>

      {/* Lore & Tactics Section */}
      <section className="border-b pb-4">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">Lore & Tactics</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Combat Tactics</label>
            <textarea
              value={typeof value.tactics === 'string' ? value.tactics : ''}
              onChange={(e) => updateField('tactics', e.target.value)}
              rows={3}
              placeholder="How this creature fights"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ecology</label>
            <textarea
              value={typeof value.ecology === 'string' ? value.ecology : ''}
              onChange={(e) => updateField('ecology', e.target.value)}
              rows={3}
              placeholder="Habitat, diet, and behavior in natural environment"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Lore</label>
            <textarea
              value={typeof value.lore === 'string' ? value.lore : ''}
              onChange={(e) => updateField('lore', e.target.value)}
              rows={3}
              placeholder="Background lore and information"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      </section>

      {/* JSON Editor for Complete Monster Data */}
      <section className="border-t-4 border-blue-500 pt-6 mt-6">
        <h3 className="text-xl font-bold text-blue-900 mb-3 flex items-center gap-2">
          📝 Complete Monster Data (JSON Editor)
        </h3>
        <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-3">
          <p className="text-sm text-blue-900 font-semibold mb-2">
            ⬇️ Scroll down to edit these complex fields in JSON format:
          </p>
          <ul className="text-sm text-blue-800 list-disc list-inside space-y-1">
            <li><strong>saving_throws</strong> - Array of save proficiencies with modifiers</li>
            <li><strong>skill_proficiencies</strong> - Array of skill proficiencies with modifiers</li>
            <li><strong>abilities</strong> - Special abilities and traits</li>
            <li><strong>actions</strong> - Combat actions (attacks, spells, etc.)</li>
            <li><strong>bonus_actions</strong> - Bonus actions available</li>
            <li><strong>reactions</strong> - Reactions the creature can take</li>
            <li><strong>legendary_actions</strong> - Legendary actions (if any)</li>
            <li><strong>mythic_actions</strong> - Mythic tier actions (if any)</li>
            <li><strong>lair_actions</strong> - Actions available in the creature's lair</li>
            <li><strong>regional_effects</strong> - Environmental effects near the creature</li>
          </ul>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-3">
          <p className="text-sm text-yellow-800">
            ⚠️ <strong>Important:</strong> This JSON includes all fields (basic info, stats, etc.) from the sections above.
            Changes made here will override the individual fields. Make sure your JSON is valid before saving.
          </p>
        </div>
        <textarea
          value={JSON.stringify(value, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              onChange(parsed);
            } catch (err) {
              // Invalid JSON, don't update
            }
          }}
          rows={25}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
        />
      </section>
    </div>
  );
};

export default MonsterContentForm;
