/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2, MoveUp, MoveDown } from 'lucide-react';
import ExpandableObjectEditor from './ExpandableObjectEditor';

interface ExpandableArrayEditorProps {
  label: string;
  value: unknown[] | null | undefined;
  onChange: (value: unknown[] | null) => void;
  path: string;
  defaultExpanded?: boolean;
  itemType?: 'string' | 'number' | 'object' | 'auto';
  objectTemplate?: Record<string, unknown>;
}

export default function ExpandableArrayEditor({
  label,
  value,
  onChange,
  path,
  defaultExpanded = false,
  itemType = 'auto',
  objectTemplate,
}: ExpandableArrayEditorProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const arrayValue = value || [];

  // Auto-detect item type if not specified
  const detectedItemType = itemType === 'auto' && arrayValue.length > 0
    ? typeof arrayValue[0] === 'object' && !Array.isArray(arrayValue[0])
      ? 'object'
      : typeof arrayValue[0] === 'number'
      ? 'number'
      : 'string'
    : itemType === 'auto'
    ? 'string'
    : itemType;

  const handleItemChange = useCallback((index: number, newValue: unknown) => {
    const updated = [...arrayValue];
    updated[index] = newValue;
    onChange(updated);
  }, [arrayValue, onChange]);

  const handleDeleteItem = useCallback((index: number) => {
    const updated = arrayValue.filter((_, i) => i !== index);
    onChange(updated.length > 0 ? updated : null);
  }, [arrayValue, onChange]);

  const handleAddItem = useCallback(() => {
    let newItem: unknown;

    switch (detectedItemType) {
      case 'number':
        newItem = 0;
        break;
      case 'object':
        newItem = objectTemplate || {};
        break;
      default:
        newItem = '';
    }

    const updated = [...arrayValue, newItem];
    onChange(updated);
  }, [arrayValue, detectedItemType, objectTemplate, onChange]);

  const handleMoveUp = useCallback((index: number) => {
    if (index === 0) return;
    const updated = [...arrayValue];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    onChange(updated);
  }, [arrayValue, onChange]);

  const handleMoveDown = useCallback((index: number) => {
    if (index === arrayValue.length - 1) return;
    const updated = [...arrayValue];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    onChange(updated);
  }, [arrayValue, onChange]);

  // Helper to get a preview label from an object
  const getObjectLabel = (item: unknown): string => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return '';
    }

    const obj = item as Record<string, unknown>;

    // Try common identifier fields
    const identifierKeys = ['name', 'title', 'label', 'id', 'skill', 'ability', 'type'];
    for (const key of identifierKeys) {
      if (obj[key] && typeof obj[key] === 'string') {
        return String(obj[key]);
      }
    }

    // Try to construct from multiple fields
    if (obj.name && obj.type) {
      return `${obj.name} (${obj.type})`;
    }

    // Fallback to first string property
    for (const [_key, val] of Object.entries(obj)) {
      if (typeof val === 'string' && val.length > 0) {
        return val.length > 40 ? val.substring(0, 40) + '...' : val;
      }
    }

    return '';
  };

  const renderItem = (item: unknown, index: number) => {
    // Handle object items
    if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
      const itemLabel = getObjectLabel(item);

      return (
        <div className="space-y-1 bg-white p-2 rounded border border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-600 font-medium">
              #{index + 1}
              {itemLabel && <span className="text-blue-600 ml-1">• {itemLabel}</span>}
            </span>
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => handleMoveUp(index)}
                disabled={index === 0}
                className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Move up"
              >
                <MoveUp className="w-3 h-3" />
              </button>
              <button
                onClick={() => handleMoveDown(index)}
                disabled={index === arrayValue.length - 1}
                className="p-1 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Move down"
              >
                <MoveDown className="w-3 h-3" />
              </button>
              <button
                onClick={() => handleDeleteItem(index)}
                className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                title="Delete item"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
          <ExpandableObjectEditor
            label={itemLabel || `Item ${index + 1}`}
            value={item as Record<string, unknown>}
            onChange={(newVal) => handleItemChange(index, newVal)}
            path={`${path}[${index}]`}
            defaultExpanded={false}
          />
        </div>
      );
    }

    // Handle primitive items (string, number, boolean)
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600 w-16 flex-shrink-0 font-medium">#{index + 1}</span>
        {detectedItemType === 'number' ? (
          <input
            type="number"
            value={Number(item) || 0}
            onChange={(e) => handleItemChange(index, parseFloat(e.target.value) || 0)}
            className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        ) : (
          <input
            type="text"
            value={String(item || '')}
            onChange={(e) => handleItemChange(index, e.target.value)}
            className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        )}
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleMoveUp(index)}
            disabled={index === 0}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Move up"
          >
            <MoveUp className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleMoveDown(index)}
            disabled={index === arrayValue.length - 1}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Move down"
          >
            <MoveDown className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDeleteItem(index)}
            className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
            title="Delete item"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  };

  const hasItems = arrayValue.length > 0;

  // Get preview of first few items for collapsed view
  const getArrayPreview = (): string => {
    if (!hasItems || arrayValue.length === 0) return '';

    const previews = arrayValue.slice(0, 3).map((item, index) => {
      if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
        const label = getObjectLabel(item);
        return label || `Item ${index + 1}`;
      }
      const str = String(item);
      return str.length > 20 ? str.substring(0, 20) + '...' : str;
    });

    const preview = previews.join(', ');
    if (arrayValue.length > 3) {
      return preview + `, +${arrayValue.length - 3} more`;
    }
    return preview;
  };

  const arrayPreview = getArrayPreview();

  return (
    <div className="border border-gray-300 rounded-md overflow-hidden bg-white">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-200"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-medium text-gray-900 text-sm">{label}</span>
          {!isExpanded && arrayPreview && (
            <span className="text-xs text-blue-600 font-medium truncate">
              {arrayPreview}
            </span>
          )}
          <span className="text-xs text-gray-500 flex-shrink-0">
            ({hasItems ? `${arrayValue.length} ${arrayValue.length === 1 ? 'item' : 'items'}` : 'empty'})
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-600 flex-shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-600 flex-shrink-0" />
        )}
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="p-3 space-y-2 bg-gray-50">
          {/* Existing items */}
          {hasItems ? (
            arrayValue.map((item, index) => (
              <div key={index}>{renderItem(item, index)}</div>
            ))
          ) : (
            <div className="text-sm text-gray-500 italic py-2">
              No items. Add one below.
            </div>
          )}

          {/* Add new item */}
          <div className="pt-2 border-t border-gray-200">
            <button
              onClick={handleAddItem}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add {detectedItemType === 'object' ? 'Object' : detectedItemType === 'number' ? 'Number' : 'Item'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
