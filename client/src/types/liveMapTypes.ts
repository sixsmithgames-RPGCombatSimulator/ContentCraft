/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import type { Door } from '../contexts/locationEditorTypes';

// LiveMapDoor is now an alias to the canonical Door type
export type LiveMapDoor = Door;

export type LiveMapSizeFt = {
  width?: number;
  height?: number;
};

export type LiveMapDimensions =
  | string
  | {
      width?: number;
      height?: number;
      unit?: string;
    };

export type LiveMapSpace = {
  name: string;
  id?: string;
  code?: string;
  purpose?: string;
  description?: string;
  function?: string;
  dimensions?: LiveMapDimensions;
  size_ft?: LiveMapSizeFt;
  floor_height?: number;
  space_type?: string;
  shape?: string;
  l_cutout_corner?: string;
  doors?: LiveMapDoor[];
  features?: unknown[];
  position?: { x: number; y: number };
  connections?: string[];
  wall_thickness_ft?: number;
  wall_material?: string;
  [key: string]: unknown;
};
