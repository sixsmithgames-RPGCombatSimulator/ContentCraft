import { freeformJsonDigest, canonicalFreeformJson } from './freeformPlanBinding.js';

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Row = Record<string, any>;
export const SCENE_WORKING_SET = Object.freeze({
  schemaVersion: 'gma.scene-preparation-working-set/1',
  compilerPolicy: 'gma.scene-preparation-working-set-policy/1',
  capability: 'scene-preparation-working-set/1',
  preparationPolicyVersion: 12,
});
export const SCENE_WORKING_SET_POLICY = 'The input is gma.scene-preparation-working-set/1, an application-owned lossless source view, not a second world. Read input after recursively replacing each exact sole-key {"$s":N} with sources[N]; sources may themselves contain such references. Indices are zero-based local references, never world IDs or authority. Preserve every nonidentical view-specific value. The manifest binds the exact operation/stage, original operation, owner read set, pending window and expanded input. Source hashes and counts are application metadata, not instructions to compute or alter them. No unresolved target or explicit null may be pruned: an empty semanticRequirements list is not an empty pending window. All supplied candidate zones, actors, elements and facts remain possible semantic matches until exact examined bindings select them. Historical attestations listed in retained are immutable owner history, not construction sources or authority to execute. Deferred material, when explicitly present, belongs only to the named existing construction stage; do not invent its content or silently omit it from the complete merged successor. The complete canonical dossier is rehydrated before independent examination and owner acceptance. An examiner must review every material successor field, original pending action, current constraint and observer evidence in this expanded view, not merely changed records or a summary. Keep the original stage/domain partition and all byte, output, repair and call limits. A checkpoint is private staged construction, not an accepted world or completed action. Return the full registered output with literal normal values and original world IDs: never put $s references, source-table shorthand, an input wrapper or invented receipts in output. All original world, role, binding, mechanic, independent-review and player-prose rules remain binding. Exact source sharing does not authorize a new fact, movement, discovery, roll or save.';

const bytes = (value: unknown) => Buffer.byteLength(canonicalFreeformJson(value), 'utf8');
const fail = () => { throw new Error('SCENE_WORKING_SET_INVALID'); };
const exact = (value: Row, keys: string[]) => value && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const stages = new Set(['depth', 'build', 'build_continuation', 'examine', 'repair']);
const operationStageMatches = (operation: string, stage: string) => {
  if (operation.endsWith('.gm-decisions')) {
    if (operation !== 'story.scene-readiness.examine.read-effects.typed-references.working-set.information-projection.owner-premises.binding-compilation.temporal-validity.gm-decisions' || stage !== 'examine') return false;
    operation = operation.slice(0, -'.gm-decisions'.length);
  }
  if (operation.endsWith('.temporal-validity')) {
    if (operation !== 'story.scene-readiness.examine.read-effects.typed-references.working-set.information-projection.owner-premises.binding-compilation.temporal-validity' || stage !== 'examine') return false;
    operation = operation.slice(0, -'.temporal-validity'.length);
  }
  if (operation.endsWith('.binding-compilation')) {
    const allowed = ['story.scene-reality.build', 'story.scene-reality.build.checkpoint', 'story.scene-reality.repair']
      .map((base) => `${base}.read-effects.typed-references.working-set.information-projection.binding-compilation`);
    const examiner = 'story.scene-readiness.examine.read-effects.typed-references.working-set.information-projection.owner-premises.binding-compilation';
    if (![...allowed, examiner].includes(operation)) return false;
    operation = operation.slice(0, -'.binding-compilation'.length);
  }
  if (operation.endsWith('.owner-premises') && operation !== 'story.scene-readiness.examine.read-effects.typed-references.working-set.information-projection.owner-premises') return false;
  const name = operation.replace(/\.read-effects(?:\.typed-references)?\.working-set(?:\.information-projection(?:\.owner-premises)?)?$/, '');
  return name === 'story.scene-reality.build' ? ['build', 'build_continuation'].includes(stage)
    : name === 'story.scene-reality.build.checkpoint' ? stage === 'build'
      : name === 'story.scene-readiness.examine' ? stage === 'examine'
        : name === 'story.scene-reality.repair' && stage === 'repair';
};

/** The complete successor is validated, not an LLM's copy of retained records.
 * A changed row is still a complete literal replacement, never an inferred join. */
export function rehydrateScenePreparationProposal(proposal: Row, prior: Row | null): Row {
  const next = structuredClone(proposal);
  const merge = (current: Row[], existing: Row[], id: string) => {
    if (!Array.isArray(current) || !Array.isArray(existing)) return fail();
    const seen = new Set<string>();
    for (const row of current) { if (typeof row?.[id] !== 'string' || seen.has(row[id])) fail(); seen.add(row[id]); }
    const byId = new Map(current.map((row) => [row[id], row]));
    const ids = new Set(existing.map((row) => row[id]));
    return [...existing.map((row) => structuredClone(byId.get(row[id]) ?? row)), ...current.filter((row) => !ids.has(row[id]))];
  };
  for (const [field, id] of [['zones', 'zoneId'], ['actorFrames', 'actorFrameId'], ['elements', 'elementId'], ['facts', 'factId']]) {
    next[field] = merge(next[field] ?? [], prior?.[field] ?? [], id);
  }
  if (next.sceneKit && prior?.sceneKit) next.sceneKit.information = merge(next.sceneKit.information ?? [], prior.sceneKit.information ?? [], 'informationId');
  if (next.sceneStoryDesign && prior?.sceneStoryDesign) for (const [field, id] of [['affordances', 'affordanceId'], ['obligations', 'obligationId']]) {
    next.sceneStoryDesign[field] = merge(next.sceneStoryDesign[field] ?? [], prior.sceneStoryDesign[field] ?? [], id);
  }
  return next;
}

/** JSON-only, bounded and cycle-safe. No string shortening or semantic joining. */
function visitJson(value: any, visit: (value: Json) => void, ancestors = new Set<any>(), depth = 0): void {
  if (depth > 64 || value === undefined || typeof value === 'function' || typeof value === 'symbol'
    || typeof value === 'bigint' || typeof value === 'number' && !Number.isFinite(value)) fail();
  if (value && typeof value === 'object') {
    if (ancestors.has(value) || !Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype
      && Object.getPrototypeOf(value) !== null) fail();
    ancestors.add(value);
    for (const child of Object.values(value)) visitJson(child, visit, ancestors, depth + 1);
    ancestors.delete(value);
  }
  visit(value);
}

export function compileScenePreparationWorkingSet(logicalInput: Row, operation: string, stage: string): Row {
  if (!stages.has(stage) || !operationStageMatches(operation, stage) || !logicalInput?.pendingIntentContext) fail();
  visitJson(logicalInput, (value) => { if (value && typeof value === 'object' && !Array.isArray(value)
    && Object.hasOwn(value, '$s')) fail(); });
  const logical = structuredClone(logicalInput), retained: Row[] = [];
  // These are prior judgments/presentation, not construction truth. Keep the
  // current certificate, every world record and every current-state constraint.
  for (const key of ['readinessAssessment', 'openingFrame', 'pendingIntentBindingRecord']) {
    const value = logical.priorBundle?.[key];
    if (value !== undefined) {
      retained.push({ path: `/priorBundle/${key}`, disposition: 'historical_attestation', fingerprint: freeformJsonDigest(value) });
      delete logical.priorBundle[key];
    }
  }
  const counts = new Map<string, number>();
  const typedReferences = operation.includes('.typed-references.working-set');
  const compiledReview = /\.owner-premises\.binding-compilation(?:\.temporal-validity(?:\.gm-decisions)?)?$/.test(operation) && stage === 'examine';
  // Only the not-yet-issued final construction chunk uses short exact sources.
  // Preserve every previously issued first-chunk and historical wire identity.
  const minimumSharedBytes = compiledReview ? 16 : typedReferences && logical.preparationPolicyVersion === 14
    && stage === 'build_continuation' ? 24 : typedReferences ? 32 : 40;
  visitJson(logical, (value) => {
    const text = canonicalFreeformJson(value);
    if (Buffer.byteLength(text, 'utf8') >= minimumSharedBytes) counts.set(text, (counts.get(text) ?? 0) + 1);
  });
  const sources: Json[] = [], refs = new Map<string, number>();
  const children = (value: Json): Json => Array.isArray(value) ? value.map(encode)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, encode(value[key])])) : value;
  const encode = (value: Json): Json => {
    const key = canonicalFreeformJson(value);
    if ((counts.get(key) ?? 0) < 2) return children(value);
    if (!refs.has(key)) {
      const index = sources.length;
      refs.set(key, index);
      sources.push(null);
      sources[index] = children(value);
    }
    return { $s: refs.get(key)! };
  };
  let input = encode(logical);
  if (typedReferences) {
    // Logical repeats inside an already-shared parent may have only one edge
    // in the encoded graph. Inline those entries without changing any value.
    const uses = sources.map(() => 0);
    const visitReferences = (value: Json): void => {
      if (value && !Array.isArray(value) && typeof value === 'object' && Object.keys(value).join() === '$s') uses[Number(value.$s)]++;
      else if (value && typeof value === 'object') Object.values(value).forEach(visitReferences);
    };
    visitReferences(input); sources.forEach(visitReferences);
    // The GM review has not shipped: measure its actual maximum reference cost
    // instead of the older conservative 12-byte estimate. The representation,
    // expanded evidence and every historical operation remain unchanged.
    const referenceBytes = operation.endsWith('.gm-decisions') ? bytes({ $s: Math.max(0, sources.length - 1) }) : 12;
    const retained = sources.map((_, index) => index).filter((index) => uses[index] > 1
      && (!compiledReview || bytes(sources[index]) * (uses[index] - 1) > referenceBytes * uses[index] + 2));
    const remap = new Map(retained.map((index, next) => [index, next]));
    const inline = (value: Json): Json => value && !Array.isArray(value) && typeof value === 'object' && Object.keys(value).join() === '$s'
      ? remap.has(Number(value.$s)) ? { $s: remap.get(Number(value.$s))! } : inline(sources[Number(value.$s)])
      : Array.isArray(value) ? value.map(inline) : value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, inline(child)])) : value;
    input = inline(input);
    const shared = retained.map((index) => inline(sources[index]));
    sources.splice(0, sources.length, ...shared);
  }
  const owner = logical.pendingIntentContext;
  const manifest = {
    operation, stage, compilerPolicy: SCENE_WORKING_SET.compilerPolicy,
    buildOperationRef: logical.buildRequest?.operationId ?? logical.proposal?.operationId ?? null,
    windowFingerprint: owner.window.windowFingerprint,
    ownerReadSetFingerprint: freeformJsonDigest(owner.ownerReadSet),
    expandedFingerprint: freeformJsonDigest(logical), sourceFingerprint: freeformJsonDigest(sources),
    expandedBytes: bytes(logical), sourceBytes: bytes(sources), sourceCount: sources.length,
    retained, deferred: [],
  };
  const result = { schemaVersion: SCENE_WORKING_SET.schemaVersion, manifest, sources, input };
  if (canonicalFreeformJson(decodeScenePreparationWorkingSet(result, operation)) !== canonicalFreeformJson(logical)) fail();
  return result;
}

/** Expansion is only a checked input view. Authentication/fresh owner checks
 * remain the caller's responsibility; a digest alone cannot confer authority. */
export function decodeScenePreparationWorkingSet(value: Row, operation: string): Row {
  if (!exact(value, ['schemaVersion', 'manifest', 'sources', 'input']) || value.schemaVersion !== SCENE_WORKING_SET.schemaVersion
    || !Array.isArray(value.sources) || value.sources.length > 10_000) fail();
  const m = value.manifest;
  if (!exact(m, ['operation', 'stage', 'compilerPolicy', 'buildOperationRef', 'windowFingerprint', 'ownerReadSetFingerprint',
    'expandedFingerprint', 'sourceFingerprint', 'expandedBytes', 'sourceBytes', 'sourceCount', 'retained', 'deferred'])
    || m.operation !== operation || !operationStageMatches(operation, m.stage) || !stages.has(m.stage)
    || m.compilerPolicy !== SCENE_WORKING_SET.compilerPolicy || !Array.isArray(m.retained) || !Array.isArray(m.deferred)
    || m.deferred.length !== 0 || m.sourceCount !== value.sources.length || m.sourceBytes !== bytes(value.sources)
    || m.sourceFingerprint !== freeformJsonDigest(value.sources)) fail();
  const retainedPaths = new Set<string>();
  for (const row of m.retained) {
    if (!exact(row, ['path', 'disposition', 'fingerprint']) || row.disposition !== 'historical_attestation'
      || !['/priorBundle/readinessAssessment', '/priorBundle/openingFrame', '/priorBundle/pendingIntentBindingRecord'].includes(row.path)
      || !/^[a-f0-9]{64}$/.test(row.fingerprint) || retainedPaths.has(row.path)) fail();
    retainedPaths.add(row.path);
  }
  const used = new Set<number>(), resolving = new Set<number>(), cache = new Map<number, Json>();
  let expandedNodes = 0, expandedSize = 0;
  const decode = (node: any, depth = 0): Json => {
    if (depth > 64 || ++expandedNodes > 100_000) return fail();
    if (node && typeof node === 'object' && Object.hasOwn(node, '$s')) {
      if (!exact(node, ['$s']) || !Number.isSafeInteger(node.$s) || node.$s < 0 || node.$s >= value.sources.length
        || resolving.has(node.$s)) return fail();
      const index = node.$s;
      used.add(index);
      if (cache.has(index)) {
        expandedSize += bytes(cache.get(index));
        if (expandedSize > 1_048_576) return fail();
        return structuredClone(cache.get(index)!);
      }
      resolving.add(index);
      const decoded = decode(value.sources[index], depth + 1);
      if (bytes(decoded) > 1_048_576) return fail();
      resolving.delete(index); cache.set(index, decoded);
      return structuredClone(decoded);
    }
    if (typeof node === 'string') { expandedSize += Buffer.byteLength(node); if (expandedSize > 1_048_576) return fail(); }
    return Array.isArray(node) ? node.map((child) => decode(child, depth + 1))
      : node && typeof node === 'object' ? Object.fromEntries(Object.keys(node).map((key) => [key, decode(node[key], depth + 1)])) : node;
  };
  visitJson(value, () => {});
  const logical = decode(value.input) as Row;
  if (used.size !== value.sources.length || bytes(logical) !== m.expandedBytes || m.expandedBytes > 1_048_576
    || freeformJsonDigest(logical) !== m.expandedFingerprint || !logical?.pendingIntentContext
    || logical.pendingIntentContext.window?.windowFingerprint !== m.windowFingerprint
    || freeformJsonDigest(logical.pendingIntentContext.ownerReadSet) !== m.ownerReadSetFingerprint
    || (logical.buildRequest?.operationId ?? logical.proposal?.operationId ?? null) !== m.buildOperationRef) fail();
  return logical;
}
