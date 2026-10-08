import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  llmRequestJsonSchema,
  llmResponseJsonSchema,
} from '../src/shared/llm/orchestratorContracts.js';
import {
  OPERATION_REGISTRY_VERSION,
  listOperationDefinitions,
} from '../src/server/llm-orchestrator/operationRegistry.js';
import { loadModelPolicy } from '../src/server/llm-orchestrator/modelPolicy.js';

const checkOnly = process.argv.includes('--check');
const contractDirectory = resolve(process.cwd(), 'contracts');
const operations = listOperationDefinitions()
  .sort((left, right) => left.id.localeCompare(right.id))
  .map((operation) => ({
    id: operation.id,
    version: operation.version,
    operationClass: operation.operationClass,
    capabilityTier: operation.capabilityTier,
    authority: operation.authority,
    prompt: operation.prompt,
    outputSchema: operation.outputSchema,
    validators: operation.validators,
    context: operation.context,
    provider: operation.provider,
    cache: operation.cache,
  }));

const registry = {
  schemaVersion: 'gma-gmc.llm-registry-artifact/1',
  registryVersion: OPERATION_REGISTRY_VERSION,
  modelPolicyVersion: loadModelPolicy().version,
  operations,
};

const openApi = {
  openapi: '3.1.0',
  info: {
    title: 'GameMasterCraft LLM Orchestrator API',
    version: OPERATION_REGISTRY_VERSION,
  },
  paths: {
    '/api/gmc/v1/llm/freeform-tickets': {
      post: {
        operationId: 'issueFreeformIntakeTicket',
        description: 'Service integration only. Builds an immutable action packet from an owned staged instruction; no gameplay effects.',
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', additionalProperties: false,
          required: ['campaignId', 'interactionId', 'issuanceKey', 'mode', 'transport', 'selectedActorRef'],
          properties: {
            campaignId: { type: 'string', minLength: 1, maxLength: 240 },
            interactionId: { type: 'string', minLength: 1, maxLength: 240 },
            issuanceKey: { type: 'string', minLength: 1, maxLength: 240 },
            mode: { const: 'action' }, transport: { enum: ['manual', 'integrated'] },
            selectedActorRef: { type: ['string', 'null'], maxLength: 240 },
            previousTicket: { type: ['string', 'null'], maxLength: 80 },
          },
        } } } },
        responses: { 200: { description: 'Exact issuance replay' }, 201: { description: 'Protected ticket, immutable request and expiry' },
          403: { description: 'Service integration authentication required' }, 409: { description: 'Issuance or disposition conflict' },
          413: { description: 'Indivisible instruction exceeds provider envelope budget' }, 422: { description: 'Invalid issuance fields' } },
      },
    },
    '/api/gmc/v1/llm/freeform-tickets/{ticket}/retire': {
      post: {
        operationId: 'retireFreeformIntakeTicket',
        description: 'Service integration only. Retires an owned ticket; cancellation does not authorize replacement.',
        parameters: [{ in: 'path', name: 'ticket', required: true, schema: { type: 'string', maxLength: 80 } }],
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', additionalProperties: false, required: ['campaignId'],
          properties: { campaignId: { type: 'string', minLength: 1, maxLength: 240 } },
        } } } },
        responses: { 200: { description: 'Retired disposition or exact retirement replay' },
          403: { description: 'Service integration authentication required' }, 404: { description: 'Owned ticket not found' },
          409: { description: 'Concurrent settlement conflict' } },
      },
    },
    '/api/gmc/v1/llm/contract': {
      get: {
        operationId: 'getLlmOrchestratorContract',
        responses: { 200: { description: 'Current registry contract' } },
      },
    },
    '/api/gmc/v1/llm/execute': {
      post: {
        operationId: 'executeLlmOperation',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LlmRequest' } } },
        },
        responses: {
          200: {
            description: 'Universal execution response',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LlmResponse' } } },
          },
        },
      },
    },
    '/api/gmc/v1/llm/validate-manual': {
      post: {
        operationId: 'validateManualLlmOperation',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['request', 'output'],
                properties: {
                  request: { $ref: '#/components/schemas/LlmRequest' },
                  output: {},
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Validated manual execution response',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LlmResponse' } } },
          },
        },
      },
    },
    '/api/gmc/v1/llm/shadow': {
      post: {
        operationId: 'compareShadowLlmOperation',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['request', 'baselineOutput'],
                properties: {
                  request: { $ref: '#/components/schemas/LlmRequest' },
                  baselineOutput: {},
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Proposal-only shadow comparison' } },
      },
    },
  },
  components: {
    schemas: {
      LlmRequest: llmRequestJsonSchema,
      LlmResponse: llmResponseJsonSchema,
    },
  },
};

const operationIds = operations.map((operation) => JSON.stringify(operation.id)).join(' | ');
const generatedTypes = `// GENERATED by scripts/generate-llm-contract.ts. Do not edit.\n`
  + `export type GmcLlmOperationId = ${operationIds};\n`
  + `export type GmcLlmRegistryVersion = ${JSON.stringify(OPERATION_REGISTRY_VERSION)};\n`;

const artifacts = new Map<string, string>([
  [resolve(contractDirectory, 'llm-operation-registry.json'), `${JSON.stringify(registry, null, 2)}\n`],
  [resolve(contractDirectory, 'llm-orchestrator.openapi.json'), `${JSON.stringify(openApi, null, 2)}\n`],
  [resolve(contractDirectory, 'llm-operation-types.d.ts'), generatedTypes],
]);

mkdirSync(contractDirectory, { recursive: true });
let drift = false;
for (const [path, contents] of artifacts) {
  if (checkOnly) {
    if (!existsSync(path) || readFileSync(path, 'utf8') !== contents) {
      console.error(`Generated LLM contract drift: ${path}`);
      drift = true;
    }
  } else {
    writeFileSync(path, contents, 'utf8');
  }
}
if (drift) process.exit(1);
console.log(checkOnly
  ? `LLM contracts current: ${operations.length} operations.`
  : `Generated LLM contracts: ${operations.length} operations.`);
