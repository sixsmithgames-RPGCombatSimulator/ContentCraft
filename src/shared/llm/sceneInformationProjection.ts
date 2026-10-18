import { canonicalFreeformJson, freeformJsonDigest } from './freeformPlanBinding.js';
import { rehydrateScenePreparationProposal } from './scenePreparationWorkingSet.js';

type Row = Record<string, any>;
export const SCENE_INFORMATION_PROJECTION = Object.freeze({
  capability: 'application-owned-scene-information-projection/1',
  policy: 'gma.scene-information-projection-policy/1',
  modelProposal: 'gma.scene-reality-model-proposal/1',
  ownerProposal: 'gma.scene-reality-proposal/1',
  builder: 'gma.scene-reality-builder-result/7',
  repair: 'gma.scene-pending-intent-repair/5',
  manualState: 'gma.scene-reality-manual-state/9',
  preparationPolicyVersion: 14,
  operationSuffix: '.information-projection',
});
export const SCENE_INFORMATION_PROJECTION_POLICY = 'For this application-owned information profile return gma.scene-reality-model-proposal/1, not the normalized owner proposal. In sceneKit replace information with informationSelections: at most 24 unique {informationId,accessVectorIndexes} rows. Each informationId is one exact staged factId in the complete rehydrated candidate. Each accessVectorIndexes is one to eight unique zero-based integer indexes into that same fact.accessVectors, in the intended presentation order. Select every retained prior sceneKit.information ID explicitly; these selections cannot be omitted for automatic retention. Do not copy or author compact state, factText or accessVectors. The application derives state from the selected fact (bounded_negative -> absent_in_scope; otherwise revealed/public_surface -> plainly_visible; otherwise concealed), exact string value or canonical JSON as factText, and the explicitly selected access-vector strings unchanged. The complete normalized owner proposal still must fit all original text/count/byte limits; never truncate, paraphrase, choose the first eight routes, drop a retained row, widen access or invent a source. Access routes describe feasibility, not arrival, successful perception or permission to disclose. The app materializes before deterministic checks and full independent examination; the examiner reviews this exact normalized dossier and projection provenance as well as actual world and action meaning. A repair changes only named failed rows/records. If a permitted fact repair changes a selected value or access vectors, explicitly reconfirm its dependent selection row; preserve every unrelated selection, record, binding, instruction, receipt and opening. No extra calls, repair allowance, provider or larger limits.';

const object = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);
const exact = (v: unknown, keys: string[]) => object(v) && Object.keys(v).sort().join(',') === [...keys].sort().join(',');
function fail(path: string): never { throw Object.assign(new Error('Scene information selections must match their exact staged source.'), {
  code: 'SCENE_INFORMATION_PROJECTION_INVALID', path,
}); }

/** Never corrects a model's prose or infers a route. This is a typed compiler. */
export function materializeSceneInformation(model: Row, prior: Row | null = null): Row {
  if (model?.schemaVersion !== SCENE_INFORMATION_PROJECTION.modelProposal || !object(model.sceneKit)
    || Object.hasOwn(model.sceneKit, 'information') || !Array.isArray(model.sceneKit.informationSelections)) fail('/sceneKit/informationSelections');
  const selections = model.sceneKit.informationSelections;
  if (selections.length > 24) fail('/sceneKit/informationSelections');
  const priorWithoutInformation = prior ? structuredClone(prior) : null;
  if (priorWithoutInformation?.sceneKit) priorWithoutInformation.sceneKit.information = [];
  const next = rehydrateScenePreparationProposal(model, priorWithoutInformation);
  const facts = new Map<string, Row>();
  for (const fact of next.facts) {
    if (typeof fact?.factId !== 'string' || facts.has(fact.factId)) fail('/facts');
    facts.set(fact.factId, fact);
  }
  const selected = new Set<string>();
  const information = selections.map((selection: Row, row: number) => {
    const path = `/sceneKit/informationSelections/${row}`;
    if (!exact(selection, ['informationId', 'accessVectorIndexes']) || typeof selection.informationId !== 'string'
      || selected.has(selection.informationId)) fail(path);
    selected.add(selection.informationId);
    const fact = facts.get(selection.informationId), indexes = selection.accessVectorIndexes;
    if (!fact || !Array.isArray(fact.accessVectors) || fact.accessVectors.length < 1 || fact.accessVectors.length > 24
      || !Array.isArray(indexes) || indexes.length < 1 || indexes.length > 8 || new Set(indexes).size !== indexes.length) fail(path);
    const accessVectors = indexes.map((index: unknown) => {
      if (!Number.isSafeInteger(index) || Number(index) < 0 || Number(index) >= fact.accessVectors.length) fail(`${path}/accessVectorIndexes`);
      const vector = fact.accessVectors[Number(index)];
      if (typeof vector !== 'string' || !vector.trim() || vector.length > 1_000) fail(`${path}/accessVectorIndexes`);
      return vector;
    });
    if (!['gm_only', 'revealed', 'public_surface'].includes(fact.visibility) || fact.value === undefined) fail(path);
    const factText = typeof fact.value === 'string' ? fact.value : canonicalFreeformJson(fact.value);
    if (!factText.trim() || factText.length > 800) fail(`${path}/factText`);
    return { informationId: fact.factId,
      state: fact.valueKind === 'bounded_negative' ? 'absent_in_scope'
        : ['revealed', 'public_surface'].includes(fact.visibility) ? 'plainly_visible' : 'concealed',
      factText, accessVectors };
  });
  for (const retained of prior?.sceneKit?.information ?? []) if (!selected.has(retained.informationId)) fail('/sceneKit/informationSelections/retained');
  next.schemaVersion = SCENE_INFORMATION_PROJECTION.ownerProposal;
  delete next.sceneKit.informationSelections;
  next.sceneKit.information = information;
  return next;
}

export function bindSceneInformationProjection(modelProposalDigest: string, selections: Row[], proposal: Row): Row {
  if (!/^[a-f0-9]{64}$/.test(modelProposalDigest)) fail('/modelProposalDigest');
  return { policy: SCENE_INFORMATION_PROJECTION.policy, modelProposalDigest,
    selectionsDigest: freeformJsonDigest(selections), normalizedDossierDigest: freeformJsonDigest(proposal) };
}

/** Examination/save staging cannot rebind a tampered dossier on read. */
export function sceneInformationProjectionIssues(proposal: Row, selections: Row[], binding: Row): string[] {
  try {
    if (!exact(binding, ['policy', 'modelProposalDigest', 'selectionsDigest', 'normalizedDossierDigest'])) return ['/informationProjection'];
    const model = structuredClone(proposal);
    model.schemaVersion = SCENE_INFORMATION_PROJECTION.modelProposal;
    delete model.sceneKit.information;
    model.sceneKit.informationSelections = structuredClone(selections);
    if (canonicalFreeformJson(materializeSceneInformation(model)) !== canonicalFreeformJson(proposal)) return ['/proposal/sceneKit/information'];
    if (canonicalFreeformJson(binding) !== canonicalFreeformJson(bindSceneInformationProjection(binding.modelProposalDigest, selections, proposal))) return ['/informationProjection'];
    return [];
  } catch (error) { return [(error as { path?: string }).path ?? '/informationProjection']; }
}

/** Indexes identify untrusted selection rows, never world authority. A patched
 * fact requires explicit reconfirmation of each dependent route selection. */
export function repairSceneInformationSelections(selections: Row[], replacements: Row[], failedIndexes: number[],
  original: Row, recordPatches: Row[]): Row[] {
  const allowed = new Set(failedIndexes), dependent = new Set<number>();
  for (const patch of recordPatches) {
    const fact = original.facts?.find((row: Row) => row.factId === patch.recordRef);
    if (fact && (canonicalFreeformJson(fact.value) !== canonicalFreeformJson(patch.replacement?.value)
      || canonicalFreeformJson(fact.accessVectors) !== canonicalFreeformJson(patch.replacement?.accessVectors))) {
      selections.forEach((row, index) => { if (row.informationId === fact.factId) { allowed.add(index); dependent.add(index); } });
    }
  }
  if (!Array.isArray(replacements) || replacements.length !== allowed.size) fail('/informationReplacements');
  const next = structuredClone(selections), seen = new Set<number>();
  for (const row of replacements) {
    if (!exact(row, ['selectionIndex', 'replacement']) || !Number.isSafeInteger(row.selectionIndex)
      || !allowed.has(row.selectionIndex) || seen.has(row.selectionIndex) || !next[row.selectionIndex]
      || !exact(row.replacement, ['informationId', 'accessVectorIndexes'])
      || dependent.has(row.selectionIndex) && row.replacement.informationId !== next[row.selectionIndex].informationId) fail('/informationReplacements');
    seen.add(row.selectionIndex); next[row.selectionIndex] = structuredClone(row.replacement);
  }
  return next;
}
