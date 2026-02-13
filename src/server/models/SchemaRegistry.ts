/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export interface SchemaRegistryEntry {
  _id: string;
  domain: string;
  version: string;
  schema: Record<string, unknown>;
  active: boolean;
  deployedAt?: Date;
}
