import { createHash } from 'node:crypto';

type StateCollection = {
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>, options?: Record<string, unknown>): Promise<unknown>;
  findOne(filter: Record<string, unknown>): Promise<Record<string, any> | null>;
  findOneAndUpdate(
    filter: Record<string, unknown>,
    update: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<Record<string, any> | null>;
};

export class CampaignClockMutationError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'CampaignClockMutationError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function durableClockSnapshot(clock: unknown) {
  if (clock === null) return null;
  if (!clock || typeof clock !== 'object' || Array.isArray(clock)) return clock ?? null;
  const source = clock as Record<string, unknown>;
  return {
    calendar: source.calendar ?? 'campaign',
    day: source.day ?? null,
    hour: source.hour ?? null,
    minute: source.minute ?? null,
    second: source.second ?? 0,
    elapsedSeconds: source.elapsedSeconds ?? null,
    label: source.label ?? null,
    timeOfDay: source.timeOfDay ?? null,
    notes: source.notes ?? '',
  };
}

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function campaignClockMutationKey(mutationId: string) {
  return sha256(mutationId);
}

export function campaignClockMutationFingerprint({
  mutationId,
  expectedRevision,
  gameClock,
}: {
  mutationId: string;
  expectedRevision: number;
  gameClock: unknown;
}) {
  return sha256(JSON.stringify({
    mutationId,
    expectedRevision,
    gameClock: durableClockSnapshot(gameClock),
  }));
}

function revisionFilter(expectedRevision: number) {
  return expectedRevision === 0
    ? { $or: [{ gameClockRevision: 0 }, { gameClockRevision: { $exists: false } }] }
    : { gameClockRevision: expectedRevision };
}

export async function applyCampaignClockMutation({
  stateCollection,
  userId,
  campaignId,
  mutationId,
  expectedRevision: requestedRevision,
  source,
  createGameClock,
  now = () => new Date(),
}: {
  stateCollection: StateCollection;
  userId: string;
  campaignId: string;
  mutationId: string;
  expectedRevision?: number | null;
  source?: unknown;
  createGameClock(previousGameClock: unknown): unknown;
  now?: () => Date;
}) {
  const id = String(mutationId ?? '').trim();
  if (!id) {
    throw new CampaignClockMutationError(400, 'VALIDATION_ERROR', 'mutationId is required for a campaign clock write.');
  }
  await stateCollection.updateOne(
    { userId, campaignId },
    { $setOnInsert: { userId, campaignId, gameClockRevision: 0 } },
    { upsert: true },
  );
  const previous = await stateCollection.findOne({ userId, campaignId });
  const previousRevision = Math.max(0, Number(previous?.gameClockRevision ?? 0) || 0);
  const key = campaignClockMutationKey(id);
  const ledgerPath = `timeMutationLedger.${key}`;
  const existing = previous?.timeMutationLedger?.[key] ?? null;
  const expectedRevision = Number.isFinite(Number(requestedRevision))
    ? Math.max(0, Math.floor(Number(requestedRevision)))
    : Math.max(0, Number(existing?.expectedRevision ?? previousRevision) || 0);
  const gameClock = createGameClock(previous?.gameClock ?? null);
  const fingerprint = campaignClockMutationFingerprint({ mutationId: id, expectedRevision, gameClock });
  if (existing) {
    if (existing.mutationId !== id || existing.fingerprint !== fingerprint) {
      throw new CampaignClockMutationError(409, 'IDEMPOTENCY_CONFLICT', 'This campaign clock mutationId was already used with different clock data.', {
        mutationId: id,
        expectedRevision,
        currentRevision: previousRevision,
      });
    }
    return {
      duplicate: true,
      mutationId: id,
      previousGameClock: existing.previousGameClock ?? null,
      gameClock: existing.gameClock ?? previous?.gameClock ?? null,
      gameClockRevision: existing.gameClockRevision ?? previousRevision,
      state: previous,
    };
  }
  if (previousRevision !== expectedRevision) {
    throw new CampaignClockMutationError(409, 'CAMPAIGN_CLOCK_CONFLICT', 'The campaign clock changed after this operation read it. No time change was applied.', {
      mutationId: id,
      expectedRevision,
      currentRevision: previousRevision,
      currentGameClock: durableClockSnapshot(previous?.gameClock ?? null),
    });
  }

  const appliedAt = now();
  const nextRevision = expectedRevision + 1;
  const record = {
    mutationId: id,
    fingerprint,
    expectedRevision,
    previousGameClock: previous?.gameClock ?? null,
    gameClock,
    gameClockRevision: nextRevision,
    source: source ?? null,
    appliedAt,
  };
  const updated = await stateCollection.findOneAndUpdate(
    {
      userId,
      campaignId,
      [ledgerPath]: { $exists: false },
      ...revisionFilter(expectedRevision),
    },
    {
      $set: {
        gameClock,
        gameClockRevision: nextRevision,
        [ledgerPath]: record,
        updatedAt: appliedAt,
      },
    },
    { returnDocument: 'after' },
  );
  if (updated) {
    return {
      duplicate: false,
      mutationId: id,
      previousGameClock: previous?.gameClock ?? null,
      gameClock: updated.gameClock ?? gameClock,
      gameClockRevision: updated.gameClockRevision ?? nextRevision,
      state: updated,
    };
  }

  const current = await stateCollection.findOne({ userId, campaignId });
  const concurrentExisting = current?.timeMutationLedger?.[key] ?? null;
  if (concurrentExisting) {
    if (concurrentExisting.mutationId !== id || concurrentExisting.fingerprint !== fingerprint) {
      throw new CampaignClockMutationError(409, 'IDEMPOTENCY_CONFLICT', 'This campaign clock mutationId was concurrently used with different clock data.', {
        mutationId: id,
        expectedRevision,
        currentRevision: Number(current?.gameClockRevision ?? 0),
      });
    }
    return {
      duplicate: true,
      mutationId: id,
      previousGameClock: concurrentExisting.previousGameClock ?? null,
      gameClock: concurrentExisting.gameClock ?? current?.gameClock ?? null,
      gameClockRevision: concurrentExisting.gameClockRevision ?? Number(current?.gameClockRevision ?? 0),
      state: current,
    };
  }
  throw new CampaignClockMutationError(409, 'CAMPAIGN_CLOCK_CONFLICT', 'Another operation changed the campaign clock first. No time change was applied.', {
    mutationId: id,
    expectedRevision,
    currentRevision: Number(current?.gameClockRevision ?? 0),
    currentGameClock: durableClockSnapshot(current?.gameClock ?? null),
  });
}
