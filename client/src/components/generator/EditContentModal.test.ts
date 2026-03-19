import { describe, expect, it } from 'vitest';
import { synchronizeStructuredContentContainers } from './EditContentModal';

describe('EditContentModal helpers', () => {
  it('synchronizes lifted npc fields without flattening structured arrays', () => {
    const synced = synchronizeStructuredContentContainers({
      appearance: 'Weathered veteran',
      skill_proficiencies: [{ name: 'Perception', value: '+6', notes: 'keen senses' }],
      actions: [{
        name: 'Saber Slash',
        description: 'Melee Weapon Attack.',
        statLine: '+8 to hit',
        sourceSection: 'creator:_combat',
        origin: 'npc_combat_stage',
        knowledgeSource: 'ai_generated',
      }],
      equipment: [{ name: 'Silvered saber', quantity: 1, notes: 'ceremonial' }],
      npc: {
        physical_appearance: 'Old appearance',
        skills: [{ name: 'Perception', value: '+4' }],
        actions: [{ name: 'Old Slash', description: 'Old' }],
        equipment: [{ name: 'Rusty knife', quantity: 1 }],
        stat_block: {
          actions: [{ name: 'Old Slash', description: 'Old' }],
          skills: [{ name: 'Stealth', value: '+5' }],
        },
      },
    });

    const npc = synced.npc as Record<string, unknown>;
    const npcStatBlock = npc.stat_block as Record<string, unknown>;

    expect(npc.physical_appearance).toBe('Weathered veteran');
    expect(npc.skills).toEqual([{ name: 'Perception', value: '+6', notes: 'keen senses' }]);
    expect(npc.actions).toEqual([
      {
        name: 'Saber Slash',
        description: 'Melee Weapon Attack.',
        statLine: '+8 to hit',
        sourceSection: 'creator:_combat',
        origin: 'npc_combat_stage',
        knowledgeSource: 'ai_generated',
      },
    ]);
    expect(npc.equipment).toEqual([{ name: 'Silvered saber', quantity: 1, notes: 'ceremonial' }]);
    expect(npcStatBlock.actions).toEqual([
      {
        name: 'Saber Slash',
        description: 'Melee Weapon Attack.',
        statLine: '+8 to hit',
        sourceSection: 'creator:_combat',
        origin: 'npc_combat_stage',
        knowledgeSource: 'ai_generated',
      },
    ]);
    expect(npcStatBlock.skills).toEqual([{ name: 'Perception', value: '+6', notes: 'keen senses' }]);
  });

  it('synchronizes lifted encounter and adventure fields back into nested containers', () => {
    const synced = synchronizeStructuredContentContainers({
      title: 'Blackreef Ambush',
      rewards: [{ name: 'Pearl Cache', description: 'Recovered from the wreck.' }],
      premise: 'Defend the convoy through haunted waters.',
      encounter: {
        title: 'Old Title',
        rewards: [{ name: 'Old Reward', description: 'Old.' }],
      },
      adventure: {
        premise: 'Old premise',
      },
    });

    expect((synced.encounter as Record<string, unknown>).title).toBe('Blackreef Ambush');
    expect((synced.encounter as Record<string, unknown>).rewards).toEqual([
      { name: 'Pearl Cache', description: 'Recovered from the wreck.' },
    ]);
    expect((synced.adventure as Record<string, unknown>).premise).toBe('Defend the convoy through haunted waters.');
  });
});
