import { describe, expect, it } from 'vitest';
import {
  assembleFinalWorkflowContent,
  buildHomebrewFinalOutput,
  buildFinalWorkflowOutput,
  inferWorkflowDeliverableType,
  resolveCompletedWorkflowOutput,
  restoreUploadedWorkflowContent,
} from './workflowContentAssembler';

describe('workflowContentAssembler', () => {
  it('assembles monster stage results and strips note fields from saves and skills', () => {
    const result = assembleFinalWorkflowContent('monster', {
      basic_info: { name: 'Kraken Spawn' },
      'stats_&_defenses': {
        saving_throws: [{ name: 'Dex', value: '+5', notes: 'derived' }],
        skill_proficiencies: [{ name: 'Stealth', value: '+7', notes: 'derived' }],
      },
      'combat_&_abilities': { actions: [{ name: 'Bite' }] },
      'legendary_&_lair': {},
      'ecology_&_lore': { ecology: 'A deep-sea ambusher.' },
    });

    expect(result.logLabel).toContain('Monster');
    expect(result.content.deliverable).toBe('monster');
    expect(result.content.saving_throws).toEqual([{ name: 'Dex', value: '+5', notes: undefined }]);
    expect(result.content.skill_proficiencies).toEqual([{ name: 'Stealth', value: '+7', notes: undefined }]);
  });

  it('normalizes numeric monster modifiers to signed strings', () => {
    const result = assembleFinalWorkflowContent('monster', {
      basic_info: { name: 'Tempest Crab' },
      'stats_&_defenses': {
        saving_throws: [{ name: 'Con', value: 6 }],
        skill_proficiencies: [{ name: 'Perception', value: 0 }],
      },
      'combat_&_abilities': {},
      'legendary_&_lair': {},
      'ecology_&_lore': {},
    });

    expect(result.content.saving_throws).toEqual([{ name: 'Con', value: '+6', notes: undefined }]);
    expect(result.content.skill_proficiencies).toEqual([{ name: 'Perception', value: '+0', notes: undefined }]);
  });

  it('assembles monster stage results with canonical workflow stage keys', () => {
    const result = assembleFinalWorkflowContent('monster', {
      'monster.basic_info': { name: 'Storm Wyrm' },
      'monster.stats': {
        armor_class: 17,
        saving_throws: [{ name: 'Dex', value: 4 }],
      },
      'monster.combat': {
        actions: [{ name: 'Lightning Lash' }],
      },
      'monster.legendary': {},
      'monster.lore': {
        ecology: 'A tempest-haunting apex predator.',
      },
    });

    expect(result.logLabel).toContain('Monster');
    expect(result.content).toMatchObject({
      deliverable: 'monster',
      name: 'Storm Wyrm',
      armor_class: 17,
      actions: [{ name: 'Lightning Lash' }],
      ecology: 'A tempest-haunting apex predator.',
    });
    expect(result.content.saving_throws).toEqual([{ name: 'Dex', value: '+4', notes: undefined }]);
  });

  it('assembles npc stage results through the shared npc merger', () => {
    const result = assembleFinalWorkflowContent('npc', {
      'creator:_basic_info': {
        name: 'Barley',
        species: 'Halfling',
        class_levels: [{ class: 'Warlock', level: 11 }],
      },
      'creator:_core_details': {
        goals: ['Cook for a marid'],
      },
      'creator:_stats': {
        ability_scores: { str: 10, dex: 18, con: 14, int: 12, wis: 10, cha: 20 },
      },
    });

    expect(result.logLabel).toContain('NPC');
    expect(result.content.name).toBe('Barley');
    expect(result.content.race).toBe('Halfling');
    expect(result.content.ability_scores).toEqual({ str: 10, dex: 18, con: 14, int: 12, wis: 10, cha: 20 });
  });

  it('assembles item stage results through the shared workflow assembler', () => {
    const result = assembleFinalWorkflowContent('item', {
      concept: {
        name: 'Tideforged Ladle',
        item_type: 'rod',
        rarity: 'rare',
      },
      mechanics: {
        properties: [{ name: 'Boiling Surge' }],
      },
      lore: {
        history: 'A relic of a drowned kitchen temple.',
        campaign_hooks: ['Find the missing matching cauldron.'],
      },
    });

    expect(result.logLabel).toContain('Item');
    expect(result.content).toMatchObject({
      deliverable: 'item',
      type: 'item',
      name: 'Tideforged Ladle',
      properties: [{ name: 'Boiling Surge' }],
      history: 'A relic of a drowned kitchen temple.',
    });
  });

  it('assembles item stage results through the shared workflow assembler with canonical stage keys', () => {
    const result = assembleFinalWorkflowContent('item', {
      'item.concept': {
        name: 'Lantern of the Brined Choir',
        item_type: 'wondrous_item',
      },
      'item.mechanics': {
        properties: [{ name: 'Choir Tide' }],
      },
      'item.lore': {
        history: 'Recovered from a drowned cathedral choir loft.',
      },
    });

    expect(result.logLabel).toContain('Item');
    expect(result.content).toMatchObject({
      deliverable: 'item',
      type: 'item',
      name: 'Lantern of the Brined Choir',
      properties: [{ name: 'Choir Tide' }],
      history: 'Recovered from a drowned cathedral choir loft.',
    });
  });

  it('assembles encounter stage results through the shared workflow assembler', () => {
    const result = assembleFinalWorkflowContent('encounter', {
      concept: {
        title: 'Kitchen Under Siege',
        objectives: ['Protect the pantry'],
      },
      enemies: {
        monsters: [{ name: 'Brine Mephit', count: 3 }],
      },
      terrain: {
        terrain: { summary: 'Flooded galley' },
      },
      tactics: {
        tactics: { opening_moves: ['Break the stove line'] },
      },
      rewards: {
        treasure: { gold: '180 gp' },
        consequences: { failure: 'The tavern closes for a week.' },
        scaling: { harder: 'Add a sea hag overseer.' },
      },
    });

    expect(result.logLabel).toContain('Encounter');
    expect(result.content).toMatchObject({
      deliverable: 'encounter',
      type: 'encounter',
      title: 'Kitchen Under Siege',
      monsters: [{ name: 'Brine Mephit', count: 3 }],
      terrain: { summary: 'Flooded galley' },
      treasure: { gold: '180 gp' },
    });
  });

  it('assembles encounter stage results through the shared workflow assembler with canonical stage keys', () => {
    const result = assembleFinalWorkflowContent('encounter', {
      'encounter.concept': {
        title: 'Moonwake Ambush',
        objectives: ['Defend the ritual skiff'],
      },
      'encounter.enemies': {
        monsters: [{ name: 'Sahuagin Raider', count: 4 }],
      },
      'encounter.terrain': {
        terrain: { summary: 'A flooded dock maze' },
      },
      'encounter.tactics': {
        tactics: { opening_moves: ['Capsize the supply raft'] },
      },
      'encounter.rewards': {
        treasure: { gold: '210 gp' },
      },
    });

    expect(result.logLabel).toContain('Encounter');
    expect(result.content).toMatchObject({
      deliverable: 'encounter',
      type: 'encounter',
      title: 'Moonwake Ambush',
      monsters: [{ name: 'Sahuagin Raider', count: 4 }],
      terrain: { summary: 'A flooded dock maze' },
      treasure: { gold: '210 gp' },
    });
  });

  it('assembles story arc stage results through the shared workflow assembler', () => {
    const result = assembleFinalWorkflowContent('story_arc', {
      premise: {
        title: 'The Drowned Feast',
        hook: 'A royal banquet vanishes under moonlit tidewater.',
      },
      structure: {
        acts: [{ name: 'Act I' }],
      },
      characters: {
        characters: [{ name: 'Chef-Marshal Ilyra' }],
      },
      secrets: {
        clues_and_secrets: ['The moonwell hides a portal.'],
        rewards: ['Favor of the harbor guild'],
        dm_notes: ['Let the cookoffs matter.'],
      },
    });

    expect(result.logLabel).toContain('Story Arc');
    expect(result.content).toMatchObject({
      deliverable: 'story_arc',
      type: 'story_arc',
      title: 'The Drowned Feast',
      acts: [{ name: 'Act I' }],
      characters: [{ name: 'Chef-Marshal Ilyra' }],
      clues_and_secrets: ['The moonwell hides a portal.'],
    });
  });

  it('assembles story arc stage results through the shared workflow assembler with canonical stage keys', () => {
    const result = assembleFinalWorkflowContent('story_arc', {
      'story_arc.premise': {
        title: 'The Chapel Beneath the Tide',
        hook: 'A sunken shrine rings bells at every new moon.',
      },
      'story_arc.structure': {
        acts: [{ name: 'Act I: The First Toll' }],
      },
      'story_arc.characters': {
        characters: [{ name: 'Keeper Maelin' }],
      },
      'story_arc.secrets': {
        clues_and_secrets: ['The bell tower seals a planar breach.'],
      },
    });

    expect(result.logLabel).toContain('Story Arc');
    expect(result.content).toMatchObject({
      deliverable: 'story_arc',
      type: 'story_arc',
      title: 'The Chapel Beneath the Tide',
      acts: [{ name: 'Act I: The First Toll' }],
      characters: [{ name: 'Keeper Maelin' }],
      clues_and_secrets: ['The bell tower seals a planar breach.'],
    });
  });

  it('assembles finalizer-backed scene stage results through the shared workflow assembler', () => {
    const result = assembleFinalWorkflowContent('scene', {
      creator: {
        title: 'Draft Dockside Vigil',
      },
      finalizer: {
        title: 'Dockside Vigil',
        description: 'A lone watchkeeper hears chains move beneath the tide.',
      },
    });

    expect(result.logLabel).toContain('finalizer');
    expect(result.content).toMatchObject({
      title: 'Dockside Vigil',
      description: 'A lone watchkeeper hears chains move beneath the tide.',
    });
  });

  it('assembles location stage results through the shared workflow assembler with canonical stage keys', () => {
    const result = assembleFinalWorkflowContent('location', {
      'location.purpose': {
        title: 'Gloam Lantern Keep',
        concept: 'A lighthouse fortress sunk halfway into a haunted bay.',
      },
      'location.foundation': {
        environment: 'Storm-lashed coastline',
      },
      'location.spaces': {
        spaces: [{ name: 'Beacon Chamber' }],
      },
      'location.details': {
        landmarks: ['A cracked prism lens'],
      },
      'location.accuracy_refinement': {
        connectivity_notes: ['The winch lift connects the flooded dock to the beacon stair.'],
      },
    });

    expect(result.logLabel).toContain('Location');
    expect(result.content).toMatchObject({
      deliverable: 'location',
      title: 'Gloam Lantern Keep',
      environment: 'Storm-lashed coastline',
      spaces: { spaces: [{ name: 'Beacon Chamber' }] },
      landmarks: ['A cracked prism lens'],
    });
  });

  it('restores npc uploads from saved pipeline stages', () => {
    const restored = restoreUploadedWorkflowContent({
      deliverable: 'npc',
      type: 'npc',
      title: 'Barley',
      _pipeline_stages: {
        'creator:_basic_info': {
          name: 'Barley',
          species: 'Halfling',
        },
        'creator:_stats': {
          ability_scores: { str: 8, dex: 16, con: 14, int: 12, wis: 10, cha: 18 },
        },
      },
    }, 'npc');

    expect(restored.logLabel).toContain('NPC');
    expect(restored.content.name).toBe('Barley');
    expect(restored.content.race).toBe('Halfling');
    expect(restored.content.title).toBe('Barley');
  });

  it('restores generic saved output from physics validator content', () => {
    const restored = restoreUploadedWorkflowContent({
      deliverable: 'scene',
      conflicts: [{ entity_name: 'Selune' }],
      _pipeline_stages: {
        physics_validator: {
          content: {
            content: {
              title: 'Moonlit Dock',
              description: 'A quiet scene.',
            },
          },
        },
      },
    }, 'scene');

    expect(restored.logLabel).toContain('physics_validator');
    expect(restored.content.title).toBe('Moonlit Dock');
    expect(restored.content.conflicts).toEqual([{ entity_name: 'Selune' }]);
  });

  it('restores scene uploads from saved pipeline stages using finalizer content', () => {
    const restored = restoreUploadedWorkflowContent({
      deliverable: 'scene',
      _pipeline_stages: {
        creator: {
          title: 'Draft Harbor Alarm',
        },
        finalizer: {
          title: 'Harbor Alarm',
          description: 'Warning bells carry across the flooded quay at dusk.',
        },
      },
    }, 'scene');

    expect(restored.logLabel).toContain('finalizer');
    expect(restored.content).toMatchObject({
      deliverable: 'scene',
      title: 'Harbor Alarm',
      description: 'Warning bells carry across the flooded quay at dusk.',
    });
  });

  it('restores nonfiction uploads from saved pipeline stages through the shared assembler', () => {
    const restored = restoreUploadedWorkflowContent({
      deliverable: 'nonfiction',
      _pipeline_stages: {
        draft: {
          title: 'Draft Tides of Memory',
        },
        finalizer: {
          title: 'Tides of Memory',
          chapters: [{ title: 'The Harbor at Dawn' }],
        },
      },
    }, 'nonfiction');

    expect(restored.logLabel).toContain('finalizer');
    expect(restored.content).toMatchObject({
      deliverable: 'nonfiction',
      title: 'Tides of Memory',
      chapters: [{ title: 'The Harbor at Dawn' }],
    });
  });

  it('restores outline uploads from saved pipeline stages through the shared writing assembler fallback', () => {
    const restored = restoreUploadedWorkflowContent({
      deliverable: 'outline',
      _pipeline_stages: {
        draft: {
          title: 'Draft Ruins of Salt',
        },
        'editor_&_style': {
          title: 'Ruins of Salt',
          chapters: [{ title: 'Collapsed Causeways' }],
        },
      },
    }, 'outline');

    expect(restored.logLabel).toContain('editor_&_style');
    expect(restored.content).toMatchObject({
      deliverable: 'outline',
      title: 'Ruins of Salt',
      chapters: [{ title: 'Collapsed Causeways' }],
    });
  });

  it('flattens uploaded monster stage structures', () => {
    const restored = restoreUploadedWorkflowContent({
      title: 'Coral Horror',
      'stats_&_defenses': { armor_class: 15 },
      'combat_&_abilities': { actions: [{ name: 'Claw' }] },
      'legendary_&_lair': {},
      'ecology_&_lore': { ecology: 'Reef predator.' },
    }, 'monster');

    expect(restored.content.title).toBe('Coral Horror');
    expect(restored.content.armor_class).toBe(15);
    expect(restored.content.actions).toEqual([{ name: 'Claw' }]);
    expect(restored.content.ecology).toBe('Reef predator.');
    expect('stats_&_defenses' in restored.content).toBe(false);
  });

  it('restores monster uploads from saved pipeline stages', () => {
    const restored = restoreUploadedWorkflowContent({
      deliverable: 'monster',
      title: 'Tempest Eel',
      _pipeline_stages: {
        basic_info: {
          name: 'Tempest Eel',
          size: 'Large',
        },
        'stats_&_defenses': {
          armor_class: 16,
          saving_throws: [{ name: 'Dex', value: 5, notes: 'derived' }],
        },
        'combat_&_abilities': {
          actions: [{ name: 'Static Bite' }],
        },
        'legendary_&_lair': {},
        'ecology_&_lore': {
          ecology: 'Storm-charged predator of flooded ruins.',
        },
      },
    }, 'monster');

    expect(restored.logLabel).toContain('Monster');
    expect(restored.content).toMatchObject({
      deliverable: 'monster',
      title: 'Tempest Eel',
      name: 'Tempest Eel',
      armor_class: 16,
      actions: [{ name: 'Static Bite' }],
      ecology: 'Storm-charged predator of flooded ruins.',
    });
    expect(restored.content.saving_throws).toEqual([{ name: 'Dex', value: '+5', notes: undefined }]);
  });

  it('restores monster uploads from canonical saved pipeline stages', () => {
    const restored = restoreUploadedWorkflowContent({
      deliverable: 'monster',
      _pipeline_stages: {
        'monster.basic_info': {
          name: 'Glassmaw Hydra',
        },
        'monster.stats': {
          armor_class: 18,
          saving_throws: [{ name: 'Con', value: 7 }],
        },
        'monster.combat': {
          actions: [{ name: 'Shattering Bite' }],
        },
        'monster.legendary': {},
        'monster.lore': {
          ecology: 'A many-headed terror that nests in crystal caverns.',
        },
      },
    }, 'monster');

    expect(restored.logLabel).toContain('Monster');
    expect(restored.content).toMatchObject({
      deliverable: 'monster',
      name: 'Glassmaw Hydra',
      armor_class: 18,
      actions: [{ name: 'Shattering Bite' }],
      ecology: 'A many-headed terror that nests in crystal caverns.',
    });
    expect(restored.content.saving_throws).toEqual([{ name: 'Con', value: '+7', notes: undefined }]);
  });

  it('flattens direct monster stage structures with canonical keys from uploads', () => {
    const restored = restoreUploadedWorkflowContent({
      title: 'Abyssal Ram',
      'monster.stats': {
        armor_class: 19,
      },
      'monster.combat': {
        actions: [{ name: 'Void Horn' }],
      },
      'monster.legendary': {},
      'monster.lore': {
        ecology: 'A siege beast that charges through planar fissures.',
      },
    }, 'monster');

    expect(restored.content).toMatchObject({
      title: 'Abyssal Ram',
      armor_class: 19,
      actions: [{ name: 'Void Horn' }],
      ecology: 'A siege beast that charges through planar fissures.',
    });
    expect('monster.stats' in restored.content).toBe(false);
    expect('monster.combat' in restored.content).toBe(false);
  });

  it('restores item uploads from saved pipeline stages', () => {
    const restored = restoreUploadedWorkflowContent({
      deliverable: 'item',
      _pipeline_stages: {
        concept: {
          name: 'Wavecaller Spoon',
          item_type: 'wondrous_item',
        },
        mechanics: {
          properties: [{ name: 'Call Broth' }],
        },
        lore: {
          history: 'Once used by a storm giant chef.',
          campaign_hooks: ['Return it to the feast hall.'],
        },
      },
    }, 'item');

    expect(restored.logLabel).toContain('Item');
    expect(restored.content).toMatchObject({
      deliverable: 'item',
      name: 'Wavecaller Spoon',
      properties: [{ name: 'Call Broth' }],
      history: 'Once used by a storm giant chef.',
    });
  });

  it('restores item uploads from canonical saved pipeline stages', () => {
    const restored = restoreUploadedWorkflowContent({
      deliverable: 'item',
      _pipeline_stages: {
        'item.concept': {
          name: 'Bellglass Spoon',
        },
        'item.mechanics': {
          properties: [{ name: 'Echo Broth' }],
        },
        'item.lore': {
          history: 'Forged for the abbots of a storm monastery.',
        },
      },
    }, 'item');

    expect(restored.logLabel).toContain('Item');
    expect(restored.content).toMatchObject({
      deliverable: 'item',
      name: 'Bellglass Spoon',
      properties: [{ name: 'Echo Broth' }],
      history: 'Forged for the abbots of a storm monastery.',
    });
  });

  it('flattens direct item stage structures with canonical keys from uploads', () => {
    const restored = restoreUploadedWorkflowContent({
      'item.concept': {
        name: 'Starwake Censer',
      },
      'item.mechanics': {
        properties: [{ name: 'Moon Incense' }],
      },
      'item.lore': {
        history: 'Once carried by the tidewatch monks.',
      },
    }, 'item');

    expect(restored.content).toMatchObject({
      deliverable: 'item',
      type: 'item',
      name: 'Starwake Censer',
      properties: [{ name: 'Moon Incense' }],
      history: 'Once carried by the tidewatch monks.',
    });
    expect('item.concept' in restored.content).toBe(false);
    expect('item.mechanics' in restored.content).toBe(false);
  });

  it('restores encounter uploads from canonical saved pipeline stages', () => {
    const restored = restoreUploadedWorkflowContent({
      deliverable: 'encounter',
      _pipeline_stages: {
        'encounter.concept': {
          title: 'The Wharfside Breach',
        },
        'encounter.enemies': {
          monsters: [{ name: 'Cult Fanatic', count: 2 }],
        },
        'encounter.terrain': {
          terrain: { summary: 'Broken piers in a hard rain' },
        },
        'encounter.tactics': {
          tactics: { fallback_plan: 'Retreat into the warehouse lofts' },
        },
        'encounter.rewards': {
          treasure: { gold: '150 gp' },
        },
      },
    }, 'encounter');

    expect(restored.logLabel).toContain('Encounter');
    expect(restored.content).toMatchObject({
      deliverable: 'encounter',
      title: 'The Wharfside Breach',
      monsters: [{ name: 'Cult Fanatic', count: 2 }],
      terrain: { summary: 'Broken piers in a hard rain' },
      treasure: { gold: '150 gp' },
    });
  });

  it('flattens direct encounter stage structures with canonical keys from uploads', () => {
    const restored = restoreUploadedWorkflowContent({
      'encounter.concept': {
        title: 'Vault of the Tidal Bell',
      },
      'encounter.enemies': {
        monsters: [{ name: 'Animated Armor', count: 2 }],
      },
      'encounter.terrain': {
        terrain: { summary: 'A flooded reliquary hall' },
      },
      'encounter.tactics': {
        tactics: { opening_moves: ['Hold the bell dais'] },
      },
      'encounter.rewards': {
        treasure: { gold: '130 gp' },
      },
    }, 'encounter');

    expect(restored.content).toMatchObject({
      deliverable: 'encounter',
      type: 'encounter',
      title: 'Vault of the Tidal Bell',
      monsters: [{ name: 'Animated Armor', count: 2 }],
      terrain: { summary: 'A flooded reliquary hall' },
      treasure: { gold: '130 gp' },
    });
    expect('encounter.concept' in restored.content).toBe(false);
    expect('encounter.enemies' in restored.content).toBe(false);
  });

  it('restores location uploads from saved pipeline stages', () => {
    const restored = restoreUploadedWorkflowContent({
      deliverable: 'location',
      _pipeline_stages: {
        purpose: {
          title: 'Moonwake Archive',
          concept: 'A tide-flooded library carved into sea cliffs.',
        },
        foundation: {
          environment: 'Coastal caverns',
        },
        spaces: {
          spaces: [{ name: 'Reading Grotto' }],
        },
        details: {
          sensory_details: ['Salt mist and whispering pages'],
        },
        accuracy_refinement: {
          connectivity_notes: ['The archive stairs descend to a lower vault.'],
        },
      },
    }, 'location');

    expect(restored.logLabel).toContain('Location');
    expect(restored.content).toMatchObject({
      deliverable: 'location',
      title: 'Moonwake Archive',
      environment: 'Coastal caverns',
      spaces: { spaces: [{ name: 'Reading Grotto' }] },
      sensory_details: ['Salt mist and whispering pages'],
    });
  });

  it('restores location uploads from canonical saved pipeline stages', () => {
    const restored = restoreUploadedWorkflowContent({
      deliverable: 'location',
      _pipeline_stages: {
        'location.purpose': {
          title: 'Starfall Reliquary',
        },
        'location.foundation': {
          environment: 'Meteor crater cloister',
        },
        'location.spaces': {
          spaces: [{ name: 'Reliquary Well' }],
        },
        'location.details': {
          landmarks: ['An iron comet suspended over the nave'],
        },
        'location.accuracy_refinement': {
          geometry_fixes: ['Align the outer cloister doors with the fallen nave entry.'],
        },
      },
    }, 'location');

    expect(restored.logLabel).toContain('Location');
    expect(restored.content).toMatchObject({
      deliverable: 'location',
      title: 'Starfall Reliquary',
      environment: 'Meteor crater cloister',
      spaces: { spaces: [{ name: 'Reliquary Well' }] },
      landmarks: ['An iron comet suspended over the nave'],
    });
  });

  it('flattens direct location stage structures with canonical keys from uploads', () => {
    const restored = restoreUploadedWorkflowContent({
      'location.purpose': {
        title: 'Blackwake Stair',
      },
      'location.foundation': {
        environment: 'A cliffside ossuary harbor',
      },
      'location.spaces': {
        spaces: [{ name: 'Tide Gate Landing' }],
      },
      'location.details': {
        landmarks: ['A bell made from leviathan bone'],
      },
      'location.accuracy_refinement': {
        connectivity_notes: ['The landing stair climbs to the ossuary watch hall.'],
      },
    }, 'location');

    expect(restored.content).toMatchObject({
      deliverable: 'location',
      title: 'Blackwake Stair',
      environment: 'A cliffside ossuary harbor',
      spaces: { spaces: [{ name: 'Tide Gate Landing' }] },
      landmarks: ['A bell made from leviathan bone'],
    });
    expect('location.purpose' in restored.content).toBe(false);
    expect('location.spaces' in restored.content).toBe(false);
  });

  it('restores story arc uploads from canonical saved pipeline stages', () => {
    const restored = restoreUploadedWorkflowContent({
      deliverable: 'story_arc',
      _pipeline_stages: {
        'story_arc.premise': {
          title: 'The Choir of Salt',
        },
        'story_arc.structure': {
          acts: [{ name: 'Act I: Gather the Lost Voices' }],
        },
        'story_arc.characters': {
          characters: [{ name: 'Abbess Coriel' }],
        },
        'story_arc.secrets': {
          clues_and_secrets: ['The drowned hymn seals the harbor gate.'],
        },
      },
    }, 'story_arc');

    expect(restored.logLabel).toContain('Story Arc');
    expect(restored.content).toMatchObject({
      deliverable: 'story_arc',
      title: 'The Choir of Salt',
      acts: [{ name: 'Act I: Gather the Lost Voices' }],
      characters: [{ name: 'Abbess Coriel' }],
      clues_and_secrets: ['The drowned hymn seals the harbor gate.'],
    });
  });

  it('flattens direct story arc stage structures with canonical keys from uploads', () => {
    const restored = restoreUploadedWorkflowContent({
      'story_arc.premise': {
        title: 'Ashes Beneath the Breakwater',
      },
      'story_arc.structure': {
        acts: [{ name: 'Act I: The Harbor Burns' }],
      },
      'story_arc.characters': {
        characters: [{ name: 'Harbormaster Serit' }],
      },
      'story_arc.secrets': {
        clues_and_secrets: ['The breakwater hides an ancient pyre engine.'],
      },
    }, 'story_arc');

    expect(restored.content).toMatchObject({
      deliverable: 'story_arc',
      type: 'story_arc',
      title: 'Ashes Beneath the Breakwater',
      acts: [{ name: 'Act I: The Harbor Burns' }],
      characters: [{ name: 'Harbormaster Serit' }],
      clues_and_secrets: ['The breakwater hides an ancient pyre engine.'],
    });
    expect('story_arc.premise' in restored.content).toBe(false);
    expect('story_arc.structure' in restored.content).toBe(false);
  });

  it('flattens direct encounter stage structures from uploads', () => {
    const restored = restoreUploadedWorkflowContent({
      concept: {
        title: 'Smugglers in the Brine Cellar',
      },
      enemies: {
        monsters: [{ name: 'Bandit', count: 4 }],
      },
      terrain: {
        terrain: { summary: 'A damp cellar maze' },
      },
      tactics: {
        tactics: { fallback_plan: 'Escape through the tide tunnel' },
      },
      rewards: {
        treasure: { gold: '95 gp' },
        consequences: { failure: 'The contraband spreads.' },
        scaling: { easier: 'Remove two bandits.' },
      },
    }, 'encounter');

    expect(restored.content).toMatchObject({
      deliverable: 'encounter',
      title: 'Smugglers in the Brine Cellar',
      monsters: [{ name: 'Bandit', count: 4 }],
      terrain: { summary: 'A damp cellar maze' },
    });
  });

  it('flattens direct location stage structures from uploads', () => {
    const restored = restoreUploadedWorkflowContent({
      purpose: {
        title: 'Stormglass Vault',
      },
      foundation: {
        environment: 'Submerged observatory',
      },
      spaces: {
        spaces: [{ name: 'Lens Hall' }],
      },
      details: {
        landmarks: ['A cracked crystal orrery'],
      },
      accuracy_refinement: {
        geometry_fixes: ['Widen the flooded corridor between Lens Hall and the intake chamber.'],
      },
    }, 'location');

    expect(restored.content).toMatchObject({
      deliverable: 'location',
      title: 'Stormglass Vault',
      environment: 'Submerged observatory',
      spaces: { spaces: [{ name: 'Lens Hall' }] },
      landmarks: ['A cracked crystal orrery'],
    });
  });

  it('flattens direct scene stage structures from uploads using finalizer content', () => {
    const restored = restoreUploadedWorkflowContent({
      creator: {
        title: 'Draft Lantern Watch',
      },
      finalizer: {
        title: 'Lantern Watch',
        description: 'Rain hisses on the watchtower roof as the harbor sleeps.',
      },
    }, 'scene');

    expect(restored.content).toMatchObject({
      title: 'Lantern Watch',
      description: 'Rain hisses on the watchtower roof as the harbor sleeps.',
    });
    expect('finalizer' in restored.content).toBe(false);
  });

  it('infers deliverable type from nested draft content', () => {
    expect(inferWorkflowDeliverableType({
      draft: {
        story_arc: {
          title: 'The Broken Moon',
        },
      },
    }, 'scene')).toBe('story_arc');
  });

  it('builds a final workflow output envelope with validation metadata', () => {
    const finalOutput = buildFinalWorkflowOutput({
      baseContent: {
        title: 'Moonlit Dock',
      },
      stageResults: {
        fact_checker: {
          summary: 'Looks good.',
        },
        canon_validator: {
          conflicts: [{ entity_name: 'Selune' }],
          canon_alignment_score: 92,
          validation_notes: 'One soft conflict.',
        },
        physics_validator: {
          physics_issues: [{ issue_type: 'logic_error' }],
          logic_score: 88,
          balance_notes: 'Tight but fair.',
        },
      },
      workflowType: 'scene',
      fallbackType: 'scene',
      proposals: [],
      ruleBase: '2024RAW',
    });

    expect(finalOutput).toMatchObject({
      title: 'Moonlit Dock',
      deliverable: 'scene',
      rule_base: '2024RAW',
      fact_check_report: { summary: 'Looks good.' },
      conflicts: [{ entity_name: 'Selune' }],
      canon_alignment_score: 92,
      validation_notes: 'One soft conflict.',
      physics_issues: [{ issue_type: 'logic_error' }],
      logic_score: 88,
      balance_notes: 'Tight but fair.',
      proposals: [],
    });
    expect(finalOutput._pipeline_stages).toBeDefined();
  });

  it('builds final workflow output for writing flows using editor-style review metadata', () => {
    const finalOutput = buildFinalWorkflowOutput({
      baseContent: {
        title: 'Ruins of Salt',
      },
      stageResults: {
        'editor_&_style': {
          summary: 'Tighten the opening transitions.',
        },
      },
      workflowType: 'outline',
      fallbackType: 'outline',
      proposals: [],
    });

    expect(finalOutput).toMatchObject({
      title: 'Ruins of Salt',
      deliverable: 'outline',
      fact_check_report: {
        summary: 'Tighten the opening transitions.',
      },
    });
  });

  it('builds a homebrew final output envelope', () => {
    const finalOutput = buildHomebrewFinalOutput({
      mergedContent: {
        entries: [{ name: 'Storm Chef', type: 'feat' }],
      },
      fileName: 'storm-codex.pdf',
      totalChunks: 4,
    });

    expect(finalOutput).toMatchObject({
      deliverable: 'homebrew',
      type: 'homebrew',
      document_title: 'storm-codex.pdf',
      fileName: 'storm-codex.pdf',
      content_type: 'homebrew',
      total_chunks: 4,
    });
  });

  it('resolves completed workflow output for shared stage-based runs', () => {
    const finalOutput = resolveCompletedWorkflowOutput({
      workflowType: 'scene',
      fallbackType: 'scene',
      ruleBase: '2024RAW',
      stageResults: {
        creator: {
          title: 'Wharf Ambush',
          proposals: ['keep?'],
        },
        fact_checker: {
          summary: 'ok',
        },
      },
    });

    expect(finalOutput).toMatchObject({
      title: 'Wharf Ambush',
      deliverable: 'scene',
      rule_base: '2024RAW',
      fact_check_report: { summary: 'ok' },
      proposals: ['keep?'],
    });
  });

  it('resolves completed workflow output for finalizer-backed scene runs', () => {
    const finalOutput = resolveCompletedWorkflowOutput({
      workflowType: 'scene',
      fallbackType: 'scene',
      ruleBase: '2024RAW',
      stageResults: {
        creator: {
          title: 'Draft Moonwell Crossing',
        },
        finalizer: {
          title: 'Moonwell Crossing',
          description: 'Silver water laps against the shrine bridge at midnight.',
        },
        fact_checker: {
          summary: 'ok',
        },
      },
    });

    expect(finalOutput).toMatchObject({
      title: 'Moonwell Crossing',
      description: 'Silver water laps against the shrine bridge at midnight.',
      deliverable: 'scene',
      fact_check_report: { summary: 'ok' },
    });
  });

  it('resolves completed workflow output for homebrew from merged stage data', () => {
    const finalOutput = resolveCompletedWorkflowOutput({
      workflowType: 'homebrew',
      fallbackType: 'homebrew',
      stageResults: {
        merged: {
          deliverable: 'homebrew',
          document_title: 'Homebrew Doc',
        },
      },
    });

    expect(finalOutput).toEqual({
      deliverable: 'homebrew',
      document_title: 'Homebrew Doc',
    });
  });
});
