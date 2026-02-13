/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export interface LibraryCollection {
  _id: string; // e.g., "collection.core_combat_spells"
  name: string; // Display name
  description: string; // What this collection contains
  entity_ids: string[]; // Array of library entity IDs
  tags?: string[]; // Searchable metadata
  category?: string; // e.g., "spells", "monsters", "starter-packs"
  is_official?: boolean; // True for curated official collections
  created_at: Date;
  updated_at: Date;
}

/**
 * Helper to generate collection ID
 */
export function generateCollectionId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `collection.${slug}`;
}
