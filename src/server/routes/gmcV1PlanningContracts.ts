/**
 * Structured planning contracts shared by the GMC integration routes.
 *
 * These objects deliberately describe JSON rather than validate game rules. GMC
 * authors durable intent; GMA/VCS remain responsible for resolving authoritative
 * movement, action economy, dice, damage, conditions, and encounter state.
 */

const mechanicalActionShape = {
  type: 'attack|spell|check|save|dash|disengage|dodge|help|hide|ready|search|use_object|interact|escape|surrender|custody|secure_prisoner|other',
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
  mechanicalPayoff: 'required for Help, Dodge, Ready, and Use Object; exact VCS state/roll/object progress changed',
  trigger: {
    event: 'movement|attack|spell|action|object_interaction|manual',
    description: 'observable trigger condition; required for Ready',
    actorId: 'specific triggering actor ID or null',
    targetId: 'specific triggering target ID or null',
  },
  response: 'for Ready only: one complete executable attack|spell|check|save mechanicalActionShape; never prose',
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
  canonicalEntityId: 'matching campaign-canon entity ID or null',
  name: 'identity only: canonical/personal name, or numbered type label when deliberately unidentified',
  description: 'physical/behavioral description; never use this as name',
  appearance: 'optional visual details kept separate from name',
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
  equipment: [{ name: 'string', kind: 'weapon|armor|shield|consumable|tool|gear|other', quantity: 'number', equipped: 'boolean', notes: 'string|null' }],
  carriedInventory: {
    equipped: [{ name: 'string', kind: 'string', quantity: 'number' }],
    coin: { cp: 'number', sp: 'number', ep: 'number', gp: 'number', pp: 'number' },
    documents: ['specific fixed documents carried before combat'],
    consumables: ['specific fixed consumables carried before combat'],
    concealedItems: ['specific fixed concealed items; discovery may require a check but existence never changes'],
    other: ['specific fixed carried possessions'],
  },
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
  actionEconomy: {
    before: { action: 'available|spent', bonusAction: 'available|spent', reaction: 'available|spent', movementFeet: 'number', freeObject: 'available|spent' },
    after: { action: 'available|spent', bonusAction: 'available|spent', reaction: 'available|reserved|spent', movementFeet: 'number', freeObject: 'available|spent' },
    unusedReasons: ['rules/state-based reason for every available capacity left unused'],
  },
  candidateScores: [{
    package: 'short description of one legal movement/action package',
    objectiveProgress: 'number 0-5',
    mechanicalImpact: 'number 0-5',
    survival: 'number 0-5',
    resourceCost: 'number 0-5 where lower cost scores higher',
    coordination: 'number 0-5',
    total: 'number',
    legal: 'boolean',
    reason: 'short state-based explanation',
  }],
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
  narrationCues: {
    movement: 'present-tense predicate fragment beginning with a vivid physical verb; no actor name or subject/possessive pronoun',
    action: 'present-tense predicate fragment with a concrete sensory or object detail; no actor name, subject/possessive pronoun, hit/miss/damage, or rules language',
    impactStyle: 'cinematic tone cue for later post-mechanics narration',
    speechTone: 'delivery/tone cue or null',
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
  'actionEconomy',
  'candidateScores',
  'bonusAction',
  'objectInteraction',
  'freeActions',
  'speech',
  'reaction',
  'narrationCues',
  'turnPlan',
  'combatPlanUpdate',
  'endTurn',
] as const;

export const NARRATE_COMBAT_TURNS_REQUIRED_KEYS = [
  'narration',
  'coveredTurnIds',
  'continuityNotes',
  'gmPrivateNotes',
] as const;

export const NARRATE_COMBAT_TURNS_INSTRUCTION = `Render the supplied executedTurns as one polished player-facing combat passage. VCS has already resolved every movement, roll, hit, miss, damage result, condition, object change, departure, and initiative change. Those authoritative results are immutable. You are narrating them, never planning, recomputing, correcting, or extending them.

NARRATIVE QUALITY:
- Write vivid present-tense fantasy prose with concrete body movement, weapon or spell behavior, impact, sound, texture, light, weather, terrain, and immediate consequence grounded in sceneContext.
- Preserve the supplied turn order. Give every executed turn a distinct beat and connect consecutive turns into a flowing exchange instead of a list of reports.
- Vary sentence length and openings. Introduce a full actor name once, then use a natural title, surname, pronoun, or physical reference. Never begin consecutive sentences with the same display name.
- Show intent through action. Avoid abstract summaries such as “follows through,” “turns the choice into pressure,” “still contests the area,” “becomes operational guidance,” or “takes the action.”
- Use dialogue only when that exact line appears in executedTurns.speech. Quoted dialogue must be copied verbatim; do not invent new speech, knowledge, commands, threats, or reactions.

MECHANICAL FIDELITY:
- Mention each turn exactly once and return every supplied turnId exactly once in coveredTurnIds, in the same order.
- A miss remains a miss. Zero damage must be rendered as a deflection, failed purchase, resistance, or harmless effect appropriate to the supplied action—not as an injury. A defeated target falls or becomes unable to continue only when the result says defeated or HP reaches zero. A departure occurs only when supplied.
- Do not invent attacks, spells, movement, wounds, object progress, conditions, reactions, dialogue, discoveries, reinforcements, objectives, or player-character actions.
- Never expose numbers or rules/interface language: no damage totals, HP, AC, DC, dice, grids, squares, turns, rounds, initiative, action economy, action/bonus action/reaction bookkeeping, VCS, GMA, GMC, schemas, IDs, state codes, or validation language.
- Do not describe a future Ready response as already triggered. Describe only the stance, watched opening, and supplied observable trigger.

Return exactly {narration,coveredTurnIds,continuityNotes,gmPrivateNotes}. narration is one complete passage ready to show the player. coveredTurnIds is the ordered array of supplied turnId values. continuityNotes and gmPrivateNotes are arrays for private diagnostics and must never be embedded in narration.`;

export const NARRATE_COMBAT_ACTION_RESULT_REQUIRED_KEYS = [
  'narration',
  'proposedCanonChanges',
  'proposedVcsExports',
  'riskLevel',
  'syncNotes',
  'gmPrivateNotes',
] as const;

export const NARRATE_COMBAT_ACTION_RESULT_INSTRUCTION = `Narrate exactly one already-resolved player combat action as polished player-facing fantasy prose. authoritativeMechanicalResult and authoritativeCombatOutcome came from VCS and are immutable. The rollRequest identifies the declared action, target, weapon or spell, nonlethal intent, and relevant circumstances. Render the result; never plan, recompute, repair, extend, or replay it.

NARRATIVE QUALITY:
- Write one to three connected present-tense paragraphs grounded in the supplied scene, recent conversation, combatants, terrain, light, sound, weapon or spell behavior, body movement, impact, and immediate observable consequence.
- Begin at the instant of the declared action without recapping the whole encounter. Vary sentence rhythm and references; do not write a dry event report or repeat a display name at the start of consecutive sentences.
- Show the result through fiction. Never say that an action “resolves,” that a mechanic “succeeds,” or that a system “records” anything.
- Do not invent words or decisions for the player character. Do not invent NPC dialogue, knowledge, reinforcements, discoveries, loot, movement, follow-up attacks, reactions, conditions, or scene outcomes absent from the supplied state.

MECHANICAL FIDELITY:
- A miss makes no damaging contact. A hit with zero damage is harmless but still contacts the declared target; do not relocate the impact to scenery. Show only target contact that turns aside, fails to penetrate, meets resistance, or dissipates without injury, lost balance, forced movement, a condition, delayed impairment, or invented protective equipment. Positive damage produces only an injury proportionate to the result. The target falls, becomes unconscious, dies, or can no longer continue only when authoritativeMechanicalResult says so. Preserve nonlethal intent exactly.
- Do not expose or paraphrase numbers and rules/interface language: no dice, rolls, modifiers, totals, damage totals, HP, AC, DC, grids, squares, initiative, action economy, VCS, GMA, GMC, schemas, IDs, state codes, outcome labels, or validation language.
- Do not claim authoritative target-state mutation beyond the supplied result. Standalone combat can describe this immediate exchange but must not invent a larger encounter transition.

Use sceneSegmentPolicy, sceneImportancePolicy, narrativeMomentumPolicy, gameTimePolicy, and campaign canon only to preserve continuity around this exact result. Put diagnostics in gmPrivateNotes, never in narration. Return {narration,proposedCanonChanges,proposedVcsExports,proposedTimeAdvance,sceneSegmentUpdate,riskLevel,syncNotes,gmPrivateNotes}.`;

export const AUDIT_RESOLVED_MECHANICS_NARRATION_REQUIRED_KEYS = [
  'valid',
  'issues',
  'correctedNarration',
  'claimAudit',
] as const;

export const AUDIT_RESOLVED_MECHANICS_NARRATION_INSTRUCTION = `Act as a strict event-fidelity auditor for prose written after an already-completed VCS skill check or combat action. Do not reward creativity and do not continue the story. Compare candidateNarration sentence by sentence against authorizedNarrationSources and the narrow resolvedMechanicsContract. authorizedNarrationSources is the exhaustive evidence set; other campaign payloads are context only and cannot authorize a claim.

SOURCE BOUNDARY:
- instruction authorizes only the player actions it actually states. It does not authorize signaling allies, speaking, moving onward, manipulating another object, selecting a route, readying another action, or making a new decision unless that step is explicitly present.
- matchingOutcomeStake is the maximum new result the check may establish. A generic direction does not authorize naming north, south, east, west, a particular branch, distance, lead, identity, injury, limp, equipment, residue, smell, hidden route, or further clue.
- authoritativeMechanicalResult and authoritativeOutcome are immutable. Do not reinterpret, recompute, or enlarge them. A zero-damage hit cannot injure, impede, move, stagger, slow, frighten, or disarm the target. A miss cannot make damaging contact. A non-defeat cannot drop or incapacitate the target.
- conversationHistory and sceneContext may support already-visible setting and continuity only. They do not authorize a new event. campaignContext may disambiguate names but is not an authorized narration source and may not be mined for a motif, clue, hazard, NPC, route, material, or sensory detail merely to enrich this beat.
- No character or NPC may perform a new action that is absent from instruction and the mechanic. No invented dialogue. No player thoughts, breath, emotion, expertise, or body reaction unless directly inherent in the declared action and established context.
- Concrete materials, construction, equipment, surface conditions, measurements, route directions, and sensory properties must appear in the supplied sources. Ordinary connective prose is allowed; new durable or tactical facts are not.

AUDIT METHOD:
1. Split candidateNarration into its exact sentences. Return exactly one claimAudit entry per sentence. Copy the complete sentence verbatim into claim; do not summarize, split, omit, or add a claim.
2. Every claimAudit entry must be {claim,sourceEvidence,unsupportedDetails,problem}. sourceEvidence is an array of {source,sourceText}, where source is exactly one of instruction, matchingOutcomeStake, rollRequest, authoritativeMechanicalResult, authoritativeOutcome, conversationHistory, or sceneContext, and sourceText is a verbatim quote present under that exact key in authorizedNarrationSources. Cite every source needed by the sentence. Never return an evidence item merely because it is thematically related.
3. unsupportedDetails is an array of every concrete or event-bearing detail in the sentence that no cited verbatim source directly supports. A paraphrase may be stylish, but it cannot add coldness, dampness, bars, groaning, rhythm, architecture, a material, a direction, an emotional judgment, or any other sensory or tactical property absent from the evidence; thematic plausibility is not support.
4. Mark valid false for any unsupported detail, added player/NPC action, enlarged outcome, mechanics contradiction, rules/interface language, private diagnostic, missing sentence, missing source quote, or source quote that is not verbatim in authorizedNarrationSources.
5. If valid is true, correctedNarration must equal candidateNarration byte-for-byte. If valid is false, correctedNarration must retain vivid supported prose while removing every invalid claim. Do not replace a rejected detail with an unsupported synonym. Do not introduce a new detail during correction.
6. When deterministicFidelityIssues is supplied, every named issue and offending detail is a binding rejection. On later reviewPass values, audit the proposed correction from scratch and still return the full exact-sentence claimAudit with evidence.

Return exactly {valid,issues:[{code,explanation,claim}],correctedNarration,claimAudit:[{claim,sourceEvidence:[{source,sourceText}],unsupportedDetails,problem}]}. valid is true only when every sentence is fully supported and unchanged.`;

export const PLAN_ENCOUNTER_INSTRUCTION = `Prepare a complete VCS encounter from the campaign context, current scene, player instruction, and player-character summary. Respect canon and safety boundaries. Do not decide player-character actions.

This is the durable preparation pass. Resolve likely non-player behavior before initiative so ordinary turns can follow stable objectives without another AI decision. Every creature is a discrete actor: a count of four laborers requires four actor entries with stable IDs and individual combatPlan values. Include every present hostile, ally, and neutral that can act.

For every non-player actor, provide complete combat statistics and available actions plus a durable combatPlan with ordered objectives, deterministic behaviors, morale break/flee/surrender/cower conditions, and communication orders/warnings. Match existing participants to campaign canon by canonicalEntityId and reconcile name, description, statistics, equipment, weapons, spells, and actions before returning them; canon capabilities may not be silently omitted or replaced with generic mechanics. The name field is identity only. Put face shape, scars, height, age, clothing, and similar prose in description/appearance. Give newly introduced people stable personal names; use numbered type labels such as "Thug 1" only for deliberately unidentified extras. Every weapon or damaging ability the actor can use must have an executable non-placeholder action name with attack/save mechanics and fixed damage entries. Never return "Spell", "Attack", "Weapon Attack", an unnamed action, or a damaging action with no valid positive-capable damage expression. Utility and condition-only spells must be explicitly marked rather than represented as attacks. Populate equipment and carriedInventory before combat, including equipped weapons and armor, exact coin, documents, consumables, concealed items, and other loot. Combat-capable magic items and weapons are equipped and represented in actions unless a specific fictional reason says otherwise. Objectives and plan IDs must remain stable for the life of the encounter. A behavior must say what state activates it and what state ends it; do not merely write flavor such as "acts intelligently."

Interactive objects are live encounter state, not decorative labels. Give each one a stable ID, location, tokenSearch metadata (preferred asset when known, concise queries/tags, and an allowed generic fallback), initial behavior state, executable interactions, movement/handler requirements, objective links, and terminal states. A cart-withdrawal plan must say exactly how handlers contribute, when the cart moves, and when it escapes or is secured.

Environmental hazards must be executable without per-turn improvisation. Include their area, cadence, triggers, effects, randomization, mitigation, and active state. Model flowing lava, erupting geysers, falling rocks, and similar pressures through explicit round/turn/event cadence and structured save/damage/condition/movement/state effects.

The legacy fields name, objective, situation, playerOptions, map, playerStart, opponents, and gmNotes are required and retain their existing meaning. The new fields are additive. Legacy hazards input may be treated as environmentalHazards, but always return environmentalHazards. Use practical in-bounds grid coordinates. Supply at least one executable action for each combat-capable actor. imageUrl may be null; walls, doors, zones, and fog still constitute an authoritative tactical map.

Return exactly one JSON object matching this schema:
${JSON.stringify(ENCOUNTER_PLANNING_OUTPUT_SCHEMA, null, 2)}`;

export const PLAN_COMBAT_TURN_INSTRUCTION = `Control exactly one active non-player combatant turn in the supplied authoritative VCS BattleRoom. Use only IDs, statistics, available token actions, targets, positions, encounter objectives, object state, hazards, and durable combat plans present in the supplied state. Never choose or alter the player character's actions. Use the combat time scale from gameTimePolicy: one round is about 6 seconds; do not narrate minutes passing inside one turn.

HIGHEST PRIORITY: optimize the actor's complete legal action economy toward the durable objective. First evaluate the actor's ordered combatPlan objectives against authoritative state. If the active objective is achieved, failed, or impossible, record that status and continue to the next objective or deterministic contingency. Otherwise build at least two legal movement/action packages from the supplied available actions and nearby object interactions, score them in candidateScores for objective progress, mechanical impact, survival, resource cost, and coordination, then choose the highest-value legal package. Maximize useful movement, action, bonus action, free object interaction, speech/free actions, and reaction policy. Every available capacity left unused needs a concrete rules/state-based explanation in actionEconomy.unusedReasons. Respect morale and communication triggers. Continue a still-valid simple instruction (for example, attack the assigned shield bearer while both remain able to fight) without inventing a new strategy.

Return a complete turn, not one isolated activity. turnPlan.steps gives execution order. movement, action, actionName, tacticalReason, and endTurn are legacy fields and must still be returned; movement and action mirror the first applicable operations from turnPlan for existing GMA clients. Return null explicitly for an unavailable movement, action, bonusAction, objectInteraction, or reaction. Return empty arrays for unused freeActions and speech.

Use objectInteraction for carts, levers, cargo, doors, hazards, and other encounter objects. Use an escape/surrender/cower/beg/play-dead step when the durable plan and morale require it; never claim a token left the encounter unless the step identifies the exit/terminal state for VCS to record. Help, Dodge, Ready, and Use Object require mechanicalPayoff naming the exact roll, condition, action-economy flag, or object state they change; narrative-only labels such as “Cover the Arrest” are illegal no-ops.

Ready is a main action, not merely a reaction policy. To Ready, set action.type to ready and include mechanicalPayoff, a structured trigger with an observable event and description, and response with one complete executable attack, spell, check, or save. The main action is spent immediately; VCS persists the declaration and spends the reaction only if the trigger matches. The top-level reaction field is for ordinary future reaction policy and cannot substitute for a Ready main action.

Treat authoritative incapacitation and custody state as binding. A combatant at 0 HP, or with defeated, unconscious, incapacitated, surrendered, restrained, in_custody, captured, escaped, or removed, cannot voluntarily move, attack, resist, speak normally, or satisfy a Ready trigger unless VCS first records recovery or release. Do not attack, threaten, Help against, or Ready against a surrendered, compliant, downed, or captured actor. A Ready trigger that depends on such an actor voluntarily moving is illegal. When a Watch/allied actor is adjacent and the durable objective calls for custody, use custody or secure_prisoner with the exact targetId and a mechanicalPayoff that applies restrained/in_custody; do not substitute flavor-only assistance. If no hostile remains able and willing to contest the encounter, return terminal objective updates instead of inventing another combat turn so GMA can end initiative and narrate escaped enemies, prisoners, and unresolved objects as aftermath consequences.

Provide narrationCues for dynamic post-mechanics narration. movement and action must be predicate fragments of at least six words beginning with a vivid present-tense verb; never begin with the actor name or he, she, they, it, his, her, their, or its. Include a concrete body movement, object, texture, sound, light, weather, or terrain detail. Avoid abstract report language such as “follows through,” “becomes operational guidance,” “still contesting,” or “turns the choice into pressure.” Never return one-word equipment/status labels such as Drawn, Sheathed, Readied, or Secured, and never return underscore-delimited state codes as prose. The cues may describe intent and motion but never claim hit, miss, damage, defeat, completed movement, or objective completion before VCS records the result.

Speech is in-world dialogue only. Characters do not speak in rules or interface terms: never put initiative, turns, rounds, actions, reactions, action economy, HP, AC, DC, grids, VCS/GMA, “tactical phase,” objective status, or similar bookkeeping into their mouths. Translate the same intent into a concrete order, warning, threat, plea, observation, or sensory fact. Bad: “Opposition is finished. End initiative.” Good: “Bind the living. Bag the evidence. No one touches that chain until the ward-reader clears it.” Post-mechanics narration dramatizes results as movement, impact, wounds, sound, and consequence; numeric mechanics remain in the structured result. Do not supply manual dice rolls or invent actions.

Return exactly one JSON object matching this schema:
${JSON.stringify(COMBAT_TURN_OUTPUT_SCHEMA, null, 2)}`;
