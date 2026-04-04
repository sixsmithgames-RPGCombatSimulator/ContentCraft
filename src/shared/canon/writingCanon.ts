import type { RetrievalGroundingStatus, WorkflowClaimStatus } from '../generation/workflowTypes.js';

export type WritingCanonFindingStatus = Exclude<WorkflowClaimStatus, 'aligned'>;

export interface WritingCanonFinding {
  key: string;
  status: WritingCanonFindingStatus;
  entityId: string;
  entityName: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  attributeKey?: string;
  draftText?: string;
  canonClaim?: string;
  suggestedAction?: string;
}

export interface WritingCanonBlockReport {
  blockId: string;
  blockTitle?: string;
  matchedEntityCount: number;
  entityNames: string[];
  reviewRequired: boolean;
  alignedCount: number;
  additiveCount: number;
  ambiguityCount: number;
  conflictCount: number;
  unsupportedCount: number;
  items: WritingCanonFinding[];
  updatedAt: number;
}

export interface WritingCanonProjectSummary {
  reviewRequired: boolean;
  scannedBlockCount: number;
  matchedBlockCount: number;
  flaggedBlockCount: number;
  matchedEntityCount: number;
  alignedCount: number;
  additiveCount: number;
  ambiguityCount: number;
  conflictCount: number;
  unsupportedCount: number;
  updatedAt: number;
}

export interface WritingCanonProjectReport {
  projectId: string;
  searchedScope: RetrievalGroundingStatus;
  availableEntityCount: number;
  warningMessage?: string;
  summary: WritingCanonProjectSummary;
  blocks: WritingCanonBlockReport[];
}
