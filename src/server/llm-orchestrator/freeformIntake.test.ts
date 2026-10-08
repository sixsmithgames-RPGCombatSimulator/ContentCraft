import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FREEFORM_INTAKE_OPERATION, FREEFORM_INTAKE_POLICY, FREEFORM_INTAKE_POLICY_VERSION } from '../../shared/llm/freeformIntakePolicy.js';
import { FREEFORM_INTENT_PROPOSAL_SCHEMA } from '../../shared/llm/freeformIntentSchema.js';
import { getOperationDefinition, validateOperationOutput } from './operationRegistry.js';
import { geminiResponseJsonSchemaForRequest, GeminiProviderAdapter } from './providers/geminiProvider.js';
import { OpenAiProviderAdapter } from './providers/openAiProvider.js';
import { validateFreeformIntake } from './freeformIntakeValidation.js';
import { freeformDigest, issueFreeformTicket, loadBoundFreeformTicket, retireFreeformTicket, FREEFORM_TICKET_LIFETIME_MS,
  type FreeformTicketCollection, type FreeformTicketRecord } from './freeformTickets.js';
import { executeLlmOperation } from './orchestrator.js';
import { MemoryExecutionStore } from './executionStore.js';
import { FakeProviderAdapter } from './providers/fakeProvider.js';
import { resolveOperationContext } from './contextResolver.js';
import * as rollout from './rolloutPolicy.js';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

const instruction = 'I send my scout into the tunnel, stay behind cover, and watch through its eyes.';
function memoryTickets() {
  const documents: FreeformTicketRecord[] = [];
  const match = (document: FreeformTicketRecord, filter: any) => Object.entries(filter).every(([key, value]) => (document as any)[key] === value);
  const records = {
    async findOne(filter: any) { return structuredClone(documents.find((row) => match(row, filter)) ?? null); },
    async insertOne(record: FreeformTicketRecord) {
      if (documents.some((row) => row.userId === record.userId && row.campaignId === record.campaignId
        && (row.issuanceKey === record.issuanceKey || row.interactionId === record.interactionId && row.attempt === record.attempt))) {
        throw Object.assign(new Error('duplicate'), { code: 11000 });
      }
      documents.push(structuredClone(record));
    },
    async findOneAndUpdate(filter: any, update: any) {
      const record = documents.find((row) => match(row, filter));
      if (!record) return null;
      Object.assign(record, structuredClone(update.$set));
      return structuredClone(record);
    },
  } as unknown as FreeformTicketCollection;
  return { documents, records };
}
async function fixture(transport: 'manual' | 'integrated' = 'manual', text = instruction) {
  const tickets = memoryTickets();
  const input = { userId: 'fictional-user', campaignId: 'fictional-campaign', interactionId: 'fictional-turn',
    issuanceKey: 'fictional-issuance', mode: 'action' as const, selectedActorRef: null, transport };
  const readInstruction = vi.fn(async () => ({ instruction: { schemaVersion: 'gma.player-instruction-artifact/1',
    interactionId: input.interactionId, exactText: text, utf8Bytes: Buffer.byteLength(text), instructionRef: 'fictional-instruction',
    instructionFingerprint: createHash('sha256').update(text).digest('hex') }, originCheckpoint: null, stagedAt: new Date() }));
  const issued = await issueFreeformTicket(input, { records: tickets.records, readInstruction });
  const referents = [
    { kind: 'actor', text: 'I', catalogKey: null, methodKind: null },
    { kind: 'actor', text: 'my scout', catalogKey: null, methodKind: null },
    { kind: 'place', text: 'the tunnel', catalogKey: null, methodKind: null },
    { kind: 'method', text: 'through its eyes', catalogKey: null, methodKind: 'capability' },
  ];
  const step = (goal: string, evidence: string, actor: number, purpose: string, after: number[] = []) => ({
    kind: 'action', purpose, goal, evidence: [evidence], actor, targets: [], method: null,
    results: [], after, parallel: [], when: null,
  });
  const output: any = { schemaVersion: 'gma.freeform-intent-proposal/1', ticket: issued.ticket, windowText: text, referents,
    steps: [step('Scout enters the tunnel', 'send my scout into the tunnel', 1, 'relocate_actor'),
      step('Character stays concealed', 'stay behind cover', 0, 'apply_capability'),
      step('Observe through the scout', 'watch through its eyes', 0, 'observe_situation', [0])],
    observations: [{ step: 2, observer: 1, observerKind: 'familiar', method: 3, form: null, viewpointAfter: 0,
      subject: 2, origin: null, facet: 'surface_description', valueKind: 'description', precision: 'ordinary', evidence: ['watch through its eyes'] }],
    clarification: null };
  output.steps[0].targets = [{ ref: 2, role: 'destination' }];
  output.steps[0].results = ['Scout reaches the tunnel'];
  output.steps[1].results = ['Remain behind cover'];
  output.steps[2].method = 3;
  const executionStore = new MemoryExecutionStore();
  const provider = new FakeProviderAdapter(() => structuredClone(output));
  const options = { userId: input.userId, freeformTickets: tickets.records, store: executionStore, providers: [provider],
    ...(transport === 'manual' ? { manualOutput: output } : {}) };
  return { ...tickets, input, readInstruction, issued, output, options, provider, executionStore };
}
function enableFixtureOperation() {
  vi.spyOn(rollout, 'resolveRolloutDecision').mockImplementation((operation, _identity) => ({
    operation, policyVersion: 'fixture-only', mode: 'primary', configuredMode: 'primary', canaryPercent: 100,
    canaryBucket: 0, selected: true, rollbackTarget: 'disabled',
  }));
}

describe('compact freeform proposal boundary (not gameplay certification)', () => {
  it('registers one closed compact schema, complete first-pass policy, and one no-fallback attempt', () => {
    const op = getOperationDefinition(FREEFORM_INTAKE_OPERATION);
    expect(op.outputSchema.schema).toEqual(FREEFORM_INTENT_PROPOSAL_SCHEMA);
    expect(op.prompt.version).toBe(FREEFORM_INTAKE_POLICY_VERSION);
    expect(op.prompt.systemInstruction).toBe(FREEFORM_INTAKE_POLICY);
    expect(Buffer.byteLength(FREEFORM_INTAKE_POLICY)).toBeLessThanOrEqual(4096);
    expect(Buffer.byteLength(JSON.stringify(geminiResponseJsonSchemaForRequest(op.outputSchema.schema)))).toBeLessThanOrEqual(4096);
    expect(geminiResponseJsonSchemaForRequest(op.outputSchema.schema)).toBeDefined();
    expect(op.provider).toMatchObject({ maxAttempts: 1, fallbackAllowed: false, maxOutputTokens: 6000 });
    expect(op.context).toMatchObject({ allowedKeys: ['input'], inputTargetBytes: 8192, inputHardLimitBytes: 24576 });
    expect(op.authority.commit).toBe('proposal_only');
    for (const rule of ['exact prefix', 'literally', 'matching kind', 'reciprocal', 'twelve', 'six dependency',
      'same observer', 'null requirement', 'stationary', '16,384', 'clarification', 'replaced whole', 'no review or confidence']) {
      expect(op.prompt.systemInstruction).toContain(rule);
    }
  });
  it('is disabled by default and never generates a model reply', async () => {
    const f = await fixture('integrated');
    const response = await executeLlmOperation(f.issued.request, f.options);
    expect(response.error?.code).toBe('OPERATION_ROLLOUT_DISABLED');
    expect(f.provider.calls).toHaveLength(0);
  });
  it.each(['manual', 'integrated'] as const)('validates the explicit remote-observer proposal in %s transport and replays once', async (transport) => {
    enableFixtureOperation();
    const f = await fixture(transport);
    expect(validateOperationOutput(FREEFORM_INTAKE_OPERATION, f.output).valid).toBe(true);
    expect(validateFreeformIntake(f.issued.request, f.output).issues).toEqual([]);
    const first = await executeLlmOperation(f.issued.request, f.options);
    expect(first.status).toBe('succeeded');
    expect(first.output).toEqual(f.output);
    expect(await executeLlmOperation(f.issued.request, f.options)).toEqual(first);
    expect(f.provider.calls).toHaveLength(transport === 'manual' ? 0 : 1);
    expect(f.documents[0]).toMatchObject({ status: 'accepted', outputDigest: freeformDigest(f.output) });
    const audits = await f.executionStore.query(f.input.userId, {});
    expect(JSON.stringify(audits.map((row) => ({ events: row.events, metadata: row.requestMetadata })))).not.toContain(instruction);
  });
  it('rejects added bookkeeping and invalid literal/index/graph/viewpoint meanings without relaxing the old schema', async () => {
    const f = await fixture();
    const badShape = { ...f.output, review: { allWindowActionsRepresented: true } };
    expect(validateOperationOutput(FREEFORM_INTAKE_OPERATION, badShape).valid).toBe(false);
    for (const mutate of [
      (o: any) => { o.ticket = 'another-ticket'; },
      (o: any) => { o.windowText = o.windowText.slice(1); },
      (o: any) => { o.steps[0].evidence = ['a different instruction']; },
      (o: any) => { o.steps[0].actor = 3; },
      (o: any) => { o.referents[0].catalogKey = 'invented'; },
      (o: any) => { o.referents[0].methodKind = 'spell'; },
      (o: any) => { o.steps[0].after = [2]; },
      (o: any) => { o.steps[1].parallel = [0]; },
      (o: any) => { o.steps[2].when = { predicate: 'failed', step: 1, requirement: null }; },
      (o: any) => { o.steps[2].when = { predicate: 'event', step: null, requirement: 'sixth bell' }; },
      (o: any) => { o.steps[1].kind = 'discussion'; },
      (o: any) => { o.observations[0].viewpointAfter = 1; },
      (o: any) => { o.observations[0].observer = 0; },
      (o: any) => { o.observations[0].step = 0; },
      (o: any) => { o.observations = []; },
      (o: any) => { o.steps[2].results = ['I know the hidden answer']; },
      (o: any) => { o.clarification = ''; },
    ]) {
      const output = structuredClone(f.output); mutate(output);
      expect(validateFreeformIntake(f.issued.request, output).valid).toBe(false);
    }
    expect(f.documents[0].status).toBe('active');
  });
  it('preserves exact Unicode prefix and suffix and does not invent evidence for an implicit request', async () => {
    const f = await fixture();
    const text = 'I look 👁️ through its eyes. Then I leave.';
    const request = structuredClone(f.issued.request);
    (request.context.input.value as any).instruction = text;
    const output = structuredClone(f.output);
    output.windowText = 'I look 👁️ through its eyes.';
    output.steps = [{ ...output.steps[2], after: [], evidence: ['look 👁️ through its eyes'] }];
    output.observations[0] = { ...output.observations[0], step: 0, viewpointAfter: null, evidence: ['through its eyes'] };
    expect(validateFreeformIntake(request, output).valid).toBe(true);
    output.steps[0].evidence = ['look through its eyes'];
    expect(validateFreeformIntake(request, output).valid).toBe(false);
  });
  it('requires the original protected request and isolates user, campaign, mode, policy, actor and transport before any call', async () => {
    enableFixtureOperation();
    const f = await fixture('integrated');
    await expect(executeLlmOperation(f.issued.request, { ...f.options, userId: 'someone-else' })).rejects.toMatchObject({ code: 'FREEFORM_TICKET_BINDING_INVALID' });
    for (const mutate of [
      (r: any) => { r.references.campaignId = 'another-campaign'; },
      (r: any) => { r.context.input.value.instruction = 'I attack'; },
      (r: any) => { r.context.input.value.mode = 'correction'; },
      (r: any) => { r.context.input.value.selectedActorRef = 'another-actor'; },
      (r: any) => { r.constraints.policyVersion = 'another-policy'; },
      (r: any) => { r.context.canon = { label: 'retrieved_authority_data', value: { privateFacts: 'secret' } }; },
    ]) {
      const request = structuredClone(f.issued.request); mutate(request);
      await expect(executeLlmOperation(request, f.options)).rejects.toMatchObject({ code: 'FREEFORM_TICKET_BINDING_INVALID' });
    }
    await expect(executeLlmOperation(f.issued.request, { ...f.options, manualOutput: f.output })).rejects.toMatchObject({ code: 'FREEFORM_TICKET_BINDING_INVALID' });
    expect(f.provider.calls).toHaveLength(0);
    expect(f.documents[0].status).toBe('active');
  });
  it('issues idempotently under concurrency, rejects different keys for the same attempt, and binds staging', async () => {
    const f = await fixture();
    const repeats = await Promise.all(Array.from({ length: 8 }, () => issueFreeformTicket(f.input, { records: f.records, readInstruction: f.readInstruction })));
    expect(repeats.every((row) => row.ticket === f.issued.ticket && row.duplicate)).toBe(true);
    expect(f.documents).toHaveLength(1);
    await expect(issueFreeformTicket({ ...f.input, issuanceKey: 'different-key' }, { records: f.records, readInstruction: f.readInstruction }))
      .rejects.toMatchObject({ code: 'FREEFORM_TICKET_ISSUANCE_CONFLICT' });
    await expect(issueFreeformTicket({ ...f.input, mode: 'correction' as any }, { records: f.records, readInstruction: f.readInstruction }))
      .rejects.toMatchObject({ code: 'FREEFORM_TICKET_INPUT_INVALID' });
    await expect(issueFreeformTicket(f.input, { records: f.records, readInstruction: vi.fn(async () => null) }))
      .rejects.toMatchObject({ code: 'FREEFORM_INSTRUCTION_NOT_STAGED' });
  });
  it('expires before accepted replay and refuses changed accepted Manual replies', async () => {
    enableFixtureOperation();
    const f = await fixture();
    await executeLlmOperation(f.issued.request, f.options);
    const changed = { ...f.output, clarification: 'Which tunnel?' };
    await expect(executeLlmOperation(f.issued.request, { ...f.options, manualOutput: changed })).rejects.toMatchObject({ code: 'FREEFORM_ACCEPTED_REPLY_CHANGED' });
    await expect(loadBoundFreeformTicket({ userId: f.input.userId, request: f.issued.request, manualOutput: f.output,
      now: new Date(f.documents[0].createdAt.getTime() + FREEFORM_TICKET_LIFETIME_MS) }, f.records)).rejects.toMatchObject({ code: 'FREEFORM_TICKET_EXPIRED' });
  });
  it('retires workflows idempotently without turning cancellation into a correction attempt', async () => {
    const f = await fixture();
    await expect(retireFreeformTicket({ userId: 'another-user', campaignId: f.input.campaignId, ticket: f.issued.ticket }, f.records))
      .rejects.toMatchObject({ code: 'FREEFORM_TICKET_NOT_FOUND' });
    expect(await retireFreeformTicket({ ...f.input, ticket: f.issued.ticket }, f.records)).toEqual({ retired: true, duplicate: false });
    expect(await retireFreeformTicket({ ...f.input, ticket: f.issued.ticket }, f.records)).toEqual({ retired: true, duplicate: true });
    await expect(issueFreeformTicket({ ...f.input, issuanceKey: 'replacement', previousTicket: f.issued.ticket },
      { records: f.records, readInstruction: f.readInstruction })).rejects.toMatchObject({ code: 'FREEFORM_REPLACEMENT_NOT_ALLOWED' });
  });
  it('discards a failed proposal, permits one fresh replacement, and stops the same second failure', async () => {
    enableFixtureOperation();
    const f = await fixture();
    const rejected = { ...f.output, windowText: 'private rejected output marker' };
    const first = await executeLlmOperation(f.issued.request, { ...f.options, manualOutput: rejected });
    expect(first.status).toBe('review_required');
    expect(first.output).toBeNull();
    expect(f.documents[0]).toMatchObject({ status: 'retired', supportStop: false });
    expect(JSON.stringify(f.documents)).not.toContain('private rejected output marker');
    await expect(executeLlmOperation(f.issued.request, f.options)).rejects.toMatchObject({ code: 'FREEFORM_TICKET_RETIRED' });
    const next = await issueFreeformTicket({ ...f.input, issuanceKey: 'replacement', previousTicket: f.issued.ticket },
      { records: f.records, readInstruction: f.readInstruction });
    const second = await executeLlmOperation(next.request, { ...f.options, manualOutput: { ...rejected, ticket: next.ticket } });
    expect(second.error).toMatchObject({ code: 'FREEFORM_INTAKE_SUPPORT_REQUIRED', retryable: false });
    expect(f.documents[1]).toMatchObject({ attempt: 2, status: 'retired', supportStop: true });
    await expect(issueFreeformTicket({ ...f.input, issuanceKey: 'third', previousTicket: next.ticket },
      { records: f.records, readInstruction: f.readInstruction })).rejects.toMatchObject({ code: 'FREEFORM_REPLACEMENT_NOT_ALLOWED' });
    expect(f.provider.calls).toHaveLength(0);
  });
  it('accepts a complete replacement, not the failed fields, and resets a different failure signature', async () => {
    enableFixtureOperation();
    const f = await fixture();
    await executeLlmOperation(f.issued.request, { ...f.options, manualOutput: { ...f.output, windowText: 'bad prefix' } });
    const next = await issueFreeformTicket({ ...f.input, issuanceKey: 'replacement', previousTicket: f.issued.ticket }, { records: f.records, readInstruction: f.readInstruction });
    expect((await executeLlmOperation(next.request, { ...f.options, manualOutput: { ...f.output, ticket: next.ticket } })).status).toBe('succeeded');
    const other = await fixture();
    await executeLlmOperation(other.issued.request, { ...other.options, manualOutput: { ...other.output, windowText: 'bad prefix' } });
    const second = await issueFreeformTicket({ ...other.input, issuanceKey: 'replacement', previousTicket: other.issued.ticket }, { records: other.records, readInstruction: other.readInstruction });
    const bad = structuredClone(other.output); bad.ticket = second.ticket; bad.steps[0].actor = 3;
    expect((await executeLlmOperation(second.request, { ...other.options, manualOutput: bad })).error?.code).toBe('OUTPUT_VALIDATION_FAILED');
    expect(other.documents[1].supportStop).toBe(false);
  });
  it('does not regenerate after a lost response, reconciles durable execution, and prevents concurrent provider calls', async () => {
    enableFixtureOperation();
    const f = await fixture('integrated');
    let release!: () => void;
    const delayed = new FakeProviderAdapter(async () => { await new Promise<void>((resolve) => { release = resolve; }); return f.output; });
    const first = executeLlmOperation(f.issued.request, { ...f.options, providers: [delayed] });
    await vi.waitFor(() => expect(delayed.calls).toHaveLength(1));
    await expect(executeLlmOperation(f.issued.request, f.options)).rejects.toMatchObject({ code: 'FREEFORM_INTAKE_PENDING' });
    release(); const result = await first;
    expect(result.status).toBe('succeeded');
    f.documents[0].status = 'running'; delete f.documents[0].response;
    expect((await executeLlmOperation(f.issued.request, f.options)).status).toBe('succeeded');
    expect(f.provider.calls).toHaveLength(0);
    expect(delayed.calls).toHaveLength(1);
  });
  it('counts escaped provider framing, rejects excess context/output, and refuses native-schema fallback before fetch', async () => {
    const f = await fixture();
    const op = getOperationDefinition(FREEFORM_INTAKE_OPERATION);
    const escaped = structuredClone(f.issued.request);
    (escaped.context.input.value as any).instruction = '\\'.repeat(8000);
    expect(() => resolveOperationContext(escaped, op)).toThrow();
    const big = structuredClone(f.output); big.referents[0].text = 'x'.repeat(17000);
    expect(validateFreeformIntake(f.issued.request, big).issues.some((row) => row.code === 'FREEFORM_PROPOSAL_OVER_BUDGET')).toBe(true);
    const excessiveGraph = { ...f.output, steps: Array.from({ length: 50 }, (_, i) => ({ ...f.output.steps[0],
      after: Array.from({ length: i }, (_unused, j) => j) })) };
    expect(validateFreeformIntake(f.issued.request, excessiveGraph).valid).toBe(false);
    vi.stubEnv('GEMINI_API_KEY', 'fixture-key');
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(new GeminiProviderAdapter().generateStructured({ requestId: 'fixture', operation: FREEFORM_INTAKE_OPERATION,
      operationClass: op.operationClass, model: 'fixture-model', systemInstruction: op.prompt.systemInstruction,
      input: {}, outputSchema: { description: 'x'.repeat(5000) }, maxOutputTokens: 6000, timeoutMs: 1000 }))
      .rejects.toMatchObject({ code: 'FREEFORM_NATIVE_SCHEMA_REQUIRED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('bounds OpenAI framing before fetch and counts SDK retries inside the one-attempt limit', async () => {
    const f = await fixture();
    const op = getOperationDefinition(FREEFORM_INTAKE_OPERATION);
    vi.stubEnv('OPENAI_API_KEY', 'fixture-key');
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'fixture throttled', type: 'rate_limit_error' } }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const request = { requestId: 'fixture', operation: FREEFORM_INTAKE_OPERATION, operationClass: op.operationClass,
      model: 'fixture-model', systemInstruction: op.prompt.systemInstruction, input: resolveOperationContext(f.issued.request, op).providerInput,
      outputSchema: op.outputSchema.schema, maxOutputTokens: 6000, timeoutMs: 1000 };
    await expect(new OpenAiProviderAdapter().generateStructured(request)).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMIT' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = String((fetchMock.mock.calls[0] as unknown as [unknown, RequestInit])[1].body);
    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(resolveOperationContext(f.issued.request, op).totalBytes);
    fetchMock.mockClear();
    await expect(new OpenAiProviderAdapter().generateStructured({ ...request, input: { escaped: '\\'.repeat(8000) } }))
      .rejects.toMatchObject({ code: 'LLM_CONTEXT_HARD_LIMIT_EXCEEDED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('does not retain a provider exception that echoes private prompt or rejected reply content', async () => {
    enableFixtureOperation();
    const f = await fixture('integrated');
    const privateMarker = 'fictional-private-provider-echo';
    const provider = new FakeProviderAdapter(() => { throw new Error(privateMarker); });
    const response = await executeLlmOperation(f.issued.request, { ...f.options, providers: [provider] });
    expect(response.status).toBe('failed');
    expect(response.output).toBeNull();
    expect(JSON.stringify(response)).not.toContain(privateMarker);
    expect(JSON.stringify(f.documents)).not.toContain(privateMarker);
    expect(JSON.stringify(await f.executionStore.query(f.input.userId, {}))).not.toContain(privateMarker);
  });
});
