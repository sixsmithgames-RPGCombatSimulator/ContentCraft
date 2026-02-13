# D&D Content Generator - Quick Start Guide

## Prerequisites

1. **MongoDB** installed and running locally
2. **OpenAI API key** with GPT-4 access
3. **Node.js 18+** and npm

## Setup Steps

### 1. Environment Configuration

Update your `.env` file:

```bash
# MongoDB
MONGODB_URI=mongodb://127.0.0.1:27017/dndgen

# OpenAI (REQUIRED)
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o

# Optional: Assistants (for specialized stage prompts)
# OPENAI_ASSISTANT_PLANNER=asst_xxx
# OPENAI_ASSISTANT_CREATOR=asst_xxx
# OPENAI_ASSISTANT_STYLIST=asst_xxx

# Server
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

### 2. Start MongoDB

```bash
# Windows
net start MongoDB

# Mac/Linux
sudo systemctl start mongod

# Or use Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

### 3. Install Dependencies (Already Done)

```bash
npm install
```

Packages installed:
- `mongodb` - Database driver
- `ajv` - JSON schema validation
- `openai` - OpenAI SDK
- `nanoid` - ID generation

### 4. Bootstrap the Database

You'll need to create a bootstrap script to seed initial data. Here's a minimal example:

```typescript
// scripts/bootstrap.ts
import { connectToMongo, getDb } from './src/server/config/mongo.js';
import { DEFAULT_AUTHORITY } from './src/server/models/Authority.js';

async function bootstrap() {
  await connectToMongo();
  const db = getDb();

  // Insert authority document
  await db.collection('authority').updateOne(
    { _id: 'authority' },
    { $set: DEFAULT_AUTHORITY },
    { upsert: true }
  );

  console.log('✓ Authority document created');

  // Add sample canon entities
  await db.collection('canon_entities').insertOne({
    _id: 'npc.elara_moonshadow',
    type: 'npc',
    canonical_name: 'Elara Moonshadow',
    aliases: ['The Silver Sage', 'Elara'],
    era: 'post-sundering',
    region: 'sword-coast',
    relationships: [],
    claims: [
      {
        text: 'Elara is a high elf wizard specializing in divination magic.',
        source: 'campaign:session-1'
      }
    ],
    version: '1.0.0'
  });

  console.log('✓ Sample entities created');

  // Add canon chunks
  await db.collection('canon_chunks').insertOne({
    _id: 'npc.elara_moonshadow#c1',
    entity_id: 'npc.elara_moonshadow',
    text: 'Elara Moonshadow is a centuries-old high elf wizard who resides in Waterdeep. She specializes in divination magic and is known for her prophetic visions.',
    metadata: {
      region: 'sword-coast',
      era: 'post-sundering',
      tags: ['wizard', 'divination', 'waterdeep']
    }
  });

  console.log('✓ Sample chunks created');
  console.log('\nBootstrap complete!');
  process.exit(0);
}

bootstrap().catch(console.error);
```

Run it:
```bash
npx tsx scripts/bootstrap.ts
```

## Current Implementation Status

### ✅ Ready to Use
- MongoDB connection
- OpenAI integration helpers
- Data models (Authority, CanonEntity, CanonChunk, Run, Artifact)
- JSON schemas for all content types
- Utility modules (logger, embeddings, chunking, citations, diff)
- AJV validator
- Canon guard
- Orchestrator framework

### 🚧 Needs Implementation
- 4 additional validators (Rules, Physics, Balance, Coherence)
- 9 pipeline stage implementations
- 3 API route files
- 6 frontend components
- Full bootstrap/seed script

## Next Development Steps

### Phase 1: Complete Validators

Create these files in `src/server/orchestration/validators/`:

1. **RulesGuard.ts** - Validate D&D rules compliance
   - AC/HP calculations
   - Proficiency bonuses
   - Spell DC math
   - Action economy

2. **PhysicsGuard.ts** - Check physics vs magic
   - Movement speeds
   - Fall damage
   - Travel times
   - Magic override table

3. **BalanceGuard.ts** - Balance checks
   - DPR ceilings
   - Save DC ranges
   - Treasure budgets

4. **CoherenceGuard.ts** - World consistency
   - Entity name resolution
   - Era/region conflicts
   - Timeline consistency

### Phase 2: Implement Pipeline Stages

Create these files in `src/server/orchestration/stages/`:

1. **Planner.ts** - Analyze prompt, create Brief
2. **Retriever.ts** - Search canon_chunks, build FactPack
3. **WorldCoherence.ts** - Pre/post coherence checks
4. **Creator.ts** - Generate JSON via LLM
5. **RulesVerifier.ts** - Run RulesGuard
6. **PhysicsMagic.ts** - Run PhysicsGuard
7. **BalanceLints.ts** - Run BalanceGuard
8. **Stylist.ts** - Polish prose
9. **Finalizer.ts** - Create continuity ledger

### Phase 3: Build API Routes

Create these files in `src/server/routes/`:

1. **runs.ts**
   ```typescript
   POST /api/runs - Create new run
   GET /api/runs/:id - Get run details
   GET /api/runs/:id/artifacts/:stage - Get artifact
   POST /api/runs/:id/advance - Retry failed stage
   GET /api/runs - List runs with filters
   ```

2. **canon.ts**
   ```typescript
   GET /api/canon/entities - Search entities
   GET /api/canon/entities/:id - Get entity
   POST /api/canon/entities - Create entity
   POST /api/canon/apply-delta - Apply changes
   ```

3. **config.ts**
   ```typescript
   GET /api/config/authority - Get authority
   PUT /api/config/authority - Update authority
   ```

### Phase 4: Update Server Index

Modify `src/server/index.ts` to:
- Connect to MongoDB on startup
- Register new routes
- Add error handling

## Testing Your Setup

### 1. Test MongoDB Connection

```typescript
// test-mongo.ts
import { connectToMongo } from './src/server/config/mongo.js';

async function test() {
  const db = await connectToMongo();
  const authority = await db.collection('authority').findOne({ _id: 'authority' });
  console.log('Authority:', authority);
}

test();
```

### 2. Test OpenAI Integration

```typescript
// test-openai.ts
import { llmJSON } from './src/server/config/openai.js';

async function test() {
  const result = await llmJSON({
    system: 'You are a helpful assistant. Return JSON.',
    user: 'Say hello in JSON with a "message" field.'
  });
  console.log('OpenAI response:', result);
}

test();
```

### 3. Test Validator

```typescript
// test-validator.ts
import { validateDraft } from './src/server/orchestration/validators/AJV.js';

const mockNPC = {
  rule_base: '2024RAW',
  sources_used: ['npc.test#c1'],
  assumptions: ['Party is level 5'],
  proposals: [],
  canon_update: 'Added test NPC',
  name: 'Test NPC',
  description: 'A test character for validation',
  race: 'Human',
  class_levels: [{ class: 'Fighter', level: 5 }],
  ability_scores: { str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 8 },
  ac: 18,
  hp: 45,
  proficiency_bonus: 3,
  personality: {
    traits: ['Brave'],
    ideals: ['Honor'],
    bonds: ['Loyalty'],
    flaws: ['Stubborn']
  },
  motivations: ['Protect the innocent']
};

const result = validateDraft('npc', mockNPC);
console.log('Validation:', result);
```

## Architecture Diagram

```
┌─────────────┐
│ User Prompt │
└──────┬──────┘
       │
┌──────▼──────────────────────────────────────────────────────┐
│                     ORCHESTRATOR                             │
│  Manages sequential execution of all stages                 │
└──────┬──────────────────────────────────────────────────────┘
       │
       ├─→ 1. Planner ────────────→ [Brief Artifact]
       │                              │
       ├─→ 2. Retriever ─────────────┤──→ [FactPack Artifact]
       │                              │
       ├─→ 3. WorldCoherence(pre) ───┤──→ [Validation Pass/Fail]
       │                              │
       ├─→ 4. Creator ───────────────┤──→ [Draft Artifact]
       │                              │
       ├─→ 5. RulesVerifier ─────────┤──→ [Validation Pass/Fail]
       │                              │
       ├─→ 6. PhysicsMagic ──────────┤──→ [Validation Pass/Fail]
       │                              │
       ├─→ 7. BalanceLints ──────────┤──→ [Validation Pass/Fail]
       │                              │
       ├─→ 8. WorldCoherence(post) ──┤──→ [Validation Pass/Fail]
       │                              │
       ├─→ 9. Stylist ───────────────┤──→ [Styled Draft]
       │                              │
       └─→ 10. Finalizer ────────────┴──→ [Continuity Ledger + Canon Delta]
                                           │
                                           ▼
                                    ┌──────────────┐
                                    │ Canon Clerk  │
                                    │ (UI Approval)│
                                    └──────────────┘
```

## Key Design Principles

1. **Immutability** - Stages cannot modify previous artifacts (except Stylist formatting)
2. **Idempotency** - Re-running a stage produces the same result
3. **Traceability** - All claims must cite chunk_ids
4. **Proposals over Invention** - Unknown → proposal with options
5. **Canon Guard** - Never auto-apply changes, always require approval

## Example Run Flow

1. User submits: "Create a deadly encounter with a dragon in the Sword Coast"

2. **Planner** outputs:
   ```json
   {
     "deliverable": "deadly encounter",
     "retrieval_hints": {
       "entities": ["dragon"],
       "regions": ["sword-coast"],
       "keywords": ["deadly", "boss", "lair"]
     },
     "rule_base": "2024RAW",
     "difficulty": "deadly"
   }
   ```

3. **Retriever** finds 8 relevant chunks about dragons, Sword Coast geography

4. **Creator** generates encounter JSON with sources_used citing all chunk_ids

5. **Validators** check AC, HP, CR appropriateness, action economy

6. **Stylist** improves descriptions while maintaining facts

7. **Finalizer** creates summary: "Added 1 adult red dragon encounter in mountain lair"

8. **User approves** via Canon Clerk → chunks added to canon_chunks

## Troubleshooting

### MongoDB Connection Error
```bash
# Check if MongoDB is running
mongo --eval "db.adminCommand('ping')"

# Check connection string
echo $MONGODB_URI
```

### OpenAI API Error
```bash
# Verify API key
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

### Schema Validation Error
Check that all required fields are present:
- rule_base
- sources_used (array)
- assumptions (array)
- proposals (array)
- canon_update (string)

## Resources

- [Implementation Guide](./DND_GENERATOR_IMPLEMENTATION.md) - Full technical details
- [OpenAI API Docs](https://platform.openai.com/docs/api-reference)
- [AJV Documentation](https://ajv.js.org/)
- [MongoDB Node Driver](https://mongodb.github.io/node-mongodb-native/)

## Support

For questions or issues:
1. Check the implementation guide for architectural details
2. Review stage contracts in the orchestration folder
3. Examine the JSON schemas for validation requirements
4. Test validators and stages independently before full pipeline
