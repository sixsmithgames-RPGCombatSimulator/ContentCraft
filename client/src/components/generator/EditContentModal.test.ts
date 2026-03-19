import { describe, expect, it } from 'vitest';
import { synchronizeStructuredContentContainers } from './EditContentModal';

describe('EditContentModal helpers', () => {
  it('synchronizes lifted npc fields without flattening structured arrays', () => {
    const synced = synchronizeStructuredContentContainers({
      appearance: 'Weathered veteran',
      size: 'Medium',
      hit_dice: '9d8',
      skill_proficiencies: [{ name: 'Perception', value: '+6', notes: 'keen senses' }],
      allies: ['Moonlit refugees'],
      enemies: ['Lolth priestesses'],
      organizations: [{ name: 'Followers of Eilistraee', role: 'Scout' }],
      actions: [{
        name: 'Saber Slash',
        description: 'Melee Weapon Attack.',
        statLine: '+8 to hit',
        sourceSection: 'creator:_combat',
        origin: 'npc_combat_stage',
        knowledgeSource: 'ai_generated',
      }],
      equipment: [{ name: 'Silvered saber', quantity: 1, notes: 'ceremonial' }],
      weapons: [{ name: 'Hand Crossbow', description: 'Repeating mechanism.' }],
      wondrous_items: [{ name: 'Cloak of Displacement', description: 'Illusory blur.' }],
      npc: {
        physical_appearance: 'Old appearance',
        skills: [{ name: 'Perception', value: '+4' }],
        allies_friends: [{ name: 'Old Ally', relationship: 'former contact' }],
        foes: [{ name: 'Old Enemy', relationship: 'hunter' }],
        factions: [{ name: 'Old Faction', role: 'member' }],
        actions: [{ name: 'Old Slash', description: 'Old' }],
        equipment: [{ name: 'Rusty knife', quantity: 1 }],
        stat_block: {
          actions: [{ name: 'Old Slash', description: 'Old' }],
          skills: [{ name: 'Stealth', value: '+5' }],
          hit_dice: '4d8',
        },
      },
    });

    const npc = synced.npc as Record<string, unknown>;
    const npcStatBlock = npc.stat_block as Record<string, unknown>;

    expect(npc.physical_appearance).toBe('Weathered veteran');
    expect(npc.size).toBe('Medium');
    expect(npc.hit_dice).toBe('9d8');
    expect(npc.skills).toEqual([{ name: 'Perception', value: '+6', notes: 'keen senses' }]);
    expect(npc.allies).toEqual(['Moonlit refugees']);
    expect(npc.allies_friends).toEqual(['Moonlit refugees']);
    expect(npc.enemies).toEqual(['Lolth priestesses']);
    expect(npc.foes).toEqual(['Lolth priestesses']);
    expect(npc.organizations).toEqual([{ name: 'Followers of Eilistraee', role: 'Scout' }]);
    expect(npc.factions).toEqual([{ name: 'Followers of Eilistraee', role: 'Scout' }]);
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
    expect(npc.weapons).toEqual([{ name: 'Hand Crossbow', description: 'Repeating mechanism.' }]);
    expect(npc.wondrous_items).toEqual([{ name: 'Cloak of Displacement', description: 'Illusory blur.' }]);
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
    expect(npcStatBlock.hit_dice).toBe('9d8');
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
