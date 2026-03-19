type PrimitiveRecord = Record<string, unknown>;

export type CanonicalGeneratedContentType =
  | 'text'
  | 'outline'
  | 'chapter'
  | 'section'
  | 'character'
  | 'location'
  | 'item'
  | 'stat-block'
  | 'fact'
  | 'story-arc'
  | 'monster';

const WRITING_SECTION_HINTS = ['scene', 'encounter', 'combat'];
const WRITING_CHAPTER_HINTS = ['adventure', 'quest'];
const WRITING_TEXT_HINTS = [
  'text',
  'nonfiction',
  'memoir',
  'journal',
  'entry',
  'manuscript',
  'homebrew',
  'document',
];

const isRecord = (value: unknown): value is PrimitiveRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const asRecord = (value: unknown): PrimitiveRecord => (isRecord(value) ? value : {});

const ensureString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const hasValue = (value: unknown): boolean => {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (isRecord(value)) {
    return Object.keys(value).length > 0;
  }
  return value !== null && value !== undefined;
};

const hasAnyValue = (record: PrimitiveRecord, keys: string[]): boolean =>
  keys.some((key) => hasValue(record[key]));

const hasNonEmptyArray = (value: unknown): boolean => Array.isArray(value) && value.length > 0;

const firstRecord = (...values: unknown[]): PrimitiveRecord | undefined => {
  for (const value of values) {
    if (isRecord(value) && Object.keys(value).length > 0) {
      return value;
    }
  }
  return undefined;
};

export function normalizeGeneratedContentTypeToken(
  value: string | undefined | null,
): CanonicalGeneratedContentType | undefined {
  const lower = ensureString(value).toLowerCase();
  if (!lower) {
    return undefined;
  }

  if (
    lower.includes('story arc') ||
    lower.includes('story_arc') ||
    lower.includes('story-arc') ||
    lower.includes('plot arc')
  ) {
    return 'story-arc';
  }

  if (lower.includes('monster') || lower.includes('creature')) {
    return 'monster';
  }

  if (lower.includes('npc') || lower.includes('character')) {
    return 'character';
  }

  if (lower.includes('location') || lower.includes('place') || lower.includes('dungeon') || lower.includes('castle')) {
    return 'location';
  }

  if (lower.includes('item') || lower.includes('artifact') || lower.includes('treasure') || lower.includes('loot')) {
    return 'item';
  }

  if (lower.includes('stat block') || lower.includes('stat-block') || lower.includes('stat_block')) {
    return 'stat-block';
  }

  if (lower.includes('outline') || lower.includes('plan')) {
    return 'outline';
  }

  if (lower.includes('chapter')) {
    return 'chapter';
  }

  if (WRITING_SECTION_HINTS.some((hint) => lower.includes(hint))) {
    return 'section';
  }

  if (WRITING_CHAPTER_HINTS.some((hint) => lower.includes(hint))) {
    return 'chapter';
  }

  if (lower.includes('fact') || lower.includes('lore')) {
    return 'fact';
  }

  if (WRITING_TEXT_HINTS.some((hint) => lower.includes(hint))) {
    return 'text';
  }

  return undefined;
}

function inferStructuredGeneratedContentType(content: PrimitiveRecord): CanonicalGeneratedContentType | undefined {
  const draft = asRecord(content.draft);
  const storyArcContainer = firstRecord(content.story_arc, content.storyArc, content.arc, draft.story_arc, draft.storyArc, draft.arc);
  if (storyArcContainer) {
    return 'story-arc';
  }

  const monsterContainer = firstRecord(content.monster, draft.monster);
  if (monsterContainer) {
    return 'monster';
  }

  const npcContainer = firstRecord(content.npc, content.character, draft.npc, draft.character);
  if (npcContainer) {
    return 'character';
  }

  const locationContainer = firstRecord(content.location, draft.location);
  if (locationContainer) {
    return 'location';
  }

  const itemContainer = firstRecord(content.item, draft.item);
  if (itemContainer) {
    return 'item';
  }

  const encounterContainer = firstRecord(content.encounter, content.encounter_details, draft.encounter, draft.encounter_details);
  if (encounterContainer) {
    return 'section';
  }

  const sceneContainer = firstRecord(content.scene, draft.scene);
  if (sceneContainer) {
    return 'section';
  }

  const storyArcLike = storyArcContainer ?? content;
  const hasStoryArcShape =
    (hasNonEmptyArray(storyArcLike.acts) &&
      (hasNonEmptyArray(storyArcLike.beats) ||
        hasAnyValue(storyArcLike, ['central_conflict', 'hook', 'branching_paths', 'clues_and_secrets']))) ||
    (hasAnyValue(storyArcLike, ['premise', 'synopsis', 'theme']) && hasNonEmptyArray(storyArcLike.acts)) ||
    (hasNonEmptyArray(storyArcLike.major_npcs) &&
      hasNonEmptyArray(storyArcLike.key_locations) &&
      hasAnyValue(storyArcLike, ['central_conflict', 'hook']));
  if (hasStoryArcShape) {
    return 'story-arc';
  }

  const hasMonsterShape =
    hasValue(content.creature_type) &&
    (hasValue(content.challenge_rating) ||
      hasValue(content.armor_class) ||
      hasValue(content.hit_points) ||
      hasNonEmptyArray(content.actions));
  if (hasMonsterShape) {
    return 'monster';
  }

  const hasNpcRoleplayShape =
    hasAnyValue(content, ['class_levels', 'personality_traits', 'ideals', 'bonds', 'flaws', 'relationships', 'goals', 'fears']);
  const hasNpcMechanicalShape =
    hasAnyValue(content, ['ability_scores', 'armor_class', 'hit_points']) &&
    hasAnyValue(content, ['actions', 'class_levels', 'race', 'species', 'spellcasting']);
  if (hasNpcRoleplayShape || hasNpcMechanicalShape) {
    return 'character';
  }

  const hasLocationShape = hasAnyValue(content, ['spaces', 'rooms', 'points_of_interest', 'location_type', 'key_features']);
  if (hasLocationShape) {
    return 'location';
  }

  const hasItemShape = hasAnyValue(content, ['item_type', 'rarity', 'properties', 'mechanics', 'attunement', 'charges']);
  if (hasItemShape) {
    return 'item';
  }

  const hasEncounterShape = hasAnyValue(content, ['encounter_type', 'objectives', 'terrain', 'hazards', 'traps', 'monsters', 'enemies', 'rewards']);
  if (hasEncounterShape) {
    return 'section';
  }

  const hasSceneShape = hasAnyValue(content, ['scene_type', 'participants', 'discoveries', 'skill_challenges']);
  if (hasSceneShape) {
    return 'section';
  }

  return undefined;
}

export function resolveGeneratedContentType(input: {
  contentType?: string | null;
  deliverable?: string | null;
  generatedContent?: unknown;
}): CanonicalGeneratedContentType {
  const content = asRecord(input.generatedContent);
  const draft = asRecord(content.draft);

  const explicitDeliverable = [
    input.deliverable,
    ensureString(content.deliverable),
    ensureString(draft.deliverable),
  ]
    .map((candidate) => normalizeGeneratedContentTypeToken(candidate ?? undefined))
    .find((candidate): candidate is CanonicalGeneratedContentType => Boolean(candidate));

  if (explicitDeliverable) {
    return explicitDeliverable;
  }

  const structured = inferStructuredGeneratedContentType(content);
  if (structured) {
    return structured;
  }

  const explicitType = [
    ensureString(content.type),
    ensureString(draft.type),
    input.contentType,
    ensureString(content.content_type),
    ensureString(content.contentType),
    ensureString(content.category),
    ensureString(content.kind),
    ensureString(draft.content_type),
    ensureString(draft.contentType),
    ensureString(draft.category),
    ensureString(draft.kind),
  ]
    .map((candidate) => normalizeGeneratedContentTypeToken(candidate ?? undefined))
    .find((candidate): candidate is CanonicalGeneratedContentType => Boolean(candidate));

  if (explicitType) {
    return explicitType;
  }

  return 'text';
}
