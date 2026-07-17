import { describe, expect, it } from 'vitest';
import {
  AUDIT_RESOLVED_MECHANICS_NARRATION_INSTRUCTION,
  AUDIT_RESOLVED_MECHANICS_NARRATION_REQUIRED_KEYS,
  COMBAT_TURN_OUTPUT_SCHEMA,
  ENCOUNTER_PLANNING_OUTPUT_SCHEMA,
  NARRATE_COMBAT_ACTION_RESULT_INSTRUCTION,
  NARRATE_COMBAT_ACTION_RESULT_REQUIRED_KEYS,
  NARRATE_COMBAT_TURNS_INSTRUCTION,
  NARRATE_COMBAT_TURNS_REQUIRED_KEYS,
  PLAN_COMBAT_TURN_INSTRUCTION,
  PLAN_COMBAT_TURN_REQUIRED_KEYS,
  PLAN_ENCOUNTER_INSTRUCTION,
  PLAN_ENCOUNTER_REQUIRED_KEYS,
} from './gmcV1PlanningContracts.js';

describe('GMC encounter planning contract', () => {
  it('retains legacy encounter fields while requiring durable preparation fields', () => {
    expect(PLAN_ENCOUNTER_REQUIRED_KEYS).toEqual(expect.arrayContaining([
      'name',
      'objective',
      'situation',
      'playerOptions',
      'map',
      'playerStart',
      'opponents',
      'gmNotes',
    ]));
    expect(PLAN_ENCOUNTER_REQUIRED_KEYS).toEqual(expect.arrayContaining([
      'allies',
      'encounterObjectives',
      'sidePlans',
      'interactiveObjects',
      'environmentalHazards',
    ]));
  });

  it('gives each discrete actor a durable objective, behavior, morale, and communication plan', () => {
    const actor = ENCOUNTER_PLANNING_OUTPUT_SCHEMA.opponents[0];

    expect(actor.id).toMatch(/stable encounter actor ID/i);
    expect(actor.actions).toHaveLength(1);
    expect(actor.bonusActions).toHaveLength(1);
    expect(actor.reactions).toHaveLength(1);
    expect(actor.equipment).toHaveLength(1);
    expect(actor.carriedInventory).toEqual(expect.objectContaining({
      equipped: expect.any(Array),
      coin: expect.any(Object),
      documents: expect.any(Array),
    }));
    expect(actor.combatPlan.planId).toMatch(/stable string/i);
    expect(actor.combatPlan.objectives[0]).toEqual(expect.objectContaining({
      id: expect.any(String),
      completionCondition: expect.any(String),
      status: expect.stringContaining('achieved'),
    }));
    expect(actor.combatPlan.behaviors[0]).toEqual(expect.objectContaining({
      when: expect.any(String),
      do: expect.stringContaining('flee'),
      continueUntil: expect.any(String),
    }));
    expect(actor.combatPlan.morale).toEqual(expect.objectContaining({
      fleeWhen: expect.any(Array),
      surrenderWhen: expect.any(Array),
      cowerWhen: expect.any(Array),
    }));
    expect(actor.combatPlan.communication).toEqual(expect.objectContaining({
      orders: expect.any(Array),
      warnAlliesWhen: expect.any(Array),
    }));
    expect(PLAN_ENCOUNTER_INSTRUCTION).toContain('a count of four laborers requires four actor entries');
    expect(PLAN_ENCOUNTER_INSTRUCTION).toContain('remain stable for the life of the encounter');
    expect(PLAN_ENCOUNTER_INSTRUCTION).toContain('Populate equipment and carriedInventory before combat');
  });

  it('defines executable object token-search/behavior and environmental-hazard metadata', () => {
    const object = ENCOUNTER_PLANNING_OUTPUT_SCHEMA.interactiveObjects[0];
    const hazard = ENCOUNTER_PLANNING_OUTPUT_SCHEMA.environmentalHazards[0];

    expect(object.tokenSearch).toEqual(expect.objectContaining({
      queries: expect.any(Array),
      tags: expect.any(Array),
      genericLabel: expect.any(String),
      allowGeneric: expect.any(String),
    }));
    expect(object.behavior).toEqual(expect.objectContaining({
      state: expect.any(String),
      interactions: expect.any(Array),
      movement: expect.objectContaining({ requiresActorCount: expect.any(String) }),
      terminalStates: expect.any(Array),
    }));
    expect(hazard).toEqual(expect.objectContaining({
      cadence: expect.objectContaining({ phase: expect.stringContaining('round_start') }),
      triggers: expect.any(Array),
      effects: expect.any(Array),
      randomization: expect.objectContaining({ method: expect.stringContaining('dice_table') }),
    }));
    expect(hazard.triggers[0]).toEqual(expect.objectContaining({
      event: expect.any(String),
      condition: expect.any(String),
      chance: expect.any(String),
    }));
    expect(hazard.effects[0]).toEqual(expect.objectContaining({
      type: expect.stringContaining('damage'),
      targetSelector: expect.any(String),
      save: expect.any(Object),
      damage: expect.any(Array),
      statePatch: expect.any(String),
    }));
    expect(PLAN_ENCOUNTER_INSTRUCTION).toContain('A cart-withdrawal plan must say exactly how handlers contribute');
    expect(PLAN_ENCOUNTER_INSTRUCTION).toContain('flowing lava, erupting geysers, falling rocks');
  });
});

describe('GMC non-player turn planning contract', () => {
  it('retains the legacy one-move/one-action fields and adds the complete action economy', () => {
    expect(PLAN_COMBAT_TURN_REQUIRED_KEYS).toEqual(expect.arrayContaining([
      'actorId',
      'movement',
      'action',
      'actionName',
      'tacticalReason',
      'actionEconomy',
      'candidateScores',
      'narrationCues',
      'endTurn',
    ]));
    expect(PLAN_COMBAT_TURN_REQUIRED_KEYS).toEqual(expect.arrayContaining([
      'combatPlanId',
      'objectiveStatus',
      'bonusAction',
      'objectInteraction',
      'freeActions',
      'speech',
      'reaction',
      'turnPlan',
      'combatPlanUpdate',
    ]));
    expect(COMBAT_TURN_OUTPUT_SCHEMA.turnPlan.steps[0].economy).toContain('movement');
    expect(COMBAT_TURN_OUTPUT_SCHEMA.turnPlan.steps[0].economy).toContain('bonus_action');
    expect(COMBAT_TURN_OUTPUT_SCHEMA.turnPlan.steps[0].economy).toContain('free_object');
    expect(COMBAT_TURN_OUTPUT_SCHEMA.turnPlan.steps[0].economy).toContain('reaction_policy');
    expect(COMBAT_TURN_OUTPUT_SCHEMA.reaction).toEqual(expect.objectContaining({
      action: expect.any(Object),
      triggers: expect.any(Array),
      reserve: expect.any(String),
    }));
    expect(COMBAT_TURN_OUTPUT_SCHEMA.actionEconomy).toEqual(expect.objectContaining({
      before: expect.any(Object), after: expect.any(Object), unusedReasons: expect.any(Array),
    }));
    expect(COMBAT_TURN_OUTPUT_SCHEMA.candidateScores).toEqual(expect.any(Array));
  });

  it('requires objective checks, deterministic continuation, object use, speech, morale, and terminal intent', () => {
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('HIGHEST PRIORITY: optimize');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain("First evaluate the actor's ordered combatPlan objectives");
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('Continue a still-valid simple instruction');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('Return a complete turn, not one isolated activity');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('Use objectInteraction for carts, levers, cargo, doors, hazards');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('escape/surrender/cower/beg/play-dead step');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('Return null explicitly');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('legacy fields');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('Ready is a main action');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('A combatant at 0 HP');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('Ready trigger that depends on such an actor voluntarily moving is illegal');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('custody or secure_prisoner');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('If no hostile remains able and willing to contest the encounter');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('mechanicalPayoff');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('Provide narrationCues for dynamic post-mechanics narration');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('predicate fragments of at least six words');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('Never return one-word equipment/status labels');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('underscore-delimited state codes');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('never begin with the actor name or he, she, they, it, his, her, their, or its');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('Speech is in-world dialogue only');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('Opposition is finished. End initiative.');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('numeric mechanics remain in the structured result');
  });
});

describe('GMC post-mechanics combat narration contract', () => {
  it('requires complete ordered coverage without inventing or exposing mechanics', () => {
    expect(NARRATE_COMBAT_TURNS_REQUIRED_KEYS).toEqual([
      'narration',
      'coveredTurnIds',
      'continuityNotes',
      'gmPrivateNotes',
    ]);
    expect(NARRATE_COMBAT_TURNS_INSTRUCTION).toContain('VCS has already resolved');
    expect(NARRATE_COMBAT_TURNS_INSTRUCTION).toContain('every supplied turnId exactly once');
    expect(NARRATE_COMBAT_TURNS_INSTRUCTION).toContain('Zero damage');
    expect(NARRATE_COMBAT_TURNS_INSTRUCTION).toContain('Quoted dialogue must be copied verbatim');
    expect(NARRATE_COMBAT_TURNS_INSTRUCTION).toContain('Do not invent attacks, spells, movement');
    expect(NARRATE_COMBAT_TURNS_INSTRUCTION).toContain('Never expose numbers or rules/interface language');
    expect(NARRATE_COMBAT_TURNS_INSTRUCTION).toContain('Do not describe a future Ready response as already triggered');
  });

  it('gives resolved player combat a dedicated no-fallback fidelity contract', () => {
    expect(NARRATE_COMBAT_ACTION_RESULT_REQUIRED_KEYS).toContain('narration');
    expect(NARRATE_COMBAT_ACTION_RESULT_INSTRUCTION).toContain('already-resolved player combat action');
    expect(NARRATE_COMBAT_ACTION_RESULT_INSTRUCTION).toContain('A hit with zero damage is harmless');
    expect(NARRATE_COMBAT_ACTION_RESULT_INSTRUCTION).toContain('Do not invent words or decisions for the player character');
    expect(NARRATE_COMBAT_ACTION_RESULT_INSTRUCTION).toContain('no dice, rolls, modifiers, totals, damage totals, HP, AC, DC');
    expect(NARRATE_COMBAT_ACTION_RESULT_INSTRUCTION).toContain('one to three connected present-tense paragraphs');
  });

  it('audits every resolved-mechanics narration claim against a narrow source boundary', () => {
    expect(AUDIT_RESOLVED_MECHANICS_NARRATION_REQUIRED_KEYS).toEqual([
      'valid', 'issues', 'correctedNarration', 'claimAudit',
    ]);
    expect(AUDIT_RESOLVED_MECHANICS_NARRATION_INSTRUCTION).toContain('sentence by sentence');
    expect(AUDIT_RESOLVED_MECHANICS_NARRATION_INSTRUCTION).toContain('matchingOutcomeStake is the maximum new result');
    expect(AUDIT_RESOLVED_MECHANICS_NARRATION_INSTRUCTION).toContain('No character or NPC may perform a new action');
    expect(AUDIT_RESOLVED_MECHANICS_NARRATION_INSTRUCTION).toContain('thematic plausibility is not support');
    expect(AUDIT_RESOLVED_MECHANICS_NARRATION_INSTRUCTION).toContain('Do not replace a rejected detail with an unsupported synonym');
    expect(AUDIT_RESOLVED_MECHANICS_NARRATION_INSTRUCTION).toContain('authorizedNarrationSources is the exhaustive evidence set');
    expect(AUDIT_RESOLVED_MECHANICS_NARRATION_INSTRUCTION).toContain('Copy the complete sentence verbatim into claim');
    expect(AUDIT_RESOLVED_MECHANICS_NARRATION_INSTRUCTION).toContain('sourceEvidence:[{source,sourceText}]');
  });
});
