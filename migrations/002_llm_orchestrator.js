import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required.');

const client = new MongoClient(uri);
await client.connect();
try {
  const db = client.db();
  const executions = db.collection('llm_executions');
  await executions.createIndex(
    { userId: 1, operation: 1, idempotencyKey: 1 },
    { unique: true, name: 'unique_llm_execution_idempotency' },
  );
  await executions.createIndex({ userId: 1, taskId: 1, startedAt: -1 });
  await executions.createIndex({ userId: 1, correlationId: 1, startedAt: -1 });
  await executions.createIndex({ userId: 1, operation: 1, cacheKey: 1, status: 1, expiresAt: 1 });
  await executions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  const workflows = db.collection('llm_generation_workflows');
  await workflows.createIndex(
    { userId: 1, workflowId: 1 },
    { unique: true, name: 'unique_llm_generation_workflow' },
  );
  await workflows.createIndex({ userId: 1, kind: 1, updatedAt: -1 });
  await workflows.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });

  const outbox = db.collection('authority_outbox');
  await outbox.createIndex(
    { userId: 1, operationId: 1, stepId: 1 },
    { unique: true, name: 'unique_authority_outbox_step' },
  );
  await outbox.createIndex({ status: 1, nextAttemptAt: 1 });
  const operations = db.collection('authority_operations');
  await operations.createIndex(
    { userId: 1, operationId: 1 },
    { unique: true, name: 'unique_authority_operation' },
  );
  await operations.createIndex({ userId: 1, status: 1, updatedAt: 1 });
  await operations.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  process.stdout.write('LLM orchestrator indexes are current.\n');
} finally {
  await client.close();
}
