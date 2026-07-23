import { randomUUID } from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import { ProjectStatus, ProjectType } from '../../shared/types/index.js';
import { parseSmartJson } from '../../shared/generation/smartJsonParser.js';

import { ProjectModel, ContentBlockModel } from '../models/index.js';
import { getCanonEntitiesCollection } from '../config/mongo.js';
import { integrationAuth, type IntegrationRequest } from '../middleware/integrationAuth.js';
import {
  buildMemoryContext,
  buildNarrationEvidenceBundle,
  buildProposedScenePresenceContract,
  buildScenePresenceContract,
  collections,
  contradictionCandidates,
  createEntityMutation,
  createFactMutation,
  createSceneMutation,
  createSessionMutation,
  createThreadMutation,
  getEntity,
  listEntities,
  listFacts,
  listThreads,
  prepareMemoryReferences,
  resolveMemoryReferences,
  resolveSceneTransitionContract,
  restoreMemoryReferences,
  updateEntity,
  validateNarrativePresenceContract,
  type GmcEntityKind,
} from '../services/gmcIntegrationStore.js';
import { generateStructuredJson, generationPrompts, getGeminiUsageSnapshot } from '../services/gmcLiveGeneration.js';
import { ensureCampaignActor } from '../services/actorEnsureWorkflow.js';
import { applyCampaignClockMutation } from '../services/campaignClockMutation.js';
import { createCampaignMutation } from '../services/campaignCreateMutation.js';
import {
  AUDIT_RESOLVED_MECHANICS_NARRATION_INSTRUCTION,
  AUDIT_RESOLVED_MECHANICS_NARRATION_REQUIRED_KEYS,
  NARRATE_COMBAT_ACTION_RESULT_INSTRUCTION,
  NARRATE_COMBAT_ACTION_RESULT_REQUIRED_KEYS,
  NARRATE_COMBAT_TURNS_INSTRUCTION,
  NARRATE_COMBAT_TURNS_REQUIRED_KEYS,
  PLAN_COMBAT_TURN_INSTRUCTION,
  PLAN_COMBAT_TURN_REQUIRED_KEYS,
  PLAN_ENCOUNTER_CHALLENGE_INSTRUCTION,
  PLAN_ENCOUNTER_CHALLENGE_REQUIRED_KEYS,
  PLAN_ENCOUNTER_INSTRUCTION,
  PLAN_ENCOUNTER_REQUIRED_KEYS,
} from './gmcV1PlanningContracts.js';

export const gmcV1Router = Router();
gmcV1Router.use(integrationAuth);

export function shouldResolveNarrativeTransition(responseMode: string, sceneSegment: Record<string, unknown> | null) {
  return responseMode !== 'ooc' && sceneSegment !== null;
}

const userId = (req: Request) => (req as IntegrationRequest).userId;
const correlationId = (req: Request) => req.header('X-Sixsmith-Correlation-Id') || randomUUID();

function fail(req: Request, res: Response, status: number, code: string, message: string, details: Record<string, unknown> = {}) {
  res.status(status).json({ error: { code, message, correlationId: correlationId(req), details } });
}

function parseGameClockText(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const dayMatch = text.match(/\bday\s*(\d{1,5})\b/i);
  const meridiemMatch = text.match(/\b(\d{1,2})(?::([0-5]\d))?(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  const twentyFourHourMatch = meridiemMatch ? null : text.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
  const day = dayMatch ? Math.max(1, Number(dayMatch[1])) : null;
  let hour: number | null = null;
  let minute: number | null = null;
  let second = 0;
  if (meridiemMatch) {
    const rawHour = Number(meridiemMatch[1]);
    const period = meridiemMatch[4].toLowerCase().replace(/\./g, '');
    if (rawHour >= 1 && rawHour <= 12) {
      hour = rawHour % 12 + (period === 'pm' ? 12 : 0);
      minute = Number(meridiemMatch[2] ?? 0);
      second = Number(meridiemMatch[3] ?? 0);
    }
  } else if (twentyFourHourMatch) {
    hour = Number(twentyFourHourMatch[1]);
    minute = Number(twentyFourHourMatch[2]);
    second = Number(twentyFourHourMatch[3] ?? 0);
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
  const result = await createCampaignMutation({
    store: ProjectModel,
    userId: userId(req),
    mutationId: req.body?.mutationId,
    input: {
    title,
    description: String(req.body?.description || '').trim(),
    type: ProjectType.DND_ADVENTURE,
    status: ProjectStatus.DRAFT,
    productKey: 'gamemastercraft',
    workspaceType: req.body?.gameMode === 'solo' ? 'solo_campaign' : 'group_campaign',
    },
  });
  res.status(result.duplicate ? 200 : 201).json({
    campaign: result.campaign,
    mutationId: result.mutationId,
    duplicate: result.duplicate,
  });
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
  const scenePresenceContract = buildScenePresenceContract(currentScene, npcs);
  res.json({
    campaign: project, currentScene, currentLocation,
    presentNpcs: npcs.filter((npc: any) => present.has(npc._id)),
    scenePresenceContract,
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
  const mutationId = String(req.body?.mutationId ?? '').trim();
  const result = await applyCampaignClockMutation({
    stateCollection: collections.state(),
    userId: uid,
    campaignId: id,
    mutationId,
    expectedRevision: req.body?.expectedRevision,
    source: req.body?.source ?? null,
    createGameClock: (previousGameClock) => (
      req.body?.gameClock === null ? null : normalizeGameClock(req.body ?? {}, (previousGameClock as Record<string, any>) ?? {})
    ),
  });
  res.json({
    mutationId: result.mutationId,
    duplicate: result.duplicate,
    previousGameClock: result.previousGameClock,
    gameClock: result.gameClock,
    gameClockRevision: result.gameClockRevision,
    campaignState: result.state,
  });
}));

gmcV1Router.get('/campaigns/:campaignId/scenes/current', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  const uid = userId(req); const id = req.params.campaignId;
  const state = await collections.state().findOne({ userId: uid, campaignId: id });
  const scene = state?.currentSceneId ? await collections.scenes().findOne({ _id: state.currentSceneId, userId: uid, campaignId: id }) : null;
  res.json({ scene });
}));

gmcV1Router.post('/campaigns/:campaignId/scenes/presence/preview', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  const uid = userId(req); const id = req.params.campaignId;
  const expectedCurrentRevision = String(req.body?.expectedCurrentRevision ?? '').trim();
  const locationId = String(req.body?.locationId ?? '').trim();
  const rawPresentNpcIds: unknown[] = Array.isArray(req.body?.presentNpcIds) ? req.body.presentNpcIds : [];
  const presentNpcIds: string[] = [...new Set(rawPresentNpcIds.map((value) => String(value)).filter(Boolean))];
  if (!expectedCurrentRevision || !locationId || presentNpcIds.length > 100) {
    fail(req, res, 400, 'VALIDATION_ERROR', 'expectedCurrentRevision, locationId, and no more than 100 presentNpcIds are required.'); return;
  }
  const [state, npcs, locations] = await Promise.all([
    collections.state().findOne({ userId: uid, campaignId: id }),
    listEntities(uid, id, 'npc'),
    listEntities(uid, id, 'location'),
  ]);
  const currentScene = state?.currentSceneId
    ? await collections.scenes().findOne({ _id: state.currentSceneId, userId: uid, campaignId: id })
    : null;
  const currentContract = buildScenePresenceContract(currentScene, npcs);
  if (!currentContract.valid || currentContract.revision !== expectedCurrentRevision) {
    fail(req, res, 409, 'SCENE_PRESENCE_REVISION_CONFLICT', 'The GMC current-scene roster changed before the proposed roster could be validated.', { currentContract }); return;
  }
  const location = locations.find((candidate: any) => String(candidate?._id) === locationId);
  if (!location) { fail(req, res, 404, 'LOCATION_NOT_FOUND', 'The proposed scene location is not canonical GMC data.'); return; }
  const knownNpcIds = new Set(npcs.map((npc: any) => String(npc?._id)));
  const unknownNpcIds = presentNpcIds.filter((npcId) => !knownNpcIds.has(npcId));
  if (unknownNpcIds.length) {
    fail(req, res, 409, 'SCENE_PRESENCE_NPC_UNRESOLVED', 'The proposed scene roster contains NPC IDs GMC cannot resolve.', { unknownNpcIds }); return;
  }
  const presenceContract = buildProposedScenePresenceContract({ currentContract, location, presentNpcIds, npcs });
  if (!presenceContract.valid) {
    fail(req, res, 409, 'SCENE_PRESENCE_PROPOSAL_INVALID', 'GMC could not produce a complete proposed-scene roster contract.', { presenceContract }); return;
  }
  res.json({ presenceContract });
}));

gmcV1Router.post('/campaigns/:campaignId/scenes/transition/resolve', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  const uid = userId(req); const id = req.params.campaignId;
  const expectedCurrentRevision = String(req.body?.expectedCurrentRevision ?? '').trim();
  const where = String(req.body?.where ?? '').trim();
  const who = Array.isArray(req.body?.who) ? req.body.who.map(String) : [];
  const playerCharacterNames = Array.isArray(req.body?.playerCharacterNames) ? req.body.playerCharacterNames.map(String) : [];
  const instruction = String(req.body?.instruction ?? '');
  if (req.body?.generatedEntities !== undefined && !Array.isArray(req.body.generatedEntities)) {
    fail(req, res, 400, 'VALIDATION_ERROR', 'generatedEntities must be an array when supplied.'); return;
  }
  const generatedEntities = Array.isArray(req.body?.generatedEntities) ? req.body.generatedEntities : [];
  if (!expectedCurrentRevision || !where || instruction.length > 20_000 || who.length > 100 || playerCharacterNames.length > 10 || generatedEntities.length > 20) {
    fail(req, res, 400, 'VALIDATION_ERROR', 'expectedCurrentRevision, where, and bounded who/playerCharacterNames arrays are required.'); return;
  }
  const [state, npcs, locations] = await Promise.all([
    collections.state().findOne({ userId: uid, campaignId: id }),
    listEntities(uid, id, 'npc'),
    listEntities(uid, id, 'location'),
  ]);
  const currentScene = state?.currentSceneId
    ? await collections.scenes().findOne({ _id: state.currentSceneId, userId: uid, campaignId: id })
    : null;
  const currentContract = buildScenePresenceContract(currentScene, npcs);
  if (!currentContract.valid || currentContract.revision !== expectedCurrentRevision) {
    fail(req, res, 409, 'SCENE_PRESENCE_REVISION_CONFLICT', 'The GMC current-scene roster changed before the transition could be resolved.', { currentContract }); return;
  }
  const sceneTransitionContract = resolveSceneTransitionContract({
    userId: uid, campaignId: id, currentContract, currentScene, locations, npcs, where, who, playerCharacterNames,
    instruction, generatedEntities,
  });
  res.json({ sceneTransitionContract });
}));

gmcV1Router.post('/campaigns/:campaignId/scenes/narrative/validate', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  const uid = userId(req); const id = req.params.campaignId;
  const expectedCurrentRevision = String(req.body?.expectedCurrentRevision ?? '').trim();
  const responseMode = String(req.body?.responseMode ?? 'in_character').trim();
  const responseText = String(req.body?.responseText ?? '');
  const sceneSegment = req.body?.sceneSegment && typeof req.body.sceneSegment === 'object' && !Array.isArray(req.body.sceneSegment)
    ? req.body.sceneSegment
    : null;
  const playerCharacterNames = Array.isArray(req.body?.playerCharacterNames) ? req.body.playerCharacterNames.map(String) : [];
  const instruction = String(req.body?.instruction ?? '');
  if (req.body?.generatedEntities !== undefined && !Array.isArray(req.body.generatedEntities)) {
    fail(req, res, 400, 'VALIDATION_ERROR', 'generatedEntities must be an array when supplied.'); return;
  }
  const generatedEntities = Array.isArray(req.body?.generatedEntities) ? req.body.generatedEntities : [];
  if (!expectedCurrentRevision || instruction.length > 20_000 || responseText.length > 200_000 || playerCharacterNames.length > 10 || generatedEntities.length > 20) {
    fail(req, res, 400, 'VALIDATION_ERROR', 'expectedCurrentRevision, bounded responseText, and no more than 10 playerCharacterNames are required.'); return;
  }
  const [state, npcs, locations] = await Promise.all([
    collections.state().findOne({ userId: uid, campaignId: id }),
    listEntities(uid, id, 'npc'),
    listEntities(uid, id, 'location'),
  ]);
  const currentScene = state?.currentSceneId
    ? await collections.scenes().findOne({ _id: state.currentSceneId, userId: uid, campaignId: id })
    : null;
  const currentContract = buildScenePresenceContract(currentScene, npcs);
  if (!currentContract.valid || currentContract.revision !== expectedCurrentRevision) {
    fail(req, res, 409, 'SCENE_PRESENCE_REVISION_CONFLICT', 'The GMC current-scene roster changed before narration could be validated.', { currentContract }); return;
  }
  let sceneTransitionContract = null;
  let selectedPresenceContract = currentContract;
  if (shouldResolveNarrativeTransition(responseMode, sceneSegment)) {
    sceneTransitionContract = resolveSceneTransitionContract({
      userId: uid,
      campaignId: id,
      currentContract,
      currentScene,
      locations,
      npcs,
      where: String(sceneSegment?.where ?? ''),
      who: Array.isArray(sceneSegment?.who) ? sceneSegment.who.map(String) : [],
      playerCharacterNames,
      instruction,
      generatedEntities,
    });
    selectedPresenceContract = sceneTransitionContract.presenceContract;
  }
  const narrativePresenceContract = validateNarrativePresenceContract({
    presenceContract: selectedPresenceContract,
    responseMode,
    responseText,
    sceneSegment,
    candidateFingerprint: String(req.body?.candidateFingerprint ?? '').trim() || null,
  });
  res.json({ narrativePresenceContract, sceneTransitionContract });
}));

gmcV1Router.post('/campaigns/:campaignId/scenes', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  if (!String(req.body?.name || '').trim()) { fail(req, res, 400, 'VALIDATION_ERROR', 'name is required.'); return; }
  const uid = userId(req); const id = req.params.campaignId;
  const expectedCurrentRevision = String(req.body?.expectedCurrentRevision ?? '').trim();
  const expectedPresenceRevision = String(req.body?.expectedPresenceRevision ?? '').trim();
  const expectedTransitionRevision = String(req.body?.expectedTransitionRevision ?? '').trim();
  const expectedGeneratedEntityRevision = String(req.body?.expectedGeneratedEntityRevision ?? '').trim();
  if (req.body?.generatedEntities !== undefined && !Array.isArray(req.body.generatedEntities)) {
    fail(req, res, 400, 'VALIDATION_ERROR', 'generatedEntities must be an array when supplied.'); return;
  }
  const requestedGeneratedEntities = Array.isArray(req.body?.generatedEntities) ? req.body.generatedEntities : [];
  if (requestedGeneratedEntities.length && (!expectedCurrentRevision || !expectedPresenceRevision || !expectedTransitionRevision || !expectedGeneratedEntityRevision)) {
    fail(req, res, 400, 'SCENE_GENERATION_CONTRACT_REQUIRED', 'Generated scene entities require current-scene, proposed-presence, transition, and generated-entity revisions.'); return;
  }
  if (requestedGeneratedEntities.length && req.body.makeCurrent === false) {
    fail(req, res, 400, 'SCENE_GENERATION_CURRENT_COMMIT_REQUIRED', 'Generated scene entities may only be materialized as part of a revision-bound current-scene commit.'); return;
  }
  let preparedTransition: any = null;
  let currentContract: any = null;
  if (req.body.makeCurrent !== false && (expectedCurrentRevision || expectedPresenceRevision)) {
    if (!expectedCurrentRevision || !expectedPresenceRevision) {
      fail(req, res, 400, 'VALIDATION_ERROR', 'Both expectedCurrentRevision and expectedPresenceRevision are required for a revision-bound current-scene commit.'); return;
    }
    const [state, npcs, locations] = await Promise.all([
      collections.state().findOne({ userId: uid, campaignId: id }),
      listEntities(uid, id, 'npc'),
      listEntities(uid, id, 'location'),
    ]);
    const currentScene = state?.currentSceneId
      ? await collections.scenes().findOne({ _id: state.currentSceneId, userId: uid, campaignId: id })
      : null;
    currentContract = buildScenePresenceContract(currentScene, npcs);
    if (!currentContract.valid || currentContract.revision !== expectedCurrentRevision) {
      fail(req, res, 409, 'SCENE_PRESENCE_REVISION_CONFLICT', 'The GMC current scene changed before the prepared transition could commit.', { currentContract }); return;
    }
    const locationId = String(req.body?.locationId ?? '').trim();
    const presentNpcIds = Array.isArray(req.body?.presentNpcIds) ? req.body.presentNpcIds.map(String) : [];
    if (requestedGeneratedEntities.length) {
      preparedTransition = resolveSceneTransitionContract({
        userId: uid,
        campaignId: id,
        currentContract,
        currentScene,
        locations,
        npcs,
        where: String(req.body?.where ?? ''),
        who: Array.isArray(req.body?.who) ? req.body.who.map(String) : [],
        playerCharacterNames: Array.isArray(req.body?.playerCharacterNames) ? req.body.playerCharacterNames.map(String) : [],
        instruction: String(req.body?.instruction ?? ''),
        generatedEntities: requestedGeneratedEntities,
      });
      if (
        !expectedTransitionRevision
        || preparedTransition.revision !== expectedTransitionRevision
        || preparedTransition.generatedEntityRevision !== expectedGeneratedEntityRevision
        || preparedTransition.location?.id !== locationId
        || JSON.stringify(preparedTransition.presentNpcIds) !== JSON.stringify([...presentNpcIds].sort())
        || preparedTransition.presenceContract?.revision !== expectedPresenceRevision
      ) {
        fail(req, res, 409, 'SCENE_GENERATION_CONTRACT_CONFLICT', 'The generated destination no longer matches the internally reconciled scene-generation contract.', { preparedTransition }); return;
      }
    }
    const location = locations.find((candidate: any) => String(candidate?._id) === locationId);
    if (requestedGeneratedEntities.length) return void await (async () => {
      const materializedEntities: any[] = [];
      let sceneResult: any = null;
      try {
        for (const generated of preparedTransition.generatedEntities) {
          const result = await createEntityMutation(uid, id, generated.entityType, generated.input);
          if (String(result.record?._id ?? '') !== String(generated.id)) {
            throw Object.assign(new Error('GMC materialized a generated scene entity under a different canonical identity.'), {
              status: 409, code: 'SCENE_GENERATED_ENTITY_IDENTITY_CONFLICT', details: { generated, recordId: result.record?._id ?? null },
            });
          }
          materializedEntities.push({ ...generated, record: result.record, duplicate: result.duplicate });
        }
        const [confirmedNpcs, confirmedLocations] = await Promise.all([listEntities(uid, id, 'npc'), listEntities(uid, id, 'location')]);
        const confirmedLocation = confirmedLocations.find((candidate: any) => String(candidate?._id) === locationId);
        const confirmedPresence = buildProposedScenePresenceContract({ currentContract, location: confirmedLocation, presentNpcIds, npcs: confirmedNpcs });
        if (!confirmedLocation || !confirmedPresence.valid || confirmedPresence.revision !== expectedPresenceRevision) {
          throw Object.assign(new Error('Generated entities were materialized, but the exact destination roster did not reproduce its prepared GMC revision.'), {
            status: 409, code: 'SCENE_GENERATED_PRESENCE_CONFLICT', details: { confirmedPresence },
          });
        }
        sceneResult = await createSceneMutation(uid, id, req.body);
        await collections.state().updateOne(
          { userId: uid, campaignId: id },
          { $set: { currentSceneId: sceneResult.record._id, updatedAt: new Date() } },
          { upsert: true },
        );
        res.status(sceneResult.duplicate ? 200 : 201).json({
          scene: sceneResult.record,
          mutationId: sceneResult.mutationId,
          duplicate: sceneResult.duplicate,
          duplicateReason: sceneResult.duplicateReason,
          materializedEntities: materializedEntities.map(({ record, entityType, mutationId, duplicate }) => ({ record, entityType, mutationId, duplicate })),
          generatedEntityRevision: expectedGeneratedEntityRevision,
        });
      } catch (error: any) {
        const cleanup: any[] = [];
        if (sceneResult && !sceneResult.duplicate) {
          const deleted = await collections.scenes().deleteOne({ _id: sceneResult.record._id, userId: uid, campaignId: id });
          cleanup.push({ kind: 'scene', id: sceneResult.record._id, removed: deleted.deletedCount === 1 });
        }
        for (const generated of [...materializedEntities].reverse()) {
          if (generated.duplicate) continue;
          const deleted = await getCanonEntitiesCollection().deleteOne({ _id: generated.record._id, userId: uid, project_id: id, 'creationMutation.mutationId': generated.mutationId });
          cleanup.push({ kind: generated.entityType, id: generated.record._id, removed: deleted.deletedCount === 1 });
        }
        const incomplete = cleanup.filter((entry) => !entry.removed);
        throw Object.assign(new Error(incomplete.length
          ? `Generated-scene commit failed and GMC could not fully compensate its staged records: ${error?.message ?? String(error)}`
          : `Generated-scene commit failed; GMC removed every newly staged scene record: ${error?.message ?? String(error)}`), {
          status: Number(error?.status ?? 502),
          code: incomplete.length ? 'SCENE_GENERATION_COMPENSATION_FAILED' : 'SCENE_GENERATION_COMMIT_FAILED',
          details: { cause: { code: error?.code ?? null, message: error?.message ?? String(error) }, cleanup },
        });
      }
    })();
    if (!location) { fail(req, res, 404, 'LOCATION_NOT_FOUND', 'The prepared scene location is no longer canonical GMC data.'); return; }
    const proposedPresence = buildProposedScenePresenceContract({ currentContract, location, presentNpcIds, npcs });
    if (!proposedPresence.valid || proposedPresence.revision !== expectedPresenceRevision) {
      fail(req, res, 409, 'SCENE_PRESENCE_PROPOSAL_CONFLICT', 'The exact prepared destination roster no longer matches GMC canon.', { proposedPresence }); return;
    }
  }
  const result = await createSceneMutation(uid, id, req.body);
  if (req.body.makeCurrent !== false) await collections.state().updateOne(
    { userId: uid, campaignId: id },
    { $set: { currentSceneId: result.record._id, updatedAt: new Date() } },
    { upsert: true },
  );
  res.status(result.duplicate ? 200 : 201).json({
    scene: result.record,
    mutationId: result.mutationId,
    duplicate: result.duplicate,
    duplicateReason: result.duplicateReason,
  });
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

gmcV1Router.post('/campaigns/:campaignId/narration/evidence', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  const uid = userId(req);
  const id = req.params.campaignId;
  const instruction = String(req.body?.instruction ?? '').trim();
  if (!instruction) { fail(req, res, 400, 'VALIDATION_ERROR', 'instruction is required.'); return; }

  // Canonical repairs complete before the snapshot is read. The resulting
  // evidence and validation contracts are hashed together by one builder.
  const prepared = await prepareMemoryReferences(uid, id, instruction);
  const state = await collections.state().findOne({ userId: uid, campaignId: id });
  const currentScene = state?.currentSceneId
    ? await collections.scenes().findOne({ _id: state.currentSceneId, userId: uid, campaignId: id })
    : null;
  const [facts, items, threads, npcs, locations, factions] = await Promise.all([
    listFacts(uid, id),
    listEntities(uid, id, 'item'),
    listThreads(uid, id),
    listEntities(uid, id, 'npc'),
    listEntities(uid, id, 'location'),
    listEntities(uid, id, 'faction'),
  ]);
  const currentLocation = currentScene?.locationId
    ? locations.find((location: any) => String(location?._id) === String(currentScene.locationId)) ?? null
    : null;
  res.json(buildNarrationEvidenceBundle({
    campaignId: id,
    instruction,
    intentTags: Array.isArray(req.body?.intentTags) ? req.body.intentTags : [],
    currentScene,
    currentLocation,
    gameClock: state?.gameClock ?? null,
    facts,
    items,
    threads,
    npcs,
    locations,
    factions,
    resolution: prepared.resolution,
    limits: req.body?.limits,
  }));
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

gmcV1Router.post('/campaigns/:campaignId/memory/resolve-references', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  const uid = userId(req); const id = req.params.campaignId;
  const instruction = String(req.body?.instruction ?? '').trim();
  if (!instruction) { fail(req, res, 400, 'VALIDATION_ERROR', 'instruction is required.'); return; }
  const [facts, threads, items, npcs, locations, factions] = await Promise.all([
    listFacts(uid, id),
    listThreads(uid, id),
    listEntities(uid, id, 'item'),
    listEntities(uid, id, 'npc'),
    listEntities(uid, id, 'location'),
    listEntities(uid, id, 'faction'),
  ]);
  res.json({
    resolution: resolveMemoryReferences({ facts: [...facts, ...threads], items, npcs, locations, factions }, instruction),
  });
}));

gmcV1Router.post('/campaigns/:campaignId/memory/prepare-references', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  const instruction = String(req.body?.instruction ?? '').trim();
  if (!instruction) { fail(req, res, 400, 'VALIDATION_ERROR', 'instruction is required.'); return; }
  res.json(await prepareMemoryReferences(userId(req), req.params.campaignId, instruction));
}));

gmcV1Router.post('/campaigns/:campaignId/memory/restore-references', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  const uid = userId(req); const id = req.params.campaignId;
  const state = await collections.state().findOne({ userId: uid, campaignId: id });
  res.json(await restoreMemoryReferences(uid, id, { ...req.body, gameClock: state?.gameClock ?? null }));
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
  const result = await createFactMutation(userId(req), req.params.campaignId, req.body);
  res.status(result.duplicate ? 200 : 201).json({
    fact: result.record,
    mutationId: result.mutationId,
    duplicate: result.duplicate,
    duplicateReason: result.duplicateReason,
  });
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
    const result = await createEntityMutation(userId(req), req.params.campaignId, kind, req.body);
    res.status(result.duplicate ? 200 : 201).json({
      [kind]: result.record,
      mutationId: result.mutationId,
      duplicate: result.duplicate,
      duplicateReason: result.duplicateReason,
    });
  }));
  gmcV1Router.patch(`/${plural}/:${kind}Id`, asyncRoute(async (req, res) => {
    const entity = await updateEntity(userId(req), req.params[`${kind}Id`], kind, req.body);
    if (!entity) { fail(req, res, 404, 'NOT_FOUND', `${kind} not found.`); return; }
    res.json({ [kind]: entity });
  }));
  if (kind !== 'faction') gmcV1Router.post(`/campaigns/:campaignId/${plural}/generate`, asyncRoute(async (req, res) => {
    if (!await campaign(req, res)) return;
    const generated = await generateStructuredJson(generationPrompts[kind as 'npc' | 'monster' | 'location' | 'item'], { prompt: req.body?.prompt, campaignId: req.params.campaignId, context: req.body });
    if (!generated.name) throw Object.assign(new Error('Generated entity has no name.'), { status: 502, code: 'STRUCTURED_OUTPUT_INVALID' });
    const makeCanon = Boolean(req.body?.makeCanon);
    const committed = makeCanon
      ? await createEntityMutation(userId(req), req.params.campaignId, kind, { ...generated, draft: false, mutationId: req.body?.mutationId })
      : null;
    const entity = committed?.record ?? { ...generated, draft: true };
    res.status(committed && !committed.duplicate ? 201 : 200).json({
      [kind]: entity,
      draft: !makeCanon,
      suggestedFacts: generated.suggestedFacts ?? [],
      ...(committed ? {
        mutationId: committed.mutationId,
        duplicate: committed.duplicate,
        duplicateReason: committed.duplicateReason,
      } : {}),
    });
  }));
}

registerEntityRoutes('npc', 'npcs');
registerEntityRoutes('monster', 'monsters');
registerEntityRoutes('location', 'locations');
registerEntityRoutes('item', 'items');
registerEntityRoutes('faction', 'factions');

gmcV1Router.post('/campaigns/:campaignId/actors/ensure', asyncRoute(async (req, res) => {
  if (!await campaign(req, res)) return;
  const result = await ensureCampaignActor(userId(req), req.params.campaignId, req.body ?? {});
  res.status(result.status === 'ready' && 'created' in result && result.created ? 201 : 200).json(result);
}));

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
  const result = await createThreadMutation(userId(req), req.params.campaignId, req.body);
  res.status(result.duplicate ? 200 : 201).json({
    thread: result.record,
    mutationId: result.mutationId,
    duplicate: result.duplicate,
    duplicateReason: result.duplicateReason,
  });
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
  const result = await createSessionMutation(userId(req), req.params.campaignId, req.body);
  res.status(result.duplicate ? 200 : 201).json({
    sessionId: result.record._id,
    session: result.record,
    mutationId: result.mutationId,
    duplicate: result.duplicate,
    duplicateReason: result.duplicateReason,
  });
}));

gmcV1Router.patch('/sessions/:sessionId/summary', asyncRoute(async (req, res) => {
  const session = await collections.sessions().findOneAndUpdate({ _id: req.params.sessionId, userId: userId(req) }, { $set: { summary: req.body?.summary ?? '', keyDecisions: req.body?.keyDecisions ?? [], openThreads: req.body?.openThreads ?? [], resolvedThreads: req.body?.resolvedThreads ?? [], updatedAt: new Date() } }, { returnDocument: 'after' });
  if (!session) { fail(req, res, 404, 'NOT_FOUND', 'Session not found.'); return; }
  res.json({ session });
}));

const COMPACT_ENVELOPE_AI_PATHS = new Set([
  '/generate-narration',
  '/adjudicate-skill-check',
  '/respond-ooc',
  '/retcon-narration',
]);
const COMPACT_AUXILIARY_AI_PATHS = new Set([
  '/evaluate-experience-award',
  '/plan-character-sheet-mutation',
]);

export const NARRATION_ENVELOPE_INSTRUCTION = `Execute only the supplied interactionEnvelope.
GMA owns intent classification, allowed controls, continuity slicing, and mutation gates. GMC canon appears only in canonEvidence; VCS mechanics appear only in mechanics. Do not reconstruct omitted campaign state or add a competing interpretation of intent.
Apply every envelope rule. Narrate only the newly authorized action. Preserve unaffected continuity, use only the exclusive present-NPC roster, and never invent mechanics, player actions, inventory changes, elapsed time, or canon.
If task is repair_narration, remove every deterministicIssues entry from rejectedCandidate without replacing it with another unsupported detail.
Return exactly one JSON object matching responseContract. For narration return {narration,npcDialogue,requiresVcsResolution,proposedCanonChanges,proposedVcsExports,proposedTimeAdvance,sceneSegmentUpdate,riskLevel,syncNotes,gmPrivateNotes}.`;

export const SKILL_ENVELOPE_INSTRUCTION = `Adjudicate only the supplied interactionEnvelope.
GMA has already determined this action is a genuine check candidate. Apply its rules and capability slice; do not request omitted character or campaign data.
Choose no_roll unless meaningful uncertainty, a real consequence, and a plausible attempt all exist. Prefer passive resolution for routine or secret opportunities. Use hidden_roll only when revealing the check leaks hidden state. Use player_roll only for a knowingly attempted consequential task, with DC and five outcome bands. One check covers the declared method until circumstances materially change.
Return {resolutionMode,skill,ability,dc,rollMode,passiveEligible,reason,preRollNarration,stakes,estimatedTimeCost,confidence}, plus requiredChecks only when distinct checks are all necessary.`;

export const OOC_ENVELOPE_INSTRUCTION = `Answer only the out-of-character task in interactionEnvelope. Use its compact canon evidence and continuity, do not narrate the player character acting, and distinguish rules discussion from in-world facts. Never claim an authoritative write occurred. Return {response,continuityNotes,proposedCanonChanges}.`;

export const RETCON_ENVELOPE_INSTRUCTION = `Apply only the retcon authorized by interactionEnvelope. Replace conflicting recent continuity, preserve unaffected state, and do not change GMC canon or VCS mechanics beyond explicit proposals. Do not replay corrected actions. Return {narration,correctionSummary,proposedCanonChanges,proposedTimeAdvance,continuityNotes}.`;

export const ENCOUNTER_ENVELOPE_INSTRUCTION = `Decide only whether the compact GMA interaction has triggered an immediate encounter requiring turn order now.
Default to continued narrative play. Conditional, hypothetical, contemplated, preparatory, or future violence is not a trigger. Do not invent an opponent absent from canonEvidence. A bounded likely-decisive single exchange may use standalone VCS mechanics instead of a BattleRoom; significant or persistent tactical state requires a BattleRoom.
Return {shouldCreateBattleRoom,requiresTurnOrder,triggeredNow,transitionType,confidence,reason,encounterBrief}.`;

export function validateCompactAiInput(req: Request) {
  const size = Buffer.byteLength(JSON.stringify(req.body ?? {}), 'utf8');
  const target = req.path === '/detect-encounter-transition'
    ? 24_000
    : (COMPACT_AUXILIARY_AI_PATHS.has(req.path) ? 32_000 : 48_000);
  if (COMPACT_ENVELOPE_AI_PATHS.has(req.path)) {
    const envelope = req.body?.interactionEnvelope;
    if (
      envelope?.authority !== 'gma.narration-envelope'
      || !envelope?.contractVersion
      || envelope?.interaction?.authority !== 'gma.interaction-plan'
      || envelope?.canonEvidence?.authority !== 'gmc.narration-evidence'
      || !envelope?.canonEvidence?.evidenceRevision
      || !envelope?.responseContract
    ) {
      throw Object.assign(new Error('A complete GMA interaction envelope with revision-bound GMC evidence is required.'), {
        status: 400,
        code: 'GMA_INTERACTION_ENVELOPE_REQUIRED',
      });
    }
  }
  if (req.path === '/detect-encounter-transition') {
    if (
      req.body?.task !== 'detect_immediate_encounter'
      || req.body?.interaction?.authority !== 'gma.interaction-plan'
      || req.body?.canonEvidence?.authority !== 'gmc.narration-evidence'
      || !req.body?.canonEvidence?.evidenceRevision
    ) {
      throw Object.assign(new Error('Encounter detection requires the compact GMA interaction plan and GMC evidence revision.'), {
        status: 400,
        code: 'GMA_ENCOUNTER_ENVELOPE_REQUIRED',
      });
    }
  }
  if (req.path === '/evaluate-experience-award') {
    if (
      req.body?.task !== 'evaluate_experience_award'
      || req.body?.interaction?.authority !== 'gma.interaction-plan'
      || req.body?.character?.authority !== 'vcs.character-summary'
      || req.body?.policy?.authority !== 'gma.experience-award-policy'
    ) {
      throw Object.assign(new Error('XP evaluation requires a compact GMA achievement contract and VCS character summary.'), {
        status: 400,
        code: 'GMA_XP_EVALUATION_CONTRACT_REQUIRED',
      });
    }
  }
  if (req.path === '/plan-character-sheet-mutation') {
    if (
      req.body?.task !== 'plan_character_sheet_mutation'
      || req.body?.interaction?.authority !== 'gma.interaction-plan'
      || req.body?.currentSheet?.authority !== 'vcs.character-sheet-slice'
      || !req.body?.currentSheet?.revision
      || req.body?.policy?.authority !== 'gma.character-sheet-mutation-policy'
    ) {
      throw Object.assign(new Error('Sheet planning requires a compact GMA mutation contract and revision-bound VCS resource slice.'), {
        status: 400,
        code: 'GMA_SHEET_MUTATION_CONTRACT_REQUIRED',
      });
    }
  }
  return { size, target, targetExceeded: size > target };
}

export function validateStructuredAiOutput(output: any, requiredKeys: string[]) {
  if (!output || typeof output !== 'object' || Array.isArray(output) || requiredKeys.some((key) => output[key] === undefined)) return false;
  for (const key of ['narration', 'response', 'reason', 'correctionSummary']) {
    if (output[key] !== undefined && typeof output[key] !== 'string') return false;
  }
  for (const key of ['proposedCanonChanges', 'proposedVcsExports', 'continuityNotes', 'issues', 'syncNotes', 'requiredChecks']) {
    if (output[key] !== undefined && !Array.isArray(output[key]) && !(key === 'syncNotes' && typeof output[key] === 'string')) return false;
  }
  for (const key of ['valid', 'shouldCreateBattleRoom', 'requiresTurnOrder', 'triggeredNow', 'shouldAward']) {
    if (output[key] !== undefined && typeof output[key] !== 'boolean') return false;
  }
  if (output.riskLevel !== undefined && !['low', 'medium', 'high'].includes(String(output.riskLevel))) return false;
  if (output.confidence !== undefined && (!Number.isFinite(Number(output.confidence)) || Number(output.confidence) < 0 || Number(output.confidence) > 1)) return false;
  return true;
}

async function ai(req: Request, res: Response, instruction: string, requiredKeys: string[]) {
  if (COMPACT_ENVELOPE_AI_PATHS.has(req.path) || COMPACT_AUXILIARY_AI_PATHS.has(req.path) || req.path === '/detect-encounter-transition') {
    const metrics = validateCompactAiInput(req);
    res.setHeader('X-GMC-AI-Context-Bytes', String(metrics.size));
    res.setHeader('X-GMC-AI-Context-Target', String(metrics.target));
    res.setHeader('X-GMC-AI-Context-Target-Exceeded', String(metrics.targetExceeded));
  }
  const output = await generateStructuredJson(instruction, req.body, { operation: req.path, correlationId: correlationId(req) });
  if (!validateStructuredAiOutput(output, requiredKeys)) {
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
gmcV1Router.post('/ai/generate-narration', asyncRoute((req, res) => ai(
  req,
  res,
  NARRATION_ENVELOPE_INSTRUCTION,
  ['narration', 'proposedCanonChanges', 'proposedVcsExports', 'riskLevel', 'syncNotes'],
)));
gmcV1Router.post('/ai/validate-narration-continuity', asyncRoute((req, res) => ai(req, res, `Act as a strict continuity editor, not a storyteller. Compare candidateNarration with the ordered conversationHistory, current instruction, continuityContract, authoritative VCS state, and campaign dashboard.
Mark the candidate invalid if it repeats an action already completed; awards the same item, money, information, damage, movement, or search result twice; contradicts the latest retcon or established state; ignores referents such as "other" or "next"; converts planning, considering, thinking, watching, or waiting into execution of a contemplated action; fails to resolve or materially advance an explicit new action; substitutes a recap for progress; or narrates a roll-dependent outcome without an authoritative result. A short orientation phrase is allowed, but the response must move forward without exceeding the player's stated intent.
When resolvedMechanicsContract is supplied, audit at event-level fidelity. authoritativeMechanicalResult, authoritativeOutcome, and rollRequest are complete and immutable. Mark the candidate invalid if it adds any follow-up action, target response after the immediate result, changed position, movement, forced movement, lost balance, condition, injury from zero damage, dialogue, material or construction detail, equipment property, terrain dimension, discovery, loot, reinforcement, or encounter transition that is absent from the supplied state. Atmospheric description may elaborate sound, light, and motion already inherent in the declared action, but may not establish a new durable fact. A zero-damage result is harmless and cannot make the target stumble, stagger, lose balance, slow, drop something, or suffer delayed impairment. Never invent words, movement, choices, or another action for the player character. Correct only the prose; never ask for or replay the mechanic.
When deterministicFidelityIssues is non-empty, each listed issue and named offending detail is a binding rejection found by the caller's structural validator. Mark the candidate invalid and remove every listed violation in correctedNarration; do not defend, paraphrase, preserve, or replace a rejected detail with another unsupported synonym. On reviewPass 2 or later, audit the correction as strictly as a fresh candidate and do not reintroduce anything rejected in previousReview.
Also mark it invalid when player-facing prose exposes developer or preparation diagnostics (“current records,” “fixed carried inventory,” “authoritative manifest,” “canon data,” “structured output,” “without inventing”), contains schema field names or underscore-delimited state codes, emits isolated state labels such as Drawn/Sheathed/Secured, repeats a full database display name at the start of consecutive sentences, or puts initiative/actions/HP/DC/VCS/GMA language into character dialogue. correctedNarration must translate mechanics into observable fiction and move private diagnosis to issues rather than preserving it in prose.
Also mark the candidate invalid if it upgrades a known or repeated detail from sceneImportanceContext into newly damning, substantial, collectible, XP-worthy, or canon-worthy evidence without a new differentiator from the current turn or explicit scene-plan importance. Known violet residue/leakage may be restated as a hazard or continuity reminder; it is not fresh decisive evidence by repetition alone.
Treat campaignDashboard.scenePresenceContract as binding. Mark the candidate invalid when a knownNonPresentNpcs entry acts, speaks, observes, carries evidence, guards, or receives an assignment. Do not repair the error by silently changing the roster; remove the absent NPC from the narration. An arrival/departure must be committed to GMC scene presence before narration uses it.
Use narrativeMomentumPolicy to mark the candidate invalid when it stops at routine follow-through, asks the player to repeat an already stated method, fails to finish actions after a resolved roll, or presents a cosmetic/procedural option menu whose choices lack materially different consequences. Minimally extend the correction through those micro-beats to the next significant interruption.
If valid, preserve candidateNarration exactly as correctedNarration. If invalid, write a minimally changed replacement that repairs every listed issue, honors the player's actual intent, preserves authoritative mechanics and established facts, and stops at the next genuine decision or properly framed roll. Do not add new mechanics merely to make the prose interesting.
Return {valid, issues:[{code,explanation}], correctedNarration, understoodPlayerIntent, stateAdvanced}.`, ['valid', 'issues', 'correctedNarration', 'understoodPlayerIntent', 'stateAdvanced'])));
export const EXPERIENCE_AWARD_INSTRUCTION = `Evaluate only the compact achievement contract supplied by GMA.
Use achievement, priorAwards, the VCS character summary, and policy.effectiveRanges. Authoritative mechanics are immutable; never reconstruct omitted campaign state or invent monster XP.
Award completed meaningful progress, not attempts, preparation, bookkeeping, routine travel, individual attacks, or repeated clues. One challenge receives one award; combat is awarded only when its outcome resolves. A repeated discovery earns 0 without a material new differentiator or completed objective.
Return {shouldAward,amount,category:'dialogue|roleplay|social|exploration|discovery|puzzle|combat|survival|objective|creative_solution|none',difficulty:'trivial|minor|meaningful|major|deadly|campaign',rationale,relatedChallengeId,alreadyRewarded,confidence,evidence}. amount is a non-negative multiple of 5 inside the selected effective range.`;
gmcV1Router.post('/ai/evaluate-experience-award', asyncRoute((req, res) => ai(
  req,
  res,
  EXPERIENCE_AWARD_INSTRUCTION,
  ['shouldAward', 'amount', 'category', 'difficulty', 'rationale', 'relatedChallengeId', 'alreadyRewarded', 'confidence', 'evidence'],
)));
gmcV1Router.post('/ai/adjudicate-skill-check', asyncRoute((req, res) => ai(
  req,
  res,
  SKILL_ENVELOPE_INSTRUCTION,
  ['resolutionMode', 'skill', 'ability', 'dc', 'rollMode', 'reason', 'preRollNarration', 'stakes', 'confidence'],
)));
gmcV1Router.post('/ai/narrate-skill-check-result', asyncRoute((req, res) => ai(req, res, `Narrate the authoritative VCS skill-check result and continue directly from the player's original action. Use authoritativeCheckOutcome and the matching scene-specific stake in rollRequest.stakes. Never change the d20, modifier, total, DC, margin, or outcome band. Do not replay actions completed before this check. If rollRequest.visibility is hidden, never mention a roll, DC, failure, success, modifier, or that hidden information was tested; simply narrate what the character perceives from the authoritative outcome. For a visible player roll, natural prose may reflect the quality of the result but should not read like a rules log. Resolve the attempted action and preserve uncertainty that the outcome band does not reveal.
Write one to three connected paragraphs of vivid player-facing fiction grounded in concrete motion, sensory evidence, environment, pressure, and consequence. Begin at the checked moment instead of recapping the scene. Vary sentence rhythm and references; never produce a dry report such as “the check succeeds,” “the result is recorded,” or “the character follows through.” Do not expose dice, totals, modifiers, DCs, outcome labels, VCS/GMA/GMC, schemas, IDs, or validation language. Do not invent player-character dialogue or a new decision. Do not invent discoveries, possessions, injuries, movement, NPC knowledge, or follow-up actions beyond the exact outcome band and remaining action already authorized by the instruction.
The supplied narrativeMomentumPolicy is binding. The roll paused the player's compound instruction; it did not cancel actions that followed the checked step. Finish every remaining authorized action unless the result makes it impossible or creates a significant interruption. Carry established operating methods through routine follow-through, apply the benefit earned by the roll, and stop only after every part of significantStopAudit passes. Do not stop at a junction, alarm, unattended object, route marker, door, bend, or empty stretch merely to offer inspect/scout/bypass choices. Continue to active opposition, a material discovery or tradeoff, a costly or irreversible commitment, a prepared importantBeat, or a terminal scene outcome that genuinely requires fresh input.
Use the supplied treasureRewardPolicy when the resolved check establishes loot, coin, valuables, gear, or magic. This is a high-magic solo campaign; reward pacing should be more favorable than standard party play while remaining plausible and avoiding duplicates.
Use the supplied sceneSegmentPolicy and sceneImportancePolicy. Return sceneSegmentUpdate when the check materially changes the active segment, completes it, or reveals that the segment scaffold is missing. Treat repeated known hazards and motifs as continuity unless the authoritative outcome establishes a new differentiator. Do not turn known violet residue/leakage into newly damning evidence or a collection objective by success narration alone.
The supplied gameTimePolicy and gameTimeContext are binding. If the resolved check consumed meaningful travel, searching, waiting, conversation, ritual, or other activity time, state that duration and return proposedTimeAdvance. Keep time costs consistent with the original stakes and do not add extra time beyond the outcome band.
Return {narration,proposedCanonChanges,proposedVcsExports,proposedTimeAdvance,sceneSegmentUpdate,riskLevel,syncNotes,gmPrivateNotes}. proposedTimeAdvance is null or {shouldAdvance,seconds,minutes,reason,activity,clockAfter}. sceneSegmentUpdate is null or {status,title,where,when,who,whyPresent,objective,doneWhen,importantBeats,knownDetails,evidenceLedger,stakes,availableRewards,rewardsRealized,rewardsMissed,outcome,arcImpacts,nextSceneSeed}.`, ['narration', 'proposedCanonChanges', 'proposedVcsExports', 'riskLevel', 'syncNotes'])));
gmcV1Router.post('/ai/narrate-combat-action-result', asyncRoute((req, res) => ai(
  req,
  res,
  NARRATE_COMBAT_ACTION_RESULT_INSTRUCTION,
  [...NARRATE_COMBAT_ACTION_RESULT_REQUIRED_KEYS],
)));
gmcV1Router.post('/ai/audit-resolved-mechanics-narration', asyncRoute((req, res) => ai(
  req,
  res,
  AUDIT_RESOLVED_MECHANICS_NARRATION_INSTRUCTION,
  [...AUDIT_RESOLVED_MECHANICS_NARRATION_REQUIRED_KEYS],
)));
gmcV1Router.post('/ai/respond-ooc', asyncRoute((req, res) => ai(
  req,
  res,
  OOC_ENVELOPE_INSTRUCTION,
  ['response', 'continuityNotes', 'proposedCanonChanges'],
)));
export const PLAN_CHARACTER_SHEET_MUTATION_INSTRUCTION = `Plan only from the compact, revision-bound VCS resource slice and evidence selected by GMA.
Return a mutation only for a newly established acquisition, loss, expenditure, healing, damage, rest, explicit equip/unequip, or bookkeeping correction. Plans, attempts, hypotheses, prose alone, and prior applied/duplicate mutations make no change. Never infer omitted inventory or campaign state.
Currency gains/costs use delta; set requires an explicit replacement total. All newly acquired weapons and all ammunition go through items.add; weapon type and acquisition never imply that a weapon is equipped. Equip/unequip only when explicitly established and move an already-owned quantity atomically. Ammunition can never be placed in Equipped Weapons. Unresolved identity, quantity, denomination, ownership, or provisional loot makes shouldMutate false. Ordinary audited challenge XP is handled separately.
Return {shouldMutate,confidence,reason,currency:{mode:'none|delta|set',cp,sp,ep,gp,pp},items:{add:[{name,quantity,type?}],remove:[{name,quantity}]},equippedWeapons:{equip:[{name,quantity}],unequip:[{name,quantity}]},hitPoints:{mode:'none|delta|set',current,maximum,temporary},hitDice:{mode:'none|delta|set',total,spent},experiencePoints:{mode:'none|delta|set',value}}. Use zero and empty arrays for unused fields.`;
export const PLAN_CHARACTER_SHEET_MUTATION_REQUIRED_KEYS = ['shouldMutate', 'confidence', 'reason', 'currency', 'items', 'equippedWeapons', 'hitPoints', 'hitDice', 'experiencePoints'];
gmcV1Router.post('/ai/plan-character-sheet-mutation', asyncRoute((req, res) => ai(req, res, PLAN_CHARACTER_SHEET_MUTATION_INSTRUCTION, PLAN_CHARACTER_SHEET_MUTATION_REQUIRED_KEYS)));
gmcV1Router.post('/ai/retcon-narration', asyncRoute((req, res) => ai(
  req,
  res,
  RETCON_ENVELOPE_INSTRUCTION,
  ['narration', 'correctionSummary', 'proposedCanonChanges', 'continuityNotes'],
)));
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
  initialNpcs:[{name,role,entityTier,presentInOpeningScene,motivation,personality_traits:[...],ideals:[...],bonds:[...],flaws:[...],secret,voice,relationshipToProtagonist,tags}],
  openThreads:[{title,description,deadlineDescription,consequence,scope:{kind,tier,locationId,locationName,entityId,entityName}}],
  sessionZeroSummary:{summary,keyDecisions,safetyNotes,playStyleNotes}
}. FACT scope tier must be geographic (world, city, district, site, room) or entity (bbeg, lieutenant, henchman, contact). NPC entityTier uses bbeg, lieutenant, henchman, or contact. Every initial NPC must have non-empty personality_traits, ideals, bonds, and flaws arrays; these are required character-defining material, not optional decoration. Every open thread is an EVENT: give it a meaningful trigger/deadline and a concrete consequence if it goes unaddressed. Generate at least 10 durable initial facts, 6-12 NPCs, 3-6 factions, 4-8 keyed locations, and 8-16 open threads unless Session 0 explicitly calls for a tiny campaign.`, ['campaign', 'campaignStructure', 'progressionPlan', 'rewardPlan', 'startingLocation', 'keyLocations', 'openingScene', 'initialFactions', 'initialFacts', 'initialNpcs', 'openThreads', 'sessionZeroSummary'])));
gmcV1Router.post('/ai/detect-encounter-transition', asyncRoute((req, res) => ai(
  req,
  res,
  ENCOUNTER_ENVELOPE_INSTRUCTION,
  ['shouldCreateBattleRoom', 'requiresTurnOrder', 'triggeredNow', 'transitionType', 'confidence', 'reason', 'encounterBrief'],
)));
gmcV1Router.post('/ai/plan-encounter', asyncRoute((req, res) => ai(
  req,
  res,
  PLAN_ENCOUNTER_INSTRUCTION,
  [...PLAN_ENCOUNTER_REQUIRED_KEYS],
)));
gmcV1Router.post('/ai/plan-encounter-challenge', asyncRoute((req, res) => ai(
  req,
  res,
  PLAN_ENCOUNTER_CHALLENGE_INSTRUCTION,
  [...PLAN_ENCOUNTER_CHALLENGE_REQUIRED_KEYS],
)));
gmcV1Router.post('/ai/plan-combat-turn', asyncRoute((req, res) => ai(
  req,
  res,
  PLAN_COMBAT_TURN_INSTRUCTION,
  [...PLAN_COMBAT_TURN_REQUIRED_KEYS],
)));
gmcV1Router.post('/ai/narrate-combat-turns', asyncRoute((req, res) => ai(
  req,
  res,
  NARRATE_COMBAT_TURNS_INSTRUCTION,
  [...NARRATE_COMBAT_TURNS_REQUIRED_KEYS],
)));
