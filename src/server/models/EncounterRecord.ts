/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import type { AuditEntry } from './NpcRecord.js';

export interface EncounterRecord {
  _id: string;
  project_id: string;
  canonical_id: string;
  schemaVersion: string;
  raw: Record<string, unknown>;
  normalized: Record<string, unknown>;
  provenance: Record<string, unknown>;
  auditTrail: AuditEntry[];
  entity_refs: string[];
  tags?: string[];
  created_at: Date;
  updated_at: Date;
}
