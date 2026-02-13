/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState } from 'react';
import { X, AlertTriangle, Layers, CheckCircle, ChevronDown, ChevronRight, FileText, Zap } from 'lucide-react';

interface CanonFact {
  text: string;
  chunk_id?: string;
  entity_name: string;
  entity_id?: string;
  entity_type?: string;
  region?: string;
}

interface FactGroup {
  id: string;
  label: string;
  facts: CanonFact[];
  characterCount: number;
  entityTypes: string[];
  regions: string[];
}

interface NpcSectionChunk {
  chunkLabel: string;
  sectionName: string;
  instructions: string;
  outputFields: string[];
  includePreviousSections: boolean;
}

interface FactChunkingModalProps {
  isOpen: boolean;
  groups?: FactGroup[];
  npcSections?: NpcSectionChunk[];
  totalCharacters?: number;
  mode?: 'facts' | 'npc-sections';
  onClose: () => void;
  onProceed: () => void;
}

export default function FactChunkingModal({
  isOpen,
  groups = [],
  npcSections = [],
  totalCharacters = 0,
  mode = 'facts',
  onClose,
  onProceed,
}: FactChunkingModalProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const isNpcMode = mode === 'npc-sections';
  const itemCount = isNpcMode ? npcSections.length : groups.length;

  const toggleGroup = (groupId: string) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupId)) {
      newExpanded.delete(groupId);
    } else {
      newExpanded.add(groupId);
    }
    setExpandedGroups(newExpanded);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isNpcMode ? (
              <FileText className="w-6 h-6 text-blue-500" />
            ) : (
              <Layers className="w-6 h-6 text-amber-500" />
            )}
            <div>
              <h2 className="text-xl font-bold">
                {isNpcMode ? 'NPC Section-Based Generation' : 'Multi-Part Generation Required'}
              </h2>
              <p className="text-sm text-gray-600">
                {isNpcMode
                  ? `NPC will be created in ${itemCount} focused sections for thorough detail`
                  : `Large factpack detected - will be split into ${itemCount} part${itemCount > 1 ? 's' : ''}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Warning/Info Banner */}
          <div className={`${isNpcMode ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'} border rounded-lg p-4 mb-6 flex gap-3`}>
            {isNpcMode ? (
              <Zap className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            )}
            <div className="text-sm">
              {isNpcMode ? (
                <>
                  <p className="font-semibold text-blue-900 mb-1">
                    Focused Section-Based NPC Creation
                  </p>
                  <p className="text-blue-800">
                    Each section will focus on a specific aspect of the NPC (Basic Info, Stats, Combat, etc.) with detailed
                    schema guidance. This ensures thorough, accurate, and richly described NPCs that align with your canon.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-amber-900 mb-1">
                    Your factpack contains {totalCharacters.toLocaleString()} characters
                  </p>
                  <p className="text-amber-800">
                    To prevent AI overwhelm, the generation will be split into multiple parts. Each part will be generated
                    separately and you'll need to review and proceed with each one.
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Stats */}
          {isNpcMode ? (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-900">{npcSections.length}</div>
                <div className="text-sm text-blue-700">NPC Sections</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-purple-900">
                  {npcSections.reduce((sum, s) => sum + s.outputFields.length, 0)}
                </div>
                <div className="text-sm text-purple-700">Total Fields</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-900">
                  {Math.round(npcSections.reduce((sum, s) => sum + s.outputFields.length, 0) / npcSections.length)}
                </div>
                <div className="text-sm text-green-700">Avg Fields/Section</div>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-900">
                  {groups.reduce((sum, g) => sum + g.facts.length, 0)}
                </div>
                <div className="text-sm text-blue-700">Total Facts</div>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-purple-900">{groups.length}</div>
                <div className="text-sm text-purple-700">Generation Parts</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-900">
                  {groups.length > 0 ? Math.round(totalCharacters / groups.length).toLocaleString() : 0}
                </div>
                <div className="text-sm text-green-700">Avg Chars/Part</div>
              </div>
            </div>
          )}

          {/* Groups / Sections */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900 mb-2">
              {isNpcMode ? 'NPC Creation Sections' : 'Proposed Grouping'}
            </h3>

            {isNpcMode ? (
              // NPC Sections Rendering
              npcSections.map((section, index) => {
                const isExpanded = expandedGroups.has(section.sectionName);

                return (
                  <div key={section.sectionName} className="border rounded-lg overflow-hidden">
                    {/* Section Header */}
                    <button
                      onClick={() => toggleGroup(section.sectionName)}
                      className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        )}
                        <div className="text-left">
                          <div className="font-semibold text-gray-900">
                            Section {index + 1}: {section.chunkLabel}
                          </div>
                          <div className="text-xs text-gray-600 flex items-center gap-2 mt-1">
                            <span>{section.outputFields.length} fields</span>
                            {section.includePreviousSections && (
                              <>
                                <span>•</span>
                                <span className="text-blue-600">Builds on previous</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                          {index === 0 ? 'Foundation' : index === npcSections.length - 1 ? 'Final' : 'Incremental'}
                        </div>
                      </div>
                    </button>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="p-4 bg-white border-t max-h-64 overflow-y-auto">
                        <div className="space-y-3">
                          <div>
                            <div className="text-xs font-semibold text-gray-700 mb-1">Output Fields:</div>
                            <div className="flex flex-wrap gap-1">
                              {section.outputFields.map((field, fieldIndex) => (
                                <span key={fieldIndex} className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                                  {field}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-gray-700 mb-1">Instructions Preview:</div>
                            <div className="text-xs text-gray-600 line-clamp-4 bg-gray-50 p-2 rounded">
                              {section.instructions.slice(0, 300)}...
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              // Fact Groups Rendering
              groups.map((group, index) => {
                const isExpanded = expandedGroups.has(group.id);

                return (
                  <div key={group.id} className="border rounded-lg overflow-hidden">
                    {/* Group Header */}
                    <button
                      onClick={() => toggleGroup(group.id)}
                      className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-gray-500" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-gray-500" />
                        )}
                        <div className="text-left">
                          <div className="font-semibold text-gray-900">
                            Part {index + 1}: {group.label}
                          </div>
                          <div className="text-xs text-gray-600 flex items-center gap-2 mt-1">
                            <span>{group.facts.length} facts</span>
                            <span>•</span>
                            <span>{group.characterCount.toLocaleString()} chars</span>
                            {group.regions.length > 0 && (
                              <>
                                <span>•</span>
                                <span>{group.regions.join(', ')}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            group.characterCount > 8000
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-green-100 text-green-700'
                          }`}
                        >
                          {group.characterCount > 8000 ? 'Large' : 'Optimal'}
                        </div>
                      </div>
                    </button>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="p-4 bg-white border-t max-h-64 overflow-y-auto">
                        <div className="space-y-2">
                          {group.facts.slice(0, 10).map((fact, factIndex) => (
                            <div key={factIndex} className="text-sm border-l-2 border-gray-300 pl-3 py-1">
                              <div className="font-medium text-gray-700">{fact.entity_name}</div>
                              <div className="text-gray-600 line-clamp-2">{fact.text}</div>
                            </div>
                          ))}
                          {group.facts.length > 10 && (
                            <div className="text-xs text-gray-500 italic pl-3">
                              ... and {group.facts.length - 10} more facts
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Info */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
            <CheckCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              {isNpcMode ? (
                <>
                  <p className="font-semibold mb-1">How section-based NPC generation works:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Each section focuses on a specific aspect with detailed schema guidance</li>
                    <li>You can review and adjust each section before proceeding</li>
                    <li>Later sections build incrementally on earlier ones</li>
                    <li>Ensures thorough, accurate NPCs aligned with your canon</li>
                  </ul>
                </>
              ) : (
                <>
                  <p className="font-semibold mb-1">How multi-part generation works:</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Each part will be generated as a separate stage</li>
                    <li>You can review each part before proceeding to the next</li>
                    <li>All parts will be merged into a single final result</li>
                    <li>Facts are grouped by entity type and region to maintain coherence</li>
                  </ul>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 bg-gray-50 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onProceed}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
          >
            {isNpcMode ? <FileText className="w-4 h-4" /> : <Layers className="w-4 h-4" />}
            {isNpcMode
              ? `Begin ${itemCount}-Section NPC Creation`
              : `Proceed with ${itemCount}-Part Generation`}
          </button>
        </div>
      </div>
    </div>
  );
}
