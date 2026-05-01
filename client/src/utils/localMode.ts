/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export const isLocalMode = (): boolean =>
  import.meta.env.VITE_LOCAL_MODE === 'true';
