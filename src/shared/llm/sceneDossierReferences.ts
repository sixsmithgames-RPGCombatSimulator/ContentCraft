type Row = Record<string, any>;
const rows = (value: unknown): Row[] => Array.isArray(value) ? value : [];
/** Pure typed reference closure, shared by the model check and final owner.
 * Source citations never create staged records. Shape/authority checks remain
 * separate; this checker cannot add, discard or rewrite any world content. */
export function sceneDossierReferenceIssues(proposal: Row): string[] {
  const issues: string[] = [];
  const zones = rows(proposal.zones), actors = rows(proposal.actorFrames), elements = rows(proposal.elements), facts = rows(proposal.facts);
  const zoneIds = new Set(zones.map((row) => row.zoneId)), actorIds = new Set(actors.flatMap((row) => [row.actorFrameId, row.actorRef])),
    elementIds = new Set(elements.map((row) => row.elementId)), factIds = new Set(facts.map((row) => row.factId));
  const targets = new Set([...zoneIds, ...actorIds, ...elementIds]);
  const check = (ref: unknown, catalog: Set<unknown>, path: string) => { if (typeof ref !== 'string' || !catalog.has(ref)) issues.push(path); };
  const list = (refs: unknown, catalog: Set<unknown>, path: string) => {
    if (!Array.isArray(refs)) issues.push(path);
    else refs.forEach((ref, index) => check(ref, catalog, `${path}/${index}`));
  };
  zones.forEach((row, index) => {
    list(row.adjacentZoneRefs, zoneIds, `/zones/${index}/adjacentZoneRefs`);
    list(row.visibleElementRefs, elementIds, `/zones/${index}/visibleElementRefs`);
    rows(row.thresholds).forEach((entry, offset) => check(entry.fromZoneRef, zoneIds, `/zones/${index}/thresholds/${offset}/fromZoneRef`));
  });
  actors.forEach((row, index) => {
    check(row.zoneRef, zoneIds, `/actorFrames/${index}/zoneRef`);
    rows(row.knowledge).forEach((entry, offset) => list(entry.factRefs, factIds, `/actorFrames/${index}/knowledge/${offset}/factRefs`));
  });
  elements.forEach((row, index) => {
    check(row.zoneRef, zoneIds, `/elements/${index}/zoneRef`);
    list(row.contents?.factRefs, factIds, `/elements/${index}/contents/factRefs`);
  });
  facts.forEach((row, index) => check(row.targetRef, targets, `/facts/${index}/targetRef`));
  for (const [key, records, id] of [['zoneRefs', zones, 'zoneId'], ['actorFrameRefs', actors, 'actorFrameId'],
    ['elementRefs', elements, 'elementId'], ['factRefs', facts, 'factId']] as const) {
    if (JSON.stringify(proposal.sceneReality?.[key]) !== JSON.stringify(records.map((row) => row[id]))) issues.push(`/sceneReality/${key}`);
  }
  list(proposal.sceneKit?.participants?.present, actorIds, '/sceneKit/participants/present');
  list(proposal.sceneKit?.participants?.anticipated, actorIds, '/sceneKit/participants/anticipated');
  rows(proposal.sceneKit?.participants?.sceneLocalRoles).forEach((row, index) => check(row.roleId, actorIds, `/sceneKit/participants/sceneLocalRoles/${index}/roleId`));
  rows(proposal.sceneKit?.establishedElements).forEach((row, index) => check(row.elementId, elementIds, `/sceneKit/establishedElements/${index}/elementId`));
  rows(proposal.sceneKit?.information).forEach((row, index) => check(row.informationId, factIds, `/sceneKit/information/${index}/informationId`));
  rows(proposal.sceneStoryDesign?.obligations).forEach((row, index) => list(row.factRefs, factIds, `/sceneStoryDesign/obligations/${index}/factRefs`));
  rows(proposal.sceneStoryDesign?.affordances).forEach((row, index) => {
    check(row.zoneRef, zoneIds, `/sceneStoryDesign/affordances/${index}/zoneRef`);
    check(row.targetRef, targets, `/sceneStoryDesign/affordances/${index}/targetRef`);
    list(row.factRefs, factIds, `/sceneStoryDesign/affordances/${index}/factRefs`);
  });
  return [...new Set(issues)];
}
