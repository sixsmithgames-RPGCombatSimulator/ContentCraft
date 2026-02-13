/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useEffect, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

interface Proposal {
  question: string;
  options: string[];
  rule_impact: string;
  selected?: string;
}

interface Conflict {
  new_claim?: string;
  existing_claim?: string;
  entity_id?: string;
  entity_name?: string;
  // Additional context fields
  field_path?: string;
  location?: string;
  conflict_type?: string;
  severity?: string;
  summary?: string;
  details?: string;
  reason?: string;
  suggested_fix?: string;
  recommended_action?: string;
  resolution?: 'keep_old' | 'use_new' | 'merge' | 'skip';
}

type PhysicsIssue = {
  severity?: string;
  description?: string;
  issue_type?: string;
  location?: string;
  suggestion?: string;
  // Additional context fields
  field_path?: string;
  summary?: string;
  details?: string;
  rule_reference?: string;
  suggested_fix?: string;
  current_value?: string;
  // Track user decision
  resolution?: 'acknowledge' | 'will_fix' | 'ignore';
};

interface GeneratedContentLike {
  proposals?: Proposal[];
  conflicts?: Conflict[];
  sources_used?: string[];
  assumptions?: string[];
  canon_update?: string;
  physics_issues?: PhysicsIssue[];
  canon_alignment_score?: number;
  logic_score?: number;
  validation_notes?: string;
  balance_notes?: string;
  [k: string]: any;
}

interface CanonDeltaModalProps {
  isOpen: boolean;
  generatedContent?: GeneratedContentLike | null;
  onClose: () => void;
  onApprove: (
    resolvedProposals: Proposal[],
    resolvedConflicts: Conflict[],
    resolvedPhysicsIssues: PhysicsIssue[]
  ) => void;
}

export default function CanonDeltaModal({
  isOpen,
  generatedContent,
  onClose,
  onApprove,
}: CanonDeltaModalProps) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [physicsIssues, setPhysicsIssues] = useState<PhysicsIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customAnswers, setCustomAnswers] = useState<Record<number, string>>({});

  const loadDeltaInfo = useCallback(() => {
    setLoading(true);
    setError(null);

    try {
      if (!generatedContent) {
        setProposals([]);
        setConflicts([]);
        setPhysicsIssues([]);
        return;
      }

      const contentProposals = generatedContent.proposals || [];
      setProposals(contentProposals.map((p) => ({ ...p, selected: p.options?.[0] })));

      const contentConflicts = generatedContent.conflicts || [];
      setConflicts(contentConflicts);

      const contentPhysicsIssues = generatedContent.physics_issues || [];
      setPhysicsIssues(contentPhysicsIssues);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process generated content');
    } finally {
      setLoading(false);
    }
  }, [generatedContent]);

  useEffect(() => {
    if (isOpen && generatedContent) {
      loadDeltaInfo();
    }
  }, [isOpen, generatedContent, loadDeltaInfo]);

  // (loadDeltaInfo logic moved above and memoized)

  const handleProposalSelect = (index: number, value: string) => {
    setProposals(prev => prev.map((p, i) =>
      i === index ? { ...p, selected: value } : p
    ));
    // Clear custom answer if switching away from "custom"
    if (value !== 'custom' && customAnswers[index]) {
      const newCustom = { ...customAnswers };
      delete newCustom[index];
      setCustomAnswers(newCustom);
    }
  };

  const handleConflictResolve = (index: number, resolution: Conflict['resolution']) => {
    setConflicts(prev => prev.map((c, i) =>
      i === index ? { ...c, resolution } : c
    ));
  };

  const handlePhysicsIssueResolve = (index: number, resolution: PhysicsIssue['resolution']) => {
    setPhysicsIssues(prev => prev.map((issue, i) =>
      i === index ? { ...issue, resolution } : issue
    ));
  };

  const handleApprove = () => {
    // Validate all proposals are resolved
    const unresolvedProposals = proposals.filter(p => !p.selected || (p.selected === 'custom' && !customAnswers[proposals.indexOf(p)]));
    if (unresolvedProposals.length > 0) {
      setError('Please answer all proposals before approving');
      return;
    }

    // Validate all conflicts are resolved
    const unresolvedConflicts = conflicts.filter(c => !c.resolution);
    if (unresolvedConflicts.length > 0) {
      setError('Please resolve all conflicts before approving');
      return;
    }

    // Validate all critical physics issues are acknowledged
    const unresolvedCriticalIssues = physicsIssues.filter(
      issue => issue.severity === 'critical' && !issue.resolution
    );
    if (unresolvedCriticalIssues.length > 0) {
      setError('Please acknowledge or resolve all critical physics/logic issues before approving');
      return;
    }

    // Merge custom answers into proposals
    const finalProposals = proposals.map((p, i) => ({
      ...p,
      selected: p.selected === 'custom' ? customAnswers[i] : p.selected,
    }));

    // Pass physics issues with resolutions so they can be tracked
    onApprove(finalProposals, conflicts, physicsIssues);
  };

  if (!isOpen || !generatedContent) return null;

  const sourcesUsed = generatedContent.sources_used || [];
  const assumptions = generatedContent?.assumptions || [];
  const canonUpdate = generatedContent?.canon_update || 'No canon changes';
  const canonScore = generatedContent?.canon_alignment_score || 0;
  const logicScore = generatedContent?.logic_score || 0;
  const validationNotes = generatedContent?.validation_notes || '';
  const balanceNotes = generatedContent?.balance_notes || '';

  const contentAny = generatedContent as Record<string, unknown>;
  const deliverable = String((contentAny as any).deliverable || (contentAny as any).type || '').toLowerCase();

  const hasMeaningfulValue = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'number') return !Number.isNaN(value);
    if (typeof value === 'boolean') return true;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
    return false;
  };

  type ExpectedField = { key: string; label: string; importance: 'expected' | 'optional' };

  const expectedFields: ExpectedField[] = (() => {
    const base: ExpectedField[] = [
      { key: 'deliverable', label: 'Deliverable Type', importance: 'expected' },
      { key: 'description', label: 'Main Description', importance: 'expected' },
    ];

    const npc: ExpectedField[] = [
      { key: 'appearance', label: 'Appearance', importance: 'expected' },
      { key: 'background', label: 'Background', importance: 'expected' },
      { key: 'race', label: 'Race', importance: 'expected' },
      { key: 'role', label: 'Role', importance: 'optional' },
      { key: 'affiliation', label: 'Affiliation', importance: 'optional' },
    ];

    const monster: ExpectedField[] = [
      { key: 'size', label: 'Size', importance: 'expected' },
      { key: 'creature_type', label: 'Creature Type', importance: 'expected' },
      { key: 'challenge_rating', label: 'Challenge Rating', importance: 'expected' },
    ];

    const location: ExpectedField[] = [
      { key: 'location_type', label: 'Location Type', importance: 'expected' },
      { key: 'purpose', label: 'Purpose', importance: 'expected' },
    ];

    const item: ExpectedField[] = [
      { key: 'item_type', label: 'Item Type', importance: 'expected' },
      { key: 'rarity', label: 'Rarity', importance: 'expected' },
    ];

    if (deliverable.includes('npc') || deliverable.includes('character')) return [...base, ...npc];
    if (deliverable.includes('monster') || deliverable.includes('creature')) return [...base, ...monster];
    if (deliverable.includes('location') || deliverable.includes('castle') || deliverable.includes('dungeon')) return [...base, ...location];
    if (deliverable.includes('item')) return [...base, ...item];
    return base;
  })();

  const missingFields = expectedFields.filter((f) => !hasMeaningfulValue((contentAny as any)[f.key]));
  const missingExpected = missingFields.filter((f) => f.importance === 'expected');
  const missingOptional = missingFields.filter((f) => f.importance === 'optional');

  type ReviewWarning = { key: string; label: string; message: string };
  const formatWarnings: ReviewWarning[] = (() => {
    const warnings: ReviewWarning[] = [];

    const isCreature =
      deliverable.includes('npc') ||
      deliverable.includes('character') ||
      deliverable.includes('monster') ||
      deliverable.includes('creature');

    if (!isCreature) return warnings;

    const armorClassCandidate =
      (contentAny as any).armor_class ??
      ((contentAny as any).stat_block && (contentAny as any).stat_block.armor_class);

    if (typeof armorClassCandidate === 'string') {
      const acStr = armorClassCandidate.trim();
      if (acStr.length > 0) {
        const ok = /^\d+$/.test(acStr) || /^(\d+)\s*\([^)]+\)$/.test(acStr);
        const incomplete = /^\d+\s*\($/.test(acStr) || /^\d+\s*\([^)]*$/.test(acStr);

        if (!ok) {
          warnings.push({
            key: 'armor_class',
            label: 'Armor Class (AC)',
            message: incomplete
              ? 'Looks incomplete. Finish it like 18 (plate armor), or enter a plain number like 18.'
              : 'Invalid format. Fix: enter a number like 18, or use parentheses like 18 (plate armor). Remove extra descriptive text like "Armor + Shield".',
          });
        }
      }
    }

    return warnings;
  })();

  const hasIssues = proposals.length > 0 || conflicts.length > 0 || physicsIssues.length > 0;
  const criticalIssuesCount = physicsIssues.filter(i => i.severity === 'critical' && !i.resolution).length;
  const issuesToFix = physicsIssues.filter(i => i.resolution === 'will_fix');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-purple-50">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Canon Delta Review</h2>
            <p className="text-sm text-gray-600 mt-1">
              Review changes and resolve any conflicts before saving
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-medium text-red-800">Error</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">Analyzing changes...</div>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium text-green-900">Sources Used</span>
                  </div>
                  <div className="text-2xl font-bold text-green-700">{sourcesUsed.length}</div>
                  <div className="text-xs text-green-600 mt-1">Facts from library</div>
                </div>

                <div className={`border rounded-lg p-4 ${proposals.length > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle className={`w-5 h-5 ${proposals.length > 0 ? 'text-yellow-600' : 'text-gray-400'}`} />
                    <span className={`text-sm font-medium ${proposals.length > 0 ? 'text-yellow-900' : 'text-gray-700'}`}>Proposals</span>
                  </div>
                  <div className={`text-2xl font-bold ${proposals.length > 0 ? 'text-yellow-700' : 'text-gray-500'}`}>{proposals.length}</div>
                  <div className={`text-xs mt-1 ${proposals.length > 0 ? 'text-yellow-600' : 'text-gray-500'}`}>Need review</div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Info className="w-5 h-5 text-blue-600" />
                    <span className="text-sm font-medium text-blue-900">Assumptions</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-700">{assumptions.length}</div>
                  <div className="text-xs text-blue-600 mt-1">Made by AI</div>
                </div>

                <div className={`border rounded-lg p-4 ${conflicts.length > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className={`w-5 h-5 ${conflicts.length > 0 ? 'text-red-600' : 'text-gray-400'}`} />
                    <span className={`text-sm font-medium ${conflicts.length > 0 ? 'text-red-900' : 'text-gray-700'}`}>Conflicts</span>
                  </div>
                  <div className={`text-2xl font-bold ${conflicts.length > 0 ? 'text-red-700' : 'text-gray-500'}`}>{conflicts.length}</div>
                  <div className={`text-xs mt-1 ${conflicts.length > 0 ? 'text-red-600' : 'text-gray-500'}`}>To resolve</div>
                </div>
              </div>

              {/* Validation Scores */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
                  <h3 className="font-semibold text-purple-900 mb-2">Canon Alignment Score</h3>
                  <div className="flex items-center gap-3">
                    <div className="text-3xl font-bold text-purple-700">{canonScore}/100</div>
                    <div className="flex-1 bg-gray-200 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full ${canonScore >= 80 ? 'bg-green-500' : canonScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${canonScore}%` }}
                      />
                    </div>
                  </div>
                  {validationNotes && <p className="text-xs text-purple-700 mt-2">{validationNotes}</p>}
                </div>

                <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 mb-2">Logic & Physics Score</h3>
                  <div className="flex items-center gap-3">
                    <div className="text-3xl font-bold text-blue-700">{logicScore}/100</div>
                    <div className="flex-1 bg-gray-200 rounded-full h-3">
                      <div
                        className={`h-3 rounded-full ${logicScore >= 80 ? 'bg-green-500' : logicScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${logicScore}%` }}
                      />
                    </div>
                  </div>
                  {balanceNotes && <p className="text-xs text-blue-700 mt-2">{balanceNotes}</p>}
                </div>
              </div>

              {/* Canon Update Summary */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-200 rounded-lg p-4">
                <h3 className="font-semibold text-purple-900 mb-2">Canon Update Summary</h3>
                <p className="text-sm text-purple-800">{canonUpdate}</p>
              </div>

              {/* Missing Field Warnings (Non-blocking) */}
              {(missingExpected.length > 0 || missingOptional.length > 0) && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-700 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-yellow-900 mb-1">Missing fields detected</h3>
                      <p className="text-sm text-yellow-800">
                        Some commonly expected fields are missing or blank. The editor will show these fields as empty unless you fill them in.
                      </p>
                      {missingExpected.length > 0 && (
                        <div className="mt-3">
                          <p className="text-sm font-medium text-yellow-900 mb-1">Expected</p>
                          <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800">
                            {missingExpected.map((f) => (
                              <li key={f.key}>{f.label}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {missingOptional.length > 0 && (
                        <div className="mt-3">
                          <p className="text-sm font-medium text-yellow-900 mb-1">Optional</p>
                          <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800">
                            {missingOptional.map((f) => (
                              <li key={f.key}>{f.label}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {formatWarnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-700 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-yellow-900 mb-1">Potential formatting issues detected</h3>
                      <p className="text-sm text-yellow-800">
                        These won’t block you from continuing, but they may cause a save-time validation error if left unchanged.
                      </p>
                      <div className="mt-3">
                        <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800">
                          {formatWarnings.map((w) => (
                            <li key={w.key}>
                              <span className="font-medium">{w.label}:</span> {w.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Proposals Section */}
              {proposals.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-600" />
                    Proposals Needing Review
                  </h3>
                  <div className="space-y-4">
                    {proposals.map((proposal, index) => (
                      <div key={index} className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <h4 className="font-medium text-yellow-900 mb-2">{proposal.question}</h4>
                        <p className="text-sm text-yellow-700 mb-3">
                          <strong>Rule Impact:</strong> {proposal.rule_impact}
                        </p>
                        <div className="space-y-2">
                          {proposal.options?.map((option, optIndex) => (
                            <label key={optIndex} className="flex items-start gap-3 p-3 bg-white border border-yellow-200 rounded cursor-pointer hover:bg-yellow-50">
                              <input
                                type="radio"
                                name={`proposal-${index}`}
                                checked={proposal.selected === option}
                                onChange={() => handleProposalSelect(index, option)}
                                className="mt-1 w-4 h-4 text-blue-600"
                              />
                              <span className="text-sm text-gray-800">{option}</span>
                            </label>
                          ))}
                          <label className="flex items-start gap-3 p-3 bg-white border border-yellow-200 rounded cursor-pointer hover:bg-yellow-50">
                            <input
                              type="radio"
                              name={`proposal-${index}`}
                              checked={proposal.selected === 'custom'}
                              onChange={() => handleProposalSelect(index, 'custom')}
                              className="mt-1 w-4 h-4 text-blue-600"
                            />
                            <div className="flex-1">
                              <span className="text-sm text-gray-800 block mb-2">Custom Answer</span>
                              {proposal.selected === 'custom' && (
                                <input
                                  type="text"
                                  value={customAnswers[index] || ''}
                                  onChange={(e) => setCustomAnswers({ ...customAnswers, [index]: e.target.value })}
                                  placeholder="Enter your custom answer..."
                                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                                />
                              )}
                            </div>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conflicts Section */}
              {conflicts.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600" />
                    Conflicts Detected
                  </h3>
                  <div className="space-y-4">
                    {conflicts.map((conflict, index) => (
                      <div key={index} className="bg-red-50 border-2 border-red-200 rounded-lg p-4">
                        {/* Header with metadata */}
                        <div className="flex items-center gap-2 flex-wrap mb-3">
                          {conflict.severity && (
                            <span className="px-2 py-0.5 text-xs bg-red-200 text-red-900 rounded font-medium">
                              {conflict.severity}
                            </span>
                          )}
                          {conflict.conflict_type && (
                            <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded">
                              {conflict.conflict_type}
                            </span>
                          )}
                          {(conflict.field_path || conflict.location) && (
                            <code className="px-2 py-0.5 text-xs bg-gray-100 text-gray-800 rounded font-mono">
                              {conflict.field_path || conflict.location}
                            </code>
                          )}
                          {conflict.entity_name && (
                            <span className="text-sm text-gray-700">
                              <strong>Entity:</strong> {conflict.entity_name}
                            </span>
                          )}
                        </div>

                        {/* Summary */}
                        {conflict.summary && (
                          <p className="text-sm font-bold text-red-900 mb-2">
                            {conflict.summary}
                          </p>
                        )}

                        {/* Details or Reason */}
                        {(conflict.details || conflict.reason) && (
                          <p className="text-sm text-gray-900 mb-3 leading-relaxed">
                            {conflict.details || conflict.reason}
                          </p>
                        )}

                        {/* Existing vs New Claims */}
                        <div className="grid grid-cols-2 gap-4 mb-3">
                          <div className="bg-white border border-red-300 rounded p-3">
                            <p className="text-xs font-medium text-gray-600 mb-1">📚 Existing Fact:</p>
                            <p className="text-sm text-gray-800">
                              {conflict.existing_claim || <em className="text-gray-500">No existing claim</em>}
                            </p>
                          </div>
                          <div className="bg-white border border-red-300 rounded p-3">
                            <p className="text-xs font-medium text-gray-600 mb-1">✨ New Claim:</p>
                            <p className="text-sm text-gray-800">
                              {conflict.new_claim || <em className="text-gray-500">No new claim</em>}
                            </p>
                          </div>
                        </div>

                        {/* Suggested Fix or Recommended Action */}
                        {(conflict.suggested_fix || conflict.recommended_action) && (
                          <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded">
                            <p className="text-xs font-medium text-green-900 mb-1">
                              💡 Suggested Resolution:
                            </p>
                            <p className="text-sm text-green-800">
                              {conflict.suggested_fix || conflict.recommended_action}
                            </p>
                          </div>
                        )}

                        {/* Resolution Buttons */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleConflictResolve(index, 'keep_old')}
                            className={`flex-1 px-3 py-2 text-sm rounded border font-medium ${
                              conflict.resolution === 'keep_old'
                                ? 'bg-blue-100 border-blue-400 text-blue-900'
                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            Keep Existing
                          </button>
                          <button
                            onClick={() => handleConflictResolve(index, 'use_new')}
                            className={`flex-1 px-3 py-2 text-sm rounded border font-medium ${
                              conflict.resolution === 'use_new'
                                ? 'bg-blue-100 border-blue-400 text-blue-900'
                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            Use New
                          </button>
                          <button
                            onClick={() => handleConflictResolve(index, 'merge')}
                            className={`flex-1 px-3 py-2 text-sm rounded border font-medium ${
                              conflict.resolution === 'merge'
                                ? 'bg-blue-100 border-blue-400 text-blue-900'
                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            Merge Both
                          </button>
                          <button
                            onClick={() => handleConflictResolve(index, 'skip')}
                            className={`flex-1 px-3 py-2 text-sm rounded border font-medium ${
                              conflict.resolution === 'skip'
                                ? 'bg-blue-100 border-blue-400 text-blue-900'
                                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                            }`}
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Physics/Logic Issues Section */}
              {physicsIssues.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-600" />
                    Physics & Logic Issues
                  </h3>
                  <div className="space-y-3">
                    {physicsIssues.map((issue, index: number) => (
                      <div key={index} className={`border-2 rounded-lg p-4 ${
                        issue.severity === 'critical' ? 'bg-red-50 border-red-200' :
                        issue.severity === 'moderate' || issue.severity === 'major' ? 'bg-orange-50 border-orange-200' :
                        'bg-yellow-50 border-yellow-200'
                      }`}>
                        {/* Header with metadata */}
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className={`px-2 py-0.5 text-xs rounded font-medium ${
                            issue.severity === 'critical' ? 'bg-red-200 text-red-900' :
                            issue.severity === 'moderate' || issue.severity === 'major' ? 'bg-orange-200 text-orange-900' :
                            'bg-yellow-200 text-yellow-900'
                          }`}>
                            {issue.severity || 'minor'}
                          </span>
                          {issue.issue_type && (
                            <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded">
                              {issue.issue_type}
                            </span>
                          )}
                          {(issue.field_path || issue.location) && (
                            <code className="px-2 py-0.5 text-xs bg-gray-100 text-gray-800 rounded font-mono">
                              {issue.field_path || issue.location}
                            </code>
                          )}
                        </div>

                        {/* Summary */}
                        {issue.summary && (
                          <p className="text-sm font-bold text-gray-900 mb-2">
                            {issue.summary}
                          </p>
                        )}

                        {/* Description or Details */}
                        <p className="text-sm text-gray-900 mb-3 leading-relaxed">
                          {issue.details || issue.description}
                        </p>

                        {/* Current Value */}
                        {issue.current_value && (
                          <div className="mb-3 p-2 bg-white border border-gray-300 rounded">
                            <p className="text-xs font-medium text-gray-600 mb-1">Current Value:</p>
                            <p className="text-sm text-gray-800">{issue.current_value}</p>
                          </div>
                        )}

                        {/* Rule Reference */}
                        {issue.rule_reference && (
                          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
                            <p className="text-xs font-medium text-blue-900 mb-1">
                              📖 Rule Reference:
                            </p>
                            <p className="text-sm text-blue-800">{issue.rule_reference}</p>
                          </div>
                        )}

                        {/* Suggested Fix */}
                        {(issue.suggested_fix || issue.suggestion) && (
                          <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded">
                            <p className="text-xs font-medium text-green-900 mb-1">
                              ✅ Suggested Fix:
                            </p>
                            <p className="text-sm text-green-800">
                              {issue.suggested_fix || issue.suggestion}
                            </p>
                          </div>
                        )}

                        {/* Resolution Buttons - Required for critical issues */}
                        {issue.severity === 'critical' && (
                          <div>
                            <p className="text-xs text-red-800 mb-2 font-medium">
                              ⚠️ Critical issues must be acknowledged before approving
                            </p>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handlePhysicsIssueResolve(index, 'will_fix')}
                                className={`flex-1 px-3 py-2 text-sm rounded border font-medium ${
                                  issue.resolution === 'will_fix'
                                    ? 'bg-green-100 border-green-400 text-green-900'
                                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                Will Fix
                              </button>
                              <button
                                onClick={() => handlePhysicsIssueResolve(index, 'acknowledge')}
                                className={`flex-1 px-3 py-2 text-sm rounded border font-medium ${
                                  issue.resolution === 'acknowledge'
                                    ? 'bg-blue-100 border-blue-400 text-blue-900'
                                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                Acknowledge (Proceed Anyway)
                              </button>
                              <button
                                onClick={() => handlePhysicsIssueResolve(index, 'ignore')}
                                className={`flex-1 px-3 py-2 text-sm rounded border font-medium ${
                                  issue.resolution === 'ignore'
                                    ? 'bg-gray-100 border-gray-400 text-gray-900'
                                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                                }`}
                              >
                                False Positive
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Optional resolution for non-critical issues */}
                        {issue.severity !== 'critical' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handlePhysicsIssueResolve(index, 'will_fix')}
                              className={`flex-1 px-3 py-2 text-xs rounded border ${
                                issue.resolution === 'will_fix'
                                  ? 'bg-green-100 border-green-300 text-green-800'
                                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              Mark to Fix
                            </button>
                            <button
                              onClick={() => handlePhysicsIssueResolve(index, 'ignore')}
                              className={`flex-1 px-3 py-2 text-xs rounded border ${
                                issue.resolution === 'ignore'
                                  ? 'bg-gray-100 border-gray-300 text-gray-800'
                                  : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                              }`}
                            >
                              Ignore
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Assumptions Section */}
              {assumptions.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Info className="w-5 h-5 text-blue-600" />
                    Assumptions Made
                  </h3>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <ul className="space-y-2">
                      {assumptions.map((assumption: string, index: number) => (
                        <li key={index} className="text-sm text-blue-800 flex items-start gap-2">
                          <span className="text-blue-600 mt-1">•</span>
                          <span>{assumption}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {/* Sources Section */}
              {sourcesUsed.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    Sources Referenced
                  </h3>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex flex-wrap gap-2">
                      {sourcesUsed.map((source: string, index: number) => (
                        <span key={index} className="px-2 py-1 bg-white text-green-800 text-xs rounded border border-green-200 font-mono">
                          {source}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Warning about issues to fix */}
        {issuesToFix.length > 0 && (
          <div className="px-6 py-3 bg-yellow-50 border-t border-yellow-200">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-yellow-900 mb-1">
                  ⚠️ Issues Marked "Will Fix" - Manual Action Required
                </h4>
                <p className="text-sm text-yellow-800">
                  You've marked {issuesToFix.length} issue{issuesToFix.length !== 1 ? 's' : ''} as "Will Fix".
                  These will NOT be automatically corrected. The content will be approved <strong>AS-IS</strong> with
                  these known issues, and you'll need to fix them manually later.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-6 py-2 text-gray-700 border border-gray-300 rounded-md hover:bg-gray-100"
          >
            Cancel
          </button>
          <div className="flex items-center gap-3">
            {hasIssues && (
              <div className="text-sm text-gray-600">
                {proposals.length > 0 && <span>{proposals.length} proposal{proposals.length !== 1 ? 's' : ''}</span>}
                {proposals.length > 0 && conflicts.length > 0 && <span>, </span>}
                {conflicts.length > 0 && <span>{conflicts.length} conflict{conflicts.length !== 1 ? 's' : ''}</span>}
                {(proposals.length > 0 || conflicts.length > 0) && criticalIssuesCount > 0 && <span>, </span>}
                {criticalIssuesCount > 0 && (
                  <span className="text-red-600 font-medium">
                    {criticalIssuesCount} critical issue{criticalIssuesCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}
            <button
              onClick={handleApprove}
              disabled={loading}
              className="px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
            >
              {issuesToFix.length > 0
                ? 'Approve AS-IS (Fix Later)'
                : hasIssues
                ? 'Approve Changes'
                : 'Approve & Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
