/**
 * Space Approval Modal
 *
 * Shows after each space is generated during iterative location creation.
 * Allows user to Accept, Reject, or Edit the space before continuing.
 *
 * Features:
 * - Review mode: Shows space details with Accept/Edit/Reject buttons
 * - Edit mode: Form-based editor for common fields with fallback to JSON for advanced fields
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle, XCircle, Edit3, AlertCircle, ArrowLeft, Code, X, Plus, Trash2, DoorOpen } from 'lucide-react';
import { validateIncomingLocationSpace } from '../../utils/locationSpaceValidation';
import { validateAllDoors, convertDoorValidationToErrors } from '../../utils/doorSync';
import type { Door, ValidationError } from '../../contexts/locationEditorTypes';
import DoorConflictPanel from './DoorConflictPanel';

interface Space {
  id?: string;
  name?: string;
  purpose?: string;
  description?: string;
  dimensions?: { width?: number; height?: number; unit?: string };
  size_ft?: { width?: number; height?: number };
  floor_height?: number;
  wall_thickness_ft?: number;
  wall_material?: string;
  // Space type - room (default), stairs, etc.
  space_type?: 'room' | 'stairs' | 'corridor';
  // Stairs properties
  stair_type?: 'straight' | 'spiral';
  z_direction?: 'ascending' | 'descending';
  z_connects_to?: string; // Name of space on other floor
  // Shape properties
  shape?: 'rectangle' | 'circle' | 'L-shape' | 'polygon';
  l_cutout_corner?: 'ne' | 'nw' | 'se' | 'sw';
  doors?: Array<{
    wall: 'north' | 'south' | 'east' | 'west';
    position_on_wall_ft: number;
    width_ft: number;
    leads_to: string;
    door_type?: string;
    is_reciprocal?: boolean;
  }>;
  features?: Array<{ label?: string; type?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

interface SpaceApprovalModalProps {
  isOpen: boolean;
  space: Space | null;
  spaceNumber: number;
  totalSpaces: number;
  onAccept: () => void;
  onReject: (reason?: string) => void;
  onEdit: (editedSpace: Space) => void;
  onClose: () => void;
  onPreviousSpace?: () => void;
  onNextSpace?: () => void;
  canGoPrevious?: boolean;
  canGoNext?: boolean;
  isReviewMode?: boolean; // True when reviewing existing space, false when approving new space
  liveMapPanel?: ReactNode; // Optional live map panel to show on the right
  autoEditNewSpace?: boolean; // Auto-enter edit mode for new spaces
  existingSpaceNames?: string[]; // List of existing space names for door "leads to" dropdown
  existingSpaces?: Space[]; // Full space data for AI context
  locationName?: string; // Overall location name/description for context
  onNavigateToEditor?: () => void; // Navigate to Layout/Editor view
}

export default function SpaceApprovalModal({
  isOpen,
  space,
  spaceNumber,
  totalSpaces,
  onAccept,
  onReject,
  onEdit,
  onClose,
  onPreviousSpace,
  onNextSpace,
  canGoPrevious = false,
  canGoNext = false,
  isReviewMode = false,
  liveMapPanel,
  autoEditNewSpace = true,
  existingSpaceNames = [],
  existingSpaces = [],
  locationName = '',
  onNavigateToEditor,
}: SpaceApprovalModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [showJsonEditor, setShowJsonEditor] = useState(false);
  const [showAIPrompt, setShowAIPrompt] = useState(false);
  const [aiDescription, setAiDescription] = useState('');
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(600);
  const [isResizing, setIsResizing] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  // Editable form fields
  const [editedName, setEditedName] = useState('');
  const [editedPurpose, setEditedPurpose] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedWidth, setEditedWidth] = useState('');
  const [editedHeight, setEditedHeight] = useState('');
  const [editedFloorHeight, setEditedFloorHeight] = useState('');
  const [editedWallThickness, setEditedWallThickness] = useState('');
  const [editedWallMaterial, setEditedWallMaterial] = useState('');
  const [editedDoors, setEditedDoors] = useState<Door[]>([]);
  // Stairs properties
  const [editedSpaceType, setEditedSpaceType] = useState<'room' | 'stairs' | 'corridor'>('room');
  const [editedStairType, setEditedStairType] = useState<'straight' | 'spiral'>('straight');
  const [editedZDirection, setEditedZDirection] = useState<'ascending' | 'descending'>('ascending');
  const [editedZConnectsTo, setEditedZConnectsTo] = useState('');
  const [editedShape, setEditedShape] = useState<'rectangle' | 'circle' | 'L-shape' | 'polygon'>('rectangle');
  const [editedLCutout, setEditedLCutout] = useState<'ne' | 'nw' | 'se' | 'sw'>('ne');
  const [jsonString, setJsonString] = useState('');
  const [doorTab, setDoorTab] = useState<'parent' | 'child'>('parent');

  // Handle panel resizing
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX - 16; // 16px for padding
      // Constrain between 300px and 70% of window width
      const maxWidth = Math.min(1000, window.innerWidth * 0.7);
      setPanelWidth(Math.max(300, Math.min(maxWidth, newWidth)));
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing]);

  // NEW: Sync form state when space prop changes
  useEffect(() => {
    if (!space) return;

    // Re-initialize form whenever space prop updates
    // This ensures form shows latest data from either:
    // - Navigation between spaces
    // - Map editor updates
    // - External state changes
    setEditedName(space.name || '');
    setEditedPurpose(space.purpose || '');
    setEditedDescription(space.description || '');
    setEditedWidth(String(space.dimensions?.width || space.size_ft?.width || ''));
    setEditedHeight(String(space.dimensions?.height || space.size_ft?.height || ''));
    setEditedFloorHeight(String(space.floor_height || ''));
    setEditedWallThickness(String(typeof space.wall_thickness_ft === 'number' ? space.wall_thickness_ft : ''));
    setEditedWallMaterial(String(space.wall_material || ''));
    setEditedDoors(Array.isArray(space.doors) ? [...space.doors] : []);
    setEditedSpaceType(space.space_type || 'room');
    setEditedStairType(space.stair_type || 'straight');
    setEditedZDirection(space.z_direction || 'ascending');
    setEditedZConnectsTo(space.z_connects_to || '');
    setEditedShape(space.shape || 'rectangle');
    setEditedLCutout(space.l_cutout_corner || 'ne');
    setJsonString(JSON.stringify(space, null, 2));

    console.log('[SpaceApprovalModal] Form synced with space prop:', space.name);

    // Run validation on current space
    const validationResults = validateAllDoors([space as any]);
    const errors = convertDoorValidationToErrors(validationResults);
    setValidationErrors(errors);
    console.log('[SpaceApprovalModal] Validation:', errors.length, 'error(s) found');

    // Auto-enter edit mode for new/blank spaces
    if (autoEditNewSpace && !space.purpose && !space.description) {
      console.log('[SpaceApprovalModal] New blank space detected, auto-entering edit mode');
      setIsEditing(true);
    }
  }, [space, autoEditNewSpace]); // ← Dependency: re-run when space changes

  // Real-time validation when doors are edited in the form
  useEffect(() => {
    if (!space || !isEditing) return;

    // Create a temp space with current edited doors for validation
    const tempSpace = { ...space, doors: editedDoors };
    const validationResults = validateAllDoors([tempSpace as any]);
    const errors = convertDoorValidationToErrors(validationResults);
    setValidationErrors(errors);

    console.log('[SpaceApprovalModal] Real-time validation:', errors.length, 'error(s) found');
  }, [editedDoors, isEditing]); // Re-validate when doors change in edit mode

  if (!isOpen || !space) return null;

  // Enter edit mode (form already synced via useEffect)
  const handleEnterEditMode = () => {
    // Form already synced via useEffect - just enable editing
    setIsEditing(true);
    console.log('[SpaceApprovalModal] Entered edit mode');
  };

  // Save edits from form
  const handleSaveFormEdits = () => {
    const width = parseFloat(editedWidth) || 0;
    const height = parseFloat(editedHeight) || 0;
    const wallThickness = editedWallThickness.trim().length > 0 ? (parseFloat(editedWallThickness) || 0) : undefined;
    const wallMaterial = editedWallMaterial.trim().length > 0 ? editedWallMaterial.trim() : undefined;

    const editedSpace: Space = {
      ...space,
      name: editedName,
      purpose: editedPurpose,
      description: editedDescription,
      // Set BOTH dimensions AND size_ft for compatibility
      dimensions: {
        width,
        height,
        unit: space.dimensions?.unit || 'ft',
      },
      size_ft: {
        width,
        height,
      },
      floor_height: parseFloat(editedFloorHeight) || 0,
      wall_thickness_ft: wallThickness,
      wall_material: wallMaterial,
      doors: editedDoors,
      // Space type and stairs properties
      space_type: editedSpaceType,
      ...(editedSpaceType === 'stairs' ? {
        stair_type: editedStairType,
        z_direction: editedZDirection,
        z_connects_to: editedZConnectsTo || undefined,
      } : {}),
      // Shape properties
      shape: editedShape,
      ...(editedShape === 'L-shape' ? {
        l_cutout_corner: editedLCutout,
      } : {}),
    };

    console.log('[SpaceApprovalModal] Saving edited space:', {
      name: editedSpace.name,
      dimensions: editedSpace.dimensions,
      size_ft: editedSpace.size_ft,
      floor_height: editedSpace.floor_height,
      shape: editedSpace.shape,
      space_type: editedSpace.space_type,
    });

    // Validate all doors before saving
    const doorValidation = validateAllDoors([editedSpace as any]);
    if (doorValidation.length > 0) {
      const errorMessages = doorValidation.map(v =>
        `Door ${v.doorIndex + 1} in ${v.spaceName}:\n  ${v.validation.errors.join('\n  ')}`
      ).join('\n\n');
      alert(`Cannot save space due to door validation errors:\n\n${errorMessages}\n\nPlease fix the door positions/widths before saving.`);
      return;
    }

    onEdit(editedSpace);
    setIsEditing(false);
  };

  /**
   * Save edits from JSON editor
   * Shows inline error instead of alert() for invalid JSON
   */
  const handleSaveJsonEdits = () => {
    try {
      const parsed = JSON.parse(jsonString);

      const validation = validateIncomingLocationSpace(parsed, {
        requireFeaturePositionAnchor: true,
      });
      if (!validation.ok) {
        setJsonError(validation.error);
        return;
      }

      setJsonError(null);
      onEdit(parsed);
      setIsEditing(false);
      setShowJsonEditor(false);
    } catch (e) {
      // Show inline error message instead of alert()
      setJsonError(e instanceof Error ? e.message : 'Invalid JSON syntax');
    }
  };

  // Cancel editing
  const handleCancelEdit = () => {
    setIsEditing(false);
    setShowJsonEditor(false);
    setShowAIPrompt(false);
  };

  // Remove a door to resolve conflict
  const handleRemoveDoor = (spaceName: string, doorIndex: number) => {
    if (!space || space.name !== spaceName) {
      console.error(`[SpaceApprovalModal] Cannot remove door: space mismatch (${space?.name} vs ${spaceName})`);
      return;
    }

    const updatedDoors = editedDoors.filter((_, idx) => idx !== doorIndex);
    setEditedDoors(updatedDoors);

    // Re-validate after removal
    const updatedSpace = { ...space, doors: updatedDoors };
    const validationResults = validateAllDoors([updatedSpace as any]);
    const errors = convertDoorValidationToErrors(validationResults);
    setValidationErrors(errors);

    console.log(`[SpaceApprovalModal] Removed door ${doorIndex} from ${spaceName}. ${errors.length} error(s) remaining.`);
  };

  // Relocate a door to resolve conflict
  const handleRelocateDoor = (spaceName: string, doorIndex: number, newPosition: number) => {
    if (!space || space.name !== spaceName) {
      console.error(`[SpaceApprovalModal] Cannot relocate door: space mismatch (${space?.name} vs ${spaceName})`);
      return;
    }

    const updatedDoors = [...editedDoors];
    if (doorIndex >= 0 && doorIndex < updatedDoors.length) {
      updatedDoors[doorIndex] = {
        ...updatedDoors[doorIndex],
        position_on_wall_ft: newPosition,
      };
      setEditedDoors(updatedDoors);

      // Re-validate after relocation
      const updatedSpace = { ...space, doors: updatedDoors };
      const validationResults = validateAllDoors([updatedSpace as any]);
      const errors = convertDoorValidationToErrors(validationResults);
      setValidationErrors(errors);

      console.log(`[SpaceApprovalModal] Relocated door ${doorIndex} in ${spaceName} to ${newPosition.toFixed(1)}ft. ${errors.length} error(s) remaining.`);
    }
  };

  // Generate AI prompt from description
  const generateAIPrompt = () => {
    // Detect if user wants multiple spaces
    const wantsMultiple = /\b(rooms|spaces|areas|chambers|corridors|halls)\b/i.test(aiDescription) &&
                          !/\b(one|single|a)\s+(room|space|area|chamber|corridor|hall)\b/i.test(aiDescription);

    // Build context about existing spaces INCLUDING spatial layout
    let existingSpacesContext = '';
    if (existingSpaces && existingSpaces.length > 0) {
      // Analyze spatial relationships from doors
      const spatialConnections: Map<string, string[]> = new Map();
      existingSpaces.forEach(space => {
        const spaceName = space.name || '';
        if (!spaceName) return;

        const doors = space.doors || [];
        const connections: string[] = [];
        doors.forEach((d: unknown) => {
          const door = d as { wall?: string; leads_to?: string };
          if (door.wall && door.leads_to && door.leads_to !== 'Pending') {
            connections.push(`${door.wall} → ${door.leads_to}`);
          }
        });
        if (connections.length > 0) {
          spatialConnections.set(spaceName, connections);
        }
      });

      existingSpacesContext = `\n\nEXISTING SPACES IN THIS LOCATION (${existingSpaces.length} spaces - DO NOT duplicate these):

${existingSpaces.map((s, idx) => {
  const name = s.name || `Space ${idx + 1}`;
  const purpose = s.purpose || 'Unknown purpose';
  const size = s.size_ft ? `${s.size_ft.width}×${s.size_ft.height} ft` :
               s.dimensions ? `${s.dimensions.width}×${s.dimensions.height} ft` : 'Unknown size';
  const doors = s.doors ? s.doors.map((d: unknown) => {
    const door = d as { wall?: string; leads_to?: string; position_on_wall_ft?: number };
    const positionFt = door.position_on_wall_ft ?? 0;
    return `${door.wall} wall at ${positionFt.toFixed(1)}ft → ${door.leads_to}`;
  }).join(', ') : 'No doors';

  // Add spatial relationship hints
  const connections = spatialConnections.get(name);
  const adjacentSpaces = connections ?
    `\n   Adjacent to: ${connections.map(c => c.split(' → ')[1]).join(', ')}` : '';

  return `${idx + 1}. ${name}
   Purpose: ${purpose}
   Size: ${size}
   Doors: ${doors}${adjacentSpaces}`;
}).join('\n\n')}

SPATIAL LAYOUT ANALYSIS:
${Array.from(spatialConnections.entries()).map(([space, connections]) =>
  `- ${space}: ${connections.join(', ')}`
).join('\n')}

LAYOUT HINTS (use these to understand where gaps exist):
- Spaces with "Pending" doors have walls that need connections
- Consider which walls are exposed vs. which are connected
- New spaces should fill architectural gaps and create logical flow`;
    }

    const quantityInstruction = wantsMultiple
      ? `Generate MULTIPLE spaces as requested (output as JSON array of space objects).
Based on the user description, determine how many spaces make sense (typically 2-5).`
      : `Generate ONE space as STRICT JSON object.`;

    const outputFormatInstruction = wantsMultiple
      ? `Output must be a JSON ARRAY of space objects: [{ space1 }, { space2 }, ...]
No markdown code fences, no commentary - just the array.`
      : `Output must be a single JSON object only (no markdown, no code fences, no commentary).`;

    const prompt = `${quantityInstruction}

LOCATION CONTEXT:
${locationName ? `Location: ${locationName}` : 'Location name not specified'}
${existingSpacesContext}

USER DESCRIPTION:
${aiDescription}

CRITICAL REQUIREMENTS:
1. DO NOT duplicate any existing spaces listed above
2. Ensure new spaces are purposeful and fit the location's theme
3. Consider spatial relationships - which existing spaces should doors connect to?
4. Make sure door "leads_to" fields reference EXACT names from existing spaces (or "Pending" for spaces not yet created)

CURRENT SETTINGS (use these as defaults unless user description overrides them):
- size: ${editedWidth || 20}×${editedHeight || 20} ft
- space_type: ${editedSpaceType}
- shape: ${editedShape}
${editedSpaceType === 'stairs' ? `- stair_type: ${editedStairType}
- z_direction: ${editedZDirection}` : ''}

CRITICAL SCHEMA RULES (DO NOT VIOLATE):
1) Units: ALL measurements are FEET.
2) Doors:
   - Use: position_on_wall_ft (absolute feet from wall start) and width_ft.
   - Do NOT use door.position or door.width.
   - position_on_wall_ft is the CENTER of the door in feet from the start of the wall (e.g., 10ft on a 20ft wall places door center at 10ft)
   - For initial placement, use 50% of wall length (e.g., 20ft wall → start at 10ft)
3) Features:
   - feature.position is the CENTER POINT in feet, relative to the room's top-left corner.
   - You MUST include: position_anchor: "center" for every feature.
   - Rectangle features MUST include width and height (feet).
   - Circle features MUST include radius (feet) and MUST NOT use width/height.
   - Feature geometry must fit fully within the room bounds.
   - Do NOT use position_ft for features.
4) ${outputFormatInstruction}

REQUIRED JSON FORMAT ${wantsMultiple ? '(for each space in array)' : ''}:
{
  "name": "Space Name",
  "purpose": "Brief purpose",
  "description": "Detailed description",
  "dimensions": { "width": number, "height": number, "unit": "ft" },
  "size_ft": { "width": number, "height": number },
  "floor_height": number,
  "space_type": "${editedSpaceType}",
  "shape": "${editedShape}",
  ${editedSpaceType === 'stairs' ? `"stair_type": "${editedStairType}",
  "z_direction": "${editedZDirection}",
  "z_connects_to": "Name of connected floor",` : ''}
  "doors": [
    { "wall": "north|south|east|west", "position_on_wall_ft": 0.5, "width_ft": 4, "leads_to": "Pending|Exact Connected Space Name", "door_type": "standard" }
  ],
  "features": [
    { "type": "furniture|architectural|fixture", "label": "Short Label", "shape": "rectangle", "position_anchor": "center", "position": { "x": 10, "y": 8 }, "width": 6, "height": 3, "material": "wood|stone|metal|cloth", "color": "#888888" },
    { "type": "fixture", "label": "Fountain", "shape": "circle", "position_anchor": "center", "position": { "x": 12, "y": 12 }, "radius": 3, "material": "stone", "color": "#999999" }
  ]
}

IMPORTANT REMINDERS:
- Each space MUST have a unique name (different from existing spaces)
- Doors should connect logically to existing spaces where appropriate
- Consider the architectural flow and purpose of each space
- floor_height should typically be 10-15 feet for normal rooms, 20-30 feet for grand halls`;

    setGeneratedPrompt(prompt);
  };

  // Handle rejection - show rejection form
  const handleRejectClick = () => {
    setIsRejecting(true);
  };

  // Confirm rejection with reason
  const handleConfirmReject = () => {
    onReject(rejectionReason.trim() || undefined);
    setIsRejecting(false);
    setRejectionReason('');
  };

  // Cancel rejection
  const handleCancelReject = () => {
    setIsRejecting(false);
    setRejectionReason('');
  };

  const dimensions = space.dimensions || {};
  const width = dimensions.width || '?';
  const height = dimensions.height || '?';
  const unit = dimensions.unit || 'ft';

  return (
    <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 ${isResizing ? 'cursor-col-resize select-none' : ''}`}>
      <div className={`bg-white rounded-lg shadow-xl w-full max-h-[90vh] flex ${liveMapPanel ? 'max-w-7xl flex-row gap-0' : 'max-w-2xl flex-col'} overflow-hidden ${isResizing ? 'select-none' : ''}`}>
        {/* Main Modal Content */}
        <div className={`flex flex-col ${liveMapPanel ? 'flex-1 min-w-0' : 'w-full'}`}>
        {/* Header */}
        <div className={`${isRejecting ? 'bg-red-600' : 'bg-blue-600'} text-white p-4 flex items-start justify-between`}>
          <div>
            <h2 className="text-xl font-bold">
              {isRejecting ? 'Reject Space' : isEditing ? 'Edit Space' : 'Review Generated Space'}
            </h2>
            <p className="text-sm text-blue-100 mt-1">
              Space {spaceNumber} of {totalSpaces}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-white hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-scroll flex-1">
          {isRejecting ? (
            // REJECTION MODE
            <div className="space-y-4">
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-700">
                  <p className="font-medium">You're about to reject this space</p>
                  <p className="mt-1">The AI will regenerate this space with your feedback. Be specific about what's wrong to get better results.</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Why are you rejecting this space? (Optional but recommended)
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                  placeholder="Example: This is a guard post, which I didn't request. I only want the 3 rooms I specified: Kitchen, Main Hallway, and Grand Banquet Hall."
                  autoFocus
                />
                <p className="mt-1 text-xs text-gray-500">
                  Specific feedback helps the AI understand what you want and improves future generations.
                </p>
              </div>

              {/* Show space summary for context */}
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                <div className="text-sm font-medium text-gray-700 mb-2">Space being rejected:</div>
                <div className="text-sm text-gray-600">
                  <div><span className="font-medium">Name:</span> {space.name || 'Unnamed'}</div>
                  <div><span className="font-medium">Purpose:</span> {space.purpose || 'N/A'}</div>
                  <div><span className="font-medium">Dimensions:</span> {width} × {height} {unit}</div>
                </div>
              </div>
            </div>
          ) : !isEditing ? (
            // REVIEW MODE
            <div className="space-y-4">
              {/* Space Name */}
              <div>
                <div className="text-sm font-medium text-gray-500">Name</div>
                <div className="text-lg font-semibold text-gray-800">{space.name || 'Unnamed Space'}</div>
              </div>

              {/* Dimensions */}
              <div>
                <div className="text-sm font-medium text-gray-500">Dimensions</div>
                <div className="text-base text-gray-800">
                  {width} × {height} {unit}
                  {space.floor_height && ` (height: ${space.floor_height}${unit})`}
                </div>
              </div>

              {/* Purpose */}
              {space.purpose && (
                <div>
                  <div className="text-sm font-medium text-gray-500">Purpose</div>
                  <div className="text-base text-gray-800">{space.purpose}</div>
                </div>
              )}

              {/* Description */}
              {space.description && (
                <div>
                  <div className="text-sm font-medium text-gray-500">Description</div>
                  <div className="text-base text-gray-700 leading-relaxed">{space.description}</div>
                </div>
              )}

              {/* Doors */}
              {Array.isArray(space.doors) && space.doors.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-500 mb-2">Doors ({space.doors.length})</div>
                  <div className="space-y-1">
                    {space.doors.map((door, index) => (
                      <div key={index} className="text-sm text-gray-700 bg-gray-50 p-2 rounded">
                        {door.wall || '?'} wall → leads to: <span className="font-medium">{door.leads_to || 'Unknown'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Features */}
              {Array.isArray(space.features) && space.features.length > 0 && (
                <div>
                  <div className="text-sm font-medium text-gray-500 mb-2">Features ({space.features.length})</div>
                  <div className="flex flex-wrap gap-2">
                    {space.features.map((feature, index) => (
                      <div key={index} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                        {feature.label || feature.type || 'Feature'}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Door Conflicts (Review Mode) */}
              {validationErrors.length > 0 && (
                <DoorConflictPanel
                  validationErrors={validationErrors}
                  compact={true}
                  className="mb-4"
                />
              )}

              {/* Warning */}
              <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-yellow-700">
                  <p className="font-medium">Review Carefully</p>
                  <p className="mt-1">Make sure this space matches your floor plan specifications. If the AI added a room you didn't request, click Reject.</p>
                </div>
              </div>
            </div>
          ) : (
            // EDIT MODE
            <div className="space-y-4">
              {/* Door Conflicts (Edit Mode) - Full Display with Fix Buttons */}
              {validationErrors.length > 0 && (
                <DoorConflictPanel
                  validationErrors={validationErrors}
                  onRemoveDoor={handleRemoveDoor}
                  onRelocateDoor={handleRelocateDoor}
                  compact={false}
                  className="mb-4"
                />
              )}

              {/* Mode tabs */}
              <div className="flex items-center gap-2 border-b border-gray-200 pb-2 mb-4">
                <button
                  onClick={() => { setShowJsonEditor(false); setShowAIPrompt(false); }}
                  className={`px-3 py-1.5 text-sm rounded ${!showJsonEditor && !showAIPrompt ? 'bg-blue-100 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  Form Editor
                </button>
                <button
                  onClick={() => { setShowAIPrompt(true); setShowJsonEditor(false); }}
                  className={`px-3 py-1.5 text-sm rounded ${showAIPrompt ? 'bg-purple-100 text-purple-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  🤖 AI Assist
                </button>
                <button
                  onClick={() => { setShowJsonEditor(true); setShowAIPrompt(false); }}
                  className={`px-3 py-1.5 text-sm rounded flex items-center gap-1 ${showJsonEditor ? 'bg-gray-200 text-gray-800 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                  <Code className="w-4 h-4" />
                  JSON
                </button>
              </div>

              {showAIPrompt ? (
                // AI ASSIST MODE
                <div className="space-y-4">
                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h4 className="font-medium text-purple-800 mb-2">AI-Assisted Space Creation</h4>
                    <p className="text-sm text-purple-700 mb-3">
                      Describe what you want, then copy the generated prompt to your AI assistant. Paste the JSON response back into the JSON tab.
                    </p>
                    
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Describe This Space
                    </label>
                    <textarea
                      value={aiDescription}
                      onChange={(e) => setAiDescription(e.target.value)}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-y mb-3"
                      placeholder="e.g., A grand spiral staircase made of white marble, connecting the main hall to the upper gallery. Should have ornate iron railings with gold leaf accents..."
                    />
                    
                    <button
                      onClick={generateAIPrompt}
                      disabled={!aiDescription.trim()}
                      className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Generate AI Prompt
                    </button>
                  </div>

                  {generatedPrompt && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-800">Copy This Prompt to AI:</h4>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(generatedPrompt);
                            // After copying, automatically switch to JSON tab for pasting the response
                            setShowAIPrompt(false);
                            setShowJsonEditor(true);
                            setJsonString('');
                          }}
                          className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          📋 Copy Prompt
                        </button>
                      </div>
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap bg-white p-3 border rounded max-h-60 overflow-auto">
                        {generatedPrompt}
                      </pre>
                      <p className="text-sm text-gray-600 mt-3">
                        After getting the AI response, switch to the <strong>JSON</strong> tab and paste the result there.
                      </p>
                    </div>
                  )}
                </div>
              ) : !showJsonEditor ? (
                // FORM EDITOR
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-gray-700">Edit Space Details</h3>
                  </div>

                  {/* Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name
                    </label>
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="e.g., Grand Banquet Hall"
                    />
                  </div>

                  {/* Purpose - Multi-line */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Purpose
                    </label>
                    <textarea
                      value={editedPurpose}
                      onChange={(e) => setEditedPurpose(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                      placeholder="e.g., Primary ceremonial space for gatherings and feasts"
                    />
                  </div>

                  {/* Description - Taller */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={editedDescription}
                      onChange={(e) => setEditedDescription(e.target.value)}
                      rows={5}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
                      placeholder="Describe this space in detail..."
                    />
                  </div>

                  {/* Dimensions */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Width (ft)
                      </label>
                      <input
                        type="number"
                        value={editedWidth}
                        onChange={(e) => setEditedWidth(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="200"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Height (ft)
                      </label>
                      <input
                        type="number"
                        value={editedHeight}
                        onChange={(e) => setEditedHeight(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="250"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Floor Height (ft)
                      </label>
                      <input
                        type="number"
                        value={editedFloorHeight}
                        onChange={(e) => setEditedFloorHeight(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="20"
                      />
                    </div>
                  </div>

                  <div className="border-t border-gray-200 pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Wall Thickness (ft)
                        </label>
                        <input
                          type="number"
                          value={editedWallThickness}
                          onChange={(e) => setEditedWallThickness(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="1"
                          min="0.5"
                          max="10"
                          step="0.5"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Wall Material
                        </label>
                        <input
                          type="text"
                          value={editedWallMaterial}
                          onChange={(e) => setEditedWallMaterial(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="stone"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Space Type Section */}
                  <div className="border-t border-gray-200 pt-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Space Type
                        </label>
                        <select
                          value={editedSpaceType}
                          onChange={(e) => setEditedSpaceType(e.target.value as 'room' | 'stairs' | 'corridor')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="room">Room</option>
                          <option value="stairs">Stairs</option>
                          <option value="corridor">Corridor</option>
                        </select>
                      </div>

                      {/* Shape selector */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Shape
                        </label>
                        <select
                          value={editedShape}
                          onChange={(e) => setEditedShape(e.target.value as 'rectangle' | 'circle' | 'L-shape' | 'polygon')}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="rectangle">Rectangle</option>
                          <option value="circle">Circle</option>
                          <option value="L-shape">L-Shape</option>
                        </select>
                      </div>

                      {/* L-shape cutout corner */}
                      {editedShape === 'L-shape' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Cutout Corner
                          </label>
                          <select
                            value={editedLCutout}
                            onChange={(e) => setEditedLCutout(e.target.value as 'ne' | 'nw' | 'se' | 'sw')}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="ne">Northeast ↗</option>
                            <option value="nw">Northwest ↖</option>
                            <option value="se">Southeast ↘</option>
                            <option value="sw">Southwest ↙</option>
                          </select>
                        </div>
                      )}
                      
                      {/* Stairs-specific options */}
                      {editedSpaceType === 'stairs' && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Stair Type
                            </label>
                            <select
                              value={editedStairType}
                              onChange={(e) => setEditedStairType(e.target.value as 'straight' | 'spiral')}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="straight">Straight</option>
                              <option value="spiral">Spiral</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Z Direction
                            </label>
                            <select
                              value={editedZDirection}
                              onChange={(e) => setEditedZDirection(e.target.value as 'ascending' | 'descending')}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="ascending">↑ Ascending (Up)</option>
                              <option value="descending">↓ Descending (Down)</option>
                            </select>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Connects To (other floor)
                            </label>
                            <input
                              type="text"
                              value={editedZConnectsTo}
                              onChange={(e) => setEditedZConnectsTo(e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              placeholder="e.g., Upper Landing, Basement Entry"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Doors Section */}
                  <div className="border-t border-gray-200 pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
                        <DoorOpen className="w-4 h-4" />
                        Doors ({editedDoors.length})
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          // Calculate default position at center of north wall (50%)
                          const width = parseFloat(editedWidth) || 20;
                          const defaultPosition = width / 2;

                          setEditedDoors([
                            ...editedDoors,
                            { wall: 'north', position_on_wall_ft: defaultPosition, width_ft: 4, leads_to: '', door_type: 'standard' },
                          ]);
                        }}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded hover:bg-blue-100"
                      >
                        <Plus className="w-3 h-3" />
                        Add Door
                      </button>
                    </div>

                    {/* Door Tabs */}
                    <div className="flex gap-1 mb-3 border-b border-gray-200">
                      <button
                        type="button"
                        onClick={() => setDoorTab('parent')}
                        className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                          doorTab === 'parent'
                            ? 'bg-emerald-50 text-emerald-700 border-b-2 border-emerald-500'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        🚪 Parent Doors
                        <span className="ml-1 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                          {editedDoors.filter(d => d.is_reciprocal !== true).length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDoorTab('child')}
                        className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                          doorTab === 'child'
                            ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        🔄 Child Doors
                        <span className="ml-1 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                          {editedDoors.filter(d => d.is_reciprocal === true).length}
                        </span>
                      </button>
                    </div>

                    {(() => {
                      const parentDoors = editedDoors.filter(d => d.is_reciprocal !== true);
                      const childDoors = editedDoors.filter(d => d.is_reciprocal === true);
                      const displayDoors = doorTab === 'parent' ? parentDoors : childDoors;

                      if (displayDoors.length === 0) {
                        return doorTab === 'parent' ? (
                          <p className="text-xs text-gray-500 italic">No parent doors. Click "Add Door" to create one.</p>
                        ) : (
                          <div className="text-xs text-gray-500 text-center py-3 bg-blue-50 rounded border border-blue-200">
                            <p className="font-medium text-blue-700 mb-1">🔄 No child doors yet</p>
                            <p className="text-[10px] text-gray-600">
                              Child doors are automatically created when another room has a door leading here.
                            </p>
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-3 max-h-[200px] overflow-y-auto">
                          {displayDoors.map((door) => {
                            const index = editedDoors.indexOf(door);
                            const isChild = door.is_reciprocal === true;
                            return (
                          <div key={index} className={`p-3 rounded-md ${isChild ? 'bg-blue-50 border-2 border-blue-300' : 'bg-emerald-50 border-2 border-emerald-300'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex-1">
                                <span className={`text-xs font-semibold ${isChild ? 'text-blue-900' : 'text-emerald-900'}`}>
                                  {isChild ? 'Child' : 'Parent'} Door {doorTab === 'parent' ? parentDoors.indexOf(door) + 1 : childDoors.indexOf(door) + 1}
                                </span>
                                {isChild && (
                                  <p className="text-[10px] text-blue-700 mt-1">
                                    🔄 Auto-created from <strong>{door.leads_to}</strong>. Position is editable to prevent conflicts.
                                  </p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditedDoors(editedDoors.filter((_, i) => i !== index));
                                }}
                                className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                                title={isChild ? "Remove door (will also remove parent)" : "Remove door"}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Wall</label>
                                <select
                                  value={door.wall}
                                  onChange={(e) => {
                                    const updated = [...editedDoors];
                                    updated[index] = { ...door, wall: e.target.value as 'north' | 'south' | 'east' | 'west' };
                                    setEditedDoors(updated);
                                  }}
                                  disabled={isChild}
                                  className={`w-full px-2 py-1 text-sm border rounded focus:ring-1 ${
                                    isChild
                                      ? 'border-blue-200 bg-blue-100 text-blue-700 cursor-not-allowed'
                                      : 'border-emerald-300 focus:ring-emerald-500'
                                  }`}
                                >
                                  <option value="north">North</option>
                                  <option value="south">South</option>
                                  <option value="east">East</option>
                                  <option value="west">West</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">Width (ft) {isChild && '(editable)'}</label>
                                <input
                                  type="number"
                                  value={door.width_ft}
                                  onChange={(e) => {
                                    const updated = [...editedDoors];
                                    updated[index] = { ...door, width_ft: parseFloat(e.target.value) || 4 };
                                    setEditedDoors(updated);
                                  }}
                                  className={`w-full px-2 py-1 text-sm border rounded focus:ring-1 ${
                                    isChild
                                      ? 'border-blue-300 bg-white text-blue-900 focus:ring-blue-500'
                                      : 'border-emerald-300 focus:ring-emerald-500'
                                  }`}
                                  min="1"
                                  max="20"
                                />
                              </div>
                              <div className="col-span-2">
                                {(() => {
                                  // Calculate wall length based on door wall direction
                                  const wall = door.wall?.toLowerCase();
                                  const width = parseFloat(editedWidth) || 20;
                                  const height = parseFloat(editedHeight) || 20;
                                  const wallLength = (wall === 'north' || wall === 'south') ? width : height;

                                  // Door position represents center, so account for door width
                                  const doorWidth = door.width_ft || 4;
                                  const doorHalfWidth = doorWidth / 2;
                                  const minPos = doorHalfWidth;
                                  const maxPos = wallLength - doorHalfWidth;
                                  const currentPos = door.position_on_wall_ft || (wallLength / 2);

                                  return (
                                    <>
                                      <label className="block text-xs text-gray-500 mb-1">
                                        Position (ft, door center): {currentPos.toFixed(1)}ft {isChild && '(editable)'}
                                      </label>
                                      <input
                                        type="range"
                                        min={minPos}
                                        max={maxPos}
                                        step="2.5"
                                        value={currentPos}
                                        onChange={(e) => {
                                          const updated = [...editedDoors];
                                          updated[index] = { ...door, position_on_wall_ft: parseFloat(e.target.value) };
                                          setEditedDoors(updated);
                                        }}
                                        className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${isChild ? 'bg-blue-200' : 'bg-gray-200'}`}
                                      />
                                      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                                        <span>{minPos.toFixed(1)}ft</span>
                                        <span>Wall: {wallLength}ft</span>
                                        <span>{maxPos.toFixed(1)}ft</span>
                                      </div>
                                    </>
                                  );
                                })()}
                              </div>
                              <div className="col-span-2">
                                <label className="block text-xs text-gray-500 mb-1">Leads To {isChild && '(Parent Room)'}</label>
                                <select
                                  value={door.leads_to}
                                  onChange={(e) => {
                                    const updated = [...editedDoors];
                                    updated[index] = { ...door, leads_to: e.target.value };
                                    setEditedDoors(updated);
                                  }}
                                  disabled={isChild}
                                  className={`w-full px-2 py-1 text-sm border rounded focus:ring-1 ${
                                    isChild
                                      ? 'border-blue-200 bg-blue-100 text-blue-700 cursor-not-allowed'
                                      : 'border-emerald-300 focus:ring-emerald-500'
                                  }`}
                                >
                                  <option value="">-- Select Destination --</option>
                                  <option value="Pending">📋 Pending (not yet created)</option>
                                  <option value="Outside">🚪 Outside</option>
                                  {existingSpaceNames.length > 0 && (
                                    <optgroup label="Existing Spaces">
                                      {existingSpaceNames
                                        .filter(name => name !== space?.name)
                                        .map(name => (
                                          <option key={name} value={name}>{name}</option>
                                        ))
                                      }
                                    </optgroup>
                                  )}
                                </select>
                                {door.leads_to && 
                                 door.leads_to !== 'Pending' && 
                                 door.leads_to !== 'Outside' &&
                                 !existingSpaceNames.includes(door.leads_to) && (
                                  <p className="text-xs text-amber-600 mt-1">
                                    ⚠️ "{door.leads_to}" doesn't exist yet
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </>
              ) : (
                // JSON EDITOR
                <>
                  <div className="flex items-center gap-2 mb-4">
                    <button
                      onClick={() => setShowJsonEditor(false)}
                      className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back to Form
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Edit JSON (Advanced)
                    </label>
                    <textarea
                      value={jsonString}
                      onChange={(e) => {
                        setJsonString(e.target.value);
                        setJsonError(null); // Clear error when user edits
                      }}
                      rows={20}
                      className={`w-full px-3 py-2 border rounded-md focus:ring-2 font-mono text-xs resize-none ${
                        jsonError
                          ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                          : 'border-gray-300 focus:ring-blue-500 focus:border-blue-500'
                      }`}
                    />
                  </div>

                  {/* JSON Error Message - replaces alert() */}
                  {jsonError && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
                      <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-xs font-medium text-red-800">Invalid JSON</p>
                        <p className="text-xs text-red-700 mt-1">{jsonError}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                    <AlertCircle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-yellow-700">
                      Make sure your JSON is valid. Invalid syntax will prevent saving.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Navigation row (if applicable) */}
        {(canGoPrevious || canGoNext) && !isRejecting && !isEditing && (
          <div className="border-t border-gray-200 px-4 py-2 bg-gray-100 flex justify-between items-center">
            <button
              onClick={onPreviousSpace}
              disabled={!canGoPrevious}
              className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              <span>←</span> Previous Space
            </button>
            <span className="text-xs text-gray-500">
              Reviewing {spaceNumber} of {totalSpaces}
            </span>
            <button
              onClick={onNextSpace}
              disabled={!canGoNext}
              className="px-3 py-1 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              Next Space <span>→</span>
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="border-t border-gray-200 p-4 bg-gray-50 flex gap-3">
          {isRejecting ? (
            // Rejection mode buttons
            <>
              <button
                onClick={handleCancelReject}
                className="flex-1 px-3 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={handleConfirmReject}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors"
              >
                <XCircle className="w-4 h-4" />
                Confirm Rejection
              </button>
            </>
          ) : !isEditing ? (
            // Review mode buttons
            <>
              <button
                onClick={onAccept}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                {isReviewMode ? 'Done Reviewing' : 'Accept & Continue'}
              </button>

              {/* Show "Go to Layout/Editor" button when in review mode and callback is provided */}
              {isReviewMode && onNavigateToEditor && (
                <button
                  onClick={onNavigateToEditor}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 transition-colors"
                >
                  <DoorOpen className="w-4 h-4" />
                  Go to Layout/Editor
                </button>
              )}

              <button
                onClick={handleEnterEditMode}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
              >
                <Edit3 className="w-4 h-4" />
                Edit
              </button>

              {/* Only show Reject button when approving new space, not when reviewing existing */}
              {!isReviewMode && (
                <button
                  onClick={handleRejectClick}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  Reject
                </button>
              )}
            </>
          ) : (
            // Edit mode buttons
            <>
              <button
                onClick={handleCancelEdit}
                className="flex-1 px-3 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>

              <button
                onClick={showJsonEditor ? handleSaveJsonEdits : handleSaveFormEdits}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                Save & Accept
              </button>
            </>
          )}
        </div>
        </div>
        {/* End Main Modal Content */}

        {/* Live Map Panel (Right Side) */}
        {liveMapPanel && (
          <>
            {/* Resize Handle */}
            <div
              className="w-1 bg-gray-300 hover:bg-blue-500 cursor-col-resize flex-shrink-0 relative group"
              onMouseDown={() => setIsResizing(true)}
            >
              <div className="absolute inset-y-0 -inset-x-1" /> {/* Wider hit area */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-12 bg-gray-400 rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* Panel Content */}
            <div className="border-l border-gray-200 flex flex-col max-h-[90vh] overflow-hidden bg-gray-50" style={{ width: `${panelWidth}px` }}>
              {liveMapPanel}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
