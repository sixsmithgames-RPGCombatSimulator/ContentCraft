/**
 * Template Selector Component
 *
 * Allows users to select from predefined architectural templates
 * for location generation with visual previews and details.
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState } from 'react';
import { Building2, ChevronDown, ChevronRight, Info } from 'lucide-react';
import { LOCATION_TEMPLATES } from '../../config/locationTemplates';

interface TemplateSelectorProps {
  selectedTemplateId: string | null;
  onSelectTemplate: (templateId: string | null) => void;
}

export default function TemplateSelector({
  selectedTemplateId,
  onSelectTemplate,
}: TemplateSelectorProps) {
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);

  const toggleDetails = (templateId: string) => {
    setExpandedTemplateId(expandedTemplateId === templateId ? null : templateId);
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-gray-700 flex items-center gap-2">
        <Building2 className="w-4 h-4" />
        Architectural Template
      </h3>

      {/* No Template Option */}
      <button
        type="button"
        onClick={() => onSelectTemplate(null)}
        className={`w-full text-left p-3 rounded-md border-2 transition-all ${
          selectedTemplateId === null
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 bg-white hover:border-gray-300'
        }`}
      >
        <div className="font-medium text-gray-800">No Template (Freeform)</div>
        <div className="text-xs text-gray-500 mt-1">
          AI generates without architectural constraints
        </div>
      </button>

      {/* Template Cards */}
      {LOCATION_TEMPLATES.map((template) => (
        <div key={template.id} className="space-y-2">
          <button
            type="button"
            onClick={() => onSelectTemplate(template.id)}
            className={`w-full text-left p-3 rounded-md border-2 transition-all ${
              selectedTemplateId === template.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="font-medium text-gray-800">{template.name}</div>
                <div className="text-xs text-gray-500 mt-1">{template.description}</div>
                <div className="text-xs text-gray-400 mt-1">
                  Types: {template.location_types.join(', ')}
                </div>
              </div>

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleDetails(template.id);
                }}
                className="ml-2 p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-gray-100"
                title="View Details"
              >
                {expandedTemplateId === template.id ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            </div>
          </button>

          {/* Expandable Details Panel */}
          {expandedTemplateId === template.id && (
            <div className="ml-4 p-3 bg-gray-50 border border-gray-200 rounded-md space-y-2 text-sm">
              {/* Suitable For */}
              <div>
                <div className="font-medium text-gray-700 text-xs">Suitable for:</div>
                <div className="text-gray-600 text-xs mt-1">
                  {template.location_types.join(', ')}
                </div>
              </div>

              {/* Materials */}
              <div>
                <div className="font-medium text-gray-700 text-xs">Materials:</div>
                <div className="text-gray-600 text-xs mt-1">
                  {template.architectural_style.materials.primary.join(', ')}
                </div>
              </div>

              {/* Room Types */}
              <div>
                <div className="font-medium text-gray-700 text-xs">Room types:</div>
                <div className="text-gray-600 text-xs mt-1">
                  {template.room_types.map((rt) => rt.type).join(', ')}
                </div>
              </div>

              {/* Layout Philosophy */}
              <div>
                <div className="font-medium text-gray-700 text-xs">Layout philosophy:</div>
                <div className="text-gray-600 text-xs mt-1 leading-relaxed">
                  {template.layout_philosophy.slice(0, 200)}
                  {template.layout_philosophy.length > 200 && '...'}
                </div>
              </div>

              {/* Example Structures */}
              {template.example_structures.length > 0 && (
                <div>
                  <div className="font-medium text-gray-700 text-xs">Examples:</div>
                  <div className="text-gray-600 text-xs mt-1">
                    {template.example_structures.join(', ')}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Info Footer */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md">
        <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700">
          Templates provide architectural constraints, style guidelines, and room type suggestions
          to help AI generate more coherent and realistic locations.
        </p>
      </div>
    </div>
  );
}
