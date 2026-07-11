/**
 * Structured planning contracts shared by the GMC integration routes.
 *
 * These objects deliberately describe JSON rather than validate game rules. GMC
 * authors durable intent; GMA/VCS remain responsible for resolving authoritative
 * movement, action economy, dice, damage, conditions, and encounter state.
 */

const mechanicalActionShape = {
  type: 'attack|spell|check|save|dash|disengage|dodge|help|hide|ready|search|use_object|interact|escape|surrender|other',
  actionId: 'stable available-action ID or null',
  name: 'string',
  targetId: 'combatant, token, object, zone, or hazard ID; null when untargeted',
  attackBonus: 'number or null',
  modifier: 'number or null',
  dc: 'number or null',
  saveDc: 'number or null',
  saveAbility: 'string or null',
  saveModifier: 'number or null',
  damage: [{ dice: 'string', bonus: 'number', type: 'string' }],
  onSuccessfulSave: 'half|none|null',
  conditions: ['string'],
  rollMode: 'normal|advantage|disadvantage',
  attacks: ['optional additional attack entries when one legal action grants multiple attacks'],
} as const;

const durableCombatPlanShape = {
  planId: 'stable string retained for the encounter',
  objectives: [{
    id: 'stable string',
    priority: 'integer; lower numbers run first',
    goal: 'short executable goal',
    targetId: 'combatant, token, object, zone, or hazard ID; null when none',
    completionCondition: 'machine-checkable condition using authoritative encounter state',
    failureCondition: 'machine-checkable condition or null',
    status: 'pending|active|achieved|failed|abandoned',
  }],
  behaviors: [{
    priority: 'integer; lower numbers run first',
    when: 'machine-checkable condition',
    do: 'move|attack|cast|interact|help|defend|flee|surrender|cower|beg|play_dead|take|trigger|speak|other',
    targetSelector: 'stable ID or deterministic selector such as assigned_target, nearest_hostile, or exit_zone',
    actionPreference: ['available action IDs or action names in preference order'],
    continueUntil: 'machine-checkable stop condition',
  }],
  morale: {
    defaultState: 'steady|uncertain|frightened|broken|fanatical',
    fightUntil: 'machine-checkable condition or null',
    fleeWhen: ['machine-checkable conditions'],
    surrenderWhen: ['machine-checkable conditions'],
    cowerWhen: ['machine-checkable conditions'],
    preserveSelf: 'boolean',
  },
  communication: {
    canSpeak: 'boolean',
    openingLine: 'string or null',
    orders: [{ when: 'machine-checkable condition', recipients: ['actor IDs or deterministic selectors'], message: 'string', effect: 'plan/target update or null' }],
    callForHelpWhen: ['machine-checkable conditions'],
    warnAlliesWhen: ['machine-checkable conditions'],
  },
} as const;

const encounterActorShape = {
  id: 'stable encounter actor ID; never use a counted group ID for multiple creatures',
  name: 'string',
  kind: 'npc|monster',
  role: 'string',
  disposition: 'hostile|ally|neutral',
  hitPoints: { current: 'number', max: 'number' },
  armorClass: 'number',
  speed: 'number',
  initiativeModifier: 'number',
  abilities: 'object',
  conditions: ['string'],
  gridX: 'number',
  gridY: 'number',
  actions: [mechanicalActionShape],
  bonusActions: [mechanicalActionShape],
  reactions: [mechanicalActionShape],
  combatPlan: durableCombatPlanShape,
} as const;

export const ENCOUNTER_PLANNING_OUTPUT_SCHEMA = {
  name: 'string',
  objective: 'legacy concise player-facing objective string',
  situation: 'concise present-tense tactical handoff',
  playerOptions: [{ label: 'string', description: 'string' }],
  map: {
    width: 'number',
    height: 'number',
    gridSize: 'number',
    feetPerCell: 'number',
    gridType: 'square|hex',
    imageUrl: 'string|null',
    walls: ['wall objects'],
    doors: ['door objects'],
    fogOfWar: 'object|null',
    zones: [{ id: 'stable string', kind: 'entry|exit|objective|hazard|terrain|other', gridCells: ['grid coordinates'], description: 'string' }],
  },
  playerStart: { gridX: 'number', gridY: 'number' },
  opponents: [encounterActorShape],
  allies: [encounterActorShape],
  encounterObjectives: [{
    id: 'stable string',
    side: 'player|hostile|ally|neutral|environment',
    description: 'string',
    targetIds: ['actor, token, object, zone, or hazard IDs'],
    completionCondition: 'machine-checkable condition',
    failureCondition: 'machine-checkable condition or null',
    initialStatus: 'pending|active',
  }],
  sidePlans: [{
    side: 'hostile|ally|neutral|environment',
    objectiveIds: ['encounter objective IDs'],
    coordination: [{ when: 'machine-checkable condition', orders: ['actor plan/target updates'] }],
  }],
  interactiveObjects: [{
    id: 'stable string',
    name: 'string',
    kind: 'cart|crate|door|lever|device|cover|objective|other',
    gridX: 'number',
    gridY: 'number',
    description: 'string',
    tokenSearch: {
      preferredAssetId: 'string|null',
      preferredImageUrl: 'string|null',
      queries: ['short image/token search strings'],
      tags: ['string'],
      genericLabel: '1-3 character fallback label',
      allowGeneric: 'boolean',
    },
    behavior: {
      state: 'JSON object with initial durable object state',
      interactions: [{ id: 'stable string', name: 'string', economy: 'action|bonus_action|free_object|none', requirements: ['machine-checkable conditions'], effects: ['structured object/token/objective state changes'] }],
      movement: { movable: 'boolean', speed: 'number|null', requiresActorCount: 'integer', actorRole: 'string|null' },
      objectiveIds: ['encounter objective IDs'],
      terminalStates: ['escaped|secured|destroyed|disabled|triggered|other'],
    },
  }],
  environmentalHazards: [{
    id: 'stable string',
    name: 'string',
    description: 'string',
    area: { shape: 'point|circle|square|line|cells|global', origin: 'grid coordinate or zone ID', size: 'number|null', cells: ['grid coordinates'] },
    tokenSearch: { queries: ['short image/token search strings'], tags: ['string'], genericLabel: '1-3 character fallback label', allowGeneric: 'boolean' },
    cadence: { phase: 'round_start|round_end|turn_start|turn_end|on_enter|on_exit|on_interact|initiative_count|continuous', everyRounds: 'integer', initiativeCount: 'integer|null' },
    triggers: [{ id: 'stable string', event: 'string', condition: 'machine-checkable condition', chance: 'number from 0 to 1 or null' }],
    effects: [{
      type: 'damage|save|condition|forced_movement|terrain|spawn|object_state|custom',
      targetSelector: 'deterministic selector',
      save: { ability: 'string|null', dc: 'number|null', onSuccess: 'half|negate|custom|null' },
      damage: [{ dice: 'string', bonus: 'number', type: 'string' }],
      conditions: ['string'],
      movement: 'structured forced-movement data or null',
      statePatch: 'structured hazard/object/terrain state patch or null',
    }],
    randomization: { method: 'none|chance|dice_table', dice: 'string|null', outcomes: ['structured weighted outcomes'] },
    mitigation: ['string'],
    active: 'boolean',
  }],
  gmNotes: 'string',
} as const;

export const COMBAT_TURN_OUTPUT_SCHEMA = {
  actorId: 'active non-player combatant ID',
  combatPlanId: 'durable combatPlan.planId or null for legacy rooms',
  objectiveStatus: {
    objectiveId: 'active objective ID or null',
    status: 'pending|active|achieved|failed|abandoned',
    achieved: 'boolean',
    reason: 'short state-based explanation',
    nextObjectiveId: 'string|null',
  },
  // Legacy fields retained for existing GMA consumers. They mirror the first
  // applicable movement/main-action operations in turnPlan.
  movement: { tokenId: 'string', gridX: 'number', gridY: 'number', reason: 'string' },
  action: mechanicalActionShape,
  actionName: 'legacy concise action label',
  tacticalReason: 'short state-based explanation',
  bonusAction: mechanicalActionShape,
  objectInteraction: {
    objectId: 'stable object token ID',
    interactionId: 'available interaction ID',
    economy: 'action|bonus_action|free_object|none',
    targetState: 'structured expected object-state patch or null',
    reason: 'string',
  },
  freeActions: [{ type: 'speak|drop_item|signal|other', text: 'string|null', targetIds: ['actor IDs'] }],
  speech: [{ text: 'string', recipients: ['actor IDs or deterministic selectors'], purpose: 'order|warning|plea|taunt|information|other' }],
  reaction: {
    action: mechanicalActionShape,
    triggers: [{ event: 'string', condition: 'machine-checkable condition', targetSelector: 'deterministic selector' }],
    reserve: 'boolean',
  },
  turnPlan: {
    objectiveId: 'active objective ID or null',
    steps: [{
      order: 'integer',
      economy: 'movement|action|bonus_action|free_object|free_action|reaction_policy|none',
      type: 'move|attack|spell|check|save|interact|help|defend|escape|surrender|cower|beg|play_dead|take|trigger|speak|other',
      payload: 'structured operation matching the relevant top-level field',
      reason: 'string',
    }],
    endState: 'short machine-checkable expected state when the plan succeeds',
  },
  combatPlanUpdate: {
    objectiveUpdates: ['structured objective status changes'],
    targetAssignments: ['structured actor-to-target assignments'],
    communicationUpdates: ['structured orders/warnings emitted this turn'],
    moraleState: 'steady|uncertain|frightened|broken|fanatical|null',
  },
  endTurn: 'boolean',
} as const;

export const PLAN_ENCOUNTER_REQUIRED_KEYS = [
  'name',
  'objective',
  'situation',
  'playerOptions',
  'map',
  'playerStart',
  'opponents',
  'allies',
  'encounterObjectives',
  'sidePlans',
  'interactiveObjects',
  'environmentalHazards',
  'gmNotes',
] as const;

export const PLAN_COMBAT_TURN_REQUIRED_KEYS = [
  'actorId',
  'combatPlanId',
  'objectiveStatus',
  'movement',
  'action',
  'actionName',
  'tacticalReason',
  'bonusAction',
  'objectInteraction',
  'freeActions',
  'speech',
  'reaction',
  'turnPlan',
  'combatPlanUpdate',
  'endTurn',
] as const;

export const PLAN_ENCOUNTER_INSTRUCTION = `Prepare a complete VCS encounter from the campaign context, current scene, player instruction, and player-character summary. Respect canon and safety boundaries. Do not decide player-character actions.

This is the durable preparation pass. Resolve likely non-player behavior before initiative so ordinary turns can follow stable objectives without another AI decision. Every creature is a discrete actor: a count of four laborers requires four actor entries with stable IDs and individual combatPlan values. Include every present hostile, ally, and neutral that can act.

For every non-player actor, provide complete combat statistics and available actions plus a durable combatPlan with ordered objectives, deterministic behaviors, morale break/flee/surrender/cower conditions, and communication orders/warnings. Objectives and plan IDs must remain stable for the life of the encounter. A behavior must say what state activates it and what state ends it; do not merely write flavor such as "acts intelligently."

Interactive objects are live encounter state, not decorative labels. Give each one a stable ID, location, tokenSearch metadata (preferred asset when known, concise queries/tags, and an allowed generic fallback), initial behavior state, executable interactions, movement/handler requirements, objective links, and terminal states. A cart-withdrawal plan must say exactly how handlers contribute, when the cart moves, and when it escapes or is secured.

Environmental hazards must be executable without per-turn improvisation. Include their area, cadence, triggers, effects, randomization, mitigation, and active state. Model flowing lava, erupting geysers, falling rocks, and similar pressures through explicit round/turn/event cadence and structured save/damage/condition/movement/state effects.

The legacy fields name, objective, situation, playerOptions, map, playerStart, opponents, and gmNotes are required and retain their existing meaning. The new fields are additive. Legacy hazards input may be treated as environmentalHazards, but always return environmentalHazards. Use practical in-bounds grid coordinates. Supply at least one executable action for each combat-capable actor. imageUrl may be null; walls, doors, zones, and fog still constitute an authoritative tactical map.

Return exactly one JSON object matching this schema:
${JSON.stringify(ENCOUNTER_PLANNING_OUTPUT_SCHEMA, null, 2)}`;

export const PLAN_COMBAT_TURN_INSTRUCTION = `Control exactly one active non-player combatant turn in the supplied authoritative VCS BattleRoom. Use only IDs, statistics, available token actions, targets, positions, encounter objectives, object state, hazards, and durable combat plans present in the supplied state. Never choose or alter the player character's actions. Use the combat time scale from gameTimePolicy: one round is about 6 seconds; do not narrate minutes passing inside one turn.

First evaluate the actor's current ordered combatPlan objectives against authoritative state. If the active objective is achieved, failed, or impossible, record that status and continue to the next objective or deterministic contingency. Otherwise maximize the actor's legal movement, action, bonus action, free object interaction, speech/free actions, and reaction policy toward that objective. Respect morale and communication triggers. Continue a still-valid simple instruction (for example, attack the assigned shield bearer while both remain able to fight) without inventing a new strategy.

Return a complete turn, not one isolated activity. turnPlan.steps gives execution order. movement, action, actionName, tacticalReason, and endTurn are legacy fields and must still be returned; movement and action mirror the first applicable operations from turnPlan for existing GMA clients. Return null explicitly for an unavailable movement, action, bonusAction, objectInteraction, or reaction. Return empty arrays for unused freeActions and speech.

Use objectInteraction for carts, levers, cargo, doors, hazards, and other encounter objects. Use an escape/surrender/cower/beg/play-dead step when the durable plan and morale require it; never claim a token left the encounter unless the step identifies the exit/terminal state for VCS to record. reaction reserves a legal response to a future trigger; it does not claim the reaction already occurred. Do not supply manual dice rolls, invent actions, or narrate hits, misses, damage, defeat, movement completion, or objective completion before VCS records them.

Return exactly one JSON object matching this schema:
${JSON.stringify(COMBAT_TURN_OUTPUT_SCHEMA, null, 2)}`;

