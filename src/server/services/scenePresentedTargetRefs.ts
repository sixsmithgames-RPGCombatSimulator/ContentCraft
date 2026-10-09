function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

/** Close an opening manifest over exact dossier identities, including the
 * actor's owner alias and thresholds nested in a zone. Labels and provenance
 * cannot make an otherwise unprepared target addressable. Shape and authority
 * validation remain the callers' responsibility. */
export function scenePresentedTargetRefs(proposal: unknown): Set<string> {
  const candidate = record(proposal);
  const zones = rows(candidate.zones);
  const identities = [
    ...zones.map((zone) => zone.zoneId),
    ...rows(candidate.actorFrames).flatMap((actor) => [actor.actorFrameId, actor.actorRef]),
    ...rows(candidate.elements).map((element) => element.elementId),
    ...rows(candidate.facts).map((fact) => fact.factId),
    ...rows(candidate.preparedBoundaries).map((boundary) => boundary.boundaryId),
    ...zones.flatMap((zone) => rows(zone.thresholds).map((threshold) => threshold.boundaryId)),
  ];
  return new Set(identities.filter((identity): identity is string => typeof identity === 'string' && identity.length > 0));
}
