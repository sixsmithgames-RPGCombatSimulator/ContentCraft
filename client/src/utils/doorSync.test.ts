import { describe, expect, it } from 'vitest';
import type { Door } from '../contexts/locationEditorTypes';
import {
  getReciprocalParentSignature,
  synchronizeReciprocalDoors,
} from './doorSync';

function createDoor(overrides: Partial<Door>): Door {
  return {
    wall: 'south',
    position_on_wall_ft: 10,
    width_ft: 4,
    leads_to: 'Chamber',
    ...overrides,
  };
}

describe('doorSync', () => {
  it('creates one reciprocal door per parent door when rooms have multiple connections', () => {
    const spaces = [
      {
        name: 'Hall',
        code: 'HALL',
        size_ft: { width: 40, height: 20 },
        doors: [
          createDoor({ wall: 'south', position_on_wall_ft: 10, leads_to: 'Chamber' }),
          createDoor({ wall: 'south', position_on_wall_ft: 30, leads_to: 'Chamber' }),
        ],
      },
      {
        name: 'Chamber',
        code: 'CHAMBER',
        size_ft: { width: 20, height: 20 },
        doors: [],
      },
    ];

    const syncedSpaces = synchronizeReciprocalDoors(spaces);
    const chamber = syncedSpaces.find((space) => space.name === 'Chamber');

    expect(chamber?.doors?.length).toBe(2);
    expect(chamber?.doors?.map((door) => door.position_on_wall_ft)).toEqual([5, 15]);
    expect(chamber?.doors?.every((door) => door.is_reciprocal === true)).toBe(true);
    expect(new Set(chamber?.doors?.map((door) => door.reciprocal_parent_signature)).size).toBe(2);
  });

  it('preserves a manually adjusted reciprocal child while the source door stays the same', () => {
    const parentSpace = {
      name: 'Hall',
      code: 'HALL',
      size_ft: { width: 40, height: 20 },
      doors: [createDoor({ wall: 'south', position_on_wall_ft: 10, leads_to: 'Chamber' })],
    };
    const signature = getReciprocalParentSignature(parentSpace, parentSpace.doors[0]);

    const syncedSpaces = synchronizeReciprocalDoors([
      parentSpace,
      {
        name: 'Chamber',
        code: 'CHAMBER',
        size_ft: { width: 20, height: 20 },
        doors: [
          {
            wall: 'north',
            position_on_wall_ft: 6,
            width_ft: 4,
            leads_to: 'Hall',
            is_reciprocal: true,
            reciprocal_parent_signature: signature,
          },
        ],
      },
    ]);

    const chamber = syncedSpaces.find((space) => space.name === 'Chamber');

    expect(chamber?.doors).toHaveLength(1);
    expect(chamber?.doors?.[0]?.position_on_wall_ft).toBe(6);
    expect(chamber?.doors?.[0]?.reciprocal_parent_signature).toBe(signature);
  });

  it('rebuilds a reciprocal child when the source door moves', () => {
    const originalParent = {
      name: 'Hall',
      code: 'HALL',
      size_ft: { width: 40, height: 20 },
      doors: [createDoor({ wall: 'south', position_on_wall_ft: 10, leads_to: 'Chamber' })],
    };
    const originalSignature = getReciprocalParentSignature(originalParent, originalParent.doors[0]);

    const syncedSpaces = synchronizeReciprocalDoors([
      {
        ...originalParent,
        doors: [createDoor({ wall: 'south', position_on_wall_ft: 20, leads_to: 'Chamber' })],
      },
      {
        name: 'Chamber',
        code: 'CHAMBER',
        size_ft: { width: 20, height: 20 },
        doors: [
          {
            wall: 'north',
            position_on_wall_ft: 6,
            width_ft: 4,
            leads_to: 'Hall',
            is_reciprocal: true,
            reciprocal_parent_signature: originalSignature,
          },
        ],
      },
    ]);

    const chamber = syncedSpaces.find((space) => space.name === 'Chamber');

    expect(chamber?.doors).toHaveLength(1);
    expect(chamber?.doors?.[0]?.position_on_wall_ft).toBe(10);
    expect(chamber?.doors?.[0]?.reciprocal_parent_signature).not.toBe(originalSignature);
  });

  it('does not add a duplicate child when a manual matching reciprocal door already exists', () => {
    const syncedSpaces = synchronizeReciprocalDoors([
      {
        name: 'Hall',
        code: 'HALL',
        size_ft: { width: 40, height: 20 },
        doors: [createDoor({ wall: 'south', position_on_wall_ft: 10, leads_to: 'Chamber' })],
      },
      {
        name: 'Chamber',
        code: 'CHAMBER',
        size_ft: { width: 20, height: 20 },
        doors: [
          {
            wall: 'north',
            position_on_wall_ft: 5,
            width_ft: 4,
            leads_to: 'Hall',
          },
        ],
      },
    ]);

    const chamber = syncedSpaces.find((space) => space.name === 'Chamber');

    expect(chamber?.doors).toHaveLength(1);
    expect(chamber?.doors?.[0]?.is_reciprocal).not.toBe(true);
  });
});
