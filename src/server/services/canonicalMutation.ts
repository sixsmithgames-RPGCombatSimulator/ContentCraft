import { createHash } from 'node:crypto';

type CanonCollection<T extends Record<string, any>> = {
  findOne(filter: Record<string, unknown>): Promise<T | null>;
  insertOne(document: T): Promise<unknown>;
};

export class CanonicalMutationError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'CanonicalMutationError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function durableValue(value: unknown, parentKey = ''): unknown {
  if (Array.isArray(value)) return value.map((entry) => durableValue(entry, parentKey));
  if (!value || typeof value !== 'object') return value ?? null;
  const ignored = new Set(['mutationId', 'correlationId', 'createdAt', 'updatedAt', 'created_at', 'updated_at']);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !ignored.has(key) && !(parentKey === 'source' && key === 'requestCorrelationId'))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, durableValue(entry, key)]),
  );
}

export function canonicalSemanticFingerprint(recordKind: string, input: unknown) {
  return sha256(JSON.stringify({ recordKind, input: durableValue(input) }));
}

export function canonicalMutationFingerprint(mutationId: string, semanticFingerprint: string) {
  return sha256(JSON.stringify({ mutationId, semanticFingerprint }));
}

export function canonicalMutationDocumentId({
  userId,
  campaignId,
  recordKind,
  mutationId,
  prefix = 'gmc-canon',
}: {
  userId: string;
  campaignId: string;
  recordKind: string;
  mutationId: string;
  prefix?: string;
}) {
  const digest = sha256(JSON.stringify({ userId, campaignId, recordKind, mutationId })).slice(0, 40);
  return `${prefix}-${digest}`;
}

function verifyExisting<T extends Record<string, any>>({
  existing,
  mutationId,
  mutationFingerprint,
  semanticFingerprint,
  recordKind,
}: {
  existing: T;
  mutationId: string;
  mutationFingerprint: string;
  semanticFingerprint: string;
  recordKind: string;
}) {
  const existingMutation = existing.creationMutation ?? {};
  if (existingMutation.mutationId === mutationId && existingMutation.fingerprint !== mutationFingerprint) {
    throw new CanonicalMutationError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'This mutationId was already used with different durable record data. The original record was preserved.',
      { mutationId, recordKind, recordId: existing._id ?? null },
    );
  }
  if (existing.canonicalFingerprint !== semanticFingerprint) {
    throw new CanonicalMutationError(
      409,
      'IDEMPOTENCY_CONFLICT',
      'A durable record ID collision was detected. No second record was created.',
      { mutationId, recordKind, recordId: existing._id ?? null },
    );
  }
  return {
    record: existing,
    duplicate: true,
    duplicateReason: existingMutation.mutationId === mutationId ? 'mutation_replay' : 'semantic_duplicate',
    mutationId,
  } as const;
}

export async function insertCanonicalMutation<T extends Record<string, any>>({
  collection,
  userId,
  campaignId,
  recordKind,
  mutationId: suppliedMutationId,
  input,
  documentId,
  scopeFilter = {},
  buildDocument,
  now = () => new Date(),
}: {
  collection: CanonCollection<T>;
  userId: string;
  campaignId: string;
  recordKind: string;
  mutationId: string;
  input: unknown;
  documentId?: string;
  scopeFilter?: Record<string, unknown>;
  buildDocument(context: {
    documentId: string;
    timestamp: Date;
    semanticFingerprint: string;
    creationMutation: Record<string, unknown>;
  }): T;
  now?: () => Date;
}) {
  const mutationId = String(suppliedMutationId ?? '').trim();
  if (!mutationId) {
    throw new CanonicalMutationError(400, 'VALIDATION_ERROR', 'mutationId is required for a durable GMC record write.');
  }
  if (mutationId.length > 240) {
    throw new CanonicalMutationError(400, 'VALIDATION_ERROR', 'mutationId must be 240 characters or fewer.');
  }
  const semanticFingerprint = canonicalSemanticFingerprint(recordKind, input);
  const mutationFingerprint = canonicalMutationFingerprint(mutationId, semanticFingerprint);
  const resolvedDocumentId = documentId ?? canonicalMutationDocumentId({ userId, campaignId, recordKind, mutationId });

  const byId = await collection.findOne({ _id: resolvedDocumentId, userId, ...scopeFilter });
  if (byId) return verifyExisting({ existing: byId, mutationId, mutationFingerprint, semanticFingerprint, recordKind });

  const byMeaning = await collection.findOne({ userId, ...scopeFilter, canonicalFingerprint: semanticFingerprint });
  if (byMeaning) return verifyExisting({ existing: byMeaning, mutationId, mutationFingerprint, semanticFingerprint, recordKind });

  const timestamp = now();
  const creationMutation = {
    mutationId,
    fingerprint: mutationFingerprint,
    recordKind,
    appliedAt: timestamp,
  };
  const document = buildDocument({
    documentId: resolvedDocumentId,
    timestamp,
    semanticFingerprint,
    creationMutation,
  });
  try {
    await collection.insertOne(document);
    return { record: document, duplicate: false, duplicateReason: null, mutationId } as const;
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    const concurrent = await collection.findOne({
      userId,
      ...scopeFilter,
      $or: [{ _id: resolvedDocumentId }, { canonicalFingerprint: semanticFingerprint }],
    });
    if (!concurrent) throw error;
    return verifyExisting({ existing: concurrent, mutationId, mutationFingerprint, semanticFingerprint, recordKind });
  }
}
