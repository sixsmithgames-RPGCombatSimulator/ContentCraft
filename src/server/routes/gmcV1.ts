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
Planning is not execution. If the player says they start to plan, formulate or devise a plan, consider options, think about acting, watch, wait, or observe, keep them in that mental or observational state. Do not choose a plan for them, move them, manipulate an object, spend a resource, trigger a hazard, advance time pressure, or infer that a contemplated future action has begun. "Formulate a plan to sabotage it" does not authorize sabotage. Offer only information already available for deliberation and stop for the player's concrete decision.
Use the supplied authoritative VCS result and campaign memory. Never invent, change, or recompute mechanical numbers. Do not contradict locked facts. Use playerCharacter capabilities and passive scores; never surface hidden reads. Before requesting an eligible roll, state its DC and every scene-specific outcome band. Canon proposals must use recordType FACT, ITEM, or EVENT; FACT includes scope, ITEM includes itemTier/location/ownership, and EVENT includes a deadline plus the consequence of inaction.
Return {narration, npcDialogue, requiresVcsResolution, proposedCanonChanges, proposedVcsExports, riskLevel, syncNotes, gmPrivateNotes}.`, ['narration', 'proposedCanonChanges', 'proposedVcsExports', 'riskLevel', 'syncNotes'])));
gmcV1Router.post('/ai/validate-narration-continuity', asyncRoute((req, res) => ai(req, res, `Act as a strict continuity editor, not a storyteller. Compare candidateNarration with the ordered conversationHistory, current instruction, continuityContract, authoritative VCS state, and campaign dashboard.
Mark the candidate invalid if it repeats an action already completed; awards the same item, money, information, damage, movement, or search result twice; contradicts the latest retcon or established state; ignores referents such as "other" or "next"; converts planning, considering, thinking, watching, or waiting into execution of a contemplated action; fails to resolve or materially advance an explicit new action; substitutes a recap for progress; or narrates a roll-dependent outcome without an authoritative result. A short orientation phrase is allowed, but the response must move forward without exceeding the player's stated intent.
If valid, preserve candidateNarration exactly as correctedNarration. If invalid, write a minimally changed replacement that repairs every listed issue, honors the player's actual intent, preserves authoritative mechanics and established facts, and stops at the next genuine decision or properly framed roll. Do not add new mechanics merely to make the prose interesting.
Return {valid, issues:[{code,explanation}], correctedNarration, understoodPlayerIntent, stateAdvanced}.`, ['valid', 'issues', 'correctedNarration', 'understoodPlayerIntent', 'stateAdvanced'])));
gmcV1Router.post('/ai/evaluate-experience-award', asyncRoute((req, res) => ai(req, res, `Evaluate only the newly completed achievement in this interaction for a fair individual XP award. Use the supplied xpAwardPolicy as binding limits and consider character level, actual danger, difficulty, consequences, ingenuity, discovery, roleplay impact, and authoritative VCS mechanics.

Award XP for meaningful progress, including combat victories, surviving serious danger, resolving or circumventing puzzles and obstacles, significant discoveries, strong consequential social play, objectives, and clever nonviolent solutions. Circumventing a challenge earns comparable XP to defeating it when it resolves the same obstacle. A small but meaningful dialogue beat may earn 5 XP. Routine conversation, repeated actions, bookkeeping, unconfirmed plans, mere attempts, or narration that makes no progress earn 0.

Do not award per attack, per line of dialogue, or repeatedly for the same challenge. A combat encounter is awarded when its outcome is resolved, not for each combat turn. Do not stack "defeated", "survived", and "circumvented" rewards for one obstacle. Use prior conversation and authoritative state to identify already-rewarded or unresolved challenges. Prefer the low end when risk or impact is modest and the high end only for genuinely severe or campaign-shaping achievements. Use monster XP from authoritative data when available, adjusted for the character's share, but never invent a monster XP value.

Return {shouldAward,amount,category:'dialogue|roleplay|social|exploration|discovery|puzzle|combat|survival|objective|creative_solution|none',difficulty:'trivial|minor|meaningful|major|deadly|campaign',rationale,relatedChallengeId,alreadyRewarded,confidence,evidence}. amount must be a non-negative integer multiple of 5 and must remain inside the policy range for the selected difficulty.`, ['shouldAward', 'amount', 'category', 'difficulty', 'rationale', 'relatedChallengeId', 'alreadyRewarded', 'confidence', 'evidence'])));
gmcV1Router.post('/ai/adjudicate-skill-check', asyncRoute((req, res) => ai(req, res, `Adjudicate whether the current player instruction requires a D&D ability or skill check before any outcome is narrated. The supplied dmCheckPolicy is binding.

Choose exactly one resolutionMode:
- no_roll: there is no meaningful uncertainty, no consequential failure, the attempt is impossible, or it is routine. Routine success may be narrated normally.
- passive: passive Perception or passive Insight meets the DC, so the character notices or understands automatically without revealing a check.
- player_roll: the character is consciously attempting something uncertain and the player may know a check is occurring.
- hidden_roll: knowing a roll occurred or seeing its result would reveal hidden information, including whether someone is following, watching, lying, concealed, or absent. The server will roll privately and narration must never mention the check.

Planning, considering, thinking through options, watching, waiting, and beginning to formulate a future plan do not call for a roll and do not authorize the contemplated action. Choose no_roll without resolving or advancing that future action. "I start to formulate a plan to sabotage it" means only that deliberation begins; the character has not touched, approached, sabotaged, or manipulated anything.

Choose Perception versus Investigation by the purpose of the action, not by whether the player used words such as look, search, inspect, examine, or investigate:
- Wisdom (Perception) detects or locates what can be noticed through the senses. Use it for looking around, watching, scanning, listening, smelling, spotting movement or hidden creatures, noticing visible details, and ordinary searches of a room, body, container, or area. Active searching does not make the check Investigation.
- Intelligence (Investigation) interprets evidence and reasons toward a conclusion. Use it for connecting clues, deciding what evidence matters, reconstructing events, deciphering information, solving puzzles, finding patterns, and determining how or why a mechanism works, broke, or was altered.
- Ask what success answers. If it answers "What do I notice?" or "Where is it?", prefer Perception. If it answers "What does this mean?", "How does this work?", or "What can I deduce?", prefer Investigation.
- A methodical search may use Investigation only when organization, inference, or understanding is the obstacle. Do not select Investigation merely because the search is deliberate or targets a physical clue.

Do not narrate evidence, clues, observers, success, failure, or ambiguity before a required roll. For player_roll, provide brief preRollNarration that positions the attempt without resolving it, and five concrete scene-specific stake bands keyed criticalFailure, partial, success, greatSuccess, criticalSuccess. Each band must tell the player what changes at that outcome; do not use generic boilerplate. Use only these skills when applicable: acrobatics, animal_handling, arcana, athletics, deception, history, insight, intimidation, investigation, medicine, nature, perception, performance, persuasion, religion, sleight_of_hand, stealth, survival. Use a DC from 5 to 30 and rollMode normal|advantage|disadvantage. Consult playerCharacter passives and modifiers. If a passive floor resolves the information, choose passive rather than player_roll.

Return {resolutionMode,skill,ability,dc,rollMode,reason,preRollNarration,stakes:{criticalFailure,partial,success,greatSuccess,criticalSuccess},confidence}.`, ['resolutionMode', 'skill', 'ability', 'dc', 'rollMode', 'reason', 'preRollNarration', 'stakes', 'confidence'])));
gmcV1Router.post('/ai/narrate-skill-check-result', asyncRoute((req, res) => ai(req, res, `Narrate the authoritative VCS skill-check result and continue directly from the player's original action. Use authoritativeCheckOutcome and the matching scene-specific stake in rollRequest.stakes. Never change the d20, modifier, total, DC, margin, or outcome band. Do not replay actions completed before this check. If rollRequest.visibility is hidden, never mention a roll, DC, failure, success, modifier, or that hidden information was tested; simply narrate what the character perceives from the authoritative outcome. For a visible player roll, natural prose may reflect the quality of the result but should not read like a rules log. Resolve the attempted action, preserve uncertainty that the outcome band does not reveal, and stop at the next player decision. Return {narration,proposedCanonChanges,proposedVcsExports,riskLevel,syncNotes,gmPrivateNotes}.`, ['narration', 'proposedCanonChanges', 'proposedVcsExports', 'riskLevel', 'syncNotes'])));
gmcV1Router.post('/ai/respond-ooc', asyncRoute((req, res) => ai(req, res, 'Respond out of character as the DM to the player, using conversationHistory and campaign context. Answer every direct player question before offering next steps. Do not narrate the player character taking actions. Clearly distinguish rules/table discussion from in-world facts. If the player identifies a continuity or plausibility problem, do not defend the narration by inventing an unsupported explanation: acknowledge the concrete inconsistency, state the corrected interpretation, and say whether a retcon is needed. When initiative or a check is challenged, compare it to the player\'s actual wording rather than actions invented by prior narration. Planning, considering, thinking, watching, and waiting are not execution; acknowledge an erroneous initiative transition when no concrete tactical action occurred. If the player asks whether a check is appropriate, apply dmCheckPolicy and explain the decision and stakes directly. Never claim that a VCS character sheet, inventory, currency balance, hit points, hit dice, or XP was updated; the caller performs and confirms authoritative writes separately. Return {response,continuityNotes,proposedCanonChanges}.', ['response', 'continuityNotes', 'proposedCanonChanges'])));
gmcV1Router.post('/ai/plan-character-sheet-mutation', asyncRoute((req, res) => ai(req, res, `Decide whether this interaction establishes or explicitly requests an authoritative VCS character-sheet change. Use currentSheet as the starting authority and the ordered conversationHistory to distinguish newly established changes from possessions or costs already synchronized. The candidateResponse is prose only and is not proof that a write occurred.

Return a mutation only for confirmed acquisitions, losses, expenditures, healing, damage, rests, or explicit bookkeeping corrections. Do not mutate for plans, attempts, hypothetical rewards, disputed outcomes, or merely mentioning an existing possession. When the player asks to backfill an established but unsynchronized reward, include it once. A prior conversation entry whose sheetMutation status is applied is already synchronized and must never be applied again.

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
gmcV1Router.post('/ai/detect-encounter-transition', asyncRoute((req, res) => ai(req, res, `Decide whether the supplied player instruction and established current scene have crossed into an encounter that needs a VCS BattleRoom right now. Default to continued narrative play.

A BattleRoom is appropriate only when all are true:
- A concrete attack, hostile confrontation, chase, or immediate tactical hazard has actually begun in the current moment.
- The order and position of multiple actors now matter before the next outcome can be resolved fairly.
- The scene cannot be resolved cleanly with narration, one ability check, or a short sequence of checks.

Do not create a BattleRoom for following or watching someone, scouting, sneaking, pickpocketing, lifting a purse, preparing a distraction, creating or waiting for an opportunity, setting a trap that has not triggered, stating a hoped-for knockout, or describing a plan that might lead to violence later. A desired future result such as knocking someone down or out is not an immediate attack when the current action is still arranging the opportunity. Heists, cons, escapes, and social maneuvers remain narrative unless active opposition makes turn order necessary. Do not add extra opponents merely to justify combat.

Planning language is never a present tactical trigger. "I start to formulate a plan", "I think about sabotaging it", "I consider my options", and similar wording mean the character is only deliberating. Do not convert the object of the plan into an action, invent urgency to force a transition, or claim the player manipulated anything. Existing danger or a possible future consequence is not enough by itself; turn order must be required by something actually happening now.

Return {shouldCreateBattleRoom,requiresTurnOrder,triggeredNow,transitionType,confidence,reason,encounterBrief}. requiresTurnOrder and triggeredNow must be booleans. transitionType must be one of none|combat|chase|tactical_hazard. encounterBrief is null unless shouldCreateBattleRoom is true. confidence must be 0-1.`, ['shouldCreateBattleRoom', 'requiresTurnOrder', 'triggeredNow', 'transitionType', 'confidence', 'reason', 'encounterBrief'])));
gmcV1Router.post('/ai/plan-encounter', asyncRoute((req, res) => ai(req, res, `Prepare a complete VCS encounter from the campaign context, current scene, player instruction, and player-character summary. Respect canon and safety boundaries. Do not decide player-character actions. Return {
  name,
  objective,
  situation,
  playerOptions:[{label,description}],
  map:{width,height,gridSize,feetPerCell,gridType,imageUrl,walls,doors,fogOfWar},
  playerStart:{gridX,gridY},
  opponents:[{name,kind,role,hitPoints,armorClass,speed,initiativeModifier,abilities,conditions,gridX,gridY,actions:[{name,type,attackBonus,range,damage:[{dice,bonus,type}],saveDc,saveAbility,onSuccessfulSave,conditions}]}],
  gmNotes
}. situation is a concise present-tense handoff explaining what just made turn order necessary and what is happening now. objective states the player's immediate goal without assuming they must kill or attack anyone. playerOptions contains 3-5 materially different, nonbinding approaches that are legal in the scene; include nonviolent, evasive, social, environmental, or escape options whenever plausible. These are prompts, not decisions for the player. Use practical grid coordinates inside the map. Supply 1-6 opponents, complete combat statistics, and at least one mechanically executable attack or spell for each. kind must be npc or monster. imageUrl may be null; walls, doors, and fog still constitute an authoritative tactical map.`, ['name', 'objective', 'situation', 'playerOptions', 'map', 'playerStart', 'opponents', 'gmNotes'])));
gmcV1Router.post('/ai/plan-combat-turn', asyncRoute((req, res) => ai(req, res, `Control exactly one non-player combatant turn in the supplied authoritative VCS BattleRoom. Use only IDs, statistics, token actions, targets, and positions present in the supplied state. Never choose or alter the player character's actions. Return {
  actorId,
  movement:{tokenId,gridX,gridY,reason},
  action:{type,targetId,attackBonus,modifier,damage,saveDc,saveAbility,saveModifier,onSuccessfulSave,conditions,rollMode},
  actionName,
  tacticalReason,
  endTurn
}. movement may be null and action may be null. Prefer a legal useful action; use attack or spell shapes supported by VCS. Do not supply manual dice rolls.`, ['actorId', 'movement', 'action', 'actionName', 'tacticalReason', 'endTurn'])));
