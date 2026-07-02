import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { ProjectStatus, ProjectType } from '../../shared/types/index.js';

import { ProjectModel, ContentBlockModel } from '../models/index.js';
import { getDb } from '../config/mongo.js';
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
import { generateStructuredJson, generationPrompts } from '../services/gmcLiveGeneration.js';

export const gmcV1Router = Router();
gmcV1Router.use(integrationAuth);

const userId = (req: Request) => (req as IntegrationRequest).userId;
const correlationId = (req: Request) => req.header('X-Sixsmith-Correlation-Id') || randomUUID();

function fail(req: Request, res: Response, status: number, code: string, message: string, details: Record<string, unknown> = {}) {
  res.status(status).json({ error: { code, message, correlationId: correlationId(req), details } });
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
    if (cause?.code) { fail(req, res, cause.status ?? 500, cause.code, cause.message); return; }
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
  const [{ blocks }, state, scenes, npcs, locations, facts, threads, session] = await Promise.all([
    ContentBlockModel.findByProjectId(uid, id, { page: 1, limit: 250 }),
    collections.state().findOne({ userId: uid, campaignId: id }),
    collections.scenes().find({ userId: uid, campaignId: id }).sort({ updatedAt: -1 }).limit(100).toArray(),
    listEntities(uid, id, 'npc'), listEntities(uid, id, 'location'), listFacts(uid, id), listThreads(uid, id, { status: 'open' }),
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
    memoryContext,
    recentSummary: session?.summary ?? null, contentSummary: blocks.map((block) => ({ id: block.id, title: block.title, type: block.type, metadata: block.metadata })),
  });
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
    status: req.body.status ?? 'open', createdAt: timestamp, updatedAt: timestamp,
  };
  await collections.threads().insertOne(thread); res.status(201).json({ thread });
}));

gmcV1Router.patch('/threads/:threadId', asyncRoute(async (req, res) => {
  const allowed: Record<string, unknown> = { recordType: 'EVENT', updatedAt: new Date() };
  for (const key of ['title', 'description', 'deadlineAt', 'deadlineDescription', 'consequence', 'scope', 'relatedNpcIds', 'relatedLocationIds', 'status']) if (req.body?.[key] !== undefined) allowed[key] = req.body[key];
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
  const output = await generateStructuredJson(instruction, req.body);
  if (!output || typeof output !== 'object' || requiredKeys.some((key) => output[key] === undefined)) {
    throw Object.assign(new Error(`Structured AI response is missing required fields: ${requiredKeys.join(', ')}.`), { status: 502, code: 'STRUCTURED_OUTPUT_INVALID' });
  }
  res.json(output);
}

gmcV1Router.post('/ai/classify-intent', asyncRoute((req, res) => ai(req, res, 'Classify the input. Return {intentType, confidence, structuredIntent, requiresVcs, requiresGameMasterCraft}. Allowed intentType values: narrative_action, mechanical_action, mixed_action, canon_query, rules_query, generation_request, prep_request, sync_request, correction, retcon, ooc_question, system_command.', ['intentType', 'confidence', 'structuredIntent', 'requiresVcs', 'requiresGameMasterCraft'])));
gmcV1Router.post('/ai/generate-narration', asyncRoute((req, res) => ai(req, res, `Continue directly from the established current state in conversationHistory. The supplied continuityContract is binding.
First determine the player's NEW intent in the current instruction relative to the final assistant turn. Repeated wording may describe a multi-step method or refer to completed work; it is not permission to perform completed steps again. Deictic words such as "other", "next", "then", "after", "already", "again", and "continue" must advance their referent. Preserve all established positions, injuries, deaths, possessions, discoveries, searches, dialogue, and consequences, with the latest retcon taking precedence. Never re-award loot, re-search the same target, re-enter a location, or replay movement already completed. Resolve or materially advance each distinct new action in order. Do not merely paraphrase the instruction. Stop only at a genuine player decision or a check that the binding dmCheckPolicy actually requires.
Use the supplied authoritative VCS result and campaign memory. Never invent, change, or recompute mechanical numbers. Do not contradict locked facts. Use playerCharacter capabilities and passive scores; never surface hidden reads. Before requesting an eligible roll, state its DC and every scene-specific outcome band. Canon proposals must use recordType FACT, ITEM, or EVENT; FACT includes scope, ITEM includes itemTier/location/ownership, and EVENT includes a deadline plus the consequence of inaction.
Return {narration, npcDialogue, requiresVcsResolution, proposedCanonChanges, proposedVcsExports, riskLevel, syncNotes, gmPrivateNotes}.`, ['narration', 'proposedCanonChanges', 'proposedVcsExports', 'riskLevel', 'syncNotes'])));
gmcV1Router.post('/ai/validate-narration-continuity', asyncRoute((req, res) => ai(req, res, `Act as a strict continuity editor, not a storyteller. Compare candidateNarration with the ordered conversationHistory, current instruction, continuityContract, authoritative VCS state, and campaign dashboard.
Mark the candidate invalid if it repeats an action already completed; awards the same item, money, information, damage, movement, or search result twice; contradicts the latest retcon or established state; ignores referents such as "other" or "next"; fails to resolve or materially advance an explicit new action; substitutes a recap for progress; or narrates a roll-dependent outcome without an authoritative result. A short orientation phrase is allowed, but the response must move forward.
If valid, preserve candidateNarration exactly as correctedNarration. If invalid, write a minimally changed replacement that repairs every listed issue, honors the player's actual intent, preserves authoritative mechanics and established facts, and stops at the next genuine decision or properly framed roll. Do not add new mechanics merely to make the prose interesting.
Return {valid, issues:[{code,explanation}], correctedNarration, understoodPlayerIntent, stateAdvanced}.`, ['valid', 'issues', 'correctedNarration', 'understoodPlayerIntent', 'stateAdvanced'])));
gmcV1Router.post('/ai/respond-ooc', asyncRoute((req, res) => ai(req, res, 'Respond out of character as the DM to the player, using conversationHistory and campaign context. Answer every direct player question before offering next steps. Do not narrate the player character taking actions. Clearly distinguish rules/table discussion from in-world facts. If the player identifies a continuity or plausibility problem, do not defend the narration by inventing an unsupported explanation: acknowledge the concrete inconsistency, state the corrected interpretation, and say whether a retcon is needed. If the player asks whether a check is appropriate, apply dmCheckPolicy and explain the decision and stakes directly. Return {response,continuityNotes,proposedCanonChanges}.', ['response', 'continuityNotes', 'proposedCanonChanges'])));
gmcV1Router.post('/ai/retcon-narration', asyncRoute((req, res) => ai(req, res, 'Apply the player retcon instruction as an authoritative correction to recent conversationHistory. Discard contradicted narration and preserve everything not affected. The corrected narration becomes established current state: concrete possessions, discoveries, injuries, deaths, positions, and completed searches it states must not be awarded or performed again in later turns. Continue from the corrected state without replaying earlier beats. Do not alter VCS mechanics unless an authoritative restored VCS snapshot is supplied. If the corrected continuation reaches a check, the supplied dmCheckPolicy is binding and all stakes must be disclosed before requesting the roll. Return {narration,correctionSummary,proposedCanonChanges,continuityNotes}.', ['narration', 'correctionSummary', 'proposedCanonChanges', 'continuityNotes'])));
gmcV1Router.post('/ai/generate-npc-dialogue', asyncRoute((req, res) => ai(req, res, 'Generate canon-aware NPC dialogue. Preserve secrets and motivations. Return {dialogue, narration, proposedCanonChanges}.', ['dialogue', 'narration', 'proposedCanonChanges'])));
gmcV1Router.post('/ai/extract-canon-changes', asyncRoute((req, res) => ai(req, res, `Extract only durable, newly established story memory from the ordered transcript. Use campaignDashboard to avoid duplicating existing entities or records. The latest retcon supersedes contradicted text. Player plans, questions, speculation, failed narration, and unconfirmed possibilities are not canon. Raw mechanics become memory only when they create a durable story consequence.

Keep canonical entities separate from memory records:
- proposedEntities contains newly introduced or materially changed NPCs, locations, and factions. Use entityType 'npc|location|faction'. NPC entityTier is 'bbeg|lieutenant|henchman|contact'. Locations use geographicTier 'world|city|district|site|room' and parentLocationId when known. Use changeType 'create|update' and an existing targetId for updates. Do not create a second entity for a known person or place.
- FACT is a durable truth. Geographic scope is {kind:'geographic',tier:'world|city|district|site|room',locationId}; entity scope is {kind:'entity',tier:'bbeg|lieutenant|henchman|contact',entityId}. Attach truths about a person to that entity rather than repeating the person as prose.
- ITEM is one discrete physical object or sensible stack, with itemTier 'plot|mundane|currency|furniture', currentLocationId, ownerEntityId, and ownerType when known. Plot items always surface; currency, mundane items, and furniture remain local. Ownership transfers are updates, not duplicate item creation.
- EVENT is only a pending pressure that will happen unless interrupted, never a completed past occurrence. It requires deadlineAt or deadlineDescription, a concrete consequence of inaction, and geographic or entity scope.

Choose the narrowest correct scope. Prefer room/site over district/city when a truth is local; use world only for genuinely universal truths. Return no proposal for atmospheric prose, repeated facts, or trivial transient motion.
Return {
  proposedEntities:[{entityType,changeType,targetId,name,summary,entityTier,geographicTier,parentLocationId,payload,riskLevel,reason}],
  proposedCanonChanges:[{recordType:'FACT|ITEM|EVENT',changeType,targetId,summary,payload,scope,itemTier,currentLocationId,ownerEntityId,ownerType,deadlineAt,deadlineDescription,consequence,riskLevel,requiresHardApproval,reason}]
}.`, ['proposedEntities', 'proposedCanonChanges'])));
gmcV1Router.post('/ai/summarize-session', asyncRoute((req, res) => ai(req, res, 'Summarize the session using the transcript, authoritative mechanical summary, and approved canon changes. Return {summary,keyDecisions,npcUpdates,openThreads,resolvedThreads,suggestedNextSessionSetup}.', ['summary', 'keyDecisions', 'npcUpdates', 'openThreads', 'resolvedThreads', 'suggestedNextSessionSetup'])));
gmcV1Router.post('/ai/build-campaign-foundation', asyncRoute((req, res) => ai(req, res, `Build a practical tabletop campaign foundation from the supplied Session 0 answers.
Respect every stated line, veil, content limit, desired theme, rules preference, and play-mode choice. For solo play, create a strong protagonist-facing opening, preserve player agency, and give the GM system useful uncertainty without deciding the protagonist's choices. Do not write a complete plot; create a playable situation with pressures, people, secrets, and open questions.
Return {
  campaign:{title,tagline,pitch,tone,themes,gmPrinciples},
  startingLocation:{name,description,atmosphere,features,secrets,hooks,tags},
  openingScene:{name,description,gmPrivateNotes,presentNpcNames},
  initialFacts:[{text,category,scope:{kind,tier,locationId,locationName,entityId,entityName},locked,secret}],
  initialNpcs:[{name,role,entityTier,presentInOpeningScene,motivation,secret,voice,relationshipToProtagonist,tags}],
  openThreads:[{title,description,deadlineDescription,consequence,scope:{kind,tier,locationId,locationName,entityId,entityName}}],
  sessionZeroSummary:{summary,keyDecisions,safetyNotes,playStyleNotes}
}. FACT scope tier must be geographic (world, city, district, site, room) or entity (bbeg, lieutenant, henchman, contact). NPC entityTier uses bbeg, lieutenant, henchman, or contact. Every open thread is an EVENT: give it a meaningful trigger/deadline and a concrete consequence if it goes unaddressed. Generate 3-6 durable initial facts, 2-4 NPCs, and 3-5 open threads.`, ['campaign', 'startingLocation', 'openingScene', 'initialFacts', 'initialNpcs', 'openThreads', 'sessionZeroSummary'])));
gmcV1Router.post('/ai/detect-encounter-transition', asyncRoute((req, res) => ai(req, res, `Decide whether the supplied player instruction and current scene have crossed into an encounter that needs a VCS BattleRoom. Ordinary travel, investigation, dialogue, shopping, downtime, roleplay, and non-hostile uncertainty do not need a BattleRoom. Create one only when turn-by-turn positioning, attacks, spells, hazards, or initiative are immediately necessary. Return {shouldCreateBattleRoom,confidence,reason,encounterBrief}. confidence must be 0-1.`, ['shouldCreateBattleRoom', 'confidence', 'reason', 'encounterBrief'])));
gmcV1Router.post('/ai/plan-encounter', asyncRoute((req, res) => ai(req, res, `Prepare a complete VCS encounter from the campaign context, current scene, player instruction, and player-character summary. Respect canon and safety boundaries. Do not decide player-character actions. Return {
  name,
  objective,
  map:{width,height,gridSize,feetPerCell,gridType,imageUrl,walls,doors,fogOfWar},
  playerStart:{gridX,gridY},
  opponents:[{name,kind,role,hitPoints,armorClass,speed,initiativeModifier,abilities,conditions,gridX,gridY,actions:[{name,type,attackBonus,range,damage:[{dice,bonus,type}],saveDc,saveAbility,onSuccessfulSave,conditions}]}],
  gmNotes
}. Use practical grid coordinates inside the map. Supply 1-6 opponents, complete combat statistics, and at least one mechanically executable attack or spell for each. kind must be npc or monster. imageUrl may be null; walls, doors, and fog still constitute an authoritative tactical map.`, ['name', 'objective', 'map', 'playerStart', 'opponents', 'gmNotes'])));
gmcV1Router.post('/ai/plan-combat-turn', asyncRoute((req, res) => ai(req, res, `Control exactly one non-player combatant turn in the supplied authoritative VCS BattleRoom. Use only IDs, statistics, token actions, targets, and positions present in the supplied state. Never choose or alter the player character's actions. Return {
  actorId,
  movement:{tokenId,gridX,gridY,reason},
  action:{type,targetId,attackBonus,modifier,damage,saveDc,saveAbility,saveModifier,onSuccessfulSave,conditions,rollMode},
  actionName,
  tacticalReason,
  endTurn
}. movement may be null and action may be null. Prefer a legal useful action; use attack or spell shapes supported by VCS. Do not supply manual dice rolls.`, ['actorId', 'movement', 'action', 'actionName', 'tacticalReason', 'endTurn'])));
