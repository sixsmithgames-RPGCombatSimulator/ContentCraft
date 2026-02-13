/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useEffect } from 'react';
import { X, Save, Trash2, Plus, Minus } from 'lucide-react';
import ClaimsEditor from '../shared/ClaimsEditor';

export type CanonBase = {
  _id?: string;
  canonical_name?: string;
  type?: string;
  aliases?: string[];
  region?: string;
  era?: string;
  tags?: string[];
  is_official?: boolean;
  source?: string;
  // Claims/Facts - core searchable content
  claims?: Array<{ text: string; source: string }>;
  // Homebrew metadata (for imported content)
  homebrew_metadata?: {
    homebrew_type?: string;
    tags?: string[];
    short_summary?: string;
    assumptions?: string[];
    notes?: string[];
  };
  // Item/Location fields
  rarity?: string;
  properties?: unknown;
  environment?: unknown;
  features?: string[];
  // NPC details
  npc_details?: {
    physical_appearance?: string;
    personality_traits?: string[];
    identifying_features?: string[];
    motivations?: string | string[];
    ideals?: string;
    flaws?: string;
    class_levels?: string;
    hit_points?: number;
    skill_proficiencies?: string[];
    equipment_carried?: string[];
    spells_known?: string[];
    allies_friends?: string[];
    foes?: string[];
  };
  // Spell details
  spell_details?: {
    level?: number;
    school?: string;
    ritual?: boolean;
    concentration?: boolean;
    casting_time?: string;
    range?: string;
    duration?: string;
    description?: string;
    higher_levels?: string;
    conditions_inflicted?: string[];
  };
};

interface CanonEntityEditorProps {
  isOpen: boolean;
  entity: CanonBase;
  onClose: () => void;
  onSave: (updatedEntity: CanonBase) => Promise<void> | void;
  onDelete?: () => Promise<void> | void;
}

export default function CanonEntityEditor({
  isOpen,
  entity,
  onClose,
  onSave,
  onDelete,
}: CanonEntityEditorProps) {
  const [editedEntity, setEditedEntity] = useState<CanonBase | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (entity) {
      // Deep clone to avoid mutating original
      setEditedEntity(JSON.parse(JSON.stringify(entity)) as CanonBase);
    }
  }, [entity]);

  if (!isOpen || !editedEntity) return null;

  const entityType = editedEntity.type;

  const handleSave = async () => {
    setSaving(true);
    setError(null);

    try {
      await onSave(editedEntity);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    if (confirm(`Are you sure you want to delete "${editedEntity.canonical_name}"? This cannot be undone.`)) {
      try {
        await onDelete();
        onClose();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to delete');
      }
    }
  };

  // (array helpers removed)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Edit Canon Entity</h2>
            <p className="text-sm text-gray-600 mt-1">
              {editedEntity.canonical_name} <span className="text-gray-400">•</span> {entityType}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Basic Fields */}
          <Section title="Basic Information">
            <Field label="Canonical Name" required>
              <input
                type="text"
                value={editedEntity.canonical_name || ''}
                onChange={(e) => setEditedEntity({ ...editedEntity, canonical_name: e.target.value })}
                className="input w-full"
              />
            </Field>

            <Field label="Type" required>
              <select
                value={editedEntity.type || 'npc'}
                onChange={(e) => setEditedEntity({ ...editedEntity, type: e.target.value })}
                className="input w-full"
              >
                <option value="npc">NPC</option>
                <option value="monster">Monster</option>
                <option value="item">Item</option>
                <option value="spell">Spell</option>
                <option value="location">Location</option>
                <option value="faction">Faction</option>
                <option value="rule">Rule</option>
                <option value="timeline">Timeline</option>
              </select>
            </Field>

            <ArrayField
              label="Aliases"
              value={editedEntity.aliases || []}
              onChange={(aliases) => setEditedEntity({ ...editedEntity, aliases })}
              placeholder="Enter an alias..."
            />

            <div className="grid grid-cols-2 gap-4">
              <Field label="Region">
                <input
                  type="text"
                  value={editedEntity.region || ''}
                  onChange={(e) => setEditedEntity({ ...editedEntity, region: e.target.value })}
                  placeholder="e.g., Sword Coast"
                  className="input w-full"
                />
              </Field>

              <Field label="Era">
                <input
                  type="text"
                  value={editedEntity.era || ''}
                  onChange={(e) => setEditedEntity({ ...editedEntity, era: e.target.value })}
                  placeholder="e.g., 1490s DR"
                  className="input w-full"
                />
              </Field>
            </div>

            <ArrayField
              label="Tags"
              value={editedEntity.tags || []}
              onChange={(tags) => setEditedEntity({ ...editedEntity, tags })}
              placeholder="Enter a tag..."
            />
          </Section>

          {/* Claims & Facts Section */}
          <Section title="Claims & Facts">
            <p className="text-xs text-gray-500 mb-3">
              Individual facts/claims that make this entity searchable. Each claim becomes independently searchable in queries.
            </p>
            <ClaimsEditor
              claims={editedEntity.claims || []}
              onChange={(claims) => setEditedEntity({ ...editedEntity, claims })}
              sourceContext={{
                fileName: editedEntity.source || 'Canon Library',
                sectionTitle: editedEntity.canonical_name || 'Unknown'
              }}
              mode="edit"
              label="Claims & Facts"
            />
          </Section>

          {/* Type-Specific Fields */}
          {entityType === 'npc' && <NPCFields entity={editedEntity} setEntity={setEditedEntity} />}
          {entityType === 'spell' && <SpellFields entity={editedEntity} setEntity={setEditedEntity} />}
          {entityType === 'item' && <ItemFields entity={editedEntity} setEntity={setEditedEntity} />}
          {entityType === 'location' && <LocationFields entity={editedEntity} setEntity={setEditedEntity} />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div>
            {onDelete && !editedEntity.is_official && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 font-medium flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Entity
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !editedEntity.canonical_name}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// NPC-specific fields
function NPCFields({ entity, setEntity }: { entity: CanonBase; setEntity: (e: CanonBase) => void }) {
  const npc = (entity.npc_details || {}) as NonNullable<CanonBase['npc_details']>;

  const updateNPC = <K extends keyof NonNullable<CanonBase['npc_details']>>(field: K, value: NonNullable<CanonBase['npc_details']>[K]) => {
    setEntity({
      ...entity,
      npc_details: {
        ...npc,
        [field]: value,
      },
    });
  };

  return (
    <Section title="NPC Details">
      <Field label="Physical Appearance">
        <textarea
          value={npc.physical_appearance || ''}
          onChange={(e) => updateNPC('physical_appearance', e.target.value)}
          className="input w-full"
          rows={3}
          placeholder="Describe their appearance..."
        />
      </Field>

      <ArrayField
        label="Personality Traits"
        value={npc.personality_traits || []}
        onChange={(val) => updateNPC('personality_traits', val)}
        placeholder="Enter a personality trait..."
      />

      <ArrayField
        label="Identifying Features"
        value={npc.identifying_features || []}
        onChange={(val) => updateNPC('identifying_features', val)}
        placeholder="Enter an identifying feature..."
      />

      <Field label="Motivations">
        <textarea
          value={npc.motivations || ''}
          onChange={(e) => updateNPC('motivations', e.target.value)}
          className="input w-full"
          rows={2}
          placeholder="What drives them..."
        />
      </Field>

      <Field label="Ideals">
        <input
          type="text"
          value={npc.ideals || ''}
          onChange={(e) => updateNPC('ideals', e.target.value)}
          className="input w-full"
          placeholder="Their ideals..."
        />
      </Field>

      <Field label="Flaws">
        <input
          type="text"
          value={npc.flaws || ''}
          onChange={(e) => updateNPC('flaws', e.target.value)}
          className="input w-full"
          placeholder="Their flaws..."
        />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Class & Levels">
          <input
            type="text"
            value={npc.class_levels || ''}
            onChange={(e) => updateNPC('class_levels', e.target.value)}
            placeholder="e.g., Fighter 5/Wizard 3"
            className="input w-full"
          />
        </Field>

        <Field label="Hit Points">
          <input
            type="number"
            value={npc.hit_points || ''}
            onChange={(e) => updateNPC('hit_points', parseInt(e.target.value))}
            placeholder="HP"
            className="input w-full"
          />
        </Field>
      </div>

      <ArrayField
        label="Skill Proficiencies"
        value={npc.skill_proficiencies || []}
        onChange={(val) => updateNPC('skill_proficiencies', val)}
        placeholder="e.g., Stealth, Persuasion"
      />

      <ArrayField
        label="Equipment Carried"
        value={npc.equipment_carried || []}
        onChange={(val) => updateNPC('equipment_carried', val)}
        placeholder="Enter an item..."
      />

      <ArrayField
        label="Spells Known"
        value={npc.spells_known || []}
        onChange={(val) => updateNPC('spells_known', val)}
        placeholder="Enter a spell..."
      />

      <ArrayField
        label="Allies & Friends"
        value={npc.allies_friends || []}
        onChange={(val) => updateNPC('allies_friends', val)}
        placeholder="Enter an ally..."
      />

      <ArrayField
        label="Foes & Enemies"
        value={npc.foes || []}
        onChange={(val) => updateNPC('foes', val)}
        placeholder="Enter a foe..."
      />
    </Section>
  );
}

// Spell-specific fields
function SpellFields({ entity, setEntity }: { entity: CanonBase; setEntity: (e: CanonBase) => void }) {
  const spell = (entity.spell_details || {}) as NonNullable<CanonBase['spell_details']>;

  const updateSpell = <K extends keyof NonNullable<CanonBase['spell_details']>>(field: K, value: NonNullable<CanonBase['spell_details']>[K]) => {
    setEntity({
      ...entity,
      spell_details: {
        ...spell,
        [field]: value,
      },
    });
  };

  return (
    <Section title="Spell Details">
      <div className="grid grid-cols-3 gap-4">
        <Field label="Level" required>
          <input
            type="number"
            min="0"
            max="9"
            value={spell.level || 0}
            onChange={(e) => updateSpell('level', parseInt(e.target.value))}
            className="input w-full"
          />
        </Field>

        <Field label="School" required>
          <select
            value={spell.school || ''}
            onChange={(e) => updateSpell('school', e.target.value)}
            className="input w-full"
          >
            <option value="">Select...</option>
            <option value="Abjuration">Abjuration</option>
            <option value="Conjuration">Conjuration</option>
            <option value="Divination">Divination</option>
            <option value="Enchantment">Enchantment</option>
            <option value="Evocation">Evocation</option>
            <option value="Illusion">Illusion</option>
            <option value="Necromancy">Necromancy</option>
            <option value="Transmutation">Transmutation</option>
          </select>
        </Field>

        <div className="space-y-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={spell.ritual || false}
              onChange={(e) => updateSpell('ritual', e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-700">Ritual</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={spell.concentration || false}
              onChange={(e) => updateSpell('concentration', e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm text-gray-700">Concentration</span>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Field label="Casting Time">
          <input
            type="text"
            value={spell.casting_time || ''}
            onChange={(e) => updateSpell('casting_time', e.target.value)}
            placeholder="e.g., 1 action"
            className="input w-full"
          />
        </Field>

        <Field label="Range">
          <input
            type="text"
            value={spell.range || ''}
            onChange={(e) => updateSpell('range', e.target.value)}
            placeholder="e.g., 120 feet"
            className="input w-full"
          />
        </Field>

        <Field label="Duration">
          <input
            type="text"
            value={spell.duration || ''}
            onChange={(e) => updateSpell('duration', e.target.value)}
            placeholder="e.g., 1 minute"
            className="input w-full"
          />
        </Field>
      </div>

      <Field label="Description" required>
        <textarea
          value={spell.description || ''}
          onChange={(e) => updateSpell('description', e.target.value)}
          className="input w-full"
          rows={4}
          placeholder="Spell description..."
        />
      </Field>

      <Field label="At Higher Levels">
        <textarea
          value={spell.higher_levels || ''}
          onChange={(e) => updateSpell('higher_levels', e.target.value)}
          className="input w-full"
          rows={2}
          placeholder="When cast at higher levels..."
        />
      </Field>

      <ArrayField
        label="Conditions Inflicted"
        value={spell.conditions_inflicted || []}
        onChange={(val) => updateSpell('conditions_inflicted', val)}
        placeholder="e.g., frightened, stunned"
      />
    </Section>
  );
}

// Item-specific fields
function ItemFields({ entity, setEntity }: { entity: CanonBase; setEntity: (e: CanonBase) => void }) {
  return (
    <Section title="Item Details">
      <Field label="Rarity">
        <select
          value={entity.rarity || 'common'}
          onChange={(e) => setEntity({ ...entity, rarity: e.target.value })}
          className="input w-full"
        >
          <option value="common">Common</option>
          <option value="uncommon">Uncommon</option>
          <option value="rare">Rare</option>
          <option value="very rare">Very Rare</option>
          <option value="legendary">Legendary</option>
          <option value="artifact">Artifact</option>
        </select>
      </Field>

      <Field label="Properties">
        <textarea
          value={typeof entity.properties === 'string' ? entity.properties : JSON.stringify(entity.properties ?? '', null, 2)}
          onChange={(e) => setEntity({ ...entity, properties: e.target.value })}
          className="input w-full font-mono text-sm"
          rows={6}
          placeholder="Item properties..."
        />
      </Field>
    </Section>
  );
}

// Location-specific fields
function LocationFields({ entity, setEntity }: { entity: CanonBase; setEntity: (e: CanonBase) => void }) {
  return (
    <Section title="Location Details">
      <Field label="Environment">
        <textarea
          value={typeof entity.environment === 'string' ? entity.environment : JSON.stringify(entity.environment ?? '', null, 2)}
          onChange={(e) => setEntity({ ...entity, environment: e.target.value })}
          className="input w-full"
          rows={4}
          placeholder="Describe the environment..."
        />
      </Field>

      <ArrayField
        label="Features"
        value={entity.features || []}
        onChange={(features) => setEntity({ ...entity, features })}
        placeholder="Enter a feature..."
      />
    </Section>
  );
}

// Reusable components
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-gray-800 mb-4 pb-2 border-b border-gray-200">
        {title}
      </h3>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function ArrayField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}) {
  // Safety check - ensure value is always an array
  const arrayValue = Array.isArray(value) ? value : [];

  return (
    <Field label={label}>
      <div className="space-y-2">
        {arrayValue.map((item, index) => (
          <div key={index} className="flex gap-2">
            <input
              type="text"
              value={item}
              onChange={(e) => {
                const newValue = [...arrayValue];
                newValue[index] = e.target.value;
                onChange(newValue);
              }}
              placeholder={placeholder}
              className="input flex-1"
            />
            <button
              onClick={() => onChange(arrayValue.filter((_, i) => i !== index))}
              className="p-2 text-red-600 hover:bg-red-50 rounded"
            >
              <Minus className="w-4 h-4" />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...arrayValue, ''])}
          className="w-full px-4 py-2 border-2 border-dashed border-gray-300 text-gray-600 rounded-md hover:border-blue-400 hover:text-blue-600 flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add {label.slice(0, -1)}
        </button>
      </div>
    </Field>
  );
}
