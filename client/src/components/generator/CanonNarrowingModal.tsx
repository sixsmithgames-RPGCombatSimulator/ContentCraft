/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useEffect } from 'react';
import { AlertTriangle, X, Plus, Trash2, Filter, Search, Check } from 'lucide-react';

interface CanonFact {
  text: string;
  chunk_id?: string;
  entity_name: string;
  entity_id?: string;
  entity_type?: string;
  region?: string;
  tags?: string[];
}

interface CanonNarrowingModalProps {
  isOpen: boolean;
  currentKeywords: string[];
  factCount: number;
  maxFacts: number;
  canonFacts: CanonFact[];
  onNarrow: (newKeywords: string[]) => void;
  onFilter: (filteredFacts: CanonFact[]) => void;
  onProceedAnyway: () => void;
  onClose: () => void;
  // New props for better UX
  context?: 'initial' | 'retrieval_hints';  // Indicates why we're narrowing
  requestedBy?: string;  // Stage that requested additional facts (e.g., "Planner")
  requestedEntities?: string[];  // Entities the AI requested facts about
  existingFactCount?: number;  // Number of facts already in factpack (for retrieval hints context)
}

export default function CanonNarrowingModal({
  isOpen,
  currentKeywords,
  factCount,
  maxFacts,
  canonFacts,
  onNarrow,
  onFilter,
  onProceedAnyway,
  onClose,
  context = 'initial',
  requestedBy,
  requestedEntities,
  existingFactCount,
}: CanonNarrowingModalProps) {
  const [mode, setMode] = useState<'narrow' | 'filter'>('narrow');
  const [keywords, setKeywords] = useState<string[]>(currentKeywords);
  const [newKeyword, setNewKeyword] = useState('');
  const [suggestions, setSuggestions] = useState<{
    locations: string[];
    entities: string[];
    regions: string[];
  }>({ locations: [], entities: [], regions: [] });

  // For filtering mode
  const [selectedFacts, setSelectedFacts] = useState<Set<string>>(new Set());
  const [entityGroups, setEntityGroups] = useState<Map<string, CanonFact[]>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');

  // Extract narrowing suggestions from canon facts
  useEffect(() => {
    if (!isOpen) return;

    const locationSet = new Set<string>();
    const entitySet = new Set<string>();
    const regionSet = new Set<string>();

    canonFacts.forEach((fact) => {
      // Extract locations (entities with type='location')
      if (fact.entity_type === 'location' && fact.entity_name) {
        locationSet.add(fact.entity_name);
      }

      // Extract important entities (NPCs, factions)
      if ((fact.entity_type === 'npc' || fact.entity_type === 'faction') && fact.entity_name) {
        entitySet.add(fact.entity_name);
      }

      // Extract regions
      if (fact.region) {
        regionSet.add(fact.region);
      }
    });

    setSuggestions({
      locations: Array.from(locationSet).slice(0, 10), // Top 10
      entities: Array.from(entitySet).slice(0, 10),
      regions: Array.from(regionSet).slice(0, 5),
    });

    // Group facts by entity for filtering mode
    const groups = new Map<string, CanonFact[]>();
    canonFacts.forEach((fact) => {
      const entityKey = fact.entity_id || fact.entity_name;
      if (!groups.has(entityKey)) {
        groups.set(entityKey, []);
      }
      groups.get(entityKey)!.push(fact);
    });
    setEntityGroups(groups);

    // Initialize all facts as selected
    const allFactIds = new Set<string>();
    canonFacts.forEach((fact, index) => {
      const factId = fact.chunk_id || `${fact.entity_name}-${index}`;
      allFactIds.add(factId);
    });
    setSelectedFacts(allFactIds);
  }, [isOpen, canonFacts]);

  const handleAddKeyword = () => {
    if (newKeyword.trim() && !keywords.includes(newKeyword.trim())) {
      setKeywords([...keywords, newKeyword.trim()]);
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setKeywords(keywords.filter((k) => k !== keyword));
  };

  const handleAddSuggestion = (suggestion: string) => {
    if (!keywords.includes(suggestion)) {
      setKeywords([...keywords, suggestion]);
    }
  };

  const handleSubmit = () => {
    if (keywords.length > 0) {
      onNarrow(keywords);
    }
  };

  const handleToggleFact = (factId: string) => {
    const newSelected = new Set(selectedFacts);
    if (newSelected.has(factId)) {
      newSelected.delete(factId);
    } else {
      newSelected.add(factId);
    }
    setSelectedFacts(newSelected);
  };

  const handleToggleEntity = (entityKey: string) => {
    const entityFacts = entityGroups.get(entityKey) || [];
    const newSelected = new Set(selectedFacts);

    // Check if all facts for this entity are selected
    const factIds = entityFacts.map((fact, index) => fact.chunk_id || `${fact.entity_name}-${index}`);
    const allSelected = factIds.every(id => newSelected.has(id));

    // Toggle all facts for this entity
    factIds.forEach(factId => {
      if (allSelected) {
        newSelected.delete(factId);
      } else {
        newSelected.add(factId);
      }
    });
    setSelectedFacts(newSelected);
  };

  const handleFilterSubmit = () => {
    const filteredFacts = canonFacts.filter((fact, index) => {
      const factId = fact.chunk_id || `${fact.entity_name}-${index}`;
      return selectedFacts.has(factId);
    });
    onFilter(filteredFacts);
  };

  // Calculate character count
  const calculateCharCount = (facts: CanonFact[]) => {
    return facts.reduce((sum, fact) => sum + fact.text.length, 0);
  };

  // Filter entities/facts based on search query
  const filterBySearch = (facts: CanonFact[], query: string): boolean => {
    if (!query.trim()) return true;

    const lowerQuery = query.toLowerCase();

    return facts.some(fact => {
      // Search in fact text
      if (fact.text.toLowerCase().includes(lowerQuery)) return true;

      // Search in entity name
      if (fact.entity_name.toLowerCase().includes(lowerQuery)) return true;

      // Search in tags
      if (fact.tags && fact.tags.some(tag => tag.toLowerCase().includes(lowerQuery))) return true;

      // Search in entity type
      if (fact.entity_type && fact.entity_type.toLowerCase().includes(lowerQuery)) return true;

      // Search in region
      if (fact.region && fact.region.toLowerCase().includes(lowerQuery)) return true;

      return false;
    });
  };

  // Filter entity groups based on search
  const filteredEntityGroups = Array.from(entityGroups.entries()).filter(([, facts]) =>
    filterBySearch(facts, searchQuery)
  );

  const selectedFactsList = canonFacts.filter((fact, index) => {
    const factId = fact.chunk_id || `${fact.entity_name}-${index}`;
    return selectedFacts.has(factId);
  });

  const selectedCharCount = calculateCharCount(selectedFactsList);
  const totalCharCount = calculateCharCount(canonFacts);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-orange-500" />
            <div>
              {context === 'retrieval_hints' ? (
                <>
                  <h2 className="text-2xl font-bold text-gray-900">Additional Facts Requested</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {requestedBy && `The ${requestedBy} stage identified gaps and requested additional facts`}
                  </p>
                  {requestedEntities && requestedEntities.length > 0 && (
                    <p className="text-sm text-blue-700 mt-1">
                      <span className="font-medium">Requested info about:</span> {requestedEntities.slice(0, 5).join(', ')}
                      {requestedEntities.length > 5 && ` +${requestedEntities.length - 5} more`}
                    </p>
                  )}
                  <p className="text-sm text-gray-600 mt-1">
                    Found {factCount} additional facts • {existingFactCount ? `${existingFactCount} existing + ${factCount} new = ${existingFactCount + factCount} total` : `${factCount} facts`}
                  </p>
                  <p className="text-sm text-orange-600 mt-1">
                    ⚠️ New facts exceed limit ({maxFacts} facts) - please narrow or filter
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-bold text-gray-900">Too Many Canon Facts</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Found {factCount} facts ({totalCharCount.toLocaleString()} chars, limit: {maxFacts} facts)
                  </p>
                </>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-gray-200 px-6">
          <button
            onClick={() => setMode('narrow')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 -mb-px font-medium transition-colors ${
              mode === 'narrow'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            <Search className="w-4 h-4" />
            Add Keywords
          </button>
          <button
            onClick={() => setMode('filter')}
            className={`flex items-center gap-2 px-4 py-3 border-b-2 -mb-px font-medium transition-colors ${
              mode === 'filter'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-600 hover:text-gray-800'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filter Facts
            {mode === 'filter' && ` (${selectedFacts.size}/${factCount})`}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {mode === 'narrow' ? (
            /* Narrow Mode - Add Keywords */
            <div className="space-y-6">
              {/* Help Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">💡 How Canon Search Works</h3>
                <p className="text-sm text-blue-800 mb-2">
                  The search prioritizes matches in this order:
                </p>
                <ol className="text-sm text-blue-700 space-y-1 ml-4">
                  <li><strong>1. Tags</strong> - Highest priority (e.g., "vampire", "waterdeep", "homebrew")</li>
                  <li><strong>2. Names & Titles</strong> - Character/location names</li>
                  <li><strong>3. Aliases & IDs</strong> - Alternative names</li>
                  <li><strong>4. Type & Region</strong> - Entity type or location</li>
                  <li><strong>5. Descriptions</strong> - Text within facts (lowest priority)</li>
                </ol>
                <p className="text-sm text-blue-700 mt-2">
                  <strong>Tip:</strong> Use specific entity names or tags to get the most relevant canon facts first.
                </p>
              </div>

              {/* Current Keywords */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Current Keywords</h3>
                <div className="flex flex-wrap gap-2">
                  {keywords.map((keyword) => (
                    <div
                      key={keyword}
                      className="flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-800 rounded-full"
                    >
                      <span className="text-sm font-medium">{keyword}</span>
                      <button
                        onClick={() => handleRemoveKeyword(keyword)}
                        className="p-0.5 hover:bg-blue-200 rounded-full"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Add New Keyword */}
              <div>
                <h3 className="font-medium text-gray-900 mb-3">Add More Specific Keywords</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddKeyword()}
                    placeholder="Type a more specific keyword..."
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={handleAddKeyword}
                    disabled={!newKeyword.trim()}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Add
                  </button>
                </div>
              </div>

              {/* Suggestions */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">Suggestions from Canon</h3>
                <p className="text-sm text-gray-600">
                  Click to add specific locations, NPCs, or regions to narrow your search:
                </p>

                {/* Specific Locations */}
                {suggestions.locations.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Specific Locations</h4>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.locations.map((loc) => (
                        <button
                          key={loc}
                          onClick={() => handleAddSuggestion(loc)}
                          disabled={keywords.includes(loc)}
                          className="px-3 py-1 text-sm bg-green-50 text-green-700 border border-green-200 rounded-md hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {loc}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Key NPCs/Factions */}
                {suggestions.entities.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Key NPCs & Factions</h4>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.entities.map((entity) => (
                        <button
                          key={entity}
                          onClick={() => handleAddSuggestion(entity)}
                          disabled={keywords.includes(entity)}
                          className="px-3 py-1 text-sm bg-purple-50 text-purple-700 border border-purple-200 rounded-md hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {entity}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Regions */}
                {suggestions.regions.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Regions</h4>
                    <div className="flex flex-wrap gap-2">
                      {suggestions.regions.map((region) => (
                        <button
                          key={region}
                          onClick={() => handleAddSuggestion(region)}
                          disabled={keywords.includes(region)}
                          className="px-3 py-1 text-sm bg-orange-50 text-orange-700 border border-orange-200 rounded-md hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {region}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* Filter Mode - Select Facts */
            <div className="space-y-4">
              {/* Stats */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-blue-900">Selected: {selectedFacts.size}/{factCount} facts</div>
                    <div className="text-xs text-blue-700 mt-1">{selectedCharCount.toLocaleString()} / {totalCharCount.toLocaleString()} characters</div>
                  </div>
                  {selectedCharCount > 8000 && (
                    <div className="text-sm font-medium text-orange-700">
                      ⚠️ Still too large for single generation
                    </div>
                  )}
                </div>
              </div>

              {/* Search Input */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search facts by text, entity name, tags, type, or region..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Bulk Actions */}
              <div className="flex items-center justify-between">
                {searchQuery ? (
                  <div className="text-sm text-gray-600">
                    Showing {filteredEntityGroups.length} of {entityGroups.size} entities matching "{searchQuery}"
                  </div>
                ) : (
                  <div className="text-sm text-gray-600">
                    Showing all {entityGroups.size} entities
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      // Select all visible facts from filtered results
                      const newSelected = new Set(selectedFacts);
                      filteredEntityGroups.forEach(([, facts]) => {
                        facts.forEach((fact, index) => {
                          const factId = fact.chunk_id || `${fact.entity_name}-${index}`;
                          newSelected.add(factId);
                        });
                      });
                      setSelectedFacts(newSelected);
                    }}
                    className="px-3 py-1 text-xs bg-green-50 text-green-700 border border-green-200 rounded-md hover:bg-green-100 font-medium"
                  >
                    Select All Visible
                  </button>
                  <button
                    onClick={() => {
                      // Deselect all visible facts from filtered results
                      const newSelected = new Set(selectedFacts);
                      filteredEntityGroups.forEach(([, facts]) => {
                        facts.forEach((fact, index) => {
                          const factId = fact.chunk_id || `${fact.entity_name}-${index}`;
                          newSelected.delete(factId);
                        });
                      });
                      setSelectedFacts(newSelected);
                    }}
                    className="px-3 py-1 text-xs bg-red-50 text-red-700 border border-red-200 rounded-md hover:bg-red-100 font-medium"
                  >
                    Deselect All Visible
                  </button>
                </div>
              </div>

              <p className="text-sm text-gray-600">
                Uncheck facts you don't need. Click entity names to toggle all facts for that entity.
              </p>

              {/* Entity Groups */}
              <div className="space-y-3">
                {filteredEntityGroups.map(([entityKey, facts]) => {
                  const factIds = facts.map((fact, index) => fact.chunk_id || `${fact.entity_name}-${index}`);
                  const allSelected = factIds.every(id => selectedFacts.has(id));
                  const someSelected = factIds.some(id => selectedFacts.has(id));

                  return (
                    <div key={entityKey} className="border border-gray-200 rounded-lg p-4">
                      {/* Entity Header */}
                      <div
                        onClick={() => handleToggleEntity(entityKey)}
                        className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 -m-4 p-4 rounded-t-lg"
                      >
                        <div className={`w-5 h-5 border-2 rounded flex items-center justify-center ${
                          allSelected
                            ? 'bg-blue-600 border-blue-600'
                            : someSelected
                            ? 'bg-blue-300 border-blue-300'
                            : 'border-gray-300'
                        }`}>
                          {allSelected && <Check className="w-4 h-4 text-white" />}
                          {!allSelected && someSelected && <div className="w-2 h-2 bg-white rounded-sm" />}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-medium text-gray-900">{facts[0].entity_name}</h4>
                            {facts[0].entity_type && (
                              <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                                {facts[0].entity_type}
                              </span>
                            )}
                            {facts[0].region && (
                              <span className="text-xs text-gray-600">📍 {facts[0].region}</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-600 mt-1">
                            {facts.length} fact{facts.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>

                      {/* Facts List */}
                      <div className="mt-3 space-y-2 pl-8">
                        {facts.map((fact, index) => {
                          const factId = fact.chunk_id || `${fact.entity_name}-${index}`;
                          const isSelected = selectedFacts.has(factId);

                          return (
                            <div
                              key={factId}
                              onClick={() => handleToggleFact(factId)}
                              className="flex items-start gap-3 p-2 rounded cursor-pointer hover:bg-gray-50"
                            >
                              <div className={`w-4 h-4 border-2 rounded flex-shrink-0 mt-0.5 ${
                                isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                              }`}>
                                {isSelected && <Check className="w-3 h-3 text-white" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-700 line-clamp-2">{fact.text}</p>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <p className="text-xs text-gray-500">{fact.text.length} chars</p>
                                  {fact.tags && fact.tags.length > 0 && (
                                    <>
                                      <span className="text-xs text-gray-400">•</span>
                                      <div className="flex flex-wrap gap-1">
                                        {fact.tags.map((tag, tagIndex) => (
                                          <span
                                            key={tagIndex}
                                            className="px-1.5 py-0.5 text-xs bg-indigo-50 text-indigo-700 rounded border border-indigo-200"
                                          >
                                            {tag}
                                          </span>
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onProceedAnyway}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 font-medium"
          >
            Proceed Anyway ({factCount} facts)
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-100 font-medium"
            >
              Cancel
            </button>
            {mode === 'narrow' ? (
              <button
                onClick={handleSubmit}
                disabled={keywords.length === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
              >
                Search with {keywords.length} keyword{keywords.length !== 1 ? 's' : ''}
              </button>
            ) : (
              <button
                onClick={handleFilterSubmit}
                disabled={selectedFacts.size === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
              >
                Use {selectedFacts.size} Selected Facts
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
