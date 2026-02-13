/**
 * NPC Stage Router
 * Intelligently determines which stages are needed based on character analysis
 
 *
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

export interface StageRequirement {
  required: boolean;
  reason?: string;
}

export interface StageRoutingDecision {
  basicInfo: StageRequirement;
  coreDetails: StageRequirement;
  stats: StageRequirement;
  characterBuild: StageRequirement;
  combat: StageRequirement;
  spellcasting: StageRequirement;
  legendary: StageRequirement;
  relationships: StageRequirement;
  equipment: StageRequirement;
}

interface BasicInfoOutput {
  challenge_rating?: number | string;
  class_levels?: Record<string, number>;
  race?: string;
  description?: string;
  subtype?: string;
  role?: string;
  [key: string]: unknown;
}

/**
 * Analyze character and determine which stages are needed
 */
export function determineRequiredStages(
  basicInfoOutput: BasicInfoOutput,
  userRequest: string
): StageRoutingDecision {
  const cr = parseChallenge(basicInfoOutput.challenge_rating);
  const hasClassLevels = hasClasses(basicInfoOutput.class_levels);
  const description = (basicInfoOutput.description || '').toLowerCase();
  const request = userRequest.toLowerCase();
  const race = (basicInfoOutput.race || '').toLowerCase();
  const subtype = (basicInfoOutput.subtype || '').toLowerCase();
  const role = (basicInfoOutput.role || '').toLowerCase();

  // Basic Info, Core Details, Stats, Character Build are ALWAYS required
  const routing: StageRoutingDecision = {
    basicInfo: {
      required: true,
      reason: 'Foundation stage - always required'
    },
    coreDetails: {
      required: true,
      reason: 'Personality and character depth - always required'
    },
    stats: {
      required: true,
      reason: 'Mechanical statistics - always required'
    },
    characterBuild: {
      required: true,
      reason: 'Class features, racial features, feats, ASI, background - always required'
    },
    combat: analyzeNeedsCombat(cr, hasClassLevels, description, request, role),
    spellcasting: analyzeNeedsSpellcasting(cr, hasClassLevels, basicInfoOutput, description, request, race, subtype),
    legendary: analyzeNeedsLegendary(cr, description, request, race, role),
    relationships: analyzeNeedsRelationships(description, request, role),
    equipment: analyzeNeedsEquipment(cr, hasClassLevels, description, request, role)
  };

  return routing;
}

/**
 * Parse challenge rating from various formats
 */
function parseChallenge(cr: unknown): number {
  if (typeof cr === 'number') return cr;
  if (typeof cr === 'string') {
    // Handle fractions like "1/4", "1/2"
    if (cr.includes('/')) {
      const [num, denom] = cr.split('/').map(Number);
      return num / denom;
    }
    return parseFloat(cr) || 0;
  }
  return 0;
}

/**
 * Check if character has class levels
 */
function hasClasses(classLevels: unknown): boolean {
  if (!classLevels || typeof classLevels !== 'object') return false;
  return Object.keys(classLevels).length > 0;
}

/**
 * Determine if Combat stage is needed
 */
function analyzeNeedsCombat(
  cr: number,
  hasClassLevels: boolean,
  description: string,
  request: string,
  role: string
): StageRequirement {
  // Combat keywords
  const combatKeywords = [
    'warrior', 'fighter', 'soldier', 'guard', 'knight', 'barbarian',
    'combat', 'battle', 'attack', 'weapon', 'armor',
    'bodyguard', 'mercenary', 'gladiator', 'champion'
  ];

  // Non-combat keywords
  const nonCombatKeywords = [
    'shopkeeper', 'merchant', 'scholar', 'librarian', 'scribe',
    'peaceful', 'non-combat', 'non-combatant', 'civilian',
    'child', 'elder', 'infant', 'baby'
  ];

  const hasCombatKeyword = combatKeywords.some(kw =>
    description.includes(kw) || request.includes(kw) || role.includes(kw)
  );

  const hasNonCombatKeyword = nonCombatKeywords.some(kw =>
    description.includes(kw) || request.includes(kw) || role.includes(kw)
  );

  // Explicit non-combatant
  if (hasNonCombatKeyword && !hasCombatKeyword) {
    return {
      required: false,
      reason: 'Non-combatant character - combat actions not needed'
    };
  }

  // CR 0 without combat keywords
  if (cr === 0 && !hasCombatKeyword && !hasClassLevels) {
    return {
      required: false,
      reason: 'CR 0 character with no combat indicators'
    };
  }

  // Default: include combat
  if (hasCombatKeyword) {
    return {
      required: true,
      reason: 'Combat-oriented character'
    };
  }

  if (cr >= 1 || hasClassLevels) {
    return {
      required: true,
      reason: 'Standard combatant (CR ≥ 1 or has class levels)'
    };
  }

  return {
    required: true,
    reason: 'Default combat capability'
  };
}

/**
 * Determine if Spellcasting stage is needed
 */
function analyzeNeedsSpellcasting(
  cr: number,
  _hasClassLevels: boolean,
  basicInfo: BasicInfoOutput,
  description: string,
  request: string,
  race: string,
  subtype: string
): StageRequirement {
  const classLevels = basicInfo.class_levels as Record<string, number> || {};

  // Spellcasting classes
  const spellcastingClasses = [
    'wizard', 'sorcerer', 'warlock', 'cleric', 'druid', 'bard',
    'paladin', 'ranger', 'artificer', 'eldritch knight', 'arcane trickster'
  ];

  // Check class levels for spellcasters
  const hasSpellcastingClass = Object.keys(classLevels).some(className =>
    spellcastingClasses.some(sc => className.toLowerCase().includes(sc))
  );

  // Spellcasting keywords
  const spellKeywords = [
    'spell', 'magic', 'mage', 'caster', 'arcane', 'divine',
    'sorcery', 'witch', 'warlock', 'wizard', 'cleric', 'druid',
    'enchant', 'conjure', 'summon', 'ritual', 'cantrip',
    'innate spellcasting', 'druidic magic', 'fey magic'
  ];

  // Innately magical races/types
  const magicalRaces = [
    'dragon', 'fey', 'celestial', 'fiend', 'demon', 'devil',
    'elemental', 'genasi', 'aasimar', 'tiefling', 'drow'
  ];

  const hasSpellKeyword = spellKeywords.some(kw =>
    description.includes(kw) || request.includes(kw)
  );

  const hasMagicalRace = magicalRaces.some(mr =>
    race.includes(mr) || subtype.includes(mr)
  );

  if (hasSpellcastingClass) {
    return {
      required: true,
      reason: `Has spellcasting class: ${Object.keys(classLevels).join(', ')}`
    };
  }

  if (hasSpellKeyword) {
    return {
      required: true,
      reason: 'Description indicates spellcasting ability'
    };
  }

  if (hasMagicalRace && cr >= 2) {
    return {
      required: true,
      reason: `Inherently magical creature (${race || subtype})`
    };
  }

  return {
    required: false,
    reason: 'No spellcasting indicators found'
  };
}

/**
 * Determine if Legendary Actions stage is needed
 */
function analyzeNeedsLegendary(
  cr: number,
  description: string,
  request: string,
  race: string,
  role: string
): StageRequirement {
  // Legendary keywords
  const legendaryKeywords = [
    'legendary', 'mythic', 'ancient dragon', 'demon lord', 'archdevil',
    'lich', 'vampire lord', 'titan', 'primordial', 'god', 'deity'
  ];

  const hasLegendaryKeyword = legendaryKeywords.some(kw =>
    description.includes(kw) || request.includes(kw) || race.includes(kw) || role.includes(kw)
  );

  // Explicit legendary request
  if (request.includes('legendary') || request.includes('mythic')) {
    return {
      required: true,
      reason: 'User explicitly requested legendary actions'
    };
  }

  // High CR threshold (11+ is legendary territory)
  if (cr >= 11) {
    return {
      required: true,
      reason: `High CR (${cr}) - legendary actions expected`
    };
  }

  // Keywords indicating legendary status
  if (hasLegendaryKeyword) {
    return {
      required: true,
      reason: 'Character is described as legendary/mythic'
    };
  }

  return {
    required: false,
    reason: `Standard character (CR ${cr}) - legendary actions not needed`
  };
}

/**
 * Determine if Relationships stage is needed
 */
function analyzeNeedsRelationships(
  description: string,
  request: string,
  role: string
): StageRequirement {
  // Relationship keywords
  const relationshipKeywords = [
    'npc', 'character', 'noble', 'lord', 'prince', 'king', 'queen',
    'merchant', 'guild', 'family', 'ally', 'rival', 'enemy',
    'friend', 'mentor', 'student', 'follower', 'leader',
    'faction', 'organization', 'court'
  ];

  // Monster keywords (less likely to need relationships)
  const monsterKeywords = [
    'beast', 'monster', 'creature', 'animal', 'undead', 'construct',
    'ooze', 'plant creature', 'mindless'
  ];

  const hasRelationshipKeyword = relationshipKeywords.some(kw =>
    description.includes(kw) || request.includes(kw) || role.includes(kw)
  );

  const hasMonsterKeyword = monsterKeywords.some(kw =>
    description.includes(kw) || request.includes(kw)
  );

  // Named characters usually have relationships
  if (request.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/) || description.match(/\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/)) {
    return {
      required: true,
      reason: 'Named character - likely has relationships'
    };
  }

  if (hasRelationshipKeyword && !hasMonsterKeyword) {
    return {
      required: true,
      reason: 'Social character with potential relationships'
    };
  }

  if (hasMonsterKeyword && !hasRelationshipKeyword) {
    return {
      required: false,
      reason: 'Monster/creature - relationships less relevant'
    };
  }

  // Default: include relationships (they add depth)
  return {
    required: true,
    reason: 'Relationships add character depth'
  };
}

/**
 * Determine if Equipment stage is needed
 */
function analyzeNeedsEquipment(
  cr: number,
  _hasClassLevels: boolean,
  description: string,
  request: string,
  role: string
): StageRequirement {
  // Equipment keywords
  const equipmentKeywords = [
    'armor', 'weapon', 'sword', 'shield', 'bow', 'staff',
    'gear', 'equipment', 'item', 'treasure', 'magic item',
    'warrior', 'knight', 'soldier', 'adventurer'
  ];

  // No equipment keywords
  const noEquipmentKeywords = [
    'beast', 'animal', 'ooze', 'plant', 'elemental',
    'incorporeal', 'spirit', 'ghost', 'naked', 'natural weapon'
  ];

  const hasEquipmentKeyword = equipmentKeywords.some(kw =>
    description.includes(kw) || request.includes(kw) || role.includes(kw)
  );

  const hasNoEquipmentKeyword = noEquipmentKeywords.some(kw =>
    description.includes(kw) || request.includes(kw)
  );

  // Explicit no equipment
  if (hasNoEquipmentKeyword && !hasEquipmentKeyword) {
    return {
      required: false,
      reason: 'Creature type does not use equipment'
    };
  }

  // Class levels usually mean equipment
  if (_hasClassLevels) {
    return {
      required: true,
      reason: 'Character with class levels typically has equipment'
    };
  }

  // Higher CR humanoids usually have equipment
  if (cr >= 1 && hasEquipmentKeyword) {
    return {
      required: true,
      reason: 'Combat-capable character with equipment indicators'
    };
  }

  // Default: include equipment (most NPCs have some gear)
  return {
    required: true,
    reason: 'Standard equipment loadout'
  };
}

/**
 * Get human-readable summary of routing decisions
 */
export function getRoutingSummary(routing: StageRoutingDecision): string {
  const included: string[] = [];
  const skipped: string[] = [];

  Object.entries(routing).forEach(([stage, requirement]) => {
    const stageName = stage.replace(/([A-Z])/g, ' $1').trim();
    const formatted = stageName.charAt(0).toUpperCase() + stageName.slice(1);

    if (requirement.required) {
      included.push(`✓ ${formatted}: ${requirement.reason}`);
    } else {
      skipped.push(`✗ ${formatted}: ${requirement.reason}`);
    }
  });

  return `Included Stages:\n${included.join('\n')}\n\nSkipped Stages:\n${skipped.join('\n')}`;
}
