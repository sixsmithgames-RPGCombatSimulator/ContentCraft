/**
 * Constraint Editor Component (Read-Only MVP)
 *
 * Displays architectural constraints from selected template.
 * For Phase 1, this is read-only. Editing will be added in future phases.
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { AlertCircle, Lock } from 'lucide-react';
import { getTemplateById } from '../../config/locationTemplates';

interface ConstraintEditorProps {
  templateId: string | null;
  disabled?: boolean;
}

export default function ConstraintEditor({ templateId, disabled = false }: ConstraintEditorProps) {
  const template = getTemplateById(templateId ?? undefined);

  // If no template selected, show placeholder
  if (!template) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-gray-700">Architectural Constraints</h3>
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-md text-center">
          <p className="text-sm text-gray-500">
            Select a template to view its architectural constraints
          </p>
        </div>
      </div>
    );
  }

  const constraints = template.constraints;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-700">Architectural Constraints</h3>

      {disabled && (
        <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <Lock className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-yellow-700">
            Constraints are managed by the selected template. Deselect the template to customize
            constraints.
          </p>
        </div>
      )}

      {/* Constraints Display */}
      <div className="space-y-3 p-4 bg-gray-50 border border-gray-200 rounded-md">
        {/* Room Size Constraints */}
        <div>
          <div className="font-medium text-gray-700 text-xs mb-2">Room Size Guidelines</div>
          <div className="space-y-1">
            {Object.entries(constraints.room_size_constraints)
              .slice(0, 5)
              .map(([roomType, constraint]) => (
                <div key={roomType} className="text-xs text-gray-600 flex justify-between">
                  <span className="font-medium">{roomType}:</span>
                  <span>
                    {constraint.min_width}-{constraint.max_width}ft × {constraint.min_height}-
                    {constraint.max_height}ft
                  </span>
                </div>
              ))}
            {Object.keys(constraints.room_size_constraints).length > 5 && (
              <div className="text-xs text-gray-400 italic">
                + {Object.keys(constraints.room_size_constraints).length - 5} more room types...
              </div>
            )}
          </div>
        </div>

        {/* Door Constraints */}
        <div>
          <div className="font-medium text-gray-700 text-xs mb-2">Door Specifications</div>
          <div className="space-y-1 text-xs text-gray-600">
            <div className="flex justify-between">
              <span>Width range:</span>
              <span>
                {constraints.door_constraints.min_width}-{constraints.door_constraints.max_width}ft
              </span>
            </div>
            <div className="flex justify-between">
              <span>Min from corner:</span>
              <span>{constraints.door_constraints.position_rules.min_from_corner}ft</span>
            </div>
            <div className="flex justify-between">
              <span>Grid snap:</span>
              <span>{constraints.door_constraints.position_rules.snap_to_grid}ft</span>
            </div>
          </div>
        </div>

        {/* Adjacency Rules */}
        {constraints.adjacency_rules.length > 0 && (
          <div>
            <div className="font-medium text-gray-700 text-xs mb-2">Adjacency Rules</div>
            <div className="space-y-1">
              {constraints.adjacency_rules.slice(0, 3).map((rule, index) => (
                <div key={index} className="text-xs text-gray-600">
                  <span className="font-medium">{rule.room_type_a}</span>{' '}
                  <span className="text-gray-400">
                    {rule.relationship === 'must_be_adjacent'
                      ? '→ MUST'
                      : rule.relationship === 'should_be_adjacent'
                        ? '→ should'
                        : '→ MUST NOT'}
                  </span>{' '}
                  <span className="font-medium">{rule.room_type_b}</span>
                  {rule.reason && <div className="text-gray-400 ml-4">({rule.reason})</div>}
                </div>
              ))}
              {constraints.adjacency_rules.length > 3 && (
                <div className="text-xs text-gray-400 italic">
                  + {constraints.adjacency_rules.length - 3} more rules...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Structural Rules */}
        {constraints.structural_rules.length > 0 && (
          <div>
            <div className="font-medium text-gray-700 text-xs mb-2">Structural Requirements</div>
            <div className="space-y-1">
              {constraints.structural_rules.map((rule, index) => (
                <div key={index} className="text-xs text-gray-600">
                  • {rule.constraint}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Info Footer */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
        <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          These constraints will be injected into AI prompts to guide generation. They help ensure
          architectural consistency and realism.
        </p>
      </div>
    </div>
  );
}
