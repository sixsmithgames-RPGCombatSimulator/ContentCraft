import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required.');

const client = new MongoClient(uri);
await client.connect();
try {
  const db = client.db();
  const revisions = db.collection('gmc_story_workspace_revisions');
  await revisions.createIndex(
    { userId: 1, campaignId: 1, workspaceId: 1, revision: -1 },
    { unique: true, name: 'unique_gmc_story_workspace_revision' },
  );
  await revisions.createIndex(
    { userId: 1, campaignId: 1, idempotencyKey: 1 },
    { unique: true, name: 'unique_gmc_story_workspace_idempotency' },
  );
  await revisions.createIndex(
    { userId: 1, campaignId: 1, workspaceId: 1, status: 1, revision: -1 },
    { name: 'gmc_story_workspace_active_lookup' },
  );
  await revisions.createIndex(
    { userId: 1, campaignId: 1, supersededByRewindId: 1 },
    { name: 'gmc_story_workspace_rewind_replay' },
  );
  process.stdout.write('GMC Story workspace indexes are current.\n');
} finally {
  await client.close();
}
