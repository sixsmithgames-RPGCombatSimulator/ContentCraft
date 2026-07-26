import type { LlmRequestEnvelope } from '../../shared/llm/orchestratorContracts.js';
import { ProjectModel } from '../models/Project.js';
import { collections } from '../services/gmcIntegrationStore.js';
import { OrchestratorError } from './errors.js';
import type { ReferenceContextLoader } from './contextResolver.js';

function safeProject(project: any) {
  return project ? {
    id: project.id,
    title: project.title,
    description: project.description,
    type: project.type,
    status: project.status,
    updatedAt: project.updatedAt,
  } : null;
}

function projectId(request: LlmRequestEnvelope) {
  return String(request.references.campaignId ?? '').trim();
}

export class MongoReferenceContextLoader implements ReferenceContextLoader {
  async load(input: Parameters<ReferenceContextLoader['load']>[0]) {
    const campaignId = projectId(input.request);
    if (!campaignId) {
      throw new OrchestratorError({
        code: 'CAMPAIGN_REFERENCE_REQUIRED',
        category: 'context',
        message: 'A campaign reference is required before canonical records can be resolved.',
        status: 400,
        source: 'gmc.mongo-context-loader',
      });
    }
    const project = await ProjectModel.findById(input.userId, campaignId);
    if (!project) {
      throw new OrchestratorError({
        code: 'REFERENCE_NOT_OWNED',
        category: 'context',
        message: 'The referenced campaign does not exist for this user.',
        status: 404,
        source: 'gmc.mongo-context-loader',
      });
    }
    const layers: Partial<LlmRequestEnvelope['context']> = {};
    if (input.missingLayers.includes('campaign')) {
      const state = await collections.state().findOne(
        { userId: input.userId, campaignId },
        { projection: { _id: 0, currentSceneId: 1, gameClock: 1, gameClockRevision: 1, updatedAt: 1 } },
      );
      layers.campaign = {
        label: 'retrieved_authority_data',
        revision: input.request.references.canonVersion,
        value: { project: safeProject(project), state },
      };
    }
    if (input.missingLayers.includes('scene')) {
      const sceneId = String(input.request.references.sceneId ?? '').trim();
      const scene = await collections.scenes().findOne(
        { _id: sceneId, userId: input.userId, campaignId },
        { projection: { userId: 0 } },
      );
      if (!scene) {
        throw new OrchestratorError({
          code: 'REFERENCE_NOT_OWNED',
          category: 'context',
          message: 'The referenced scene does not exist in the referenced campaign.',
          status: 404,
          source: 'gmc.mongo-context-loader',
        });
      }
      layers.scene = {
        label: 'retrieved_authority_data',
        revision: input.request.references.sceneVersion,
        value: scene,
      };
    }
    if (input.missingLayers.includes('canon')) {
      const entityIds = [
        ...(input.request.references.actorIds ?? []),
        ...(input.request.references.locationIds ?? []),
      ];
      const [facts, entities] = await Promise.all([
        collections.facts().find(
          { userId: input.userId, campaignId, supersededAt: { $exists: false } },
          { projection: { userId: 0 } },
        ).sort({ updatedAt: -1 }).limit(100).toArray(),
        entityIds.length
          ? collections.entities().find(
            { _id: { $in: entityIds }, userId: input.userId, project_id: campaignId, status: { $ne: 'superseded' } },
            { projection: { userId: 0 } },
          ).limit(100).toArray()
          : [],
      ]);
      const resolvedIds = new Set(entities.map((entity) => String(entity._id)));
      const unresolvedIds = entityIds.filter((id) => !resolvedIds.has(String(id)));
      if (unresolvedIds.length) {
        throw new OrchestratorError({
          code: 'REFERENCE_NOT_OWNED',
          category: 'context',
          message: 'One or more canonical entity references are missing or outside this campaign.',
          status: 404,
          source: 'gmc.mongo-context-loader',
          details: { unresolvedIds },
        });
      }
      layers.canon = {
        label: 'retrieved_authority_data',
        revision: input.request.references.canonVersion,
        value: { facts, entities },
      };
    }
    return layers;
  }
}
