import { Router, type Request } from 'express';
import type { IntegrationRequest } from '../middleware/integrationAuth.js';
import type { LlmRequestEnvelope } from '../../shared/llm/orchestratorContracts.js';
import { executeLlmOperation, executeShadowComparison } from './orchestrator.js';
import { MongoExecutionStore } from './executionStore.js';
import { listOperationDefinitions, OPERATION_REGISTRY_VERSION } from './operationRegistry.js';
import { loadModelPolicy } from './modelPolicy.js';
import {
  MongoAuthorityOutboxStore,
  createAuthorityOperation,
  recordAuthorityCompensation,
  recordAuthorityFailure,
  recordAuthorityReceipt,
} from './authorityOutbox.js';
import { classifyCanonProposal } from './canonClaimClassifier.js';
import { queryLlmObservability } from './observability.js';
import { deleteUserOrchestratorData } from './retention.js';
import { findMechanicsLedger, upsertMechanicsLedger } from './mechanicsLedger.js';

export const llmOrchestratorRouter = Router();

function userId(req: Request) {
  return (req as IntegrationRequest).userId;
}

function forwardMechanicsLedgerError(error: unknown, res: any, next: (error?: unknown) => void) {
  const status = Number((error as any)?.status ?? 0);
  if (status >= 400 && status < 500) {
    res.status(status).json({
      error: {
        code: (error as any)?.code ?? 'GMA_MECHANICS_LEDGER_ERROR',
        message: error instanceof Error ? error.message : 'The mechanics ledger request was rejected.',
      },
    });
    return;
  }
  next(error);
}

llmOrchestratorRouter.get('/contract', (_req, res) => {
  res.json({
    registryVersion: OPERATION_REGISTRY_VERSION,
    modelPolicyVersion: loadModelPolicy().version,
    operations: listOperationDefinitions().map((operation) => ({
      id: operation.id,
      version: operation.version,
      operationClass: operation.operationClass,
      authority: operation.authority,
      outputSchema: {
        id: operation.outputSchema.id,
        version: operation.outputSchema.version,
      },
      prompt: {
        id: operation.prompt.id,
        version: operation.prompt.version,
      },
    })),
  });
});

llmOrchestratorRouter.post('/execute', async (req, res, next) => {
  try {
    const response = await executeLlmOperation(req.body as LlmRequestEnvelope, { userId: userId(req) });
    const status = response.status === 'succeeded'
      ? 200
      : response.error?.code === 'IDEMPOTENCY_CONFLICT' || response.error?.code === 'OUTPUT_SCHEMA_VERSION_MISMATCH'
        ? 409
        : response.error?.code === 'LLM_CONTEXT_HARD_LIMIT_EXCEEDED'
          ? 413
        : response.error?.category === 'contract' || response.error?.category === 'policy' || response.error?.category === 'context'
          ? 400
          : response.error?.code === 'PROVIDER_RATE_LIMIT' || response.error?.code === 'PROVIDER_SPEND_CAP_EXCEEDED'
            ? 429
            : 502;
    res.status(status).json(response);
  } catch (error) {
    next(error);
  }
});

llmOrchestratorRouter.post('/validate-manual', async (req, res, next) => {
  try {
    const response = await executeLlmOperation(req.body?.request as LlmRequestEnvelope, {
      userId: userId(req),
      manualOutput: req.body?.output,
    });
    res.status(response.status === 'succeeded' ? 200 : 422).json(response);
  } catch (error) {
    next(error);
  }
});

llmOrchestratorRouter.post('/shadow', async (req, res, next) => {
  try {
    const comparison = await executeShadowComparison({
      request: req.body?.request as LlmRequestEnvelope,
      baselineOutput: req.body?.baselineOutput,
      options: { userId: userId(req) },
    });
    res.status(comparison.status === 'succeeded' ? 200 : 502).json({ comparison });
  } catch (error) {
    next(error);
  }
});

llmOrchestratorRouter.get('/executions', async (req, res, next) => {
  try {
    const records = await new MongoExecutionStore().query(userId(req), {
      taskId: typeof req.query.taskId === 'string' ? req.query.taskId : undefined,
      correlationId: typeof req.query.correlationId === 'string' ? req.query.correlationId : undefined,
      operation: typeof req.query.operation === 'string' ? req.query.operation : undefined,
      limit: Number(req.query.limit ?? 50),
    });
    res.json({
      executions: records.map((record) => ({
        taskId: record.taskId,
        correlationId: record.correlationId,
        operation: record.operation,
        idempotencyKey: record.idempotencyKey,
        status: record.status,
        startedAt: record.startedAt,
        completedAt: record.completedAt,
        route: record.response?.route,
        usage: record.response?.usage,
        timing: record.response?.timing,
        validation: record.response?.validation,
        error: record.response?.error,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GMA's mechanics receipt is stored beside GMC's durable execution records so
 * a later Vercel instance can rebuild narration from the authoritative VCS
 * result and the campaign context that GMC supplied to the original request.
 */
llmOrchestratorRouter.put('/mechanics-ledger/:campaignId/:interactionId', async (req, res, next) => {
  try {
    const result = await upsertMechanicsLedger({
      userId: userId(req),
      campaignId: req.params.campaignId,
      interactionId: req.params.interactionId,
      kind: req.body?.kind,
      requestFingerprint: String(req.body?.requestFingerprint ?? ''),
      request: req.body?.request && typeof req.body.request === 'object' ? req.body.request : {},
      response: req.body?.response && typeof req.body.response === 'object' ? req.body.response : {},
    });
    res.status(result.created ? 201 : 200).json(result);
  } catch (error) {
    forwardMechanicsLedgerError(error, res, next);
  }
});

llmOrchestratorRouter.get('/mechanics-ledger/:campaignId/:interactionId', async (req, res, next) => {
  try {
    const ledger = await findMechanicsLedger({
      userId: userId(req),
      campaignId: req.params.campaignId,
      interactionId: req.params.interactionId,
    });
    if (!ledger) {
      res.status(404).json({ error: { code: 'GMA_MECHANICS_LEDGER_NOT_FOUND', message: 'No durable mechanics receipt exists for this interaction.' } });
      return;
    }
    res.json({ ledger });
  } catch (error) {
    forwardMechanicsLedgerError(error, res, next);
  }
});

llmOrchestratorRouter.get('/observability', async (req, res, next) => {
  try {
    res.json(await queryLlmObservability(new MongoExecutionStore(), userId(req)));
  } catch (error) {
    next(error);
  }
});

llmOrchestratorRouter.delete('/retention/user-data', async (req, res, next) => {
  try {
    res.json(await deleteUserOrchestratorData({
      userId: userId(req),
      confirmation: String(req.body?.confirmation ?? ''),
    }));
  } catch (error) {
    next(error);
  }
});

llmOrchestratorRouter.post('/canon/classify', (req, res, next) => {
  try {
    const classification = classifyCanonProposal({
      expectedCanonRevision: String(req.body?.expectedCanonRevision ?? ''),
      currentCanonRevision: String(req.body?.currentCanonRevision ?? ''),
      proposal: req.body?.proposal,
      claims: Array.isArray(req.body?.claims) ? req.body.claims : [],
    });
    res.json({ classification });
  } catch (error) {
    next(error);
  }
});

llmOrchestratorRouter.post('/authority-operations', async (req, res, next) => {
  try {
    const operation = await createAuthorityOperation({
      store: new MongoAuthorityOutboxStore(),
      userId: userId(req),
      operationId: String(req.body?.operationId ?? ''),
      correlationId: String(req.body?.correlationId ?? req.header('X-Sixsmith-Correlation-Id') ?? ''),
      proposal: req.body?.proposal,
      steps: Array.isArray(req.body?.steps) ? req.body.steps : [],
    });
    res.status(201).json({ operation });
  } catch (error) {
    next(error);
  }
});

llmOrchestratorRouter.post('/authority-operations/:operationId/receipts', async (req, res, next) => {
  try {
    const operation = await recordAuthorityReceipt({
      store: new MongoAuthorityOutboxStore(),
      userId: userId(req),
      operationId: req.params.operationId,
      stepId: String(req.body?.stepId ?? ''),
      mutationId: String(req.body?.mutationId ?? ''),
      receipt: req.body?.receipt ?? null,
    });
    res.json({ operation });
  } catch (error) {
    next(error);
  }
});

llmOrchestratorRouter.post('/authority-operations/:operationId/failures', async (req, res, next) => {
  try {
    const operation = await recordAuthorityFailure({
      store: new MongoAuthorityOutboxStore(),
      userId: userId(req),
      operationId: req.params.operationId,
      stepId: String(req.body?.stepId ?? ''),
      error: {
        code: String(req.body?.error?.code ?? 'AUTHORITY_STEP_FAILED'),
        message: String(req.body?.error?.message ?? 'Authority step failed.'),
        retryable: Boolean(req.body?.error?.retryable),
      },
    });
    res.json({ operation });
  } catch (error) {
    next(error);
  }
});

llmOrchestratorRouter.post('/authority-operations/:operationId/compensations', async (req, res, next) => {
  try {
    const operation = await recordAuthorityCompensation({
      store: new MongoAuthorityOutboxStore(),
      userId: userId(req),
      operationId: req.params.operationId,
      stepId: String(req.body?.stepId ?? ''),
      receipt: req.body?.receipt ?? null,
    });
    res.json({ operation });
  } catch (error) {
    next(error);
  }
});
