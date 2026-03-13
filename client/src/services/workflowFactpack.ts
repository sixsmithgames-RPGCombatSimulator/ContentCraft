import type { CanonFact, Factpack } from './workflowCanonRetrieval';

export interface WorkflowFactGroup {
  id: string;
  label: string;
  facts: CanonFact[];
  characterCount: number;
  entityTypes: string[];
  regions: string[];
}

export function deduplicateWorkflowFactpack(factpack: Factpack): Factpack {
  const seenChunkIds = new Set<string>();
  const seenTexts = new Set<string>();
  const uniqueFacts: CanonFact[] = [];

  factpack.facts.forEach((fact) => {
    const normalizedText = fact.text.trim().toLowerCase();
    if (seenChunkIds.has(fact.chunk_id) || seenTexts.has(normalizedText)) {
      return;
    }

    seenChunkIds.add(fact.chunk_id);
    seenTexts.add(normalizedText);
    uniqueFacts.push(fact);
  });

  return {
    facts: uniqueFacts,
    entities: Array.from(new Set(factpack.entities)),
    gaps: Array.from(new Set(factpack.gaps)),
  };
}

export function mergeWorkflowFactpacks(existing: Factpack, incoming: Factpack): Factpack {
  const existingChunkIds = new Set(existing.facts.map((fact) => fact.chunk_id));
  const uniqueNewFacts = incoming.facts.filter((fact) => !existingChunkIds.has(fact.chunk_id));

  const existingEntityIds = new Set(existing.entities);
  const uniqueNewEntities = incoming.entities.filter((entityId) => !existingEntityIds.has(entityId));

  return deduplicateWorkflowFactpack({
    facts: [...existing.facts, ...uniqueNewFacts],
    entities: [...existing.entities, ...uniqueNewEntities],
    gaps: [...existing.gaps, ...incoming.gaps],
  });
}

export function groupWorkflowFacts(factpack: Factpack, maxCharsPerGroup = 8000): WorkflowFactGroup[] {
  const facts = factpack.facts;
  const totalChars = facts.reduce((sum, fact) => sum + fact.text.length, 0);

  if (totalChars <= maxCharsPerGroup) {
    return [{
      id: 'all',
      label: 'All Facts',
      facts,
      characterCount: totalChars,
      entityTypes: Array.from(new Set(facts.map((fact) => fact.entity_type || 'unknown'))),
      regions: Array.from(new Set(facts.map((fact) => fact.region || 'unspecified').filter(Boolean))),
    }];
  }

  const typeGroups = new Map<string, Map<string, CanonFact[]>>();

  facts.forEach((fact) => {
    const type = fact.entity_type || 'unknown';
    const region = fact.region || 'unspecified';

    if (!typeGroups.has(type)) {
      typeGroups.set(type, new Map());
    }

    const regionMap = typeGroups.get(type)!;
    if (!regionMap.has(region)) {
      regionMap.set(region, []);
    }

    regionMap.get(region)!.push(fact);
  });

  const preliminaryGroups: WorkflowFactGroup[] = [];
  let groupId = 0;

  for (const [type, regionMap] of typeGroups.entries()) {
    for (const [region, regionFacts] of regionMap.entries()) {
      const characterCount = regionFacts.reduce((sum, fact) => sum + fact.text.length, 0);

      preliminaryGroups.push({
        id: `group-${groupId++}`,
        label: region !== 'unspecified' ? `${type} - ${region}` : type,
        facts: regionFacts,
        characterCount,
        entityTypes: [type],
        regions: region !== 'unspecified' ? [region] : [],
      });
    }
  }

  const finalGroups: WorkflowFactGroup[] = [];
  let currentGroup: WorkflowFactGroup | null = null;

  for (const group of preliminaryGroups.sort((a, b) => a.characterCount - b.characterCount)) {
    if (group.characterCount > maxCharsPerGroup) {
      const chunks: CanonFact[][] = [];
      let currentChunk: CanonFact[] = [];
      let currentChunkChars = 0;

      for (const fact of group.facts) {
        if (currentChunkChars + fact.text.length > maxCharsPerGroup && currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentChunkChars = 0;
        }

        currentChunk.push(fact);
        currentChunkChars += fact.text.length;
      }

      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }

      chunks.forEach((chunkFacts, index) => {
        finalGroups.push({
          id: `${group.id}-${index + 1}`,
          label: `${group.label} (Part ${index + 1}/${chunks.length})`,
          facts: chunkFacts,
          characterCount: chunkFacts.reduce((sum, fact) => sum + fact.text.length, 0),
          entityTypes: group.entityTypes,
          regions: group.regions,
        });
      });
      continue;
    }

    if (currentGroup && currentGroup.characterCount + group.characterCount <= maxCharsPerGroup) {
      currentGroup.facts.push(...group.facts);
      currentGroup.characterCount += group.characterCount;
      currentGroup.entityTypes = Array.from(new Set([...currentGroup.entityTypes, ...group.entityTypes]));
      currentGroup.regions = Array.from(new Set([...currentGroup.regions, ...group.regions]));
      currentGroup.label = currentGroup.entityTypes.length > 1
        ? `Mixed (${currentGroup.entityTypes.join(', ')})`
        : currentGroup.entityTypes[0];
      continue;
    }

    if (currentGroup) {
      finalGroups.push(currentGroup);
    }
    currentGroup = { ...group };
  }

  if (currentGroup) {
    finalGroups.push(currentGroup);
  }

  return finalGroups;
}

export function formatWorkflowCanonFacts(factpack: Factpack): string {
  return factpack.facts.map((fact) => `[${fact.entity_name}] ${fact.text}`).join('\n\n');
}
