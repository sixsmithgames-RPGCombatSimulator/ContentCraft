import { describe, expect, it } from 'vitest';
import {
  COMBAT_TURN_OUTPUT_SCHEMA,
  ENCOUNTER_PLANNING_OUTPUT_SCHEMA,
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
  });

  it('requires objective checks, deterministic continuation, object use, speech, morale, and terminal intent', () => {
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain("First evaluate the actor's current ordered combatPlan objectives");
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('Continue a still-valid simple instruction');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('Return a complete turn, not one isolated activity');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('Use objectInteraction for carts, levers, cargo, doors, hazards');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('escape/surrender/cower/beg/play-dead step');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('Return null explicitly');
    expect(PLAN_COMBAT_TURN_INSTRUCTION).toContain('legacy fields');
  });
});
