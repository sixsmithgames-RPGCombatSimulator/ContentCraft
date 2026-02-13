/**
 * Room Properties Panel - Side panel for editing selected room properties
 *
 * Allows users to edit:
 * - Room name
 * - Room size (width x height)
 * - Room purpose/function
 * - Door connections (add/remove/edit)
 * - Other room metadata
 *
 * Auto-saves changes immediately on every edit
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { useState, useEffect } from 'react';
import { X, Plus, Trash2, ChevronUp, Home, DoorOpen, Lock, Unlock } from 'lucide-react';
import { useLocationEditor, Space } from '../../contexts/LocationEditorContext';

interface RoomPropertiesPanelProps {
  onSaveAll?: () => void;
}

export default function RoomPropertiesPanel({ onSaveAll }: RoomPropertiesPanelProps = {}) {
  const { state, dispatch, selectRoom, addDoor, removeDoor, createSnapshot } = useLocationEditor();

  const selectedRoom = state.spaces.find(
    s => (s.code || s.name) === state.selectedRoomId
  );

  // Local form state
  const [roomName, setRoomName] = useState('');
  const [roomWidth, setRoomWidth] = useState(30);
  const [roomHeight, setRoomHeight] = useState(30);
  const [roomPurpose, setRoomPurpose] = useState('');
  const [doorTab, setDoorTab] = useState<'parent' | 'child'>('parent');

  // Update local state when selection changes
  useEffect(() => {
    if (selectedRoom) {
      setRoomName(selectedRoom.name);
      setRoomWidth(selectedRoom.size_ft.width);
      setRoomHeight(selectedRoom.size_ft.height);
      setRoomPurpose(selectedRoom.purpose || '');
    }
  }, [selectedRoom]);

  // ============================================================================
  // ROOM LIST VIEW (shown when no room selected or as header)
  // ============================================================================
  const renderRoomList = () => (
    <div className="border-b border-gray-200">
      <div className="bg-gradient-to-r from-gray-50 to-blue-50 px-4 py-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-1">
          <Home className="w-3 h-3" />
          Rooms ({state.spaces.length})
        </span>
      </div>
      <div className="max-h-[200px] overflow-y-auto">
        {state.spaces.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-4">No rooms yet</p>
        ) : (
          state.spaces.map((room, idx) => (
            <button
              key={room.code || room.name}
              onClick={() => selectRoom(room.code || room.name)}
              className={`w-full text-left px-4 py-2 text-sm border-b border-gray-100 hover:bg-blue-50 transition-colors flex items-center justify-between ${
                state.selectedRoomId === (room.code || room.name)
                  ? 'bg-blue-100 text-blue-900 font-medium'
                  : 'text-gray-700'
              }`}
            >
              <span className="truncate flex-1">
                <span className="text-gray-400 mr-1">#{idx + 1}</span>
                {room.name}
              </span>
              {room.doors && room.doors.length > 0 && (
                <span className="text-xs text-gray-400 flex items-center gap-0.5">
                  <DoorOpen className="w-3 h-3" />
                  {room.doors.length}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );

  // When no room is selected, show room list with instructions
  if (!selectedRoom) {
    return (
      <div className="w-[300px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-200 px-4 py-3 flex-shrink-0">
          <h3 className="font-semibold text-gray-900">Location Editor</h3>
        </div>

        {/* Room List */}
        {renderRoomList()}

        {/* Global Wall Settings */}
        <div className="border-b border-gray-200 p-4 bg-gray-50">
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Default Wall Settings
          </h4>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Thickness (ft)</label>
              <input
                type="number"
                value={state.globalWallSettings.thickness_ft}
                onChange={(e) => {
                  const value = parseFloat(e.target.value) || 1;
                  const nextSettings = {
                    ...state.globalWallSettings,
                    thickness_ft: value,
                  };
                  dispatch({ type: 'SET_GLOBAL_WALL_SETTINGS', payload: nextSettings });
                  createSnapshot(`Set default wall thickness to ${value}ft`);
                  if (onSaveAll) {
                    setTimeout(() => {
                      onSaveAll();
                    }, 0);
                  }
                }}
                min="0.5"
                max="10"
                step="0.5"
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Material</label>
              <input
                type="text"
                value={state.globalWallSettings.material}
                onChange={(e) => {
                  const value = e.target.value;
                  const nextSettings = {
                    ...state.globalWallSettings,
                    material: value,
                  };
                  dispatch({ type: 'SET_GLOBAL_WALL_SETTINGS', payload: nextSettings });
                  createSnapshot(`Set default wall material to ${value || 'default'}`);
                  if (onSaveAll) {
                    setTimeout(() => {
                      onSaveAll();
                    }, 0);
                  }
                }}
                placeholder="e.g., stone, wood, brick"
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <p className="text-xs text-gray-500">
              These settings apply to all new spaces. Individual spaces can override these values.
            </p>
          </div>
        </div>

        {/* Instructions */}
        <div className="flex-1 p-4 flex flex-col items-center justify-center text-gray-500">
          <ChevronUp className="w-6 h-6 mb-2 text-gray-300" />
          <p className="text-sm text-center">
            Select a room above or click on the map
          </p>
          <p className="text-xs text-center mt-2 text-gray-400">
            Drag rooms to move • Drag corners to resize
          </p>
        </div>
      </div>
    );
  }

  // Auto-save helper - saves changes immediately when any field is edited
  const autoSave = (updates: Partial<Space>, action: string) => {
    console.log('[RoomPropertiesPanel] Auto-saving:', action, updates);

    dispatch({
      type: 'UPDATE_SPACE',
      payload: {
        id: state.selectedRoomId!,
        updates,
      },
    });
    createSnapshot(action);

    // Trigger parent save to persist changes to accumulated results
    // Use setTimeout to ensure React has flushed the state update
    if (onSaveAll) {
      setTimeout(() => {
        onSaveAll();
      }, 0);
    }
  };

  const handleAddDoor = () => {
    if (!selectedRoom) return;

    // Calculate default position at center of north wall (50%)
    const northWallLength = selectedRoom.size_ft.width;
    const defaultPosition = northWallLength / 2;

    addDoor(state.selectedRoomId!, {
      wall: 'north',
      position_on_wall_ft: defaultPosition, // Center of wall
      width_ft: 4,
      leads_to: 'Pending',
      style: 'wooden', // Use 'style' not 'door_type'
    });
    createSnapshot(`Added door to ${roomName}`);
  };

  const handleRemoveDoor = (doorIndex: number) => {
    removeDoor(state.selectedRoomId!, doorIndex);
    createSnapshot(`Removed door from ${roomName}`);
  };

  const handleUpdateDoor = (doorIndex: number, field: string, value: string | number) => {
    try {
      dispatch({
        type: 'UPDATE_DOOR',
        payload: {
          roomId: state.selectedRoomId!,
          doorIndex,
          updates: { [field]: value },
        },
      });

      // Create snapshot for undo/redo support
      createSnapshot(`Updated door ${field} in ${roomName}`);
    } catch (error) {
      // Display validation error to user
      const errorMsg = error instanceof Error ? error.message : 'Invalid door update';
      console.error('[RoomPropertiesPanel] Door update error:', errorMsg);
      alert(errorMsg);
    }
  };

  const doors = selectedRoom.doors || [];

  // Separate parent and child doors
  const parentDoors = doors.filter(door => door.is_reciprocal !== true);
  const childDoors = doors.filter(door => door.is_reciprocal === true);

  // Helper: Get wall length for a given door
  const getWallLength = (door: any): number => {
    if (!selectedRoom) return 0;
    const wall = door.wall?.toLowerCase();
    return (wall === 'north' || wall === 'south')
      ? selectedRoom.size_ft.width
      : selectedRoom.size_ft.height;
  };

  return (
    <div className="w-[300px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col h-full overflow-hidden">
      {/* Header with room name and close button */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-b border-gray-200 px-4 py-3 flex items-center justify-between flex-shrink-0">
        <h3 className="font-semibold text-gray-900 truncate flex-1" title={selectedRoom.name}>
          {selectedRoom.name}
        </h3>
        <button
          onClick={() => selectRoom(null)}
          className="p-1 text-gray-400 hover:text-gray-600 rounded hover:bg-white ml-2"
          title="Deselect room"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Room List - collapsible quick navigation */}
      {renderRoomList()}

      {/* Content - scrollable properties */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        <div className="border border-gray-200 rounded p-3 bg-gray-50">
          <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">
            Default Wall Settings
          </h4>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Thickness (ft)</label>
              <input
                type="number"
                value={state.globalWallSettings.thickness_ft}
                onChange={(e) => {
                  const value = parseFloat(e.target.value) || 1;
                  const nextSettings = {
                    ...state.globalWallSettings,
                    thickness_ft: value,
                  };
                  dispatch({ type: 'SET_GLOBAL_WALL_SETTINGS', payload: nextSettings });
                  createSnapshot(`Set default wall thickness to ${value}ft`);
                  if (onSaveAll) {
                    setTimeout(() => {
                      onSaveAll();
                    }, 0);
                  }
                }}
                min="0.5"
                max="10"
                step="0.5"
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Material</label>
              <input
                type="text"
                value={state.globalWallSettings.material}
                onChange={(e) => {
                  const value = e.target.value;
                  const nextSettings = {
                    ...state.globalWallSettings,
                    material: value,
                  };
                  dispatch({ type: 'SET_GLOBAL_WALL_SETTINGS', payload: nextSettings });
                  createSnapshot(`Set default wall material to ${value || 'default'}`);
                  if (onSaveAll) {
                    setTimeout(() => {
                      onSaveAll();
                    }, 0);
                  }
                }}
                placeholder="e.g., stone, wood, brick"
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <p className="text-xs text-gray-500">
              These settings apply to all new spaces. Individual spaces can override these values.
            </p>
          </div>
        </div>

        {/* Basic Properties */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Room Name
          </label>
          <input
            type="text"
            value={roomName}
            onChange={(e) => {
              const newName = e.target.value;
              setRoomName(newName);
              autoSave({ name: newName }, `Renamed room to "${newName}"`);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-2">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Width (ft)
            </label>
            <input
              type="number"
              value={roomWidth}
              onChange={(e) => {
                const newWidth = Math.max(5, parseInt(e.target.value) || 5);
                setRoomWidth(newWidth);
                autoSave(
                  { size_ft: { width: newWidth, height: roomHeight } },
                  `Changed room width to ${newWidth}ft`
                );
              }}
              min="5"
              step="5"
              className="w-full px-3 py-2 border border-gray-300 rounded text-base focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Height (ft)
            </label>
            <input
              type="number"
              value={roomHeight}
              onChange={(e) => {
                const newHeight = Math.max(5, parseInt(e.target.value) || 5);
                setRoomHeight(newHeight);
                autoSave(
                  { size_ft: { width: roomWidth, height: newHeight } },
                  `Changed room height to ${newHeight}ft`
                );
              }}
              min="5"
              step="5"
              className="w-full px-3 py-2 border border-gray-300 rounded text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">
            Purpose/Function
          </label>
          <textarea
            value={roomPurpose}
            onChange={(e) => {
              const newPurpose = e.target.value;
              setRoomPurpose(newPurpose);
              autoSave({ purpose: newPurpose }, 'Updated room purpose');
            }}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="e.g., Throne room, Guard barracks, etc."
          />
        </div>

        {/* Wall Properties Section */}
        <div className="border-t border-gray-200 pt-4">
          <h4 className="text-xs font-semibold text-gray-700 mb-2">Wall Properties</h4>
          <div className="space-y-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Thickness (ft)
                <span className="text-gray-400 ml-1">
                  (default: {state.globalWallSettings.thickness_ft})
                </span>
              </label>
              <input
                type="number"
                value={selectedRoom.wall_thickness_ft ?? ''}
                onChange={(e) => {
                  const value = e.target.value ? parseFloat(e.target.value) : undefined;
                  autoSave({ wall_thickness_ft: value }, `Set wall thickness to ${value ?? 'default'}`);
                }}
                min="0.5"
                max="10"
                step="0.5"
                placeholder={`${state.globalWallSettings.thickness_ft} (default)`}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Material
                <span className="text-gray-400 ml-1">
                  (default: {state.globalWallSettings.material})
                </span>
              </label>
              <input
                type="text"
                value={selectedRoom.wall_material ?? ''}
                onChange={(e) => {
                  const value = e.target.value || undefined;
                  autoSave({ wall_material: value }, `Set wall material to ${value ?? 'default'}`);
                }}
                placeholder={`${state.globalWallSettings.material} (default)`}
                className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <p className="text-xs text-gray-500">
              Leave blank to use default values. Clear field to reset to default.
            </p>
          </div>
        </div>

        {/* Doors Section */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-gray-700">
              Doors ({doors.length})
            </label>
            <button
              onClick={handleAddDoor}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100 border border-blue-200"
            >
              <Plus className="w-3 h-3" />
              Add Door
            </button>
          </div>

          {/* Door Tabs */}
          <div className="flex gap-1 mb-3 border-b border-gray-200">
            <button
              onClick={() => setDoorTab('parent')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                doorTab === 'parent'
                  ? 'bg-emerald-50 text-emerald-700 border-b-2 border-emerald-500'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              🚪 Parent Doors
              <span className="ml-1 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                {parentDoors.length}
              </span>
            </button>
            <button
              onClick={() => setDoorTab('child')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                doorTab === 'child'
                  ? 'bg-blue-50 text-blue-700 border-b-2 border-blue-500'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              🔄 Child Doors
              <span className="ml-1 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                {childDoors.length}
              </span>
            </button>
          </div>

          <div className="space-y-2">
            {doorTab === 'parent' ? (
              parentDoors.length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-3 bg-gray-50 rounded">
                  No parent doors yet. Click "Add Door" to create one.
                </p>
              ) : (
                parentDoors.map((door, idx) => {
                  // Find the actual index in the full doors array
                  const actualIdx = doors.indexOf(door);

                  return (
                    <div
                      key={actualIdx}
                      className="border-2 border-emerald-300 rounded p-3 space-y-2 bg-emerald-50"
                    >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <span className="text-xs font-semibold text-emerald-900">
                        Parent Door {idx + 1}
                      </span>
                      <div className="mt-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-300">
                          🚪 Manually Created
                        </span>
                        <p className="text-[10px] text-emerald-700 mt-1">
                          Editing this door will auto-update its reciprocal in <strong>{door.leads_to}</strong>.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveDoor(actualIdx)}
                      className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                      title="Remove door"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Wall</label>
                    <select
                      value={door.wall}
                      onChange={(e) => handleUpdateDoor(actualIdx, 'wall', e.target.value)}
                      className="w-full px-2 py-1 border border-emerald-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                    >
                      <option value="north">North</option>
                      <option value="south">South</option>
                      <option value="east">East</option>
                      <option value="west">West</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Leads To</label>
                    <select
                      value={door.leads_to}
                      onChange={(e) => handleUpdateDoor(actualIdx, 'leads_to', e.target.value)}
                      className="w-full px-2 py-1 border border-emerald-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                    >
                      <option value="">-- Select Destination --</option>
                      <option value="Pending">📋 Pending (not yet created)</option>
                      <option value="Outside">🚪 Outside</option>
                      <optgroup label="Existing Spaces">
                        {state.spaces
                          .filter(s => s.name !== selectedRoom?.name) // Exclude current room
                          .map(s => (
                            <option key={s.code || s.name} value={s.name}>
                              {s.name}
                            </option>
                          ))
                        }
                      </optgroup>
                    </select>
                    {/* Warning if leads_to doesn't match any existing space */}
                    {door.leads_to &&
                     door.leads_to !== 'Pending' &&
                     door.leads_to !== 'Outside' &&
                     !state.spaces.some(s => s.name === door.leads_to) && (
                      <p className="text-xs text-amber-600 mt-1">
                        ⚠️ "{door.leads_to}" doesn't exist yet
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Width (ft)</label>
                      <input
                        type="number"
                        value={door.width_ft}
                        onChange={(e) => {
                          const width = parseFloat(e.target.value);
                          if (!isNaN(width) && width > 0) {
                            handleUpdateDoor(actualIdx, 'width_ft', width);
                          }
                        }}
                        min="1"
                        step="0.5"
                        className="w-full px-2 py-1 border border-emerald-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                      />
                    </div>
                    <div>
                      {(() => {
                        const wallLength = getWallLength(door);
                        const doorHalfWidth = door.width_ft / 2;
                        const minPos = doorHalfWidth;
                        const maxPos = wallLength - doorHalfWidth;

                        return (
                          <>
                            <label className="block text-xs text-gray-600 mb-1">
                              Position (ft, center of door)
                            </label>
                            <input
                              type="number"
                              value={door.position_on_wall_ft}
                              onChange={(e) => {
                                const pos = parseFloat(e.target.value);
                                if (!isNaN(pos)) {
                                  handleUpdateDoor(actualIdx, 'position_on_wall_ft', pos);
                                }
                              }}
                              min={minPos}
                              max={maxPos}
                              step="0.5"
                              className="w-full px-2 py-1 border border-emerald-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500 bg-white"
                            />
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              Valid: {minPos.toFixed(1)}ft - {maxPos.toFixed(1)}ft
                            </p>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                );
              })
            )) : (
              // Child Doors Tab
              childDoors.length === 0 ? (
                <div className="text-xs text-gray-500 text-center py-3 bg-blue-50 rounded border border-blue-200">
                  <p className="font-medium text-blue-700 mb-1">🔄 No child doors yet</p>
                  <p className="text-[10px] text-gray-600">
                    Child doors are automatically created when another room has a door leading here.
                  </p>
                </div>
              ) : (
                childDoors.map((door, idx) => {
                  // Find the actual index in the full doors array
                  const actualIdx = doors.indexOf(door);

                  return (
                  <div
                    key={actualIdx}
                    className="border-2 border-blue-300 rounded p-3 space-y-2 bg-blue-50"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <span className="text-xs font-semibold text-blue-900">
                          Child Door {idx + 1}
                        </span>
                        <div className="mt-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 border border-blue-300">
                            🔄 Auto-created from {door.leads_to}
                          </span>
                          <p className="text-[10px] text-blue-700 mt-1">
                            This door was automatically created. Edit the parent door in <strong>{door.leads_to}</strong>.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveDoor(actualIdx)}
                        className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                        title="Remove door (will also remove parent)"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Wall</label>
                      <input
                        type="text"
                        value={door.wall}
                        disabled
                        className="w-full px-2 py-1 border border-blue-200 rounded text-xs bg-blue-100 text-blue-700 font-medium cursor-not-allowed"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Leads To (Parent Room)</label>
                      <input
                        type="text"
                        value={door.leads_to}
                        disabled
                        className="w-full px-2 py-1 border border-blue-200 rounded text-xs bg-blue-100 text-blue-700 font-medium cursor-not-allowed"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Width (ft)</label>
                        <input
                          type="number"
                          value={door.width_ft}
                          disabled
                          className="w-full px-2 py-1 border border-blue-200 rounded text-xs bg-blue-100 text-blue-700 cursor-not-allowed"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Position (ft)</label>
                        <input
                          type="number"
                          value={door.position_on_wall_ft}
                          disabled
                          className="w-full px-2 py-1 border border-blue-200 rounded text-xs bg-blue-100 text-blue-700 cursor-not-allowed"
                        />
                      </div>
                    </div>

                    <div className="bg-blue-100 border border-blue-300 rounded p-2">
                      <p className="text-[10px] text-blue-800">
                        <strong>ℹ️ Read-only:</strong> Child doors mirror their parent. To modify this door, edit the parent door in <strong>{door.leads_to}</strong>.
                      </p>
                    </div>
                  </div>
                  );
                })
              )
            )}
          </div>
        </div>

        {/* Room Info */}
        <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-700">
              <span className="font-semibold">Position:</span> ({selectedRoom.position?.x}, {selectedRoom.position?.y})
            </p>
            <button
              onClick={() => {
                const roomId = selectedRoom.code || selectedRoom.name;
                dispatch({
                  type: 'UPDATE_SPACE',
                  payload: {
                    id: roomId,
                    updates: { position_locked: !selectedRoom.position_locked }
                  }
                });
              }}
              className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                selectedRoom.position_locked
                  ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={selectedRoom.position_locked ? 'Position locked - click to unlock' : 'Position unlocked - click to lock'}
            >
              {selectedRoom.position_locked ? (
                <>
                  <Lock className="w-3 h-3" />
                  Locked
                </>
              ) : (
                <>
                  <Unlock className="w-3 h-3" />
                  Unlocked
                </>
              )}
            </button>
          </div>
          <p className="text-xs text-gray-700">
            <span className="font-semibold">Size:</span> {selectedRoom.size_ft.width} × {selectedRoom.size_ft.height} ft
          </p>
          <p className="text-xs text-gray-700">
            <span className="font-semibold">Index:</span> #{selectedRoom.index + 1}
          </p>
          {selectedRoom.position_locked && (
            <p className="text-xs text-yellow-700 bg-yellow-50 rounded px-2 py-1 border border-yellow-200">
              🔒 Position locked - auto-layout won't move this room
            </p>
          )}
        </div>
      </div>

      {/* Auto-save Info */}
      <div className="border-t border-gray-200 px-4 py-3 bg-gradient-to-r from-green-50 to-blue-50 flex-shrink-0">
        <p className="text-xs text-gray-600 text-center">
          ✓ Changes are saved automatically as you edit
        </p>
      </div>
    </div>
  );
}
