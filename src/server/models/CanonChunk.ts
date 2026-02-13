/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export interface ChunkMetadata {
  region?: string;
  era?: string;
  doc_id?: string; // Source document identifier
  page?: number;
  tags?: string[];
  weight?: number; // Relevance weight for retrieval (0-1)
  source?: string;
  entity_type?: string;
  entity_name?: string;
}

export interface CanonChunk {
  _id: string; // e.g., "npc.rhylar_frinac#c2"
  entity_id: string; // e.g., "npc.rhylar_frinac"
  text: string; // 1-5 sentences of coherent fact
  metadata: ChunkMetadata;
  embedding?: number[]; // Optional vector embedding for semantic search
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Generate chunk ID from entity ID and chunk number
 */
export function generateChunkId(entityId: string, chunkNumber: number): string {
  return `${entityId}#c${chunkNumber}`;
}
