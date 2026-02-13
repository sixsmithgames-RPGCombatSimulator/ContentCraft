/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { EntityType } from '../models/CanonEntity.js';
import { logger } from './logger.js';

export interface ParsedEntity {
  type: EntityType;
  canonical_name: string;
  aliases: string[];
  era?: string;
  region?: string;
  claims: Array<{ text: string; source: string }>;
}

export interface DocumentParseResult {
  entities: ParsedEntity[];
  metadata: {
    totalEntities: number;
    byType: Record<string, number>;
    sourceName: string;
  };
}

export async function parseDocument(
  _documentText: string,
  sourceName: string
): Promise<DocumentParseResult> {
  logger.warn(`parseDocument called for ${sourceName}, but AI parsing is disabled.`);
  return {
    entities: [],
    metadata: {
      totalEntities: 0,
      byType: {},
      sourceName,
    },
  };
}
