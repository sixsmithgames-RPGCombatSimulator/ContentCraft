#!/usr/bin/env tsx
import { connectToMongo, getDb, closeMongo } from '../src/server/config/mongo.js';
import { DEFAULT_AUTHORITY } from '../src/server/models/Authority.js';

async function bootstrap() {
  console.log('🚀 Starting D&D Generator bootstrap...\n');

  try {
    // Connect to MongoDB
    console.log('📊 Connecting to MongoDB...');
    await connectToMongo();
    const db = getDb();

    // 1. Insert Authority document
    console.log('📜 Creating authority document...');
    await db.collection('authority').updateOne(
      { _id: 'authority' },
      { $set: DEFAULT_AUTHORITY },
      { upsert: true }
    );
    console.log('✓ Authority document created\n');

    // 2. Create sample canon entities
    console.log('👥 Creating sample canon entities...');

    const entities = [
      {
        _id: 'npc.elara_moonshadow',
        type: 'npc',
        canonical_name: 'Elara Moonshadow',
        aliases: ['The Silver Sage', 'Elara', 'Lady Moonshadow'],
        era: 'post-sundering',
        region: 'sword-coast',
        relationships: [],
        claims: [
          {
            text: 'Elara is a high elf wizard specializing in divination magic.',
            source: 'campaign:session-1',
          },
          {
            text: 'She resides in Waterdeep and operates a divination shop in the Dock Ward.',
            source: 'campaign:session-1',
          },
        ],
        version: '1.0.0',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        _id: 'location.waterdeep',
        type: 'location',
        canonical_name: 'Waterdeep',
        aliases: ['The City of Splendors', 'Crown of the North'],
        era: 'post-sundering',
        region: 'sword-coast',
        relationships: [
          { target_id: 'faction.lords_of_waterdeep', kind: 'governed_by' },
        ],
        claims: [
          {
            text: 'Waterdeep is the most influential city on the Sword Coast.',
            source: 'SCAG p.15',
          },
          {
            text: 'The city is divided into multiple wards including Castle, Sea, Dock, and Trade Wards.',
            source: 'SCAG p.15-17',
          },
        ],
        version: '1.0.0',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        _id: 'item.flame_tongue',
        type: 'item',
        canonical_name: 'Flame Tongue',
        aliases: ['Flametongue', 'Flame Tongue Sword'],
        region: 'any',
        relationships: [],
        claims: [
          {
            text: 'A flame tongue is a rare magic sword that deals an extra 2d6 fire damage.',
            source: 'DMG 2024 p.262',
          },
          {
            text: 'The sword requires a bonus action to activate the flames.',
            source: 'DMG 2024 p.262',
          },
        ],
        version: '1.0.0',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        _id: 'rule.concentration',
        type: 'rule',
        canonical_name: 'Concentration',
        aliases: ['Concentration mechanic'],
        relationships: [],
        claims: [
          {
            text: 'Only one concentration spell can be active at a time per caster.',
            source: 'PHB 2024 p.203',
          },
          {
            text: 'Concentration is broken by taking damage and failing a Constitution saving throw (DC 10 or half damage, whichever is higher).',
            source: 'PHB 2024 p.203',
          },
        ],
        version: '1.0.0',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ];

    for (const entity of entities) {
      await db.collection('canon_entities').updateOne(
        { _id: entity._id },
        { $set: entity },
        { upsert: true }
      );
      console.log(`  ✓ ${entity.canonical_name} (${entity.type})`);
    }
    console.log();

    // 3. Create canon chunks
    console.log('📦 Creating canon chunks...');

    const chunks = [
      {
        _id: 'npc.elara_moonshadow#c1',
        entity_id: 'npc.elara_moonshadow',
        text: 'Elara Moonshadow is a centuries-old high elf wizard who resides in Waterdeep. She specializes in divination magic and is known for her prophetic visions. Her silver hair and keen violet eyes mark her as one of the most respected diviners in the city.',
        metadata: {
          region: 'sword-coast',
          era: 'post-sundering',
          tags: ['wizard', 'divination', 'waterdeep', 'npc'],
          weight: 1.0,
        },
        created_at: new Date(),
      },
      {
        _id: 'npc.elara_moonshadow#c2',
        entity_id: 'npc.elara_moonshadow',
        text: 'Elara operates "Moonlit Futures," a divination shop in Waterdeep\'s Dock Ward. She offers scrying services, fortune telling, and occasionally serves as a consultant for the Lords of Waterdeep on matters of prophecy.',
        metadata: {
          region: 'sword-coast',
          era: 'post-sundering',
          tags: ['waterdeep', 'business', 'divination'],
          weight: 0.8,
        },
        created_at: new Date(),
      },
      {
        _id: 'location.waterdeep#c1',
        entity_id: 'location.waterdeep',
        text: 'Waterdeep, the City of Splendors, is the most influential and prosperous city on the Sword Coast. With a population of over 130,000, it serves as a major trade hub and political center. The city is governed by the mysterious Lords of Waterdeep.',
        metadata: {
          region: 'sword-coast',
          era: 'post-sundering',
          tags: ['city', 'trade', 'politics', 'major-location'],
          weight: 1.0,
        },
        created_at: new Date(),
      },
      {
        _id: 'location.waterdeep#c2',
        entity_id: 'location.waterdeep',
        text: 'The city is divided into wards: Castle Ward (seat of government), Sea Ward (wealthy district), Trade Ward (commerce), Dock Ward (working class), and others. Each ward has its own character and governance.',
        metadata: {
          region: 'sword-coast',
          era: 'post-sundering',
          tags: ['city', 'geography', 'wards'],
          weight: 0.9,
        },
        created_at: new Date(),
      },
      {
        _id: 'item.flame_tongue#c1',
        entity_id: 'item.flame_tongue',
        text: 'A flame tongue is a rare magic sword that bursts into flames when activated. While ablaze, the sword deals an extra 2d6 fire damage. The wielder can activate or deactivate the flames as a bonus action.',
        metadata: {
          tags: ['magic-item', 'weapon', 'rare', 'fire-damage'],
          weight: 1.0,
        },
        created_at: new Date(),
      },
      {
        _id: 'rule.concentration#c1',
        entity_id: 'rule.concentration',
        text: 'Concentration is a game mechanic for maintaining certain spells. A caster can concentrate on only one spell at a time. Taking damage requires a Constitution saving throw (DC 10 or half the damage taken, whichever is higher) to maintain concentration.',
        metadata: {
          tags: ['rule', 'spellcasting', 'concentration', 'core-mechanic'],
          weight: 1.0,
        },
        created_at: new Date(),
      },
    ];

    for (const chunk of chunks) {
      await db.collection('canon_chunks').updateOne(
        { _id: chunk._id },
        { $set: chunk },
        { upsert: true }
      );
      console.log(`  ✓ ${chunk._id}`);
    }
    console.log();

    // Summary
    const entityCount = await db.collection('canon_entities').countDocuments();
    const chunkCount = await db.collection('canon_chunks').countDocuments();

    console.log('✅ Bootstrap complete!\n');
    console.log('📊 Database Summary:');
    console.log(`  - Authority: configured`);
    console.log(`  - Canon Entities: ${entityCount}`);
    console.log(`  - Canon Chunks: ${chunkCount}\n`);

    console.log('🎯 Next Steps:');
    console.log('  1. Start the server: npm run dev');
    console.log('  2. Test with: POST /api/runs with a prompt');
    console.log('  3. Add more canon entities and chunks as needed');
    console.log('  4. Optional: Run embeddings generation for vector search\n');

  } catch (error) {
    console.error('❌ Bootstrap failed:', error);
    process.exit(1);
  } finally {
    await closeMongo();
  }
}

bootstrap();
