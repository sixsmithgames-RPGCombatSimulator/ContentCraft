import type { LlmRequestEnvelope, LlmValidationResult } from '../../shared/llm/orchestratorContracts.js';
import { FREEFORM_INTAKE_POLICY_VERSION } from '../../shared/llm/freeformIntakePolicy.js';

/** Shape validation runs first. These checks bind meaning to supplied data,
 * not to facts, permissions, completeness, or a self-reported confidence. */
export function validateFreeformIntake(request: LlmRequestEnvelope, output: any): LlmValidationResult {
  const issues: LlmValidationResult['issues'] = [];
  const add = (path: string, code: string) => {
    if (issues.length < 32) issues.push({ path, code, message: 'The proposal does not satisfy the original intake policy.' });
  };
  const input = request.context.input?.value as any;
  const refs = Array.isArray(output?.referents) ? output.referents : [];
  const steps = Array.isArray(output?.steps) ? output.steps : [];
  const observations = Array.isArray(output?.observations) ? output.observations : [];
  const window = output?.windowText;
  if (Buffer.byteLength(JSON.stringify(output) ?? '', 'utf8') > 16_384) add('/', 'FREEFORM_PROPOSAL_OVER_BUDGET');
  if (refs.length > 32 || steps.length > 8 || observations.length > 32) {
    add('/', 'FREEFORM_PROPOSAL_OVER_BUDGET');
    return { validatorId: 'freeform-intake', version: FREEFORM_INTAKE_POLICY_VERSION, valid: false, issues };
  }
  if (output?.ticket !== input?.ticket) add('/ticket', 'FREEFORM_TICKET_MISMATCH');
  if (typeof window !== 'string' || !window.length || typeof input?.instruction !== 'string'
    || !input.instruction.startsWith(window) || /[\uD800-\uDBFF]$/.test(window)) add('/windowText', 'FREEFORM_EXACT_PREFIX_REQUIRED');
  if (output?.clarification !== null && (typeof output?.clarification !== 'string' || !output.clarification.trim())) {
    add('/clarification', 'FREEFORM_CLARIFICATION_INVALID');
  }
  const evidence = (quotes: unknown, path: string) => {
    if (!Array.isArray(quotes) || !quotes.length || quotes.some((quote) => typeof quote !== 'string'
      || !quote.length || typeof window !== 'string' || !window.includes(quote))) add(path, 'FREEFORM_EXACT_EVIDENCE_REQUIRED');
  };
  const ref = (index: unknown, path: string, kinds: string[], optional = false) => {
    if (optional && index === null) return;
    if (!Number.isInteger(index) || Number(index) < 0 || Number(index) >= refs.length
      || !kinds.includes(refs[Number(index)]?.kind)) add(path, 'FREEFORM_REFERENT_INVALID');
  };
  const catalog = Array.isArray(input?.catalog) ? input.catalog : [];
  refs.forEach((entry: any, i: number) => {
    if (!entry || typeof entry !== 'object') { add(`/referents/${i}`, 'FREEFORM_REFERENT_INVALID'); return; }
    if ((entry.kind === 'method') !== (entry.methodKind !== null)) add(`/referents/${i}/methodKind`, 'FREEFORM_METHOD_KIND_INVALID');
    if (entry.catalogKey !== null && !catalog.some((row: any) => row.key === entry.catalogKey && row.kind === entry.kind)) {
      add(`/referents/${i}/catalogKey`, 'FREEFORM_CATALOG_KEY_INVALID');
    }
  });
  const deps: Set<number>[] = steps.map(() => new Set<number>());
  const parallelPairs = new Set<string>();
  steps.forEach((step: any, i: number) => {
    const p = `/steps/${i}`;
    if (!step || typeof step !== 'object') { add(p, 'FREEFORM_STEP_INVALID'); return; }
    evidence(step.evidence, `${p}/evidence`);
    if (input?.mode !== 'action' || step.kind !== 'action') add(`${p}/kind`, 'FREEFORM_WORKFLOW_NOT_ENABLED');
    if (step.kind === 'action' && step.purpose === null) add(`${p}/purpose`, 'FREEFORM_PURPOSE_REQUIRED');
    ref(step.actor, `${p}/actor`, ['actor'], output?.clarification !== null);
    ref(step.method, `${p}/method`, ['method'], true);
    (Array.isArray(step.targets) ? step.targets : []).forEach((target: any, j: number) => {
      ref(target?.ref, `${p}/targets/${j}/ref`, ['actor', 'subject', 'place', 'object']);
    });
    for (const index of Array.isArray(step.after) ? step.after : []) {
      if (!Number.isInteger(index) || index < 0 || index >= i) add(`${p}/after`, 'FREEFORM_DEPENDENCY_INVALID');
      else deps[i].add(index);
    }
    if (step.when !== null && step.when !== undefined) {
      if (['state', 'event'].includes(step.when.predicate)) add(`${p}/when`, 'FREEFORM_WORKFLOW_NOT_ENABLED');
      else if (!Number.isInteger(step.when.step) || step.when.step < 0 || step.when.step >= i
        || !deps[i].has(step.when.step) || step.when.requirement !== null) add(`${p}/when`, 'FREEFORM_CONDITION_INVALID');
    }
    for (const peer of Array.isArray(step.parallel) ? step.parallel : []) {
      if (!Number.isInteger(peer) || peer < 0 || peer >= steps.length || peer === i
        || !Array.isArray(steps[peer]?.parallel) || !steps[peer].parallel.includes(i)) add(`${p}/parallel`, 'FREEFORM_PARALLEL_INVALID');
      else parallelPairs.add([i, peer].sort((a, b) => a - b).join(':'));
    }
    const count = observations.filter((row: any) => row?.step === i).length;
    const information = ['discover_information', 'observe_situation'].includes(step.purpose);
    if (information && ((!count && output?.clarification === null) || count > 12 || step.results?.length !== 0)
      || !information && count !== 0) add(p, 'FREEFORM_INFORMATION_PARTITION_INVALID');
  });
  const ancestors = (index: number, seen = new Set<number>()): Set<number> => {
    for (const dependency of deps[index] ?? []) {
      if (seen.has(dependency)) continue;
      seen.add(dependency); ancestors(dependency, seen);
    }
    return seen;
  };
  const depth = (index: number): number => 1 + Math.max(0, ...[...(deps[index] ?? [])].map(depth));
  if (deps.reduce((count, entries) => count + entries.size, 0) + parallelPairs.size > 12
    || steps.some((_: unknown, i: number) => depth(i) > 6)) add('/steps', 'FREEFORM_GRAPH_OVER_BUDGET');
  for (const pair of parallelPairs) {
    const [left, right] = pair.split(':').map(Number);
    if (ancestors(left).has(right) || ancestors(right).has(left)) add('/steps', 'FREEFORM_PARALLEL_DEPENDENCY_CONFLICT');
  }
  observations.forEach((row: any, i: number) => {
    const p = `/observations/${i}`;
    if (!row || typeof row !== 'object') { add(p, 'FREEFORM_OBSERVATION_INVALID'); return; }
    evidence(row.evidence, `${p}/evidence`);
    ref(row.observer, `${p}/observer`, ['actor']);
    ref(row.method, `${p}/method`, ['method']);
    ref(row.form, `${p}/form`, ['form'], true);
    ref(row.subject, `${p}/subject`, ['actor', 'subject', 'place', 'object']);
    ref(row.origin, `${p}/origin`, ['actor', 'subject', 'place', 'object'], true);
    if (!Number.isInteger(row.step) || row.step < 0 || row.step >= steps.length
      || !['discover_information', 'observe_situation'].includes(steps[row.step]?.purpose)) add(`${p}/step`, 'FREEFORM_OBSERVATION_STEP_INVALID');
    if (row.viewpointAfter !== null && (!Number.isInteger(row.viewpointAfter) || row.viewpointAfter < 0
      || row.viewpointAfter >= row.step || !ancestors(row.step).has(row.viewpointAfter)
      || steps[row.viewpointAfter]?.purpose !== 'relocate_actor' || steps[row.viewpointAfter]?.actor !== row.observer)) {
      add(`${p}/viewpointAfter`, 'FREEFORM_VIEWPOINT_INVALID');
    }
  });
  return { validatorId: 'freeform-intake', version: FREEFORM_INTAKE_POLICY_VERSION, valid: issues.length === 0, issues };
}
