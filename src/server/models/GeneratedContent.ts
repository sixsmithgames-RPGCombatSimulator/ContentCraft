/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export interface GeneratedContentDocument {
  _id: string;
  project_id: string;
  content_type: string;
  title: string;
  generated_content: Record<string, unknown>;
  resolved_proposals: unknown[];
  resolved_conflicts: unknown[];
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}
