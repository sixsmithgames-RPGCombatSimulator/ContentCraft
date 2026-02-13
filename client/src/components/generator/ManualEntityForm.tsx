/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';

interface Claim {
  text: string;
  source: string;
}

interface NewEntity {
  type: string;
  canonical_name: string;
  aliases: string[];
  region?: string;
  era?: string;
  claims: Claim[];
}

interface ManualEntityFormProps {
  onSave: (entity: NewEntity) => void;
  onCancel: () => void;
}

export default function ManualEntityForm({ onSave, onCancel }: ManualEntityFormProps) {
  const [type, setType] = useState<string>('npc');
  const [canonicalName, setCanonicalName] = useState('');
  const [aliases, setAliases] = useState<string[]>(['']);
  const [region, setRegion] = useState('');
  const [era, setEra] = useState('');
  const [claims, setClaims] = useState<Claim[]>([{ text: '', source: '' }]);

  // Validation error state - replaces alert() calls
  const [validationError, setValidationError] = useState<string | null>(null);

  const addAlias = () => {
    setAliases([...aliases, '']);
  };

  const updateAlias = (index: number, value: string) => {
    const newAliases = [...aliases];
    newAliases[index] = value;
    setAliases(newAliases);
  };

  const removeAlias = (index: number) => {
    setAliases(aliases.filter((_, i) => i !== index));
  };

  const addClaim = () => {
    setClaims([...claims, { text: '', source: '' }]);
  };

  const updateClaim = (index: number, field: 'text' | 'source', value: string) => {
    const newClaims = [...claims];
    newClaims[index][field] = value;
    setClaims(newClaims);
  };

  const removeClaim = (index: number) => {
    setClaims(claims.filter((_, i) => i !== index));
  };

  /**
   * Handle form submission with validation
   * Shows inline error messages instead of using alert()
   */
  const handleSave = () => {
    // Validate canonical name
    if (!canonicalName.trim()) {
      setValidationError('Canonical name is required');
      return;
    }

    // Validate claims
    const validClaims = claims.filter(c => c.text.trim() && c.source.trim());
    if (validClaims.length === 0) {
      setValidationError('At least one claim with text and source is required');
      return;
    }

    // Clear any previous errors
    setValidationError(null);

    const entity = {
      type,
      canonical_name: canonicalName.trim(),
      aliases: aliases.filter(a => a.trim()).map(a => a.trim()),
      region: region.trim() || undefined,
      era: era.trim() || undefined,
      claims: validClaims,
    };

    onSave(entity);
  };

  return (
    <div className="space-y-6">
      {/* Validation Error Banner - replaces alert() */}
      {validationError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md flex items-start gap-3">
          <svg className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"/>
          </svg>
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800">{validationError}</p>
          </div>
          <button
            onClick={() => setValidationError(null)}
            className="text-red-600 hover:text-red-800"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd"/>
            </svg>
          </button>
        </div>
      )}

      {/* Entity Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Entity Type *
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="npc">NPC (Non-Player Character)</option>
          <option value="monster">Monster / Creature</option>
          <option value="item">Item / Artifact</option>
          <option value="spell">Spell</option>
          <option value="location">Location / Place</option>
          <option value="faction">Faction / Organization</option>
          <option value="rule">Rule / Mechanic</option>
          <option value="timeline">Timeline / Event</option>
        </select>
      </div>

      {/* Canonical Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Name *
        </label>
        <input
          type="text"
          value={canonicalName}
          onChange={(e) => setCanonicalName(e.target.value)}
          placeholder="e.g., Elara Moonshadow"
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Aliases */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">
            Aliases / Alternative Names
          </label>
          <button
            onClick={addAlias}
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Alias
          </button>
        </div>
        {aliases.map((alias, index) => (
          <div key={index} className="flex gap-2 mb-2">
            <input
              type="text"
              value={alias}
              onChange={(e) => updateAlias(index, e.target.value)}
              placeholder="e.g., The Silver Sage"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {aliases.length > 1 && (
              <button
                onClick={() => removeAlias(index)}
                className="p-2 text-red-600 hover:bg-red-50 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Region and Era */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Region (optional)
          </label>
          <input
            type="text"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="e.g., waterdeep, sword-coast"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Era (optional)
          </label>
          <input
            type="text"
            value={era}
            onChange={(e) => setEra(e.target.value)}
            placeholder="e.g., post-sundering"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Claims/Facts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">
            Facts / Claims *
          </label>
          <button
            onClick={addClaim}
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Add Fact
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Each fact should be a discrete piece of information with a source reference
        </p>
        {claims.map((claim, index) => (
          <div key={index} className="border border-gray-200 rounded-md p-3 mb-3">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <textarea
                  value={claim.text}
                  onChange={(e) => updateClaim(index, 'text', e.target.value)}
                  placeholder="Fact text (e.g., 'Elara Moonshadow is a high elf wizard residing in Waterdeep')"
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none text-sm"
                />
                <input
                  type="text"
                  value={claim.source}
                  onChange={(e) => updateClaim(index, 'source', e.target.value)}
                  placeholder="Source (e.g., 'campaign_guide:page_5' or 'session_notes:2024-01-15')"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>
              {claims.length > 1 && (
                <button
                  onClick={() => removeClaim(index)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-gray-200">
        <button
          onClick={onCancel}
          className="flex-1 px-6 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex-1 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          Save Entity
        </button>
      </div>
    </div>
  );
}
