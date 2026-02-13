/**
 * Door Conflict Panel
 *
 * Displays door conflicts to users in a clear, actionable format.
 * Provides buttons to resolve conflicts by removing or relocating doors.
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { AlertTriangle, Trash2, MoveHorizontal, X } from 'lucide-react';
import type { ValidationError } from '../../contexts/locationEditorTypes';

interface DoorConflictPanelProps {
  validationErrors: ValidationError[];
  onRemoveDoor?: (spaceName: string, doorIndex: number) => void;
  onRelocateDoor?: (spaceName: string, doorIndex: number, newPosition: number) => void;
  className?: string;
  compact?: boolean; // Compact mode for inline display
}

interface ParsedConflict {
  spaceName: string;
  doorIndex: number;
  wall: string;
  position: number;
  width: number;
  leadsTo: string;
  conflictingDoors: Array<{
    leadsTo: string;
    position: number;
  }>;
  errorMessage: string;
}

/**
 * Parse validation error message to extract conflict details
 */
function parseConflictError(error: ValidationError): ParsedConflict | null {
  // Match pattern: "Room Name: Door X (wall wall at Yft) conflicts with existing door(s)..."
  const doorPattern = /^(.*?):\s*Door\s+(\d+)\s+\((.*?)\s+wall\s+at\s+([\d.]+)ft.*?width\s+([\d.]+)ft.*?\)\s+conflicts/i;
  const match = error.message.match(doorPattern);

  if (!match) return null;

  const [, spaceName, doorIndexStr, wall, positionStr, widthStr] = match;
  const doorIndex = parseInt(doorIndexStr, 10) - 1; // Convert to 0-based index
  const position = parseFloat(positionStr);
  const width = parseFloat(widthStr);

  // Extract leads_to from message (pattern: "leads to X")
  const leadsToMatch = error.message.match(/leads\s+to\s+([^)]+)/i);
  const leadsTo = leadsToMatch ? leadsToMatch[1].trim() : 'Unknown';

  // Extract conflicting door positions (pattern: "Name at Xft")
  const conflictPattern = /([^,]+?)\s+at\s+([\d.]+)ft/g;
  const conflictingDoors: Array<{ leadsTo: string; position: number }> = [];
  let conflictMatch;
  while ((conflictMatch = conflictPattern.exec(error.message)) !== null) {
    const [, conflictLeadsTo, conflictPosStr] = conflictMatch;
    conflictingDoors.push({
      leadsTo: conflictLeadsTo.trim(),
      position: parseFloat(conflictPosStr),
    });
  }

  return {
    spaceName: spaceName.trim(),
    doorIndex,
    wall,
    position,
    width,
    leadsTo,
    conflictingDoors,
    errorMessage: error.message,
  };
}

/**
 * Suggest a non-conflicting position for a door
 * Simple heuristic: move door to start or end of wall
 */
function suggestRelocatePosition(conflict: ParsedConflict, wallLength: number): number | null {
  const doorHalfWidth = conflict.width / 2;
  const minPos = doorHalfWidth + 2; // 2ft buffer from edge
  const maxPos = wallLength - doorHalfWidth - 2;

  // Try positions: start (25%), end (75%), or center if both fail
  const candidates = [
    wallLength * 0.25,
    wallLength * 0.75,
    wallLength * 0.5,
  ];

  for (const candidate of candidates) {
    if (candidate < minPos || candidate > maxPos) continue;

    // Check if this position would conflict
    const wouldConflict = conflict.conflictingDoors.some(conflicting => {
      const distance = Math.abs(candidate - conflicting.position);
      return distance < (conflict.width / 2 + 2); // 2ft buffer
    });

    if (!wouldConflict) {
      return candidate;
    }
  }

  return null; // No good position found
}

export default function DoorConflictPanel({
  validationErrors,
  onRemoveDoor,
  onRelocateDoor,
  className = '',
  compact = false,
}: DoorConflictPanelProps) {
  // Filter for door conflict errors only
  const doorConflicts = validationErrors
    .map(error => parseConflictError(error))
    .filter((parsed): parsed is ParsedConflict => parsed !== null);

  if (doorConflicts.length === 0) {
    return null;
  }

  if (compact) {
    // Compact inline display
    return (
      <div className={`flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md ${className}`}>
        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 text-sm">
          <p className="font-medium text-red-800">
            {doorConflicts.length} Door Conflict{doorConflicts.length > 1 ? 's' : ''} Detected
          </p>
          <p className="text-red-700 mt-1">
            Some doors overlap on the same wall. This will cause rendering issues.
            {onRemoveDoor || onRelocateDoor ? ' Use the fixes below to resolve conflicts.' : ' Please review and fix these conflicts.'}
          </p>
        </div>
      </div>
    );
  }

  // Full detailed display
  return (
    <div className={`bg-red-50 border-2 border-red-300 rounded-lg ${className}`}>
      {/* Header */}
      <div className="bg-red-600 text-white px-4 py-3 rounded-t-lg flex items-center gap-2">
        <AlertTriangle className="w-5 h-5" />
        <div className="flex-1">
          <h3 className="font-semibold text-lg">Door Conflicts Detected</h3>
          <p className="text-sm text-red-100">
            {doorConflicts.length} conflict{doorConflicts.length > 1 ? 's' : ''} found - doors overlap on the same wall
          </p>
        </div>
      </div>

      {/* Conflict List */}
      <div className="p-4 space-y-4 max-h-[400px] overflow-y-auto">
        {doorConflicts.map((conflict, idx) => {
          // Estimate wall length (rough heuristic - would need actual room data for precision)
          const estimatedWallLength = Math.max(
            ...conflict.conflictingDoors.map(d => d.position),
            conflict.position
          ) + 50; // Add buffer

          const suggestedPosition = suggestRelocatePosition(conflict, estimatedWallLength);

          return (
            <div key={idx} className="bg-white border border-red-300 rounded-md p-4">
              {/* Conflict Summary */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h4 className="font-semibold text-red-900 text-sm">
                    {conflict.spaceName}: Door {conflict.doorIndex + 1}
                  </h4>
                  <p className="text-xs text-red-700 mt-1">
                    {conflict.wall} wall at {conflict.position.toFixed(1)}ft → leads to {conflict.leadsTo}
                  </p>
                  <p className="text-xs text-red-700">
                    Width: {conflict.width}ft
                  </p>
                </div>
              </div>

              {/* Conflicting Doors */}
              <div className="mb-3">
                <p className="text-xs font-medium text-red-800 mb-1">Conflicts with:</p>
                <div className="space-y-1">
                  {conflict.conflictingDoors.map((conflicting, cIdx) => (
                    <div key={cIdx} className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded">
                      {conflicting.leadsTo} at {conflicting.position.toFixed(1)}ft
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              {(onRemoveDoor || onRelocateDoor) && (
                <div className="flex gap-2 pt-3 border-t border-red-200">
                  {onRemoveDoor && (
                    <button
                      onClick={() => onRemoveDoor(conflict.spaceName, conflict.doorIndex)}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 transition-colors"
                      title="Remove this door"
                    >
                      <Trash2 className="w-3 h-3" />
                      Remove Door
                    </button>
                  )}

                  {onRelocateDoor && suggestedPosition && (
                    <button
                      onClick={() => onRelocateDoor(conflict.spaceName, conflict.doorIndex, suggestedPosition)}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
                      title={`Move door to ${suggestedPosition.toFixed(1)}ft`}
                    >
                      <MoveHorizontal className="w-3 h-3" />
                      Move to {suggestedPosition.toFixed(1)}ft
                    </button>
                  )}

                  {onRelocateDoor && !suggestedPosition && (
                    <div className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-gray-200 text-gray-600 text-xs rounded cursor-not-allowed">
                      <X className="w-3 h-3" />
                      No space to relocate
                    </div>
                  )}
                </div>
              )}

              {/* Full Error Message (collapsible) */}
              <details className="mt-3 text-xs">
                <summary className="cursor-pointer text-red-700 hover:text-red-900 font-medium">
                  Show full error message
                </summary>
                <div className="mt-2 p-2 bg-red-100 rounded text-red-800 text-[10px] font-mono">
                  {conflict.errorMessage}
                </div>
              </details>
            </div>
          );
        })}
      </div>

      {/* Footer Help */}
      <div className="border-t border-red-300 bg-red-100 px-4 py-3 rounded-b-lg">
        <p className="text-xs text-red-800">
          <strong>Why this matters:</strong> Overlapping doors will render incorrectly on the map and may cause navigation issues.
          Remove conflicting doors or relocate them to non-overlapping positions on the wall.
        </p>
      </div>
    </div>
  );
}
