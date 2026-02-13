/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export interface ProjectLibraryLink {
  _id: string; // Unique link ID
  project_id: string; // Which project this link belongs to
  library_entity_id: string; // Which library entity is linked (e.g., "lib.spell.fireball")
  added_at: Date; // When the link was created
  added_by?: string; // User who added it (optional)
  project_tags?: string[]; // Project-specific tags for this entity
  notes?: string; // Project-specific notes about this entity
}

/**
 * Helper to generate link ID
 */
export function generateLinkId(projectId: string, libraryEntityId: string): string {
  return `link_${projectId}_${libraryEntityId}`;
}
