import { formatParseError, parseAIResponse } from '../utils/jsonParser';
import { validateNpcStageOutput } from '../utils/npcStageValidator';
import { validateIncomingLocationSpace } from '../utils/locationSpaceValidation';
import {
  getStageContract,
  validateStageOutput,
} from '../utils/stageOutputContracts';
import { repairWorkflowStagePayload } from '../../../src/shared/generation/workflowStageRepair';

type JsonRecord = Record<string, unknown>;
type StageResults = Record<string, JsonRecord>;
type SpellSlots = Record<string, number>;
type SpellListByKey = Record<string, string[]>;

type SpellcastingNormalized = {
  spellcasting_ability: string;
  spell_save_dc: number;
  spell_attack_bonus: number;
  spell_slots: SpellSlots;
  prepared_spells?: SpellListByKey;
  always_prepared_spells?: SpellListByKey;
  innate_spells?: SpellListByKey;
  spellcasting_focus?: string;
  spells_known?: string[];
};

type ResolvedMechanics = {
  spellcasting?: {
    has_spellcasting: boolean;
    caster_mode: 'prepared' | 'known' | 'innate' | 'hybrid';
    has_slots: boolean;
    has_innate: boolean;
    spellcasting_ability?: string;
    spell_save_dc?: number;
    spell_attack_bonus?: number;
    spellcasting_focus?: string;
  };
  combat?: {
    has_combat_actions: boolean;
    has_bonus_actions: boolean;
    has_reactions: boolean;
  };
  legendary?: {
    has_legendary: boolean;
  };
};

export interface NormalizeWorkflowStageResponseInput {
  aiResponse: string;
  stageName: string;
  stageIdentity?: string;
  workflowType?: string;
  configPrompt?: string;
  configFlags?: JsonRecord;
  previousDecisions?: Record<string, string>;
  stageResults: StageResults;
}

export type NormalizeWorkflowStageResponseResult =
  | {
    ok: true;
    parsed: JsonRecord;
    contractKey?: string | null;
  }
  | {
    ok: false;
    error: string;
    rawSnippet?: string;
    parsed?: JsonRecord;
  };

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getStageObject = (source: StageResults | null | undefined, key: string): JsonRecord | undefined => {
  if (!source) return undefined;
  const value = source[key];
  return isRecord(value) ? value : undefined;
};

const buildCombatCapabilities = (combat: JsonRecord): ResolvedMechanics['combat'] => {
  const hasActions = Array.isArray(combat.actions) && combat.actions.length > 0;
  const hasBonus = Array.isArray(combat.bonus_actions) && combat.bonus_actions.length > 0;
  const hasReactions = Array.isArray(combat.reactions) && combat.reactions.length > 0;
  return {
    has_combat_actions: hasActions,
    has_bonus_actions: hasBonus,
    has_reactions: hasReactions,
  };
};

const buildLegendaryCapabilities = (legendary: JsonRecord): ResolvedMechanics['legendary'] => {
  const hasLegendaryActions = isRecord(legendary.legendary_actions)
    || (Array.isArray(legendary.legendary_actions) && legendary.legendary_actions.length > 0);
  const hasLegendaryResistance = isRecord(legendary.legendary_resistance);
  return {
    has_legendary: Boolean(hasLegendaryActions || hasLegendaryResistance),
  };
};

const coerceCombatString = (value: unknown): string | undefined => {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normalizeCombatList = (value: unknown, bucket: 'actions' | 'bonus_actions' | 'reactions'): JsonRecord[] => {
  if (!Array.isArray(value)) return [];
  const defaultActivation = bucket === 'actions' ? 'action' : bucket === 'bonus_actions' ? 'bonus_action' : 'reaction';
  return value
    .map((entry) => {
      if (typeof entry === 'string') {
        const text = coerceCombatString(entry);
        return text ? { name: text.slice(0, 80) || 'Feature', description: text, activationType: defaultActivation } as JsonRecord : null;
      }
      if (!isRecord(entry)) return null;
      const name = coerceCombatString(entry.name) ?? coerceCombatString(entry.title) ?? coerceCombatString(entry.attack) ?? coerceCombatString(entry.action);
      const description = coerceCombatString(entry.description) ?? coerceCombatString(entry.details) ?? coerceCombatString(entry.text) ?? coerceCombatString(entry.effect);
      if (!name && !description) return null;
      return {
        ...entry,
        name: name ?? (description ? description.slice(0, 80) : 'Feature'),
        description: description ?? name ?? 'Details unavailable.',
        activationType: coerceCombatString(entry.activationType) ?? coerceCombatString(entry.activation_type) ?? defaultActivation,
      } as JsonRecord;
    })
    .filter((entry): entry is JsonRecord => entry !== null);
};

const resolveCombat = (context: JsonRecord, existing: JsonRecord): JsonRecord => {
  const actions = normalizeCombatList(existing.actions, 'actions');
  const bonusActions = normalizeCombatList(existing.bonus_actions, 'bonus_actions');
  const reactions = normalizeCombatList(existing.reactions, 'reactions');
  if (actions.length > 0) {
    return { ...existing, actions, bonus_actions: bonusActions, reactions } as JsonRecord;
  }

  const abilities = context.ability_scores as JsonRecord | undefined;
  const prof = typeof context.proficiency_bonus === 'number' ? context.proficiency_bonus : 0;
  const str = abilities && typeof abilities.str === 'number' ? abilities.str : 10;
  const dex = abilities && typeof abilities.dex === 'number' ? abilities.dex : 10;
  const mod = Math.max(Math.floor((str - 10) / 2), Math.floor((dex - 10) / 2));
  const attackBonus = prof + mod;

  return {
    ...existing,
    actions: [
      {
        name: 'Weapon Attack',
        description: 'A basic attack with the wielded weapon.',
        attack_bonus: attackBonus,
        damage: '1d8 + mod',
        range: 'melee or 30 ft.',
        statLine: `${attackBonus >= 0 ? '+' : ''}${attackBonus} to hit`,
        uses: 'At will',
        activationType: 'action',
        sourceSection: 'creator:_combat',
        origin: 'workflow_stage_response',
        knowledgeSource: 'derived',
      },
    ],
    bonus_actions: bonusActions,
    reactions,
  } as JsonRecord;
};

const PALADIN_SLOTS_BY_LEVEL: Record<number, SpellSlots> = {
  1: { '1': 0 },
  2: { '1': 2 },
  3: { '1': 3 },
  4: { '1': 3 },
  5: { '1': 4, '2': 2 },
  6: { '1': 4, '2': 2 },
  7: { '1': 4, '2': 3 },
  8: { '1': 4, '2': 3 },
  9: { '1': 4, '2': 3, '3': 2 },
  10: { '1': 4, '2': 3, '3': 2 },
  11: { '1': 4, '2': 3, '3': 3 },
  12: { '1': 4, '2': 3, '3': 3 },
  13: { '1': 4, '2': 3, '3': 3, '4': 1 },
  14: { '1': 4, '2': 3, '3': 3, '4': 1 },
  15: { '1': 4, '2': 3, '3': 3, '4': 2 },
  16: { '1': 4, '2': 3, '3': 3, '4': 2 },
  17: { '1': 4, '2': 3, '3': 3, '4': 3 },
  18: { '1': 4, '2': 3, '3': 3, '4': 3 },
  19: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 1 },
  20: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 1 },
};

const FULL_CASTER_SLOTS: Record<number, SpellSlots> = {
  1: { '1': 2 },
  2: { '1': 3 },
  3: { '1': 4, '2': 2 },
  4: { '1': 4, '2': 3 },
  5: { '1': 4, '2': 3, '3': 2 },
  6: { '1': 4, '2': 3, '3': 3 },
  7: { '1': 4, '2': 3, '3': 3, '4': 1 },
  8: { '1': 4, '2': 3, '3': 3, '4': 2 },
  9: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 1 },
  10: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2 },
  11: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1 },
  12: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1 },
  13: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1 },
  14: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1 },
  15: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1 },
  16: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1 },
  17: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 2, '6': 1, '7': 1, '8': 1, '9': 1 },
  18: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 3, '6': 1, '7': 1, '8': 1, '9': 1 },
  19: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 3, '6': 2, '7': 1, '8': 1, '9': 1 },
  20: { '1': 4, '2': 3, '3': 3, '4': 3, '5': 3, '6': 2, '7': 2, '8': 1, '9': 1 },
};

const DEFAULT_PREPARED_SPELLS: Record<string, SpellListByKey> = {
  cleric: { '1': ['cure wounds', 'guiding bolt', 'bless'], '2': ['lesser restoration', 'spiritual weapon'] },
  druid: { '1': ['entangle', 'faerie fire', 'cure wounds'], '2': ['heat metal', 'pass without trace'] },
  wizard: { '1': ['magic missile', 'shield', 'mage armor'], '2': ['misty step', 'mirror image'] },
  artificer: { '1': ['cure wounds', 'faerie fire'], '2': ['invisibility', 'see invisibility'] },
  paladin: { '1': ['bless', 'cure wounds'], '2': ['lesser restoration'] },
  ranger: { '1': ['hunter\'s mark', 'cure wounds'], '2': ['pass without trace'] },
};

const DEFAULT_KNOWN_SPELLS: Record<string, string[]> = {
  bard: ['vicious mockery', 'healing word', 'dissonant whispers'],
  sorcerer: ['fire bolt', 'magic missile', 'shield'],
  warlock: ['eldritch blast', 'hex'],
};

const getAbilityMod = (score: number | undefined): number => {
  if (typeof score !== 'number') return 0;
  return Math.floor((score - 10) / 2);
};

const resolveSpellcasting = (context: JsonRecord): SpellcastingNormalized | null => {
  const classLevels = context.class_levels as JsonRecord[] | undefined;
  const abilityScores = context.ability_scores as JsonRecord | undefined;
  const proficiency = context.proficiency_bonus as number | undefined;

  if (!classLevels || !Array.isArray(classLevels) || classLevels.length === 0) return null;

  const casterInfo = classLevels
    .filter((cl) => isRecord(cl) && typeof cl.class === 'string')
    .map((cl) => {
      const rawLevel = (cl as JsonRecord).level;
      const parsedLevel = typeof rawLevel === 'number' ? rawLevel : Number.parseInt(String(rawLevel ?? '0'), 10) || 0;
      return {
        name: String((cl as JsonRecord).class).toLowerCase(),
        level: parsedLevel,
        subclass: isRecord(cl) && typeof cl.subclass === 'string' ? String(cl.subclass).toLowerCase() : undefined,
      };
    });

  const totalLevel = casterInfo.reduce((acc: number, cl) => acc + (cl.level ?? 0), 0);
  const isPrepared = casterInfo.some((c) => ['cleric', 'druid', 'wizard', 'artificer', 'paladin'].includes(c.name));
  const isKnown = casterInfo.some((c) => ['bard', 'sorcerer', 'warlock'].includes(c.name));
  const isHalf = casterInfo.some((c) => ['paladin', 'ranger'].includes(c.name));

  if (!isPrepared && !isKnown && !isHalf) return null;

  const highest = [...casterInfo].sort((a, b) => (b.level ?? 0) - (a.level ?? 0))[0];
  const abilityMap: Record<string, string> = {
    cleric: 'WIS',
    druid: 'WIS',
    paladin: 'CHA',
    ranger: 'WIS',
    wizard: 'INT',
    artificer: 'INT',
    bard: 'CHA',
    sorcerer: 'CHA',
    warlock: 'CHA',
  };
  const abilityKey = abilityMap[highest?.name] || 'CHA';
  const abilityScore = abilityScores && typeof abilityScores[abilityKey.toLowerCase()] === 'number'
    ? (abilityScores[abilityKey.toLowerCase()] as number)
    : undefined;
  const mod = getAbilityMod(abilityScore);
  const prof = typeof proficiency === 'number' ? proficiency : 0;

  const casterLevel = Math.max(1, Math.min(20, highest?.level || totalLevel || 1));
  const slots = isPrepared || (!isKnown && !isHalf)
    ? (FULL_CASTER_SLOTS[casterLevel] || FULL_CASTER_SLOTS[1])
    : (PALADIN_SLOTS_BY_LEVEL[casterLevel] || PALADIN_SLOTS_BY_LEVEL[1]);

  const preparedSeeds = DEFAULT_PREPARED_SPELLS[highest?.name] || {};
  const prepared: SpellListByKey = {};
  Object.keys(slots).forEach((lvl) => {
    const seedList = preparedSeeds[lvl] || preparedSeeds['1'] || ['bless'];
    prepared[lvl] = seedList;
  });

  const alwaysPrepared: SpellListByKey = {};
  const paladinOaths: Record<string, string[]> = {
    devotion: ['protection from evil and good', 'sanctuary', 'lesser restoration', 'zone of truth'],
  };
  const paladinSubclass = casterInfo.find((c) => c.name === 'paladin')?.subclass;
  const oathList = paladinSubclass ? paladinOaths[paladinSubclass] : undefined;
  if (oathList && oathList.length > 0) {
    alwaysPrepared.oath = oathList;
  }

  const knownSpells = isKnown ? (DEFAULT_KNOWN_SPELLS[highest?.name] || ['eldritch blast']) : [];

  return {
    spellcasting_ability: abilityKey,
    spell_save_dc: 8 + prof + mod,
    spell_attack_bonus: prof + mod,
    spell_slots: slots,
    prepared_spells: isPrepared || isHalf ? prepared : {},
    always_prepared_spells: alwaysPrepared,
    innate_spells: {},
    spells_known: isKnown ? knownSpells : [],
    spellcasting_focus: highest?.name === 'cleric' || highest?.name === 'paladin' ? 'holy symbol' : highest?.name === 'wizard' ? 'arcane focus' : 'focus',
  };
};

const buildSpellcastingCapabilities = (spellcasting: SpellcastingNormalized | null): ResolvedMechanics['spellcasting'] => {
  if (!spellcasting) return undefined;
  const hasSlots = isRecord(spellcasting.spell_slots) && Object.keys(spellcasting.spell_slots).length > 0;
  const hasPrepared = isRecord(spellcasting.prepared_spells) && Object.keys(spellcasting.prepared_spells).length > 0;
  const hasKnown = Array.isArray(spellcasting.spells_known) && spellcasting.spells_known.length > 0;
  const hasInnate = isRecord(spellcasting.innate_spells) && Object.keys(spellcasting.innate_spells).length > 0;

  let casterMode: 'prepared' | 'known' | 'innate' | 'hybrid' = 'innate';
  if (hasPrepared && hasKnown) casterMode = 'hybrid';
  else if (hasPrepared || hasSlots) casterMode = 'prepared';
  else if (hasKnown) casterMode = 'known';

  return {
    has_spellcasting: hasPrepared || hasKnown || hasInnate || hasSlots,
    caster_mode: casterMode,
    has_slots: hasSlots,
    has_innate: hasInnate,
    spellcasting_ability: spellcasting.spellcasting_ability,
    spell_save_dc: spellcasting.spell_save_dc,
    spell_attack_bonus: spellcasting.spell_attack_bonus,
    spellcasting_focus: spellcasting.spellcasting_focus,
  };
};

const SPELLCASTING_ALLOWED_KEYS: (keyof SpellcastingNormalized)[] = [
  'spellcasting_ability',
  'spell_save_dc',
  'spell_attack_bonus',
  'spell_slots',
  'prepared_spells',
  'always_prepared_spells',
  'innate_spells',
  'spellcasting_focus',
  'spells_known',
];

const normalizeSpellcasting = (raw: JsonRecord, resolver: SpellcastingNormalized | null): SpellcastingNormalized => {
  const pruned: Partial<SpellcastingNormalized> = {};

  const mapSpellListRecord = (value: unknown): SpellListByKey => {
    if (!isRecord(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .map(([lvl, spells]) => {
          const arr = Array.isArray(spells)
            ? spells.filter((x) => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim())
            : [];
          return [lvl, arr];
        })
        .filter(([, arr]) => (arr as string[]).length > 0),
    );
  };

  for (const key of SPELLCASTING_ALLOWED_KEYS) {
    const v = raw[key];

    if (key === 'spell_slots' && isRecord(v)) {
      pruned[key] = Object.fromEntries(Object.entries(v).map(([lvl, val]) => [lvl, Number(val) || 0])) as SpellSlots;
      continue;
    }

    if (key === 'prepared_spells' || key === 'innate_spells' || key === 'always_prepared_spells') {
      pruned[key] = mapSpellListRecord(v);
      continue;
    }

    if (key === 'spells_known' && Array.isArray(v)) {
      pruned[key] = v.filter((x) => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim());
      continue;
    }

    if (key === 'spellcasting_ability' || key === 'spellcasting_focus') {
      if (typeof v === 'string' && v.trim().length > 0) {
        pruned[key] = v.trim();
      }
      continue;
    }

    if (key === 'spell_save_dc' || key === 'spell_attack_bonus') {
      if (typeof v === 'number' && Number.isFinite(v)) {
        pruned[key] = v;
      }
    }
  }

  const base = resolver ?? {
    spellcasting_ability: 'CHA',
    spell_save_dc: 0,
    spell_attack_bonus: 0,
    spell_slots: {},
    prepared_spells: {},
    always_prepared_spells: {},
    innate_spells: {},
    spells_known: [],
  };

  return {
    spellcasting_ability: typeof pruned.spellcasting_ability === 'string' && pruned.spellcasting_ability.trim().length > 0
      ? pruned.spellcasting_ability
      : base.spellcasting_ability,
    spell_save_dc: typeof pruned.spell_save_dc === 'number' && Number.isFinite(pruned.spell_save_dc)
      ? pruned.spell_save_dc
      : base.spell_save_dc,
    spell_attack_bonus: typeof pruned.spell_attack_bonus === 'number' && Number.isFinite(pruned.spell_attack_bonus)
      ? pruned.spell_attack_bonus
      : base.spell_attack_bonus,
    spell_slots: (pruned.spell_slots && Object.keys(pruned.spell_slots).length > 0 ? pruned.spell_slots : base.spell_slots) as SpellSlots,
    prepared_spells: pruned.prepared_spells ?? base.prepared_spells,
    always_prepared_spells: pruned.always_prepared_spells ?? base.always_prepared_spells,
    innate_spells: pruned.innate_spells ?? base.innate_spells,
    spells_known: Array.isArray(pruned.spells_known)
      ? pruned.spells_known
      : Array.isArray(resolver?.spells_known)
        ? resolver.spells_known
        : base.spells_known,
    spellcasting_focus: typeof pruned.spellcasting_focus === 'string' && pruned.spellcasting_focus.trim().length > 0
      ? pruned.spellcasting_focus.trim()
      : base.spellcasting_focus,
  };
};

const SPECIES_CANON = [
  'Aasimar',
  'Human',
  'Elf',
  'Dwarf',
  'Halfling',
  'Gnome',
  'Tiefling',
  'Dragonborn',
  'Half-Elf',
  'Half-Orc',
  'Goliath',
] as const;

const levenshtein = (a: string, b: string): number => {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let i = 1; i <= n; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= m; j++) {
      const temp = dp[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[m];
};

const tokenizeLower = (text: string): string[] =>
  (text || '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

export const inferSpecies = (input: { original_user_request?: string; previous_decisions?: Record<string, string> }): string | null => {
  const text = input.original_user_request || '';
  const decisions = input.previous_decisions || {};

  const heritage = String(decisions['aasimar-heritage'] ?? decisions['Aasimar Subrace'] ?? '').toLowerCase();
  if (heritage.includes('aasimar')) return 'Aasimar';

  const tokens = tokenizeLower(text);
  for (const tok of tokens) {
    for (const sp of SPECIES_CANON) {
      const target = sp.toLowerCase();
      if (tok === target) return sp;
      if (tok.length >= 5 && Math.abs(tok.length - target.length) <= 2 && levenshtein(tok, target) <= 1) return sp;
    }
  }

  return null;
};

export function parseAndNormalizeWorkflowStageResponse(
  input: NormalizeWorkflowStageResponseInput,
): NormalizeWorkflowStageResponseResult {
  if (input.stageName === 'Visual Map') {
    return {
      ok: true,
      parsed: {
        visual_map_html: input.aiResponse.trim(),
        stage: 'visual_map',
        generated_at: new Date().toISOString(),
      },
    };
  }

  const parseResult = parseAIResponse<JsonRecord>(input.aiResponse);
  if (!parseResult.success) {
    return {
      ok: false,
      error: formatParseError(parseResult),
      rawSnippet: typeof input.aiResponse === 'string' ? input.aiResponse.slice(0, 500) : undefined,
    };
  }

  let parsed = parseResult.data || {};

  const repairResult = repairWorkflowStagePayload({
    stageIdOrName: input.stageIdentity || input.stageName,
    workflowType: input.workflowType,
    payload: parsed,
    configPrompt: input.configPrompt,
    configFlags: input.configFlags,
    previousDecisions: input.previousDecisions,
  });
  parsed = repairResult.payload;
  const contractKey = repairResult.contractKey;
  const stageContract = contractKey ? getStageContract(contractKey, input.workflowType) : null;

  if (contractKey && stageContract) {
    if (contractKey === 'spellcasting') {
      const spellCtx: JsonRecord = {
        ...getStageObject(input.stageResults, 'creator:_basic_info'),
        ...getStageObject(input.stageResults, 'creator:_stats'),
        ...parsed,
      };
      const resolved = resolveSpellcasting(spellCtx);
      parsed = normalizeSpellcasting(parsed, resolved) as JsonRecord;

      const spellMechanics = buildSpellcastingCapabilities(resolved ?? (parsed as unknown as SpellcastingNormalized));
      if (spellMechanics) {
        parsed.resolved_mechanics = spellMechanics as unknown as JsonRecord;
      }
    }

    if (contractKey === 'combat') {
      const combatCtx: JsonRecord = {
        ...getStageObject(input.stageResults, 'creator:_stats'),
        ...getStageObject(input.stageResults, 'creator:_equipment'),
        ...parsed,
      };
      parsed = resolveCombat(combatCtx, parsed) as JsonRecord;
      const combatMechanics = buildCombatCapabilities(parsed);
      if (combatMechanics) {
        parsed.resolved_mechanics = combatMechanics as unknown as JsonRecord;
      }
    }

    if (contractKey === 'legendary') {
      const legendaryMechanics = buildLegendaryCapabilities(parsed);
      parsed.resolved_mechanics = legendaryMechanics as unknown as JsonRecord;
    }

    const validation = validateStageOutput(contractKey, parsed, input.workflowType);
    if (!validation.ok) {
      return {
        ok: false,
        error: `AI response is invalid for ${input.stageName}: ${validation.error}`,
        rawSnippet: typeof input.aiResponse === 'string' ? input.aiResponse.slice(0, 500) : undefined,
      };
    }
  }

  if (input.stageName === 'Spaces' && input.workflowType === 'location') {
    const candidateSpace = (() => {
      if (parsed.space && typeof parsed.space === 'object') return parsed.space;
      if (Array.isArray(parsed.spaces) && parsed.spaces.length > 0) return parsed.spaces[0];
      return parsed;
    })();

    const validation = validateIncomingLocationSpace(candidateSpace, {
      requireFeaturePositionAnchor: true,
    });
    if (validation.ok === false) {
      return {
        ok: false,
        error: validation.error,
        rawSnippet: typeof input.aiResponse === 'string' ? input.aiResponse.slice(0, 500) : undefined,
      };
    }
  }

  if (input.workflowType === 'npc' && input.stageName.startsWith('Creator:')) {
    const stageContextForValidation: JsonRecord = {
      ...getStageObject(input.stageResults, 'creator:_basic_info'),
      ...getStageObject(input.stageResults, 'creator:_core_details'),
      ...getStageObject(input.stageResults, 'creator:_stats'),
      ...getStageObject(input.stageResults, 'creator:_character_build'),
      ...parsed,
    };
    const validation = validateNpcStageOutput(input.stageName, stageContextForValidation);
    if (!validation.isValid) {
      const stageIssues = validation.errors.map((errorMessage) => ({
        severity: 'critical',
        description: errorMessage,
        suggestion: 'Retry this stage and require complete, fully populated NPC data.',
      }));
      const existingConflicts = Array.isArray(parsed.conflicts) ? parsed.conflicts as unknown[] : [];
      return {
        ok: false,
        error: validation.errors.join(' '),
        rawSnippet: typeof input.aiResponse === 'string' ? input.aiResponse.slice(0, 500) : undefined,
        parsed: {
          ...parsed,
          conflicts: [...stageIssues, ...existingConflicts],
        },
      };
    }

    if (validation.warnings.length > 0) {
      const stageIssues = validation.warnings.map((message) => ({
        severity: 'warning',
        description: message,
        suggestion: 'Review this stage output and confirm whether the data is sufficiently complete.',
      }));
      const existingConflicts = Array.isArray(parsed.conflicts) ? parsed.conflicts as unknown[] : [];
      parsed.conflicts = [...stageIssues, ...existingConflicts];
    }
  }

  return {
    ok: true,
    parsed,
    contractKey,
  };
}


