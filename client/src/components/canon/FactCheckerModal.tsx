/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState } from 'react';
import { X, Search, AlertTriangle, CheckCircle, Download, Trash2, ChevronRight, ChevronLeft } from 'lucide-react';
import { API_BASE_URL } from '../../services/api';

interface DuplicateGroup {
  text: string;
  normalized_text: string;
  chunk_ids: string[];
  sources: string[];
  count: number;
}

interface EntityWithDuplicates {
  entity_id: string;
  canonical_name: string;
  type: string;
  region?: string;
  is_official?: boolean;
  duplicate_groups: DuplicateGroup[];
  total_duplicates: number;
}

interface ScanResult {
  stats: {
    entities_scanned: number;
    entities_with_duplicates: number;
    total_duplicates: number;
    potential_removals: number;
  };
  entities: EntityWithDuplicates[];
  cross_entity_duplicates?: Array<{
    text: string;
    normalized_text: string;
    entities: Array<{
      entity_id: string;
      canonical_name: string;
      chunk_ids: string[];
    }>;
    count: number;
  }>;
}

interface DeduplicationPlan {
  normalized_text: string;
  chunk_ids_to_remove: string[];
}

interface FactCheckerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function FactCheckerModal({ isOpen, onClose, onSuccess }: FactCheckerModalProps) {
  const [scanning, setScanning] = useState(false);
  const [scope, setScope] = useState<'all' | 'official' | 'homebrew'>('all');
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<EntityWithDuplicates | null>(null);
  const [deduplicationPlans, setDeduplicationPlans] = useState<Map<string, DeduplicationPlan[]>>(new Map());
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backupCreated, setBackupCreated] = useState(false);

  if (!isOpen) return null;

  const handleScan = async () => {
    setScanning(true);
    setError(null);
    setScanResult(null);
    setSelectedEntity(null);
    setDeduplicationPlans(new Map());
    setBackupCreated(false);

    try {
      const response = await fetch(`${API_BASE_URL}/canon/fact-check/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }),
      });

      if (!response.ok) {
        throw new Error('Failed to scan for duplicates');
      }

      const result: ScanResult = await response.json();
      setScanResult(result);

      // Auto-generate deduplication plans (keep first, remove rest)
      const plans = new Map<string, DeduplicationPlan[]>();
      for (const entity of result.entities) {
        const entityPlans: DeduplicationPlan[] = [];
        for (const group of entity.duplicate_groups) {
          // Keep first chunk, remove all others
          entityPlans.push({
            normalized_text: group.normalized_text,
            chunk_ids_to_remove: group.chunk_ids.slice(1), // Remove all except first
          });
        }
        plans.set(entity.entity_id, entityPlans);
      }
      setDeduplicationPlans(plans);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to scan');
    } finally {
      setScanning(false);
    }
  };

  const handleCreateBackup = async () => {
    if (!scanResult) return;

    try {
      const entityIds = scanResult.entities.map(e => e.entity_id);

      const response = await fetch(`${API_BASE_URL}/canon/fact-check/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_ids: entityIds }),
      });

      if (!response.ok) {
        throw new Error('Failed to create backup');
      }

      const result = await response.json();

      // Download backup JSON to client
      const blob = new Blob([JSON.stringify(result.backup_data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.backup_file;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setBackupCreated(true);
      alert(`✅ Backup created and downloaded!\n\nFile: ${result.backup_file}\nEntities: ${result.entity_count}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create backup');
    }
  };

  const handleToggleChunk = (entityId: string, normalizedText: string, chunkId: string) => {
    const plans = new Map(deduplicationPlans);
    const entityPlans = plans.get(entityId) || [];
    const planIndex = entityPlans.findIndex(p => p.normalized_text === normalizedText);

    if (planIndex === -1) return;

    const plan = entityPlans[planIndex];
    const chunkIndex = plan.chunk_ids_to_remove.indexOf(chunkId);

    if (chunkIndex === -1) {
      // Add to removal list
      plan.chunk_ids_to_remove.push(chunkId);
    } else {
      // Remove from removal list
      plan.chunk_ids_to_remove.splice(chunkIndex, 1);
    }

    plans.set(entityId, entityPlans);
    setDeduplicationPlans(plans);
  };

  const handleDedupeEntity = async (entityId: string) => {
    setProcessing(true);
    setError(null);

    try {
      const deduplicationPlan = deduplicationPlans.get(entityId) || [];

      const response = await fetch(`${API_BASE_URL}/canon/fact-check/dedupe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_id: entityId,
          deduplication_plan: deduplicationPlan,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to deduplicate entity');
      }

      const result = await response.json();
      alert(`✅ Entity deduplicated!\n\nRemoved ${result.removed_count} duplicate claims\nNew claim count: ${result.new_claim_count}`);

      // Rescan to update UI
      await handleScan();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to deduplicate');
    } finally {
      setProcessing(false);
    }
  };

  const handleBulkDedupe = async () => {
    if (!scanResult) return;

    if (!backupCreated) {
      const confirm = window.confirm(
        '⚠️ No backup has been created yet!\n\nIt is strongly recommended to create a backup before bulk cleanup.\n\nContinue without backup?'
      );
      if (!confirm) return;
    }

    const confirm2 = window.confirm(
      `⚠️ Bulk Cleanup Confirmation\n\n` +
      `This will remove ${scanResult.stats.potential_removals} duplicate claims from ${scanResult.stats.entities_with_duplicates} entities.\n\n` +
      `This action cannot be undone (unless you have a backup).\n\n` +
      `Continue?`
    );

    if (!confirm2) return;

    setProcessing(true);
    setError(null);

    try {
      const entityPlans = Array.from(deduplicationPlans.entries()).map(([entity_id, deduplication_plan]) => ({
        entity_id,
        deduplication_plan,
      }));

      const response = await fetch(`${API_BASE_URL}/canon/fact-check/bulk-dedupe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity_plans: entityPlans }),
      });

      if (!response.ok) {
        throw new Error('Failed to bulk deduplicate');
      }

      const result = await response.json();
      alert(
        `✅ Bulk cleanup complete!\n\n` +
        `Entities processed: ${result.entities_processed}\n` +
        `Total duplicates removed: ${result.total_removed}`
      );

      // Rescan to show clean state
      await handleScan();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to bulk deduplicate');
    } finally {
      setProcessing(false);
    }
  };

  const handleClose = () => {
    setScanResult(null);
    setSelectedEntity(null);
    setDeduplicationPlans(new Map());
    setError(null);
    setBackupCreated(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 text-orange-500" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Canon Fact Checker</h2>
              <p className="text-sm text-gray-600 mt-1">
                Find and remove duplicate claims in your canon library
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
              <strong>Error:</strong> {error}
            </div>
          )}

          {!selectedEntity ? (
            /* Main View - Scan and Results */
            <div className="space-y-6">
              {/* Scan Controls */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-3">Scan for Duplicates</h3>
                <div className="flex items-center gap-3">
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value as 'all' | 'official' | 'homebrew')}
                    className="px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={scanning}
                  >
                    <option value="all">All Entities</option>
                    <option value="official">Official Content Only</option>
                    <option value="homebrew">Homebrew Content Only</option>
                  </select>
                  <button
                    onClick={handleScan}
                    disabled={scanning}
                    className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {scanning ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4" />
                        Start Scan
                      </>
                    )}
                  </button>
                </div>
              </div>

              {scanResult && (
                <>
                  {/* Summary Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="text-sm text-gray-600 mb-1">Entities Scanned</div>
                      <div className="text-2xl font-bold text-gray-900">{scanResult.stats.entities_scanned}</div>
                    </div>
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <div className="text-sm text-orange-700 mb-1">With Duplicates</div>
                      <div className="text-2xl font-bold text-orange-900">{scanResult.stats.entities_with_duplicates}</div>
                    </div>
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="text-sm text-red-700 mb-1">Total Duplicates</div>
                      <div className="text-2xl font-bold text-red-900">{scanResult.stats.total_duplicates}</div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="text-sm text-green-700 mb-1">Can Remove</div>
                      <div className="text-2xl font-bold text-green-900">{scanResult.stats.potential_removals}</div>
                    </div>
                  </div>

                  {scanResult.stats.entities_with_duplicates === 0 ? (
                    <div className="text-center py-12 bg-green-50 border border-green-200 rounded-lg">
                      <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-green-900 mb-2">No Duplicates Found!</h3>
                      <p className="text-green-700">Your canon library is clean and deduplicated.</p>
                    </div>
                  ) : (
                    <>
                      {/* Action Buttons */}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleCreateBackup}
                          disabled={backupCreated}
                          className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium ${
                            backupCreated
                              ? 'bg-green-100 text-green-800 border border-green-300'
                              : 'bg-purple-600 text-white hover:bg-purple-700'
                          }`}
                        >
                          <Download className="w-4 h-4" />
                          {backupCreated ? 'Backup Created ✓' : 'Create Backup'}
                        </button>
                        <button
                          onClick={handleBulkDedupe}
                          disabled={processing}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                        >
                          <Trash2 className="w-4 h-4" />
                          {processing ? 'Processing...' : `Fix All (${scanResult.stats.entities_with_duplicates} entities)`}
                        </button>
                      </div>

                      {/* Entities List */}
                      <div>
                        <h3 className="font-medium text-gray-900 mb-3">Entities with Duplicates:</h3>
                        <div className="space-y-2">
                          {scanResult.entities.map((entity) => (
                            <div
                              key={entity.entity_id}
                              onClick={() => setSelectedEntity(entity)}
                              className="border border-gray-200 rounded-lg p-4 hover:border-blue-400 hover:bg-blue-50 cursor-pointer transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="font-medium text-gray-900">{entity.canonical_name}</h4>
                                    <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                                      {entity.type}
                                    </span>
                                    {entity.is_official && (
                                      <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded">
                                        Official
                                      </span>
                                    )}
                                    {entity.region && (
                                      <span className="text-xs text-gray-600">📍 {entity.region}</span>
                                    )}
                                  </div>
                                  <div className="text-sm text-gray-600 mt-1">
                                    {entity.total_duplicates} duplicate claim{entity.total_duplicates !== 1 ? 's' : ''} •{' '}
                                    {entity.duplicate_groups.length} group{entity.duplicate_groups.length !== 1 ? 's' : ''}
                                  </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-400" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          ) : (
            /* Detail View - Entity Duplicates */
            <div className="space-y-6">
              <button
                onClick={() => setSelectedEntity(null)}
                className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
              >
                <ChevronLeft className="w-4 h-4" />
                Back to List
              </button>

              <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{selectedEntity.canonical_name}</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-1 text-xs bg-white text-gray-700 rounded border border-gray-300">
                        {selectedEntity.type}
                      </span>
                      {selectedEntity.is_official && (
                        <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                          Official
                        </span>
                      )}
                      {selectedEntity.region && (
                        <span className="text-sm text-gray-700">📍 {selectedEntity.region}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-700">Total Duplicates</div>
                    <div className="text-3xl font-bold text-orange-900">{selectedEntity.total_duplicates}</div>
                  </div>
                </div>
              </div>

              {/* Duplicate Groups */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-900">Duplicate Groups:</h3>
                {selectedEntity.duplicate_groups.map((group, groupIndex) => {
                  const plan = deduplicationPlans.get(selectedEntity.entity_id)?.find(
                    p => p.normalized_text === group.normalized_text
                  );
                  const willRemove = plan?.chunk_ids_to_remove || [];

                  return (
                    <div key={groupIndex} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                      <div className="mb-3">
                        <div className="text-xs font-medium text-gray-500 mb-1">
                          Duplicate Group {groupIndex + 1} of {selectedEntity.duplicate_groups.length}
                        </div>
                        <div className="text-sm text-gray-800 bg-white border border-gray-200 rounded p-3">
                          "{group.text}"
                        </div>
                      </div>

                      <div className="space-y-2">
                        {group.chunk_ids.map((chunkId, index) => {
                          const isMarkedForRemoval = willRemove.includes(chunkId);
                          const isLast = group.chunk_ids.filter(id => !willRemove.includes(id)).length === 1;

                          return (
                            <div
                              key={chunkId}
                              className={`border rounded p-3 transition-colors ${
                                isMarkedForRemoval
                                  ? 'border-red-300 bg-red-50'
                                  : 'border-green-300 bg-green-50'
                              }`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="text-xs font-medium text-gray-600 mb-1">
                                    Claim {index + 1} ({chunkId})
                                  </div>
                                  <div className="text-xs text-gray-600">
                                    Source: {group.sources[Math.min(index, group.sources.length - 1)]}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleToggleChunk(selectedEntity.entity_id, group.normalized_text, chunkId)}
                                  disabled={!isMarkedForRemoval && isLast}
                                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                    isMarkedForRemoval
                                      ? 'bg-green-600 text-white hover:bg-green-700'
                                      : isLast
                                      ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                      : 'bg-red-600 text-white hover:bg-red-700'
                                  }`}
                                >
                                  {isMarkedForRemoval ? 'Keep' : isLast ? 'Must Keep' : 'Remove'}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  Will remove <strong>{deduplicationPlans.get(selectedEntity.entity_id)?.reduce((sum, p) => sum + p.chunk_ids_to_remove.length, 0) || 0}</strong> duplicate claims
                </div>
                <button
                  onClick={() => handleDedupeEntity(selectedEntity.entity_id)}
                  disabled={processing}
                  className="px-6 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
                >
                  {processing ? 'Processing...' : 'Apply Cleanup'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={handleClose}
            className="w-full px-6 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
