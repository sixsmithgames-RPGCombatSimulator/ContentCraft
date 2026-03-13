type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function getNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

export function getAverageWallThicknessFt(walls: unknown[]): number | undefined {
  const thicknesses = walls
    .map((wallUnknown) => {
      if (!isRecord(wallUnknown)) return undefined;
      return getPositiveNumber(wallUnknown.thickness);
    })
    .filter((thickness): thickness is number => typeof thickness === 'number');

  if (thicknesses.length === 0) {
    return undefined;
  }

  return thicknesses.reduce((sum, thickness) => sum + thickness, 0) / thicknesses.length;
}

export function getPrimaryWallMaterial(walls: unknown[]): string | undefined {
  for (const wallUnknown of walls) {
    if (!isRecord(wallUnknown)) continue;
    const material = getNonEmptyString(wallUnknown.material);
    if (material) {
      return material;
    }
  }

  return undefined;
}

export function getNormalizedWallMetadata(record: JsonRecord): {
  walls: unknown[];
  wallThicknessFt?: number;
  wallMaterial?: string;
} {
  const walls = Array.isArray(record.walls) ? record.walls : [];

  return {
    walls,
    wallThicknessFt: getPositiveNumber(record.wall_thickness_ft) ?? getAverageWallThicknessFt(walls),
    wallMaterial: getNonEmptyString(record.wall_material) ?? getPrimaryWallMaterial(walls),
  };
}
