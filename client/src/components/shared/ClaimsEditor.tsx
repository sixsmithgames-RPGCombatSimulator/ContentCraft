/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { Plus, Trash2, Sparkles } from 'lucide-react';

export interface Claim {
  text: string;
  source: string;
}

export interface SourceContext {
  fileName: string;
  sectionTitle: string;
}

interface ClaimsEditorProps {
  claims: Claim[];
  onChange: (claims: Claim[]) => void;
  sourceContext: SourceContext;
  mode?: 'view' | 'edit';
  label?: string;
}

export default function ClaimsEditor({
  claims,
  onChange,
  sourceContext,
  mode = 'edit',
  label = 'AI-Extracted Claims',
}: ClaimsEditorProps) {
  const isReadOnly = mode === 'view';

  const handleClaimChange = (index: number, field: keyof Claim, value: string) => {
    const newClaims = [...claims];
    newClaims[index] = { ...newClaims[index], [field]: value };
    onChange(newClaims);
  };

  const handleDeleteClaim = (index: number) => {
    const newClaims = claims.filter((_, i) => i !== index);
    onChange(newClaims);
  };

  const handleAddClaim = () => {
    const sourceAttribution = `${sourceContext.fileName}:section_${sourceContext.sectionTitle.replace(/\s+/g, '_')}`;
    const newClaim: Claim = {
      text: '',
      source: sourceAttribution,
    };
    onChange([...claims, newClaim]);
  };

  // View mode - display only
  if (isReadOnly) {
    if (claims.length === 0) return null;

    return (
      <div className="mb-3 p-4 bg-purple-50 border-2 border-purple-300 rounded-md">
        <h4 className="text-sm font-bold text-purple-900 mb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          {label} ({claims.length} discrete fact{claims.length !== 1 ? 's' : ''})
        </h4>
        <p className="text-xs text-purple-700 mb-3">
          These are the individual, searchable facts that will be stored in the canon library:
        </p>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {claims.map((claim, idx) => (
            <div key={idx} className="bg-white border border-purple-200 rounded p-2">
              <div className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full text-xs font-bold flex items-center justify-center">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900">{claim.text}</p>
                  <p className="text-xs text-gray-500 mt-1 italic">Source: {claim.source}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-purple-700 mt-3 font-medium">
          ✅ All {claims.length} claim{claims.length !== 1 ? 's' : ''} will be independently searchable in your canon library
        </p>
      </div>
    );
  }

  // Edit mode
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {claims.length > 0 && <span className="text-xs text-purple-600 ml-1">({claims.length} discrete fact{claims.length !== 1 ? 's' : ''})</span>}
      </label>
      <p className="text-xs text-gray-500 mb-2">
        Edit individual claims or delete unwanted ones. Each claim becomes independently searchable in the library.
      </p>

      <div className="space-y-2 max-h-96 overflow-y-auto border border-purple-200 rounded-md p-2 bg-purple-50">
        {claims.map((claim, claimIdx) => (
          <div key={claimIdx} className="bg-white border border-purple-300 rounded-md p-3">
            <div className="flex items-start gap-2 mb-2">
              <span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full text-xs font-bold flex items-center justify-center mt-1">
                {claimIdx + 1}
              </span>
              <button
                onClick={() => handleDeleteClaim(claimIdx)}
                className="ml-auto p-1 text-red-600 hover:bg-red-50 rounded"
                title="Delete this claim"
                type="button"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Claim Text</label>
                <textarea
                  value={claim.text}
                  onChange={(e) => handleClaimChange(claimIdx, 'text', e.target.value)}
                  rows={2}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs"
                  placeholder="Enter the discrete fact/claim..."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Source Attribution</label>
                <input
                  type="text"
                  value={claim.source}
                  onChange={(e) => handleClaimChange(claimIdx, 'source', e.target.value)}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs font-mono"
                  placeholder="e.g., PHB 2024:section_Vampires"
                />
              </div>
            </div>
          </div>
        ))}

        {/* Add New Claim Button */}
        <button
          onClick={handleAddClaim}
          className="w-full px-3 py-2 border-2 border-dashed border-purple-300 text-purple-600 rounded-md hover:bg-purple-50 text-sm font-medium flex items-center justify-center gap-2"
          type="button"
        >
          <Plus className="w-4 h-4" />
          Add New Claim
        </button>
      </div>
    </div>
  );
}
