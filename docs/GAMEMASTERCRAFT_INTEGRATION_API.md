# GameMasterCraft Integration API

The `/api/gmc/v1` API is the canon and generation surface used by GameMaster Assistant. GameMasterCraft remains the canon authority.

## Authentication

Local `SINGLE_USER_MODE=true` uses `DEFAULT_USER_ID`. Otherwise every request requires:

```http
Authorization: Bearer <GMC_SERVICE_API_KEY>
X-Sixsmith-User-Id: <Clerk user ID>
X-Sixsmith-Correlation-Id: <UUID>
```

The service key must contain at least 32 characters and must remain server-side.

## Campaign and live context

```http
GET /api/gmc/v1/campaigns
POST /api/gmc/v1/campaigns
GET /api/gmc/v1/campaigns/{campaignId}
GET /api/gmc/v1/campaigns/{campaignId}/dashboard
GET /api/gmc/v1/campaigns/{campaignId}/scenes/current
POST /api/gmc/v1/campaigns/{campaignId}/scenes
PATCH /api/gmc/v1/scenes/{sceneId}
```

The dashboard aggregates current scene/location, present NPCs, scene-relevant memory, recent session summary, and existing project content summaries. `memoryContext` is the authoritative retrieval projection described below; the legacy `relevantFacts` and `openThreads` fields mirror its FACT and EVENT arrays.

## Memory model: type and scope

GameMasterCraft stores campaign memory as three explicit record types:

- `FACT`: a durable truth about the world or an entity.
- `ITEM`: a discrete physical object with narrative tier, location, and ownership.
- `EVENT`: an unresolved pressure with a deadline/trigger and a consequence if nobody intervenes. Events use the existing thread lifecycle (`open`, `resolved`, or `superseded`).

FACT scope is one of:

- Geographic: `world`, `city`, `district`, `site`, `room`.
- Entity: `bbeg`, `lieutenant`, `henchman`, `contact`.

ITEM narrative tier is one of `plot`, `mundane`, `currency`, or `furniture`. Locations form an ancestry through `details.parentLocationId`, allowing a room scene to inherit its site, district, and city context.

```http
POST /api/gmc/v1/campaigns/{campaignId}/memory/context
Content-Type: application/json

{
  "currentLocationId": "location-room-id",
  "presentNpcIds": ["npc-contact-id"]
}
```

The returned `memoryContext` always includes world FACTs, plot ITEMs, and BBEG/lieutenant entity memory. It adds geographic FACTs/EVENTs whose location is in the current ancestry, minor entity memory only when that entity is present, and mundane/currency/furniture ITEMs only when their location or owner is in the scene. `retrieval.included` and `retrieval.excluded` make the selection auditable.

New records should use these shapes:

```json
{
  "recordType": "FACT",
  "text": "The Compact forbids unlicensed gates.",
  "scope": { "kind": "geographic", "tier": "world", "locationId": null, "entityId": null }
}
```

```json
{
  "name": "Observatory Key",
  "itemTier": "plot",
  "currentLocationId": "location-vault-id",
  "ownerEntityId": null,
  "ownerType": null
}
```

```json
{
  "recordType": "EVENT",
  "title": "The vault floods",
  "deadlineDescription": "At the next high tide",
  "consequence": "The evidence is destroyed.",
  "scope": { "kind": "geographic", "tier": "site", "locationId": "location-chapel-id" }
}
```

Records created before this taxonomy remain compatible. Legacy FACTs infer scope from their category and relationships; legacy ITEMs remain visible until classified so migration cannot silently hide canon.

## Canon and facts

```http
POST /api/gmc/v1/campaigns/{campaignId}/canon/relevant
GET  /api/gmc/v1/campaigns/{campaignId}/canon/locked-facts
POST /api/gmc/v1/campaigns/{campaignId}/canon/check-contradictions
GET  /api/gmc/v1/campaigns/{campaignId}/facts
GET  /api/gmc/v1/facts/{factId}
POST /api/gmc/v1/campaigns/{campaignId}/facts
PATCH /api/gmc/v1/facts/{factId}
POST /api/gmc/v1/facts/{factId}/lock
POST /api/gmc/v1/facts/{factId}/supersede
```

Facts are durable, campaign-scoped, optionally secret, lockable, and superseded rather than destructively deleted.

## Typed canon entities

NPC, location, item, and faction resources support list, get, create, and update. NPCs, locations, and items also support structured Gemini generation:

```http
GET|POST /api/gmc/v1/campaigns/{campaignId}/{npcs|locations|items|factions}
GET|PATCH /api/gmc/v1/{npcs|locations|items|factions}/{entityId}
POST /api/gmc/v1/campaigns/{campaignId}/{npcs|locations|items}/generate
POST /api/gmc/v1/items/{itemId}/supersede
```

Generated content remains a draft unless `makeCanon: true` is supplied.

## Threads and sessions

```http
GET|POST /api/gmc/v1/campaigns/{campaignId}/threads
GET|PATCH /api/gmc/v1/threads/{threadId}
POST /api/gmc/v1/threads/{threadId}/resolve
POST /api/gmc/v1/threads/{threadId}/supersede
POST /api/gmc/v1/campaigns/{campaignId}/sessions
PATCH /api/gmc/v1/sessions/{sessionId}/summary
```

## Live AI

```http
POST /api/gmc/v1/ai/classify-intent
POST /api/gmc/v1/ai/generate-narration
POST /api/gmc/v1/ai/respond-ooc
POST /api/gmc/v1/ai/retcon-narration
POST /api/gmc/v1/ai/generate-npc-dialogue
POST /api/gmc/v1/ai/extract-canon-changes
POST /api/gmc/v1/ai/summarize-session
POST /api/gmc/v1/ai/build-campaign-foundation
POST /api/gmc/v1/ai/detect-encounter-transition
POST /api/gmc/v1/ai/plan-encounter
POST /api/gmc/v1/ai/plan-combat-turn
```

Narration instructions explicitly prohibit inventing or recomputing VCS mechanics, require locked-canon compliance, and stop at the next player decision. Narration consumes the ordered recent conversation timeline so it continues from the latest established scene rather than replaying a prior beat. OOC responses remain table talk, while retcon responses explicitly supersede contradicted narration.
Encounter planning supplies tactical map geometry, opponents, token positions,
and VCS-executable actions. Combat-turn planning controls only non-player
combatants; VCS remains responsible for dice, damage, conditions, initiative,
and durable mechanical state.
