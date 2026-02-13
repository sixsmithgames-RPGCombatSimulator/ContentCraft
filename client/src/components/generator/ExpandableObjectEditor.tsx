/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useCallback } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import ExpandableArrayEditor from './ExpandableArrayEditor';

interface ExpandableObjectEditorProps {
  label: string;
  value: Record<string, unknown> | null | undefined;
  onChange: (value: Record<string, unknown> | null) => void;
  path: string;
  defaultExpanded?: boolean;
}

export default function ExpandableObjectEditor({
  label,
  value,
  onChange,
  path,
  defaultExpanded = false,
}: ExpandableObjectEditorProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [newKey, setNewKey] = useState('');
  const [newValueType, setNewValueType] = useState<'string' | 'number' | 'boolean' | 'array' | 'object'>('string');

  const objectValue = value || {};

  const handleFieldChange = useCallback((key: string, newValue: unknown) => {
    const updated = { ...objectValue, [key]: newValue };
    onChange(updated);
  }, [objectValue, onChange]);

  const handleDeleteField = useCallback((key: string) => {
    const updated = { ...objectValue };
    delete updated[key];
    onChange(Object.keys(updated).length > 0 ? updated : null);
  }, [objectValue, onChange]);

  const handleAddField = useCallback(() => {
    if (!newKey.trim()) return;

    let initialValue: unknown;
    switch (newValueType) {
      case 'number':
        initialValue = 0;
        break;
      case 'boolean':
        initialValue = false;
        break;
      case 'array':
        initialValue = [];
        break;
      case 'object':
        initialValue = {};
        break;
      default:
        initialValue = '';
    }

    const updated = { ...objectValue, [newKey.trim()]: initialValue };
    onChange(updated);
    setNewKey('');
  }, [newKey, newValueType, objectValue, onChange]);

  const renderValue = (key: string, val: unknown) => {
    const currentValue = val;

    // Handle null/undefined
    if (currentValue === null || currentValue === undefined) {
      return (
        <input
          type="text"
          value=""
          onChange={(e) => handleFieldChange(key, e.target.value || null)}
          className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="(null)"
        />
      );
    }

    // Handle boolean
    if (typeof currentValue === 'boolean') {
      return (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={currentValue}
            onChange={(e) => handleFieldChange(key, e.target.checked)}
            className="w-4 h-4 text-blue-600"
          />
          <span className="text-sm text-gray-600">{currentValue ? 'true' : 'false'}</span>
        </label>
      );
    }

    // Handle number
    if (typeof currentValue === 'number') {
      return (
        <input
          type="number"
          value={currentValue}
          onChange={(e) => handleFieldChange(key, parseFloat(e.target.value) || 0)}
          className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      );
    }

    // Handle array - render inline, don't show it in this row
    // Arrays will be rendered below as ExpandableArrayEditor
    if (Array.isArray(currentValue)) {
      return (
        <div className="flex-1 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-blue-700 text-sm font-medium">
          {currentValue.length} {currentValue.length === 1 ? 'item' : 'items'} ↓ Expand below to edit
        </div>
      );
    }

    // Handle object (will be rendered as nested ExpandableObjectEditor below)
    if (typeof currentValue === 'object') {
      const objKeys = Object.keys(currentValue as Record<string, unknown>);
      return (
        <div className="flex-1 px-3 py-2 bg-blue-50 border border-blue-200 rounded-md text-blue-700 text-sm font-medium">
          {objKeys.length} {objKeys.length === 1 ? 'property' : 'properties'} ↓ Expand below to edit
        </div>
      );
    }

    // Handle string (default)
    return (
      <input
        type="text"
        value={String(currentValue)}
        onChange={(e) => handleFieldChange(key, e.target.value)}
        className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    );
  };

  const entries = Object.entries(objectValue);
  const hasEntries = entries.length > 0;

  // Extract a preview of the object for collapsed view
  const getObjectPreview = (): string => {
    if (!hasEntries) return '';

    // Try to find a meaningful identifier field
    const identifierKeys = ['name', 'title', 'label', 'id', 'skill', 'ability'];
    for (const key of identifierKeys) {
      if (objectValue[key] && typeof objectValue[key] === 'string') {
        return String(objectValue[key]);
      }
    }

    // Try to find a description field to show partially
    if (objectValue.description && typeof objectValue.description === 'string') {
      const desc = String(objectValue.description);
      return desc.length > 30 ? desc.substring(0, 30) + '...' : desc;
    }

    // If the object is small, show first few key-value pairs
    if (entries.length <= 2) {
      return entries
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? '{...}' : String(v).substring(0, 20)}`)
        .join(', ');
    }

    return '';
  };

  const preview = getObjectPreview();

  return (
    <div className="border border-gray-300 rounded-md overflow-hidden bg-white">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-200"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-medium text-gray-900 text-sm">{label}</span>
          {!isExpanded && preview && (
            <span className="text-xs text-blue-600 font-medium truncate">
              {preview}
            </span>
          )}
          <span className="text-xs text-gray-500 flex-shrink-0">
            ({hasEntries ? `${entries.length} ${entries.length === 1 ? 'property' : 'properties'}` : 'empty'})
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
          {/* Existing fields */}
          {hasEntries ? (
            entries.map(([key, val]) => (
              <div key={key} className="space-y-1">
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-gray-700 w-40 flex-shrink-0">
                    {key}
                  </label>
                  {renderValue(key, val)}
                  <button
                    onClick={() => handleDeleteField(key)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                    title="Delete field"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Nested array editor */}
                {((): JSX.Element | null => {
                  if (!Array.isArray(val)) return null;
                  return (
                    <div className="ml-6 mt-1">
                      <ExpandableArrayEditor
                        label={key}
                        value={val as unknown[]}
                        onChange={(newVal) => handleFieldChange(key, newVal)}
                        path={`${path}.${key}`}
                        defaultExpanded={false}
                        itemType="auto"
                      />
                    </div>
                  );
                })()}

                {/* Nested object editor */}
                {val && typeof val === 'object' && !Array.isArray(val) && (
                  <div className="ml-6 mt-1">
                    <ExpandableObjectEditor
                      label={key}
                      value={val as Record<string, unknown>}
                      onChange={(newVal) => handleFieldChange(key, newVal)}
                      path={`${path}.${key}`}
                      defaultExpanded={false}
                    />
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-sm text-gray-500 italic py-2">
              No properties. Add one below.
            </div>
          )}

          {/* Add new field */}
          <div className="pt-2 border-t border-gray-200">
            <div className="text-xs text-gray-600 mb-2">Add new property:</div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddField();
                  }
                }}
                placeholder="Property name"
                className="flex-1 px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <select
                value={newValueType}
                onChange={(e) => setNewValueType(e.target.value as typeof newValueType)}
                className="px-3 py-2 bg-white border border-gray-300 rounded-md text-gray-900 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="string">String</option>
                <option value="number">Number</option>
                <option value="boolean">Boolean</option>
                <option value="array">Array</option>
                <option value="object">Object</option>
              </select>
              <button
                onClick={handleAddField}
                disabled={!newKey.trim()}
                className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded transition-colors"
                title="Add property"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
