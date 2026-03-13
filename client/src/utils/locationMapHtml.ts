import type { LiveMapSpace } from '../types/liveMapTypes';
import {
  buildLocationMapBodyContent,
  getLocationSpaceColor,
  wrapLocationMapHtmlDocument,
} from './locationMapDocument';
import {
  generateFullWidthLocationFloorPlan,
  getLocationSpaceDimsForKey,
} from './locationMapPreview';

function buildDoorSignature(space: LiveMapSpace): string {
  if (!Array.isArray(space.doors) || space.doors.length === 0) {
    return '';
  }

  return space.doors
    .map((door) => [
      door.wall,
      door.position_on_wall_ft,
      door.width_ft,
      door.leads_to,
      door.style ?? door.door_type ?? '',
      door.state ?? '',
      door.is_reciprocal ? 'reciprocal' : 'primary',
      door.reciprocal_parent_signature ?? '',
    ].join(':'))
    .join('|');
}

export function buildLocationMapSpacesHash(spaces: LiveMapSpace[]): string {
  return JSON.stringify(spaces.map((space) => ({
    name: space.name,
    size_ft: space.size_ft,
    dimensions: space.dimensions,
    position: space.position,
    wall_thickness_ft: space.wall_thickness_ft,
    wall_material: space.wall_material,
    shape: space.shape,
    space_type: space.space_type,
    floor_height: space.floor_height,
    doors: buildDoorSignature(space),
  })));
}

export function buildLocationEditorProviderKey(spaces: LiveMapSpace[]): string {
  return spaces.map((space) => {
    const dims = getLocationSpaceDimsForKey(space);
    return [
      space.name,
      dims.width,
      dims.height,
      buildDoorSignature(space),
      space.shape || 'rect',
      space.space_type || 'room',
      space.wall_thickness_ft ?? '',
      space.wall_material ?? '',
      space.position?.x ?? '',
      space.position?.y ?? '',
    ].join('-');
  }).join('|');
}

export function generateLocationMapHtml(
  locationName: string,
  spaces: LiveMapSpace[],
  totalSpaces: number,
  currentSpace: number,
  inline: boolean = false
): string {
  void currentSpace;

  const spaceRows = spaces.map((space, index) => {
    return generateFullWidthLocationFloorPlan(space, getLocationSpaceColor(space.function), index, false);
  }).join('');

  const bodyContent = buildLocationMapBodyContent(locationName, spaces, totalSpaces, spaceRows);
  return wrapLocationMapHtmlDocument(locationName, bodyContent, inline).trim();
}
