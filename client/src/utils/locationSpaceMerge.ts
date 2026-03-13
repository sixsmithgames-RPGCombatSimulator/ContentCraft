import type { LiveMapDimensions, LiveMapSpace } from '../types/liveMapTypes';

export type MergeableLocationSpace = LiveMapSpace & {
  position_locked?: boolean;
};

type LocationSpaceMergeStrategy = 'identity' | 'identity-or-index';

interface MergeLocationSpacesOptions {
  strategy?: LocationSpaceMergeStrategy;
}

function getSpaceKey(space: MergeableLocationSpace): string {
  if (typeof space.name === 'string' && space.name.length > 0) {
    return space.name;
  }

  if (typeof space.id === 'string' && space.id.length > 0) {
    return space.id;
  }

  return '';
}

function cloneDimensions(dimensions: LiveMapDimensions | undefined): LiveMapDimensions | undefined {
  if (typeof dimensions === 'string') {
    return dimensions;
  }

  if (dimensions && typeof dimensions === 'object') {
    return {
      width: typeof dimensions.width === 'number' ? dimensions.width : undefined,
      height: typeof dimensions.height === 'number' ? dimensions.height : undefined,
      unit: typeof dimensions.unit === 'string' ? dimensions.unit : undefined,
    };
  }

  return undefined;
}

function resolveOriginalSpace(
  originalSpaces: MergeableLocationSpace[],
  resultsMap: Map<string, MergeableLocationSpace>,
  space: MergeableLocationSpace,
  index: number,
  strategy: LocationSpaceMergeStrategy
): MergeableLocationSpace | undefined {
  const key = getSpaceKey(space);
  if (key) {
    const matchedByIdentity = resultsMap.get(key);
    if (matchedByIdentity) {
      return matchedByIdentity;
    }
  }

  if (strategy === 'identity-or-index') {
    return originalSpaces[index];
  }

  return undefined;
}

export function mergeUpdatedLocationSpaces(
  originalSpaces: MergeableLocationSpace[],
  updatedSpaces: MergeableLocationSpace[],
  options: MergeLocationSpacesOptions = {}
): MergeableLocationSpace[] {
  const strategy = options.strategy ?? 'identity';
  const resultsMap = new Map(originalSpaces.map((space) => [getSpaceKey(space), space]));

  return updatedSpaces.map((space, index) => {
    const original = resolveOriginalSpace(originalSpaces, resultsMap, space, index, strategy);
    if (!original) {
      return space;
    }

    const cleanedOriginal = { ...original };
    delete cleanedOriginal.dimensions;
    delete cleanedOriginal.size_ft;

    const merged: MergeableLocationSpace = {
      ...cleanedOriginal,
      ...space,
    };

    if (space.position) {
      merged.position = {
        x: space.position.x,
        y: space.position.y,
      };
    }

    if (typeof space.position_locked === 'boolean') {
      merged.position_locked = space.position_locked;
    }

    if (Array.isArray(space.doors)) {
      merged.doors = space.doors;
    }

    if (space.size_ft && typeof space.size_ft === 'object') {
      merged.size_ft = {
        width: space.size_ft.width,
        height: space.size_ft.height,
      };
      merged.dimensions = {
        width: space.size_ft.width,
        height: space.size_ft.height,
      };
      return merged;
    }

    if (space.dimensions && typeof space.dimensions === 'object') {
      merged.dimensions = {
        width: space.dimensions.width,
        height: space.dimensions.height,
      };
      merged.size_ft = {
        width: space.dimensions.width,
        height: space.dimensions.height,
      };
      return merged;
    }

    if (original.size_ft && typeof original.size_ft === 'object') {
      merged.size_ft = {
        width: original.size_ft.width,
        height: original.size_ft.height,
      };
    }

    const originalDimensions = cloneDimensions(original.dimensions);
    if (originalDimensions !== undefined) {
      merged.dimensions = originalDimensions;
    }

    return merged;
  });
}
