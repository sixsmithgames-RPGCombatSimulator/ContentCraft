import { createHash } from 'node:crypto';

export const NPC_IDENTITY_CONTRACT_VERSION = '2026-08-01.1';

export const NPC_NARRATIVE_DEPTHS = ['surface', 'developed', 'major'] as const;
export const NPC_MECHANICAL_DEPTHS = ['none', 'template', 'combat_ready', 'full'] as const;

export type NpcNarrativeDepth = typeof NPC_NARRATIVE_DEPTHS[number];
export type NpcMechanicalDepth = typeof NPC_MECHANICAL_DEPTHS[number];
export type NpcIdentityKind = 'personal_name' | 'mononym' | 'public_alias' | 'role_descriptor' | 'group_label';

export interface NpcIdentityAssessment {
  kind: NpcIdentityKind;
  confidence: 'high' | 'medium';
  reasons: string[];
}

const HONORIFICS = new Set([
  'advocate', 'captain', 'constable', 'doctor', 'factor', 'father', 'high', 'inspector', 'lady', 'lord',
  'lordling', 'madam', 'magister', 'master', 'mistress', 'mother', 'officer', 'professor', 'saint',
  'sergeant', 'sister', 'warden', 'ward-reader',
]);

const ROLE_TERMS = new Set([
  'account-broker', 'bellkeeper', 'bell-keeper', 'blade', 'boy', 'broker', 'carrier', 'clerk', 'coordinator',
  'courier', 'dice', 'dockhand', 'dragger', 'enforcer', 'familiar', 'girl', 'guard', 'guide', 'handler',
  'keeper', 'ledger-carrier', 'lookout', 'man', 'merchant', 'person', 'players', 'pusher', 'quartermaster',
  'reader', 'runner', 'sentry', 'shield', 'sluice', 'supervisor', 'vendor', 'wardwright', 'watcher', 'woman',
  'worker',
]);

const GIVEN_NAMES = [
  'Alda', 'Ansel', 'Arlen', 'Bera', 'Bram', 'Cala', 'Cedran', 'Corin', 'Dain', 'Dessa', 'Edrin', 'Elka',
  'Fara', 'Fenric', 'Galen', 'Gressa', 'Hale', 'Hessa', 'Ilyra', 'Iven', 'Jessa', 'Jorren', 'Kael', 'Kessa',
  'Loran', 'Lysa', 'Mara', 'Merric', 'Nella', 'Neris', 'Orin', 'Orla', 'Perrin', 'Quillan', 'Ressa', 'Rovan',
  'Selka', 'Soren', 'Talia', 'Toren', 'Ulric', 'Vessa', 'Veyra', 'Willa', 'Yorin', 'Zella',
];

const FAMILY_NAMES = [
  'Ashdown', 'Barrow', 'Bell', 'Blackreed', 'Brasswake', 'Copperfen', 'Dusk', 'Ember', 'Fallow', 'Graymantle',
  'Hale', 'Harrow', 'Kest', 'Krail', 'Marr', 'Morn', 'Nymm', 'Pell', 'Quill', 'Reed', 'Rusk', 'Sedge',
  'Silt', 'Tallow', 'Tarrow', 'Thornwick', 'Tideglass', 'Vale', 'Venn', 'Voss', 'Wren', 'Yarrow',
];

const normalizeSpace = (value: unknown) => String(value ?? '').normalize('NFKC').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').trim();
const normalizedToken = (value: string) => value.toLowerCase().replace(/^[^a-z]+|[^a-z]+$/g, '');

function identityTokens(value: string) {
  return normalizeSpace(value).split(/[\s/]+/).map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}'-]+$/gu, '')).filter(Boolean);
}

function looksLikePersonalToken(value: string) {
  return /^[\p{Lu}][\p{L}'-]{1,}$/u.test(value);
}

export function assessNpcIdentity(value: unknown): NpcIdentityAssessment {
  const name = normalizeSpace(value);
  if (!name) return { kind: 'role_descriptor', confidence: 'high', reasons: ['empty_identity'] };
  const tokens = identityTokens(name);
  const lowered = tokens.map(normalizedToken);
  const reasons: string[] = [];

  if (/\b(?:players|crew|team|pair|group|crowd|workers|guards)\b/i.test(name)) {
    return { kind: 'group_label', confidence: 'high', reasons: ['plural_or_collective_identity'] };
  }
  if (/^(?:unidentified|unknown|unnamed|anonymous)\b/i.test(name)) reasons.push('unidentified_prefix');
  if (/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)$/i.test(name)) reasons.push('numbered_role');
  if (/\b(?:with|wearing|holding|carrying|below|above|inside|outside|near|under|at)\b/i.test(name)) reasons.push('descriptive_phrase');

  const honorificPrefix = HONORIFICS.has(lowered[0] ?? '') ? 1 : 0;
  const personalTail = tokens.slice(honorificPrefix);
  const roleHits = lowered.filter((token) => ROLE_TERMS.has(token));
  if (roleHits.length) reasons.push('occupational_or_descriptive_term');

  if (/^(?:the|old)\s+/i.test(name) && tokens.length <= 4 && !roleHits.length
    && tokens.slice(1).every(looksLikePersonalToken) && !reasons.includes('unidentified_prefix')) {
    return { kind: 'public_alias', confidence: 'medium', reasons: ['established_style_public_alias'] };
  }
  if (tokens.length === 1 && looksLikePersonalToken(tokens[0]) && !roleHits.length) {
    return { kind: 'mononym', confidence: 'medium', reasons: ['capitalized_mononym'] };
  }
  if (honorificPrefix && personalTail.length >= 1 && personalTail.every(looksLikePersonalToken) && !reasons.some((reason) => reason !== 'occupational_or_descriptive_term')) {
    return { kind: personalTail.length === 1 ? 'mononym' : 'personal_name', confidence: 'high', reasons: ['honorific_with_personal_name'] };
  }
  if (tokens.length >= 2 && tokens.length <= 4 && tokens.every(looksLikePersonalToken) && !roleHits.length && !reasons.length) {
    return { kind: 'personal_name', confidence: 'high', reasons: ['capitalized_personal_name'] };
  }
  return {
    kind: reasons.includes('plural_or_collective_identity') ? 'group_label' : 'role_descriptor',
    confidence: reasons.length ? 'high' : 'medium',
    reasons: reasons.length ? reasons : ['identity_does_not_resolve_as_a_personal_name'],
  };
}

export function isCanonicalNpcName(value: unknown) {
  return ['personal_name', 'mononym', 'public_alias'].includes(assessNpcIdentity(value).kind);
}

function stableIndex(seed: string, offset: number, size: number) {
  const digest = createHash('sha256').update(`${seed}:${offset}`).digest();
  return digest.readUInt32BE(0) % size;
}

export function generateStableNpcName(seed: string, unavailable: Iterable<string> = []) {
  const occupied = new Set([...unavailable].map((value) => normalizeSpace(value).toLowerCase()).filter(Boolean));
  for (let attempt = 0; attempt < GIVEN_NAMES.length * 2; attempt += 1) {
    const given = GIVEN_NAMES[stableIndex(seed, attempt * 2, GIVEN_NAMES.length)];
    const family = FAMILY_NAMES[stableIndex(seed, attempt * 2 + 1, FAMILY_NAMES.length)];
    const candidate = `${given} ${family}`;
    if (!occupied.has(candidate.toLowerCase())) return candidate;
  }
  const suffix = createHash('sha256').update(seed).digest('hex').slice(0, 4).toUpperCase();
  return `Neris Vale-${suffix}`;
}

function normalizeNarrativeDepth(value: unknown): NpcNarrativeDepth {
  return NPC_NARRATIVE_DEPTHS.includes(String(value) as NpcNarrativeDepth) ? String(value) as NpcNarrativeDepth : 'surface';
}

function normalizeMechanicalDepth(value: unknown): NpcMechanicalDepth {
  return NPC_MECHANICAL_DEPTHS.includes(String(value) as NpcMechanicalDepth) ? String(value) as NpcMechanicalDepth : 'none';
}

function mechanicalTitleBasis(input: Record<string, any>, title: string) {
  const supplied = input.mechanicalTitleBasis ?? input.details?.mechanicalTitleBasis;
  if (supplied && typeof supplied === 'object' && !Array.isArray(supplied)) {
    const suppliedHasMechanics = Boolean(
      supplied.classLevels
      || supplied.class_levels
      || supplied.hitDice
      || supplied.hit_dice
      || (Array.isArray(supplied.classFeatures ?? supplied.class_features) && (supplied.classFeatures ?? supplied.class_features).length)
      || (Array.isArray(supplied.feats) && supplied.feats.length)
    );
    if (title && suppliedHasMechanics) return { ...supplied, title };
  }
  const classLevels = input.class_levels ?? input.details?.class_levels ?? input.actorProfile?.class_levels;
  const hitDice = input.hit_dice ?? input.details?.hit_dice ?? input.actorProfile?.hit_dice;
  const classFeatures = input.class_features ?? input.details?.class_features ?? input.actorProfile?.class_features;
  const feats = input.feats ?? input.details?.feats ?? input.actorProfile?.feats;
  const hasMechanics = Boolean(classLevels || hitDice || (Array.isArray(classFeatures) && classFeatures.length) || (Array.isArray(feats) && feats.length));
  return title && hasMechanics ? {
    title,
    classLevels: classLevels ?? null,
    hitDice: hitDice ?? null,
    classFeatures: Array.isArray(classFeatures) ? classFeatures : [],
    feats: Array.isArray(feats) ? feats : [],
    source: 'explicit_npc_mechanics',
  } : null;
}

export function normalizeNpcIdentitySeed(input: Record<string, any>, options: {
  campaignId: string;
  mutationId?: string;
  unavailableNames?: Iterable<string>;
  source?: string;
}): Record<string, any> & { name: string; aliases: string[]; details: Record<string, any> } {
  const rawName = normalizeSpace(input.name ?? input.canonical_name ?? input.details?.name);
  if (!rawName) throw Object.assign(new Error('An NPC seed requires a name or player-facing role label.'), { status: 400, code: 'NPC_IDENTITY_REQUIRED' });
  const assessment = assessNpcIdentity(rawName);
  if (assessment.kind === 'group_label') {
    throw Object.assign(new Error('A group label cannot be stored as one NPC. Create individual NPCs or use an encounter group.'), {
      status: 422,
      code: 'NPC_GROUP_IDENTITY_INVALID',
      details: { proposedName: rawName, assessment },
    });
  }
  const existingDetails = input.details && typeof input.details === 'object' && !Array.isArray(input.details) ? { ...input.details } : {};
  const explicitDisplayLabel = normalizeSpace(input.displayLabel ?? input.playerFacingLabel ?? existingDetails.displayLabel ?? existingDetails.identity?.displayLabel);
  const displayLabel = explicitDisplayLabel || rawName;
  const aliases = [...new Set([
    ...(Array.isArray(input.aliases) ? input.aliases : []),
    ...(assessment.kind === 'role_descriptor' ? [rawName] : []),
    ...(displayLabel !== rawName ? [displayLabel] : []),
  ].map(normalizeSpace).filter(Boolean))];
  const unavailable = new Set([...(options.unavailableNames ?? [])].map(normalizeSpace).filter(Boolean));
  const seed = [options.campaignId, options.mutationId ?? '', rawName, input.role ?? existingDetails.role ?? '', input.location ?? existingDetails.location ?? ''].join('|');
  const canonicalName = assessment.kind === 'role_descriptor' ? generateStableNpcName(seed, unavailable) : rawName;
  const title = normalizeSpace(input.title ?? existingDetails.title);
  const profession = normalizeSpace(input.profession ?? input.occupation ?? existingDetails.profession ?? existingDetails.occupation ?? input.role ?? existingDetails.role);
  const narrativeDepth = normalizeNarrativeDepth(input.narrativeDepth ?? existingDetails.narrativeDepth ?? existingDetails.profileLifecycle?.narrativeDepth);
  const mechanicalDepth = normalizeMechanicalDepth(input.mechanicalDepth ?? existingDetails.mechanicalDepth ?? existingDetails.profileLifecycle?.mechanicalDepth);
  const titleBasis = mechanicalTitleBasis({ ...input, details: existingDetails }, title);
  const identity = {
    contractVersion: NPC_IDENTITY_CONTRACT_VERSION,
    entityKind: 'individual',
    canonicalName,
    displayLabel,
    nameKnownToPlayers: Boolean(input.nameKnownToPlayers ?? existingDetails.identity?.nameKnownToPlayers ?? assessment.kind !== 'role_descriptor'),
    assessment,
    nameSource: assessment.kind === 'role_descriptor' ? 'gmc_stable_identity_synthesis' : 'supplied_personal_identity',
    sourceLabel: assessment.kind === 'role_descriptor' ? rawName : null,
  };
  const normalizedDetails = {
    ...existingDetails,
    name: canonicalName,
    displayLabel,
    ...(title ? { title } : {}),
    ...(profession ? { profession, occupation: existingDetails.occupation ?? profession } : {}),
    identity,
    narrativeDepth,
    mechanicalDepth,
    profileLifecycle: {
      ...(existingDetails.profileLifecycle && typeof existingDetails.profileLifecycle === 'object' ? existingDetails.profileLifecycle : {}),
      contractVersion: NPC_IDENTITY_CONTRACT_VERSION,
      narrativeDepth,
      mechanicalDepth,
    },
    ...(titleBasis ? { mechanicalTitleBasis: titleBasis } : {}),
  };
  if (!titleBasis) delete (normalizedDetails as Record<string, any>).mechanicalTitleBasis;
  return {
    ...input,
    name: canonicalName,
    canonical_name: canonicalName,
    aliases,
    details: normalizedDetails,
  };
}

const NARRATIVE_RANK: Record<NpcNarrativeDepth, number> = { surface: 0, developed: 1, major: 2 };
const MECHANICAL_RANK: Record<NpcMechanicalDepth, number> = { none: 0, template: 1, combat_ready: 2, full: 3 };

export function maxNpcNarrativeDepth(left: unknown, right: unknown): NpcNarrativeDepth {
  const a = normalizeNarrativeDepth(left);
  const b = normalizeNarrativeDepth(right);
  return NARRATIVE_RANK[a] >= NARRATIVE_RANK[b] ? a : b;
}

export function maxNpcMechanicalDepth(left: unknown, right: unknown): NpcMechanicalDepth {
  const a = normalizeMechanicalDepth(left);
  const b = normalizeMechanicalDepth(right);
  return MECHANICAL_RANK[a] >= MECHANICAL_RANK[b] ? a : b;
}
