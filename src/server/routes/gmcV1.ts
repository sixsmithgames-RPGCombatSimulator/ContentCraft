import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { ProjectStatus, ProjectType } from '../../shared/types/index.js';
import { parseSmartJson } from '../../shared/generation/smartJsonParser.js';

import { ProjectModel, ContentBlockModel } from '../models/index.js';
import { integrationAuth, type IntegrationRequest } from '../middleware/integrationAuth.js';
import {
  buildMemoryContext,
  collections,
  contradictionCandidates,
  createEntity,
  createFact,
  getEntity,
  listEntities,
  listFacts,
  listThreads,
  updateEntity,
  type GmcEntityKind,
} from '../services/gmcIntegrationStore.js';
import { generateStructuredJson, generationPrompts, getGeminiUsageSnapshot } from '../services/gmcLiveGeneration.js';
import {
  PLAN_COMBAT_TURN_INSTRUCTION,
  PLAN_COMBAT_TURN_REQUIRED_KEYS,
  PLAN_ENCOUNTER_INSTRUCTION,
  PLAN_ENCOUNTER_REQUIRED_KEYS,
} from './gmcV1PlanningContracts.js';

export const gmcV1Router = Router();
gmcV1Router.use(integrationAuth);

const userId = (req: Request) => (req as IntegrationRequest).userId;
const correlationId = (req: Request) => req.header('X-Sixsmith-Correlation-Id') || randomUUID();

function fail(req: Request, res: Response, status: number, code: string, message: string, details: Record<string, unknown> = {}) {
  res.status(status).json({ error: { code, message, correlationId: correlationId(req), details } });
}

function parseGameClockText(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const dayMatch = text.match(/\bday\s*(\d{1,5})\b/i);
  const meridiemMatch = text.match(/\b(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  const twentyFourHourMatch = meridiemMatch ? null : text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  const day = dayMatch ? Math.max(1, Number(dayMatch[1])) : null;
  let hour: number | null = null;
  let minute: number | null = null;
  const second = 0;
  if (meridiemMatch) {
    const rawHour = Number(meridiemMatch[1]);
    const period = meridiemMatch[3].toLowerCase().replace(/\./g, '');
    if (rawHour >= 1 && rawHour <= 12) {
      hour = rawHour % 12 + (period === 'pm' ? 12 : 0);
      minute = Number(meridiemMatch[2] ?? 0);
    }
  } else if (twentyFourHourMatch) {
    hour = Number(twentyFourHourMatch[1]);
    minute = Number(twentyFourHourMatch[2]);
  }
  const timeOfDayMatch = text.match(/\b(dawn|morning|noon|afternoon|evening|dusk|night|midnight)\b/i);
  const timeOfDay = hour === null && timeOfDayMatch ? timeOfDayMatch[1].toLowerCase() : null;
  if (day === null && hour === null && !timeOfDay) return null;
  const elapsedSeconds = day !== null && hour !== null
    ? ((day - 1) * 86400) + (hour * 3600) + ((minute ?? 0) * 60) + second
    : null;
  return { calendar: 'campaign', day, hour, minute, second, elapsedSeconds, label: null, timeOfDay, notes: '' };
}

function normalizeGameClock(input: any = {}, previous: Record<string, any> = {}) {
  const rawSource = input?.gameClock !== undefined ? input.gameClock : input;
  const parsedRaw = parseGameClockText(rawSource);
  if ((typeof rawSource !== 'object' || rawSource === null || Array.isArray(rawSource)) && parsedRaw) {
    return { ...previous, ...parsedRaw, updatedAt: new Date() };
  }
  const source = rawSource && typeof rawSource === 'object' && !Array.isArray(rawSource) ? rawSource : {};
  const parsedText = parseGameClockText(source.label ?? source.display ?? source.timeOfDay ?? '');
  const numberOrPrevious = (key: string, min: number, max: number) => {
    const value = Number(source[key] ?? parsedText?.[key as keyof typeof parsedText] ?? previous[key]);
    return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : null;
  };
  const hour = numberOrPrevious('hour', 0, 23);
  const minute = numberOrPrevious('minute', 0, 59);
  const second = numberOrPrevious('second', 0, 59) ?? 0;
  const day = numberOrPrevious('day', 1, 100000);
  const computedElapsed = day !== null && hour !== null
    ? ((day - 1) * 86400) + (hour * 3600) + ((minute ?? 0) * 60) + second
    : null;
  const elapsedSeconds = Number(source.elapsedSeconds ?? parsedText?.elapsedSeconds ?? previous.elapsedSeconds ?? computedElapsed);
  const rawLabel = String(source.label ?? source.display ?? previous.label ?? previous.display ?? '').trim();
  const label = parsedText ? '' : rawLabel;
  const timeOfDay = String(source.timeOfDay ?? parsedText?.timeOfDay ?? previous.timeOfDay ?? '').trim();
  return {
    ...(previous ?? {}),
    ...(source ?? {}),
    day,
    hour,
    minute,
    second,
    elapsedSeconds: Number.isFinite(elapsedSeconds) ? Math.max(0, Math.floor(elapsedSeconds)) : null,
    label: label || null,
    timeOfDay: timeOfDay || null,
    calendar: String(source.calendar ?? previous.calendar ?? 'campaign').trim() || 'campaign',
    notes: String(source.notes ?? previous.notes ?? '').trim(),
    updatedAt: new Date(),
  };
}

async function campaign(req: Request, res: Response, id = req.params.campaignId) {
  const project = await ProjectModel.findById(userId(req), id);
  if (!project) { fail(req, res, 404, 'NOT_FOUND', 'Campaign not found.'); return null; }
  return project;
}

const asyncRoute = (handler: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response, next: any) => {
  try { await handler(req, res); }
  catch (cause: any) {
    if (cause?.message?.includes('required')) { fail(req, res, 400, 'VALIDATION_ERROR', cause.message); return; }
    if (cause?.code) { fail(req, res, cause.status ?? 500, cause.code, cause.message, cause.details ?? {}); return; }
    next(cause);
  }
};

gmcV1Router.get('/campaigns', asyncRoute(async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 100)));
  const result = await ProjectModel.findAll(userId(req), { page, limit });
  const campaigns = result.projects.filter((project) => project.productKey === 'gamemastercraft' || ['dnd-adventure', 'dnd-homebrew', 'story-arc', 'scene'].includes(String(project.type)));
  res.json({ campaignLinks: undefined, campaigns, pagination: { page, limit, total: campaigns.length } });
}));

gmcV1Router.post('/campaigns', asyncRoute(async (req, res) => {
  const title = String(req.body?.title || '').trim();
  if (!title) { fail(req, res, 400, 'VALIDATION_ERROR', 'title is required.'); return; }
  const created = await ProjectModel.create(userId(req), {
    title,
    description: String(req.body?.description || '').trim(),
    type: ProjectType.DND_ADVENTURE,
    status: ProjectStatus.DRAFT,
    productKey: 'gamemastercraft',
    workspaceType: req.body?.gameMode === 'solo' ? 'solo_campaign' : 'group_campaign',
  });
  res.status(201).json({ campaign: created });
}));

gmcV1Router.get('/campaigns/:campaignId', asyncRoute(async (req, res) => {
  const project = await campaign(req, res); if (!project) return;
  res.json({ campaign: project });
}));

gmcV1Router.get('/campaigns/:campaignId/dashboard', asyncRoute(async (req, res) => {
  const project = await campaign(req, res); if (!project) return;
  const uid = userId(req); const id = req.params.campaignId;
  const [{ blocks }, state, scenes, npcs, locations, session] = await Promise.all([
    ContentBlockModel.findByProjectId(uid, id, { page: 1, limit: 250 }),
    collections.state().findOne({ userId: uid, campaignId: id }),
    collections.scenes().find({ userId: uid, campaignId: id }).sort({ updatedAt: -1 }).limit(100).toArray(),
    listEntities(uid, id, 'npc'), listEntities(uid, id, 'location'),
    collections.sessions().find({ userId: uid, campaignId: id }).sort({ endedAt: -1, createdAt: -1 }).limit(1).next(),
  ]);
  const currentScene = scenes.find((scene: any) => scene._id === state?.currentSceneId) ?? null;
  const currentLocation = currentScene?.locationId ? locations.find((location: any) => location._id === currentScene.locationId) ?? null : null;
  const present = new Set<string>(currentScene?.presentNpcIds ?? []);
  const memoryContext = await buildMemoryContext(uid, id, {
    currentLocationId: currentScene?.locationId ?? null,
    presentNpcIds: currentScene?.presentNpcIds ?? [],
  });
  res.json({
    campaign: project, currentScene, currentLocation,
    presentNpcs: npcs.filter((npc: any) => present.has(npc._id)),
    relevantFacts: memoryContext.facts.slice(0, 50), openThreads: memoryContext.events,
    campaignState: state ?? null,
    gameClock: state?.gameClock ?? null,
    memoryContext,
    recentSummary: session?.summary ?? null, contentSummary: blocks.map((block) => ({ id: block.id, title: block.title, type: block.type, metadata: block.metadata })),
  });
}));

gmcV1Router.get('/campaigns/:campaignId/time', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  const uid = userId(req); const id = req.params.campaignId;
  const state = await collections.state().findOne({ userId: uid, campaignId: id });
  res.json({ gameClock: state?.gameClock ?? null, campaignState: state ?? null });
}));

gmcV1Router.patch('/campaigns/:campaignId/time', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  const uid = userId(req); const id = req.params.campaignId;
  const previous = await collections.state().findOne({ userId: uid, campaignId: id });
  const gameClock = req.body?.gameClock === null ? null : normalizeGameClock(req.body ?? {}, previous?.gameClock ?? {});
  const state = await collections.state().findOneAndUpdate(
    { userId: uid, campaignId: id },
    {
      $set: { gameClock, updatedAt: new Date() },
      $setOnInsert: { userId: uid, campaignId: id },
    },
    { upsert: true, returnDocument: 'after' },
  );
  res.json({ gameClock: state?.gameClock ?? gameClock, campaignState: state });
}));

gmcV1Router.get('/campaigns/:campaignId/scenes/current', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  const uid = userId(req); const id = req.params.campaignId;
  const state = await collections.state().findOne({ userId: uid, campaignId: id });
  const scene = state?.currentSceneId ? await collections.scenes().findOne({ _id: state.currentSceneId, userId: uid, campaignId: id }) : null;
  res.json({ scene });
}));

gmcV1Router.post('/campaigns/:campaignId/scenes', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  if (!String(req.body?.name || '').trim()) { fail(req, res, 400, 'VALIDATION_ERROR', 'name is required.'); return; }
  const uid = userId(req); const id = req.params.campaignId; const timestamp = new Date();
  const scene = { _id: randomUUID(), userId: uid, campaignId: id, name: req.body.name, locationId: req.body.locationId ?? null, presentNpcIds: req.body.presentNpcIds ?? [], description: req.body.description ?? '', gmPrivateNotes: req.body.gmPrivateNotes ?? null, status: req.body.status ?? 'active', createdAt: timestamp, updatedAt: timestamp };
  await collections.scenes().insertOne(scene);
  if (req.body.makeCurrent !== false) await collections.state().updateOne({ userId: uid, campaignId: id }, { $set: { currentSceneId: scene._id, updatedAt: timestamp } }, { upsert: true });
  res.status(201).json({ scene });
}));

gmcV1Router.patch('/scenes/:sceneId', asyncRoute(async (req, res) => {
  const uid = userId(req); const { sceneId } = req.params;
  const allowed: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of ['name', 'locationId', 'presentNpcIds', 'description', 'gmPrivateNotes', 'status']) if (req.body?.[key] !== undefined) allowed[key] = req.body[key];
  const scene = await collections.scenes().findOneAndUpdate({ _id: sceneId, userId: uid }, { $set: allowed }, { returnDocument: 'after' });
  if (!scene) { fail(req, res, 404, 'NOT_FOUND', 'Scene not found.'); return; }
  if (req.body?.makeCurrent) await collections.state().updateOne({ userId: uid, campaignId: scene.campaignId }, { $set: { currentSceneId: sceneId, updatedAt: new Date() } }, { upsert: true });
  res.json({ scene });
}));

gmcV1Router.post('/campaigns/:campaignId/canon/relevant', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  const uid = userId(req); const id = req.params.campaignId; const query = String(req.body?.query || '').trim();
  const state = await collections.state().findOne({ userId: uid, campaignId: id });
  const scene = state?.currentSceneId ? await collections.scenes().findOne({ _id: state.currentSceneId, userId: uid, campaignId: id }) : null;
  const currentLocationId = req.body?.currentLocationId ?? scene?.locationId ?? null;
  const presentNpcIds = req.body?.presentNpcIds ?? scene?.presentNpcIds ?? [];
  const memoryContext = await buildMemoryContext(uid, id, { currentLocationId, presentNpcIds });
  const matches = (value: any) => !query || JSON.stringify(value).toLowerCase().includes(query.toLowerCase());
  const locations = await listEntities(uid, id, 'location', query);
  const lockedFacts = await listFacts(uid, id, { locked: true });
  res.json({
    facts: memoryContext.facts.filter(matches).slice(0, req.body?.limit ?? 20),
    items: memoryContext.items.filter(matches),
    events: memoryContext.events.filter(matches),
    npcs: memoryContext.entities.filter(matches),
    locations,
    threads: memoryContext.events.filter(matches),
    lockedFacts,
    memoryContext,
    warnings: [],
  });
}));

gmcV1Router.post('/campaigns/:campaignId/memory/context', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  const uid = userId(req); const id = req.params.campaignId;
  const state = await collections.state().findOne({ userId: uid, campaignId: id });
  const scene = state?.currentSceneId ? await collections.scenes().findOne({ _id: state.currentSceneId, userId: uid, campaignId: id }) : null;
  const memoryContext = await buildMemoryContext(uid, id, {
    currentLocationId: req.body?.currentLocationId ?? scene?.locationId ?? null,
    presentNpcIds: req.body?.presentNpcIds ?? scene?.presentNpcIds ?? [],
  });
  res.json({ memoryContext });
}));

gmcV1Router.get('/campaigns/:campaignId/canon/locked-facts', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  res.json({ facts: await listFacts(userId(req), req.params.campaignId, { locked: true }) });
}));

gmcV1Router.post('/campaigns/:campaignId/canon/check-contradictions', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  const locked = await listFacts(userId(req), req.params.campaignId, { locked: true });
  const proposals = Array.isArray(req.body?.proposedChanges) ? req.body.proposedChanges : [];
  const contradictions = proposals.flatMap((proposal: any) => contradictionCandidates(String(proposal.text ?? proposal.payload?.text ?? ''), locked as any));
  res.json({ hasContradiction: contradictions.length > 0, contradictions });
}));

gmcV1Router.get('/campaigns/:campaignId/facts', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  res.json({ facts: await listFacts(userId(req), req.params.campaignId, req.query as any) });
}));

gmcV1Router.get('/facts/:factId', asyncRoute(async (req, res) => {
  const fact = await collections.facts().findOne({ _id: req.params.factId, userId: userId(req) });
  if (!fact) { fail(req, res, 404, 'NOT_FOUND', 'Fact not found.'); return; }
  res.json({ fact });
}));

gmcV1Router.post('/campaigns/:campaignId/facts', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  res.status(201).json({ fact: await createFact(userId(req), req.params.campaignId, req.body) });
}));

gmcV1Router.patch('/facts/:factId', asyncRoute(async (req, res) => {
  const allowed: Record<string, unknown> = { recordType: 'FACT', updatedAt: new Date() };
  for (const key of ['text', 'category', 'scope', 'relatedEntityIds', 'relatedLocationIds', 'secret']) if (req.body?.[key] !== undefined) allowed[key] = req.body[key];
  const fact = await collections.facts().findOneAndUpdate({ _id: req.params.factId, userId: userId(req) }, { $set: allowed }, { returnDocument: 'after' });
  if (!fact) { fail(req, res, 404, 'NOT_FOUND', 'Fact not found.'); return; }
  res.json({ fact });
}));

gmcV1Router.post('/facts/:factId/lock', asyncRoute(async (req, res) => {
  const fact = await collections.facts().findOneAndUpdate({ _id: req.params.factId, userId: userId(req) }, { $set: { locked: true, updatedAt: new Date() } }, { returnDocument: 'after' });
  if (!fact) { fail(req, res, 404, 'NOT_FOUND', 'Fact not found.'); return; }
  res.json({ fact });
}));

gmcV1Router.post('/facts/:factId/supersede', asyncRoute(async (req, res) => {
  const fact = await collections.facts().findOneAndUpdate({ _id: req.params.factId, userId: userId(req) }, { $set: { supersededAt: new Date(), supersededByFactId: req.body?.supersededByFactId ?? null, supersedeReason: req.body?.reason ?? null, updatedAt: new Date() } }, { returnDocument: 'after' });
  if (!fact) { fail(req, res, 404, 'NOT_FOUND', 'Fact not found.'); return; }
  res.json({ fact });
}));

function registerEntityRoutes(kind: GmcEntityKind, plural: string) {
  gmcV1Router.get(`/campaigns/:campaignId/${plural}`, asyncRoute(async (req, res) => {
    if (!await campaign(req, res)) return;
    res.json({ [plural]: await listEntities(userId(req), req.params.campaignId, kind, String(req.query.search || '')) });
  }));
  gmcV1Router.get(`/${plural}/:${kind}Id`, asyncRoute(async (req, res) => {
    const entity = await getEntity(userId(req), req.params[`${kind}Id`], kind);
    if (!entity) { fail(req, res, 404, 'NOT_FOUND', `${kind} not found.`); return; }
    res.json({ [kind]: entity });
  }));
  gmcV1Router.post(`/campaigns/:campaignId/${plural}`, asyncRoute(async (req, res) => {
    if (!await campaign(req, res)) return;
    res.status(201).json({ [kind]: await createEntity(userId(req), req.params.campaignId, kind, req.body) });
  }));
  gmcV1Router.patch(`/${plural}/:${kind}Id`, asyncRoute(async (req, res) => {
    const entity = await updateEntity(userId(req), req.params[`${kind}Id`], kind, req.body);
    if (!entity) { fail(req, res, 404, 'NOT_FOUND', `${kind} not found.`); return; }
    res.json({ [kind]: entity });
  }));
  if (kind !== 'faction') gmcV1Router.post(`/campaigns/:campaignId/${plural}/generate`, asyncRoute(async (req, res) => {
    if (!await campaign(req, res)) return;
    const generated = await generateStructuredJson(generationPrompts[kind as 'npc' | 'location' | 'item'], { prompt: req.body?.prompt, campaignId: req.params.campaignId, context: req.body });
    if (!generated.name) throw Object.assign(new Error('Generated entity has no name.'), { status: 502, code: 'STRUCTURED_OUTPUT_INVALID' });
    const makeCanon = Boolean(req.body?.makeCanon);
    const entity = makeCanon ? await createEntity(userId(req), req.params.campaignId, kind, { ...generated, draft: false }) : { ...generated, draft: true };
    res.json({ [kind]: entity, draft: !makeCanon, suggestedFacts: generated.suggestedFacts ?? [] });
  }));
}

registerEntityRoutes('npc', 'npcs');
registerEntityRoutes('location', 'locations');
registerEntityRoutes('item', 'items');
registerEntityRoutes('faction', 'factions');

gmcV1Router.post('/items/:itemId/supersede', asyncRoute(async (req, res) => {
  const item = await collections.entities().findOneAndUpdate(
    { _id: req.params.itemId, userId: userId(req), type: 'item' },
    { $set: { status: 'superseded', 'details.memory.supersededAt': new Date(), 'details.memory.supersedeReason': req.body?.reason ?? null, updated_at: new Date() } },
    { returnDocument: 'after' },
  );
  if (!item) { fail(req, res, 404, 'NOT_FOUND', 'item not found.'); return; }
  res.json({ item });
}));

gmcV1Router.get('/campaigns/:campaignId/threads', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  res.json({ threads: await listThreads(userId(req), req.params.campaignId, req.query as any) });
}));

gmcV1Router.get('/threads/:threadId', asyncRoute(async (req, res) => {
  const thread = await collections.threads().findOne({ _id: req.params.threadId, userId: userId(req) });
  if (!thread) { fail(req, res, 404, 'NOT_FOUND', 'Thread not found.'); return; }
  res.json({ thread });
}));

gmcV1Router.post('/campaigns/:campaignId/threads', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  if (!req.body?.title) { fail(req, res, 400, 'VALIDATION_ERROR', 'title is required.'); return; }
  if (!req.body?.deadlineAt && !String(req.body?.deadlineDescription ?? req.body?.deadline ?? '').trim()) {
    fail(req, res, 400, 'VALIDATION_ERROR', 'EVENT requires deadlineAt or deadlineDescription.'); return;
  }
  if (req.body?.deadlineAt && Number.isNaN(Date.parse(String(req.body.deadlineAt)))) {
    fail(req, res, 400, 'VALIDATION_ERROR', 'deadlineAt must be an ISO-8601 date-time.'); return;
  }
  if (!String(req.body?.consequence ?? '').trim()) {
    fail(req, res, 400, 'VALIDATION_ERROR', 'EVENT consequence is required.'); return;
  }
  const timestamp = new Date();
  const thread = {
    _id: randomUUID(), userId: userId(req), campaignId: req.params.campaignId,
    recordType: 'EVENT', title: req.body.title, description: req.body.description ?? '',
    deadlineAt: req.body.deadlineAt ?? null,
    deadlineDescription: req.body.deadlineDescription ?? req.body.deadline ?? null,
    consequence: req.body.consequence ?? '',
    scope: req.body.scope ?? { kind: 'geographic', tier: 'world', locationId: null, entityId: null },
    relatedNpcIds: req.body.relatedNpcIds ?? [], relatedLocationIds: req.body.relatedLocationIds ?? [],
    status: req.body.status ?? 'open',
    source: req.body.source ?? { system: 'gamemastercraft' },
    createdAt: timestamp, updatedAt: timestamp,
  };
  await collections.threads().insertOne(thread); res.status(201).json({ thread });
}));

gmcV1Router.patch('/threads/:threadId', asyncRoute(async (req, res) => {
  const allowed: Record<string, unknown> = { recordType: 'EVENT', updatedAt: new Date() };
  for (const key of ['title', 'description', 'deadlineAt', 'deadlineDescription', 'consequence', 'scope', 'relatedNpcIds', 'relatedLocationIds', 'status', 'source']) if (req.body?.[key] !== undefined) allowed[key] = req.body[key];
  const thread = await collections.threads().findOneAndUpdate({ _id: req.params.threadId, userId: userId(req) }, { $set: allowed }, { returnDocument: 'after' });
  if (!thread) { fail(req, res, 404, 'NOT_FOUND', 'Thread not found.'); return; }
  res.json({ thread });
}));

gmcV1Router.post('/threads/:threadId/resolve', asyncRoute(async (req, res) => {
  const thread = await collections.threads().findOneAndUpdate({ _id: req.params.threadId, userId: userId(req) }, { $set: { status: 'resolved', resolution: req.body?.resolution ?? '', sourceSessionRunId: req.body?.sourceSessionRunId ?? null, resolvedAt: new Date(), updatedAt: new Date() } }, { returnDocument: 'after' });
  if (!thread) { fail(req, res, 404, 'NOT_FOUND', 'Thread not found.'); return; }
  res.json({ thread });
}));

gmcV1Router.post('/threads/:threadId/supersede', asyncRoute(async (req, res) => {
  const thread = await collections.threads().findOneAndUpdate(
    { _id: req.params.threadId, userId: userId(req) },
    { $set: { status: 'superseded', supersededAt: new Date(), supersedeReason: req.body?.reason ?? null, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!thread) { fail(req, res, 404, 'NOT_FOUND', 'Thread not found.'); return; }
  res.json({ thread });
}));

gmcV1Router.post('/campaigns/:campaignId/sessions', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  const session = { _id: randomUUID(), userId: userId(req), campaignId: req.params.campaignId, ...req.body, createdAt: new Date(), updatedAt: new Date() };
  await collections.sessions().insertOne(session); res.status(201).json({ sessionId: session._id, session });
}));

gmcV1Router.patch('/sessions/:sessionId/summary', asyncRoute(async (req, res) => {
  const session = await collections.sessions().findOneAndUpdate({ _id: req.params.sessionId, userId: userId(req) }, { $set: { summary: req.body?.summary ?? '', keyDecisions: req.body?.keyDecisions ?? [], openThreads: req.body?.openThreads ?? [], resolvedThreads: req.body?.resolvedThreads ?? [], updatedAt: new Date() } }, { returnDocument: 'after' });
  if (!session) { fail(req, res, 404, 'NOT_FOUND', 'Session not found.'); return; }
  res.json({ session });
}));

async function ai(req: Request, res: Response, instruction: string, requiredKeys: string[]) {
  const output = await generateStructuredJson(instruction, req.body, { operation: req.path, correlationId: correlationId(req) });
  if (!output || typeof output !== 'object' || requiredKeys.some((key) => output[key] === undefined)) {
    throw Object.assign(new Error(`Structured AI response is missing required fields: ${requiredKeys.join(', ')}.`), { status: 502, code: 'STRUCTURED_OUTPUT_INVALID' });
  }
  res.json(output);
}

gmcV1Router.get('/ai/usage', asyncRoute(async (_req, res) => {
  res.json(getGeminiUsageSnapshot());
}));

gmcV1Router.post('/tools/parse-json', asyncRoute(async (req, res) => {
  const parsed = parseSmartJson(req.body?.text, {
    requireObject: req.body?.requireObject !== false,
    allowSingleItemArray: true,
    maxLength: 200_000,
  });
  if (parsed.ok === false) {
    fail(req, res, 400, 'INVALID_JSON', parsed.message, { warnings: parsed.warnings });
    return;
  }
  res.json({
    value: parsed.value,
    foundJsonBlock: parsed.foundJsonBlock,
    repaired: parsed.repaired,
    warnings: parsed.warnings,
  });
}));

gmcV1Router.post('/ai/classify-intent', asyncRoute((req, res) => ai(req, res, 'Classify the input. Return {intentType, confidence, structuredIntent, requiresVcs, requiresGameMasterCraft}. Allowed intentType values: narrative_action, mechanical_action, mixed_action, canon_query, rules_query, generation_request, prep_request, sync_request, correction, retcon, ooc_question, system_command.', ['intentType', 'confidence', 'structuredIntent', 'requiresVcs', 'requiresGameMasterCraft'])));
gmcV1Router.post('/ai/generate-narration', asyncRoute((req, res) => ai(req, res, `Continue directly from the established current state in conversationHistory. The supplied continuityContract is binding.
First determine the player's NEW intent in the current instruction relative to the final assistant turn. Repeated wording may describe a multi-step method or refer to completed work; it is not permission to perform completed steps again. Deictic words such as "other", "next", "then", "after", "already", "again", and "continue" must advance their referent. Preserve all established positions, injuries, deaths, possessions, discoveries, searches, dialogue, and consequences, with the latest retcon taking precedence. Never re-award loot, re-search the same target, re-enter a location, or replay movement already completed. Resolve or materially advance each distinct new action in order. Do not merely paraphrase the instruction. Stop only at a genuine player decision or a check that the binding dmCheckPolicy actually requires.
The supplied narrativeMomentumPolicy is binding. Treat a compound instruction as one authorization chain: a required roll may pause it, but after the roll resolves complete every remaining authorized step unless the result makes it impossible or creates a significant interruption. Carry established operating methods such as familiar scouting, shield formation, avoiding obvious alarms, following the strongest known lead, and continuing until contact through routine traversal until circumstances materially invalidate them.
Before stopping, apply all parts of narrativeMomentumPolicy.significantStopAudit. Fresh player input must actually be required; reasonable options must have materially different consequences; and the unresolved choice must not already be answered by the instruction or established method. A junction, warning cord, unattended lamp, door, bend, route marker, suspicious but inert prop, or empty stretch is not independently a decision point merely because it can be described. Re-audit inherited active segments and importantBeats: a prior response naming a micro-beat does not make it significant, so redirect or fold it forward when it lacks material stakes. Apply successful-check benefits and continue toward a valid prepared importantBeat, active opposition, material discovery, costly commitment, irreversible choice, or terminal scene outcome. Do not invent a breadcrumb ladder of micro-obstacles to manufacture prompts.
Planning is not execution. If the player says they start to plan, formulate or devise a plan, consider options, think about acting, watch, wait, or observe, keep them in that mental or observational state. Do not choose a plan for them, move them, manipulate an object, spend a resource, trigger a hazard, advance time pressure, or infer that a contemplated future action has begun. "Formulate a plan to sabotage it" does not authorize sabotage. Offer only information already available for deliberation and stop for the player's concrete decision.
Use the supplied authoritative VCS result and campaign memory. Never invent, change, or recompute mechanical numbers. Do not contradict locked facts. Use playerCharacter capabilities and passive scores; never surface hidden reads. Passive resolution includes passive Perception, Insight, Investigation, or 10 + another applicable modifier when the DM chooses a passive repeated/secret task. If skillCheckDecision.resolutionMode is passive, use its passiveValue and passiveSuccess without mentioning a check, DC, success, or failure. Before requesting an eligible visible roll, state its DC and every scene-specific outcome band. Canon proposals must use recordType FACT, ITEM, or EVENT; FACT includes scope, ITEM includes itemTier/location/ownership, and EVENT includes a deadline plus the consequence of inaction.
Use the supplied treasureRewardPolicy when the interaction establishes loot, coin, valuables, gear, or magic. This is a high-magic solo campaign; reward pacing should be more favorable than standard party play while remaining plausible in the scene and avoiding duplicate awards.
Use the supplied sceneSegmentPolicy and sceneImportancePolicy as binding scene scaffolding. Maintain the current playable segment as a known where/when/who/why/objective/doneWhen frame with importantBeats, knownDetails, and evidenceLedger. If the active segment is missing, stale, or underspecified, return sceneSegmentUpdate.status "active" with that scaffold. If the segment reaches an endpoint, return a terminal sceneSegmentUpdate with outcome, rewards, and arc impacts before framing the next decision.
Use sceneImportanceContext before treating any detail as substantial, damning, newly collectible evidence, XP-worthy progress, or canon. A repeated known hazard or motif may orient or warn the player, but it is not new evidence unless this turn establishes a new source, pattern, quantity, condition, actor link, timing, route information, or safe collection method. Violet residue or violet leakage that has already been seen and warned against is normally a known hazardous trace, not a fresh proof packet to collect.
The supplied gameTimePolicy and gameTimeContext are binding. Keep in-world time consistent. As a courtesy, mention current time of day/night and realistic travel or activity durations when the player is choosing where to go or what to spend time doing. If an action, rest, ritual, search, travel, wait, conversation, or other activity consumes meaningful time, state the duration in narration and return proposedTimeAdvance. Combat uses VCS scale: one round is about 6 seconds; do not turn every individual turn into a separate large time jump. Do not advance time for pure planning or observation unless the player actually waits or spends time. If the exact clock is unknown, say so briefly and use relative durations until a clock anchor is established.
Return {narration, npcDialogue, requiresVcsResolution, proposedCanonChanges, proposedVcsExports, proposedTimeAdvance, sceneSegmentUpdate, riskLevel, syncNotes, gmPrivateNotes}. proposedTimeAdvance is null or {shouldAdvance,seconds,minutes,reason,activity,clockAfter}. sceneSegmentUpdate is null or {status,title,where,when,who,whyPresent,objective,doneWhen,importantBeats,knownDetails,evidenceLedger,stakes,availableRewards,rewardsRealized,rewardsMissed,outcome,arcImpacts,nextSceneSeed}.`, ['narration', 'proposedCanonChanges', 'proposedVcsExports', 'riskLevel', 'syncNotes'])));
gmcV1Router.post('/ai/validate-narration-continuity', asyncRoute((req, res) => ai(req, res, `Act as a strict continuity editor, not a storyteller. Compare candidateNarration with the ordered conversationHistory, current instruction, continuityContract, authoritative VCS state, and campaign dashboard.
Mark the candidate invalid if it repeats an action already completed; awards the same item, money, information, damage, movement, or search result twice; contradicts the latest retcon or established state; ignores referents such as "other" or "next"; converts planning, considering, thinking, watching, or waiting into execution of a contemplated action; fails to resolve or materially advance an explicit new action; substitutes a recap for progress; or narrates a roll-dependent outcome without an authoritative result. A short orientation phrase is allowed, but the response must move forward without exceeding the player's stated intent.
Also mark the candidate invalid if it upgrades a known or repeated detail from sceneImportanceContext into newly damning, substantial, collectible, XP-worthy, or canon-worthy evidence without a new differentiator from the current turn or explicit scene-plan importance. Known violet residue/leakage may be restated as a hazard or continuity reminder; it is not fresh decisive evidence by repetition alone.
Use narrativeMomentumPolicy to mark the candidate invalid when it stops at routine follow-through, asks the player to repeat an already stated method, fails to finish actions after a resolved roll, or presents a cosmetic/procedural option menu whose choices lack materially different consequences. Minimally extend the correction through those micro-beats to the next significant interruption.
If valid, preserve candidateNarration exactly as correctedNarration. If invalid, write a minimally changed replacement that repairs every listed issue, honors the player's actual intent, preserves authoritative mechanics and established facts, and stops at the next genuine decision or properly framed roll. Do not add new mechanics merely to make the prose interesting.
Return {valid, issues:[{code,explanation}], correctedNarration, understoodPlayerIntent, stateAdvanced}.`, ['valid', 'issues', 'correctedNarration', 'understoodPlayerIntent', 'stateAdvanced'])));
gmcV1Router.post('/ai/evaluate-experience-award', asyncRoute((req, res) => ai(req, res, `Evaluate only the newly completed achievement in this interaction for a fair individual XP award. Use the supplied xpAwardPolicy as binding limits and consider character level, actual danger, difficulty, consequences, ingenuity, discovery, roleplay impact, and authoritative VCS mechanics.

Award XP for meaningful progress, including combat victories, surviving serious danger, resolving or circumventing puzzles and obstacles, significant discoveries, strong consequential social play, objectives, and clever nonviolent solutions. Circumventing a challenge earns comparable XP to defeating it when it resolves the same obstacle. A small but meaningful dialogue beat may earn 5 XP. Routine conversation, repeated actions, bookkeeping, unconfirmed plans, mere attempts, or narration that makes no progress earn 0.

Do not award per attack, per line of dialogue, or repeatedly for the same challenge. A combat encounter is awarded when its outcome is resolved, not for each combat turn. Do not stack "defeated", "survived", and "circumvented" rewards for one obstacle. Use prior conversation and authoritative state to identify already-rewarded or unresolved challenges. Prefer the low end when risk or impact is modest and the high end only for genuinely severe or campaign-shaping achievements. Use monster XP from authoritative data when available, adjusted for the character's share, but never invent a monster XP value.
Use sceneImportancePolicy and sceneImportanceContext when judging discovery XP. Repeatedly noticing or mentioning the same known clue, residue, warning, or hazard earns 0 unless the new interaction establishes a material differentiator, resolves a scene objective, safely recovers something that could not previously be recovered, or changes the campaign state.

Return {shouldAward,amount,category:'dialogue|roleplay|social|exploration|discovery|puzzle|combat|survival|objective|creative_solution|none',difficulty:'trivial|minor|meaningful|major|deadly|campaign',rationale,relatedChallengeId,alreadyRewarded,confidence,evidence}. amount must be a non-negative integer multiple of 5 and must remain inside the policy range for the selected difficulty.`, ['shouldAward', 'amount', 'category', 'difficulty', 'rationale', 'relatedChallengeId', 'alreadyRewarded', 'confidence', 'evidence'])));
gmcV1Router.post('/ai/adjudicate-skill-check', asyncRoute((req, res) => ai(req, res, `Adjudicate whether the current player instruction requires a D&D ability or skill check before any outcome is narrated. The supplied dmCheckPolicy is binding.

Choose exactly one resolutionMode:
- no_roll: there is no meaningful uncertainty, no consequential failure, the attempt is impossible, or it is routine. Routine success may be narrated normally.
- passive: passive Perception or passive Insight meets the DC, so the character notices or understands automatically without revealing a check.
- player_roll: the character is consciously attempting something uncertain and the player may know a check is occurring.
- hidden_roll: knowing a roll occurred or seeing its result would reveal hidden information, including whether someone is following, watching, lying, concealed, or absent. The server will roll privately and narration must never mention the check.

Apply passive and visibility adjudication in this order:
1. First decide whether the task has meaningful uncertainty, a real failure consequence, and an actual opportunity the method could affect. A player saying "I roll", asking for a check, or volunteering a die result is only an adjudication request; it does not create a check and the volunteered number is not authoritative. Choose no_roll when there is nothing meaningful to resolve.
2. For standing vigilance, repeated searching/scouting, routine examination, and unknown opportunities, compare passive Perception, Insight, Investigation, or 10 + the applicable modifier. Choose passive and return passiveEligible:true when passive resolution is appropriate; do not reveal the DC or that an opportunity was checked.
3. Choose hidden_roll only when meaningful variability beyond passive resolution is warranted and merely knowing a check occurred would leak a creature, clue, lie, trap, observer, or missed opportunity. Return passiveEligible:false when the hidden roll must remain variable even if the passive score meets the DC.
4. Choose player_roll only when the character knowingly undertakes a consequential uncertain task and awareness of the check does not reveal hidden state.

Review recent conversationHistory rollRequest entries. Do not offer or accept a reroll for the same unchanged task after a low result. Require a material change in method, circumstances, information, tools, help, time investment, or consequence. A declared ongoing scouting/search method is not a request for another roll at every opportunity.

Use dmCheckPolicy.sequenceResolution and narrativeMomentumPolicy. One check resolves the declared method across its immediate action sequence until the circumstances, threat, stakes, opposition, or method materially change. Do not request another scouting, searching, trap-checking, or route-reading roll merely because the group reaches the next short corridor, branch, bend, object, or movement interval. A compound instruction such as "disable the alarm, then proceed" keeps the second action authorized after the first action's check resolves.

Planning, considering, thinking through options, watching, waiting, and beginning to formulate a future plan do not call for a roll and do not authorize the contemplated action. Choose no_roll without resolving or advancing that future action. "I start to formulate a plan to sabotage it" means only that deliberation begins; the character has not touched, approached, sabotaged, or manipulated anything.

Choose Perception versus Investigation by the purpose of the action, not by whether the player used words such as look, search, inspect, examine, or investigate:
- Wisdom (Perception) detects or locates what can be noticed through the senses. Use it for looking around, watching, scanning, listening, smelling, spotting movement or hidden creatures, noticing visible details, and ordinary searches of a room, body, container, or area. Active searching does not make the check Investigation.
- Intelligence (Investigation) interprets evidence and reasons toward a conclusion. Use it for connecting clues, deciding what evidence matters, reconstructing events, deciphering information, solving puzzles, finding patterns, and determining how or why a mechanism works, broke, or was altered.
- Ask what success answers. If it answers "What do I notice?" or "Where is it?", prefer Perception. If it answers "What does this mean?", "How does this work?", or "What can I deduce?", prefer Investigation.
- A methodical search may use Investigation only when organization, inference, or understanding is the obstacle. Do not select Investigation merely because the search is deliberate or targets a physical clue.

Do not narrate evidence, clues, observers, success, failure, or ambiguity before a required roll. For player_roll, provide brief preRollNarration that positions the attempt without resolving it, and five concrete scene-specific stake bands keyed criticalFailure, partial, success, greatSuccess, criticalSuccess. Each band must tell the player what changes at that outcome; do not use generic boilerplate. Use only these skills when applicable: acrobatics, animal_handling, arcana, athletics, deception, history, insight, intimidation, investigation, medicine, nature, perception, performance, persuasion, religion, sleight_of_hand, stealth, survival. Use a DC from 5 to 30 and rollMode normal|advantage|disadvantage. Consult playerCharacter passives and modifiers. If a passive floor resolves the information, choose passive rather than player_roll.

The supplied gameTimePolicy is binding. If the check itself would consume meaningful time, include that in the lite stakes and full stakes as a concrete cost or pressure. If two approaches differ primarily by time, make that clear.
Use sceneImportancePolicy and sceneImportanceContext when deciding whether the check discovers something new. Rechecking a known hazard can confirm, avoid, bypass, identify a new differentiator, or establish safe handling, but the stakes must not promise decisive new evidence from a repeated known detail unless the scene scaffold or current method supports it.
Return {resolutionMode,skill,ability,dc,rollMode,passiveEligible,reason,preRollNarration,stakes:{criticalFailure,partial,success,greatSuccess,criticalSuccess},estimatedTimeCost,confidence}.`, ['resolutionMode', 'skill', 'ability', 'dc', 'rollMode', 'reason', 'preRollNarration', 'stakes', 'confidence'])));
gmcV1Router.post('/ai/narrate-skill-check-result', asyncRoute((req, res) => ai(req, res, `Narrate the authoritative VCS skill-check result and continue directly from the player's original action. Use authoritativeCheckOutcome and the matching scene-specific stake in rollRequest.stakes. Never change the d20, modifier, total, DC, margin, or outcome band. Do not replay actions completed before this check. If rollRequest.visibility is hidden, never mention a roll, DC, failure, success, modifier, or that hidden information was tested; simply narrate what the character perceives from the authoritative outcome. For a visible player roll, natural prose may reflect the quality of the result but should not read like a rules log. Resolve the attempted action and preserve uncertainty that the outcome band does not reveal.
The supplied narrativeMomentumPolicy is binding. The roll paused the player's compound instruction; it did not cancel actions that followed the checked step. Finish every remaining authorized action unless the result makes it impossible or creates a significant interruption. Carry established operating methods through routine follow-through, apply the benefit earned by the roll, and stop only after every part of significantStopAudit passes. Do not stop at a junction, alarm, unattended object, route marker, door, bend, or empty stretch merely to offer inspect/scout/bypass choices. Continue to active opposition, a material discovery or tradeoff, a costly or irreversible commitment, a prepared importantBeat, or a terminal scene outcome that genuinely requires fresh input.
Use the supplied treasureRewardPolicy when the resolved check establishes loot, coin, valuables, gear, or magic. This is a high-magic solo campaign; reward pacing should be more favorable than standard party play while remaining plausible and avoiding duplicates.
Use the supplied sceneSegmentPolicy and sceneImportancePolicy. Return sceneSegmentUpdate when the check materially changes the active segment, completes it, or reveals that the segment scaffold is missing. Treat repeated known hazards and motifs as continuity unless the authoritative outcome establishes a new differentiator. Do not turn known violet residue/leakage into newly damning evidence or a collection objective by success narration alone.
The supplied gameTimePolicy and gameTimeContext are binding. If the resolved check consumed meaningful travel, searching, waiting, conversation, ritual, or other activity time, state that duration and return proposedTimeAdvance. Keep time costs consistent with the original stakes and do not add extra time beyond the outcome band.
Return {narration,proposedCanonChanges,proposedVcsExports,proposedTimeAdvance,sceneSegmentUpdate,riskLevel,syncNotes,gmPrivateNotes}. proposedTimeAdvance is null or {shouldAdvance,seconds,minutes,reason,activity,clockAfter}. sceneSegmentUpdate is null or {status,title,where,when,who,whyPresent,objective,doneWhen,importantBeats,knownDetails,evidenceLedger,stakes,availableRewards,rewardsRealized,rewardsMissed,outcome,arcImpacts,nextSceneSeed}.`, ['narration', 'proposedCanonChanges', 'proposedVcsExports', 'riskLevel', 'syncNotes'])));
gmcV1Router.post('/ai/respond-ooc', asyncRoute((req, res) => ai(req, res, 'Respond out of character as the DM to the player, using conversationHistory and campaign context. Answer every direct player question before offering next steps. Do not narrate the player character taking actions. Clearly distinguish rules/table discussion from in-world facts. If the player identifies a continuity or plausibility problem, do not defend the narration by inventing an unsupported explanation: acknowledge the concrete inconsistency, state the corrected interpretation, and say whether a retcon is needed. When initiative or a check is challenged, compare it to the player\'s actual wording rather than actions invented by prior narration. Planning, considering, thinking, watching, and waiting are not execution; acknowledge an erroneous initiative transition when no concrete tactical action occurred. If the player asks whether a check is appropriate, apply dmCheckPolicy and explain the decision and stakes directly. If the player asks about time, answer from gameTimeContext and gameTimePolicy, distinguishing exact clock time from estimates. Never claim that a VCS character sheet, inventory, currency balance, hit points, hit dice, XP, or the campaign clock was updated; the caller performs and confirms authoritative writes separately. Return {response,continuityNotes,proposedCanonChanges}.', ['response', 'continuityNotes', 'proposedCanonChanges'])));
gmcV1Router.post('/ai/plan-character-sheet-mutation', asyncRoute((req, res) => ai(req, res, `Decide whether this interaction establishes or explicitly requests an authoritative VCS character-sheet change. Use currentSheet as the starting authority and the ordered conversationHistory to distinguish newly established changes from possessions or costs already synchronized. The candidateResponse is prose only and is not proof that a write occurred.

Return a mutation only for confirmed acquisitions, losses, expenditures, healing, damage, rests, or explicit bookkeeping corrections. Do not mutate for plans, attempts, hypothetical rewards, disputed outcomes, or merely mentioning an existing possession. When the player asks to backfill an established but unsynchronized reward, include it once. A prior conversation entry whose sheetMutation status is applied is already synchronized and must never be applied again.

The supplied treasureRewardPolicy is binding when interpreting newly established coin, valuables, gear, and magic. This is a high-magic solo campaign, so plausible rewards should be more favorable than standard party play. Use the policy baseline as calibration while preserving the fiction and never duplicating already synchronized loot.

Currency rules:
- Use mode delta for coin gained or spent so existing recorded wealth is preserved. Values may be positive or negative integers.
- Use mode set only when the player explicitly gives an authoritative replacement balance for the whole denomination or requests a correction to that exact total.
- Never reinterpret a newly gained amount as the character's whole balance.

Inventory rules:
- add contains only items newly owned by the character; use a stable concise name and quantity.
- remove contains items actually lost, consumed, sold, or transferred, with quantity when known.
- Do not put currency in inventory items.

HP, hit-dice, and XP rules:
- Use delta for newly established damage, healing, spent/recovered dice, or manual XP adjustments.
- Use set only for an explicit authoritative correction.
- Ordinary GMA milestone/challenge XP awards are handled by a separate audited path, so leave XP unchanged unless the player explicitly requests a manual correction.

Return {
  shouldMutate,
  confidence,
  reason,
  currency:{mode:'none|delta|set',cp,sp,ep,gp,pp},
  items:{add:[{name,quantity}],remove:[{name,quantity}]},
  hitPoints:{mode:'none|delta|set',current,maximum,temporary},
  hitDice:{mode:'none|delta|set',total,spent},
  experiencePoints:{mode:'none|delta|set',value}
}. Use zero for unused numeric values, empty arrays for unused item operations, and confidence from 0 to 1.`, ['shouldMutate', 'confidence', 'reason', 'currency', 'items', 'hitPoints', 'hitDice', 'experiencePoints'])));
gmcV1Router.post('/ai/retcon-narration', asyncRoute((req, res) => ai(req, res, 'Apply the player retcon instruction as an authoritative correction to recent conversationHistory. Discard contradicted narration and preserve everything not affected. The corrected narration becomes established current state: concrete possessions, discoveries, injuries, deaths, positions, completed searches, and elapsed in-world time it states must not be awarded or performed again in later turns. Continue from the corrected state without replaying earlier beats. Do not alter VCS mechanics or campaign time unless an authoritative restored snapshot or explicit retcon instruction is supplied. If the corrected continuation reaches a check, the supplied dmCheckPolicy is binding and all stakes must be disclosed before requesting the roll. Use gameTimePolicy for any corrected time handling. Return {narration,correctionSummary,proposedCanonChanges,proposedTimeAdvance,continuityNotes}.', ['narration', 'correctionSummary', 'proposedCanonChanges', 'continuityNotes'])));
gmcV1Router.post('/ai/generate-npc-dialogue', asyncRoute((req, res) => ai(req, res, 'Generate canon-aware NPC dialogue. Preserve secrets and motivations. Return {dialogue, narration, proposedCanonChanges}.', ['dialogue', 'narration', 'proposedCanonChanges'])));
gmcV1Router.post('/ai/extract-canon-changes', asyncRoute((req, res) => ai(req, res, `Extract only durable, newly established story memory from the ordered transcript. Use campaignDashboard to avoid duplicating existing entities or records. The latest retcon supersedes contradicted text. Player plans, questions, speculation, failed narration, and unconfirmed possibilities are not canon. Raw mechanics become memory only when they create a durable story consequence.
Use sceneImportancePolicy and sceneImportanceContext. Do not propose canon for a repeated known hazard, residue, clue, warning, or motif unless the latest interaction establishes a new material fact about source, pattern, quantity, condition, actor connection, timing, route information, safe recovery, ownership, or scene outcome. Violet residue/leakage already seen and warned against remains an existing hazard/reminder unless this transcript adds one of those differentiators.

Keep canonical entities separate from memory records:
- proposedEntities contains newly introduced or materially changed NPCs, locations, and factions. Use entityType 'npc|location|faction'. NPC entityTier is 'bbeg|lieutenant|henchman|contact'. Locations use geographicTier 'world|city|district|site|room' and parentLocationId when known. Use changeType 'create|update' and an existing targetId for updates. Do not create a second entity for a known person or place.
- FACT is a durable truth. Geographic scope is {kind:'geographic',tier:'world|city|district|site|room',locationId}; entity scope is {kind:'entity',tier:'bbeg|lieutenant|henchman|contact',entityId}. Attach truths about a person to that entity rather than repeating the person as prose.
- ITEM is one discrete physical object or sensible stack, with itemTier 'plot|mundane|currency|furniture', currentLocationId, ownerEntityId, and ownerType when known. Plot items always surface; currency, mundane items, and furniture remain local. Ownership transfers are updates, not duplicate item creation.
- EVENT is only a pending pressure that will happen unless interrupted, never a completed past occurrence. It requires deadlineAt or deadlineDescription, a concrete consequence of inaction, and geographic or entity scope. Use gameTimeContext when interpreting relative deadlines such as tonight, second bell, after the long rest, or when the shipment leaves.

Choose the narrowest correct scope. Prefer room/site over district/city when a truth is local; use world only for genuinely universal truths. Return no proposal for atmospheric prose, repeated facts, or trivial transient motion.
Return {
  proposedEntities:[{entityType,changeType,targetId,name,summary,entityTier,geographicTier,parentLocationId,payload,riskLevel,reason}],
  proposedCanonChanges:[{recordType:'FACT|ITEM|EVENT',changeType,targetId,summary,payload,scope,itemTier,currentLocationId,ownerEntityId,ownerType,deadlineAt,deadlineDescription,consequence,riskLevel,requiresHardApproval,reason}]
}.`, ['proposedEntities', 'proposedCanonChanges'])));
gmcV1Router.post('/ai/summarize-session', asyncRoute((req, res) => ai(req, res, 'Summarize the session using the transcript, authoritative mechanical summary, and approved canon changes. Return {summary,keyDecisions,npcUpdates,openThreads,resolvedThreads,suggestedNextSessionSetup}.', ['summary', 'keyDecisions', 'npcUpdates', 'openThreads', 'resolvedThreads', 'suggestedNextSessionSetup'])));
gmcV1Router.post('/ai/build-campaign-foundation', asyncRoute((req, res) => ai(req, res, `Build a rich but playable tabletop campaign foundation from the supplied Session 0 answers.
Respect every stated line, veil, content limit, desired theme, rules preference, and play-mode choice. For solo play, create a strong protagonist-facing opening, preserve player agency, and give the GM system useful uncertainty without deciding the protagonist's choices.

Build enough campaign structure for real play after Session 0, not a thin opening seed. Do not write a railroad or decide future player choices. Create flexible layers that can survive unexpected routes:
- campaign spine: premise, central question, core conflict, antagonist pressure, win/loss shape, and why the campaign matters;
- setting frame: where play begins, what the player-facing truths are, what is strange or unstable, and what ordinary life looks like before trouble escalates;
- factions: at least three active groups with goals, methods, resources, relationships, and what they do if ignored;
- antagonist map: BBEG or campaign-level pressure, lieutenants, henchmen, contacts, and minions as roles. Mark unrevealed identities as provisional roles, not scene-present NPCs;
- arcs and sub-arcs: 3-5 major arcs plus 4-8 sub-arcs/side arcs with start triggers, completion signals, consequences, rewards, and impact on the campaign spine;
- clue/secret network: important secrets, evidence paths, alternate clues, and how clues point to people, places, items, or next choices;
- locations: starting site plus several keyed locations that each have a purpose, pressure, secret, and reason to revisit;
- scenes: opening scene must have where, when, who, objective, important beats, known details, doneWhen, rewards, exits, and arc impacts;
- progression: level/chapter rhythm, treasure/reward types, XP/milestone assumptions, downtime hooks, and escalating stakes;
- coherence: recurring motifs, canon boundaries, flexible continuity rules, and what must remain true even if the player bypasses planned content.

Use proven campaign composition lessons without copying any published adventure: strong central villain pressure and sense of place; readable early escalation; real faction procedures behind faction-heavy play; non-linear clue networks; linked sandbox locations; meaningful clocks and consequences. Keep future secrets labeled as GM-private/provisional. Established facts must be safe to store as canon; provisional plans must be clearly provisional.
Return {
  campaign:{title,tagline,pitch,tone,themes,campaignPillars,sixTruths,centralQuestion,settingFrame,intendedLevelRange,gmPrinciples},
  campaignStructure:{
    spine:{premise,centralConflict,bbeg,bbegWants,doomClock,winCondition,lossCondition,gmSecret},
    arcs:[{title,tier:'campaign|chapter|side|character',premise,playerFacingHook,gmSecret,startTrigger,completionSignals,consequence,rewardKinds,scope,relatedNpcNames,relatedLocationNames}],
    coherenceMap:{recurringMotifs,tensionEscalation,flexibilityPrinciples,canonBoundaries}
  },
  progressionPlan:[{phase,levelRange,focus,unlockSignals,rewardAssumptions}],
  rewardPlan:[{rewardType,whenAwarded,examples,scaleNotes}],
  startingLocation:{name,description,atmosphere,features,secrets,hooks,tags},
  keyLocations:[{name,description,geographicTier,parentLocationName,purpose,pressure,secret,revisitHook,tags}],
  openingScene:{name,description,where,when,objective,doneWhen,importantBeats,knownDetails,evidenceLedger,rewards,arcImpacts,playerExits,gmPrivateNotes,presentNpcNames},
  initialFactions:[{name,role,status,publicFace,secret,goal,methods,resources,relationshipToProtagonist,tags}],
  initialFacts:[{text,category,scope:{kind,tier,locationId,locationName,entityId,entityName},locked,secret}],
  initialNpcs:[{name,role,entityTier,presentInOpeningScene,motivation,secret,voice,relationshipToProtagonist,tags}],
  openThreads:[{title,description,deadlineDescription,consequence,scope:{kind,tier,locationId,locationName,entityId,entityName}}],
  sessionZeroSummary:{summary,keyDecisions,safetyNotes,playStyleNotes}
}. FACT scope tier must be geographic (world, city, district, site, room) or entity (bbeg, lieutenant, henchman, contact). NPC entityTier uses bbeg, lieutenant, henchman, or contact. Location geographicTier uses world, city, district, site, or room. Every open thread is an EVENT: give it a meaningful trigger/deadline and a concrete consequence if it goes unaddressed. Generate at least 10 durable initial facts, 6-12 NPCs, 3-6 factions, 4-8 keyed locations, and 8-16 open threads unless Session 0 explicitly calls for a tiny campaign.`, ['campaign', 'campaignStructure', 'progressionPlan', 'rewardPlan', 'startingLocation', 'keyLocations', 'openingScene', 'initialFactions', 'initialFacts', 'initialNpcs', 'openThreads', 'sessionZeroSummary'])));
gmcV1Router.post('/ai/detect-encounter-transition', asyncRoute((req, res) => ai(req, res, `Decide whether the supplied player instruction and established current scene have crossed into an encounter that needs a VCS BattleRoom right now. Default to continued narrative play.

A BattleRoom is appropriate only when all are true:
- A concrete attack, hostile confrontation, chase, or immediate tactical hazard has actually begun in the current moment.
- The order and position of multiple actors now matter before the next outcome can be resolved fairly.
- The scene cannot be resolved cleanly with narration, one ability check, or a short sequence of checks.

Do not create a BattleRoom for following or watching someone, scouting, sneaking, pickpocketing, lifting a purse, preparing a distraction, creating or waiting for an opportunity, setting a trap that has not triggered, stating a hoped-for knockout, or describing a plan that might lead to violence later. A desired future result such as knocking someone down or out is not an immediate attack when the current action is still arranging the opportunity. Heists, cons, escapes, and social maneuvers remain narrative unless active opposition makes turn order necessary. Do not add extra opponents merely to justify combat.

Planning language is never a present tactical trigger. "I start to formulate a plan", "I think about sabotaging it", "I consider my options", and similar wording mean the character is only deliberating. Do not convert the object of the plan into an action, invent urgency to force a transition, or claim the player manipulated anything. Existing danger or a possible future consequence is not enough by itself; turn order must be required by something actually happening now.

Return {shouldCreateBattleRoom,requiresTurnOrder,triggeredNow,transitionType,confidence,reason,encounterBrief}. requiresTurnOrder and triggeredNow must be booleans. transitionType must be one of none|combat|chase|tactical_hazard. encounterBrief is null unless shouldCreateBattleRoom is true. confidence must be 0-1.`, ['shouldCreateBattleRoom', 'requiresTurnOrder', 'triggeredNow', 'transitionType', 'confidence', 'reason', 'encounterBrief'])));
gmcV1Router.post('/ai/plan-encounter', asyncRoute((req, res) => ai(
  req,
  res,
  PLAN_ENCOUNTER_INSTRUCTION,
  [...PLAN_ENCOUNTER_REQUIRED_KEYS],
)));
gmcV1Router.post('/ai/plan-combat-turn', asyncRoute((req, res) => ai(
  req,
  res,
  PLAN_COMBAT_TURN_INSTRUCTION,
  [...PLAN_COMBAT_TURN_REQUIRED_KEYS],
)));
