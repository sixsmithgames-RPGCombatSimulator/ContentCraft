/** Explicit, bounded synthetic provider probe. Never executes a campaign. */
import 'dotenv/config';
import { FREEFORM_INTAKE_OPERATION } from '../src/shared/llm/freeformIntakePolicy.js';
import { getOperationDefinition, validateOperationOutput } from '../src/server/llm-orchestrator/operationRegistry.js';
import { GeminiProviderAdapter, geminiResponseJsonSchemaForRequest } from '../src/server/llm-orchestrator/providers/geminiProvider.js';
import { routeProviders } from '../src/server/llm-orchestrator/modelPolicy.js';
import { createUniversalRequest } from '../src/server/llm-orchestrator/orchestrator.js';
import { resolveOperationContext } from '../src/server/llm-orchestrator/contextResolver.js';
import { validateFreeformIntake } from '../src/server/llm-orchestrator/freeformIntakeValidation.js';

const operation = getOperationDefinition(FREEFORM_INTAKE_OPERATION);
const projection = geminiResponseJsonSchemaForRequest(operation.outputSchema.schema);
if (projection === undefined) throw new Error('Compact native schema exceeds the existing provider bound.');
const request = createUniversalRequest({ operation: operation.id, taskId: 'fictional-native-probe',
  correlationId: 'fictional-native-probe', idempotencyKey: 'fictional-native-probe',
  context: { input: { label: 'user_text', value: { ticket: 'fictional-native-probe', mode: 'action',
    instruction: 'I send my familiar into the tunnel, stay behind cover, and watch through its eyes.',
    selectedActorRef: null, catalog: [] } } },
});
const context = resolveOperationContext(request, operation);
const metadata = { operation: operation.id, policyVersion: operation.prompt.version,
  schemaBytes: Buffer.byteLength(JSON.stringify(projection)), policyBytes: Buffer.byteLength(operation.prompt.systemInstruction),
  providerEnvelopeBytes: context.totalBytes, providerCalls: 0, ownerWrites: 0, realCampaignData: false };
if (!process.argv.includes('--live')) {
  console.log(JSON.stringify({ ...metadata, providerAcceptanceTested: false }));
} else {
  const adapter = new GeminiProviderAdapter();
  let model: string | null = null;
  let calls = 0;
  try {
    const route = routeProviders({ adapters: [adapter], tier: operation.capabilityTier,
      operationClass: operation.operationClass, premiumAllowed: true, fallbackAllowed: false })[0];
    model = route.model;
    calls = 1;
    const generated = await adapter.generateStructured({ requestId: request.taskId, operation: operation.id,
      operationClass: operation.operationClass, model: route.model, systemInstruction: operation.prompt.systemInstruction,
      input: context.providerInput, outputSchema: operation.outputSchema.schema, temperature: operation.provider.temperature,
      thinkingLevel: operation.provider.thinkingLevel, maxOutputTokens: operation.provider.maxOutputTokens, timeoutMs: 55000 });
    const shape = validateOperationOutput(operation.id, generated.output);
    const semantics = validateFreeformIntake(request, generated.output);
    const output = generated.output as any;
    const meanings = output?.steps?.map((row: any) => row.purpose) ?? [];
    const scoutPreserved = output?.steps?.length === 3 && meanings.includes('relocate_actor')
      && meanings.includes('observe_situation') && output?.observations?.some((row: any) => row.observerKind === 'familiar');
    const valid = shape.valid && semantics.valid && scoutPreserved;
    console.log(JSON.stringify({ ...metadata, providerCalls: 1, providerAcceptanceTested: true,
      provider: adapter.id, adapterVersion: adapter.version, model: route.model,
      nativeSchemaAccepted: true, shapeValid: shape.valid, semanticChecksPassed: semantics.valid,
      scoutMeaningsPreserved: scoutPreserved, usage: generated.usage,
      issueCodes: [...shape.issues, ...semantics.issues].map((row) => row.code) }));
    if (!valid) process.exitCode = 1;
  } catch (error: unknown) {
    console.log(JSON.stringify({ ...metadata,
      provider: adapter.id, model, nativeSchemaAccepted: false,
      providerCalls: calls, providerAcceptanceTested: calls > 0,
      errorCode: (error as { code?: string })?.code ?? 'PROBE_FAILED' }));
    process.exitCode = 1;
  }
}
