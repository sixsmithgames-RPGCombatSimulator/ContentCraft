import type { Db } from 'mongodb';
import { getDb } from '../config/mongo.js';
import { OrchestratorError } from './errors.js';

const RETAINED_COLLECTIONS = [
  'llm_executions',
  'llm_generation_workflows',
  'authority_operations',
  'authority_outbox',
  'gma_mechanics_ledger',
] as const;

export async function deleteUserOrchestratorData(input: {
  userId: string;
  confirmation: string;
  database?: Pick<Db, 'collection'>;
}) {
  if (input.confirmation !== 'delete-my-orchestrator-data') {
    throw new OrchestratorError({
      code: 'DELETION_CONFIRMATION_REQUIRED',
      category: 'persistence',
      message: 'Exact orchestrator-data deletion confirmation is required.',
      retryable: false,
      status: 400,
      source: 'gmc.llm-retention',
    });
  }
  const database = input.database ?? getDb();
  const deleted: Record<string, number> = {};
  for (const name of RETAINED_COLLECTIONS) {
    const result = await database.collection(name).deleteMany({ userId: input.userId });
    deleted[name] = result.deletedCount;
  }
  return {
    schemaVersion: 'gma-gmc.llm-deletion-receipt/1',
    userId: input.userId,
    deleted,
    completedAt: new Date().toISOString(),
  };
}
