# GameMasterCraft Integration API

The `/api/gmc/v1` API is the canon and generation surface used by GameMaster Assistant. GameMasterCraft remains the canon authority.

## Authentication

Local `SINGLE_USER_MODE=true` uses `DEFAULT_USER_ID`. Otherwise requests may use
the same delegated Clerk bearer token as the rest of GameMasterCraft:

```http
Authorization: Bearer <Clerk session token>
X-Sixsmith-Correlation-Id: <UUID>
```

For trusted backend jobs, service auth remains supported:

```http
Authorization: Bearer <GMC_SERVICE_API_KEY>
X-Sixsmith-User-Id: <Clerk user ID or existing GMC user email>
X-Sixsmith-Correlation-Id: <UUID>
```

The service key must contain at least 32 characters and must remain server-side.
When a Clerk token is supplied, GMC derives the owner from the token `sub`.

## Private GMA scene plans

GMC advertises the additive `gmc.gma-scene-plan-store/1` contract in
`GET /api/health`. These endpoints require service authentication (or local
single-user mode); a Clerk browser session receives
`403 SERVICE_AUTH_REQUIRED`. The private payload is integration state, not
campaign canon, and never appears in health, dashboard, scene, timeline, or
public campaign responses.

```http
POST /api/gmc/v1/campaigns/{campaignId}/integration/scene-plans/revisions
GET  /api/gmc/v1/campaigns/{campaignId}/integration/scene-plans/active?scenePlanId={id}&sceneId={id}&schemaVersion=gma.scene-plan/2
GET  /api/gmc/v1/campaigns/{campaignId}/integration/scene-plans/{scenePlanId}/revisions/{revision}?payloadHash={sha256}
POST /api/gmc/v1/campaigns/{campaignId}/integration/scene-plans/{scenePlanId}/rewind
```

An append supplies one `gma.scene-plan/2` private payload plus its canonical
scene ID, stable plan ID, expected active revision, idempotency key, source
revision map, interaction ID, and timeline anchor:

```json
{
  "sceneId": "scene-flintwake",
  "scenePlanId": "plan-flintwake",
  "schemaVersion": "gma.scene-plan/2",
  "expectedRevision": 0,
  "idempotencyKey": "scene-plan:interaction-123",
  "sourceRevisions": { "gmcCanon": 12, "gmcPresence": "presence-4", "vcs": 9 },
  "interactionId": "interaction-123",
  "timelineAnchor": { "messageId": "message-123", "sequence": 18 },
  "privatePayload": {
    "schemaVersion": "gma.scene-plan/2",
    "sceneId": "scene-flintwake"
  }
}
```

GMC validates a schema allowlist, JSON shape, tenant/campaign ownership, and a
65,536-byte hard payload ceiling. It hashes canonical JSON so field order does
not change identity. The append is optimistic: `expectedRevision` must equal
the active compatible revision (`0` for the first append). Repeating an
identical idempotency key returns the original opaque `gma.scene-plan-ref/1`
data; reusing it for different content or writing from a stale revision returns
a typed `409` without changing storage.

Revision content is append-only. A rewind supplies `expectedRevision`, a
non-negative `boundarySequence`, and a stable `rewindId`. GMC supersedes every
available revision after that timeline boundary and returns the exact prior
opaque reference, or `null` when the rewind predates the plan. Later writes use
new monotonically increasing revision numbers; superseded history is never
overwritten. Diagnostics contain hashes, sizes, top-level key names, source
revision key names, and timeline anchors only—not private payload values.

## Typed GMA location routing

GMC advertises the additive scene-story routing family in `GET /api/health`:

- `gma.location-routing/1` for the compact GMA routing projection;
- narration evidence `2026-08-02.1`; and
- world-generation policy `2026-08-02.1`.

Older GMA clients that omit `contractVersions` continue receiving narration
evidence `2026-07-24.1` and world-generation policy `2026-08-01.1`. A new
client opts into the additive contracts explicitly, so deploying GMC first does
not break the already-deployed consumer.

`memory/resolve-references`, `memory/prepare-references`, and
`narration/evidence` accept this optional request material:

```json
{
  "contractVersions": {
    "narrationEvidence": "2026-08-02.1",
    "worldGenerationPolicy": "2026-08-02.1"
  },
  "locationRouting": {
    "authority": "gma.location-routing",
    "contractVersion": "gma.location-routing/1",
    "policyVersion": "gma.location-intent/1",
    "instructionFingerprint": "sha256-without-prefix",
    "locationMentions": [
      {
        "id": "location-1",
        "sourceSpan": { "start": 0, "end": 21, "quote": "Where is Dorrik from?" },
        "actingEntity": "player",
        "normalizedReference": "dorrik origin",
        "role": "background_fact",
        "movementState": "none",
        "confidence": 0.99,
        "ambiguity": null
      }
    ],
    "movementState": "none",
    "locationIntent": "reference",
    "generationIntent": "npc_background",
    "taskKind": "narration"
  }
}
```

GMC validates every source span against the exact instruction. A person-location
relationship gap can become destination authority only when the accepted
projection positively establishes player travel and arrival (or an explicit
creation target). Background facts, dialogue subjects, references, current
settings, malformed projections, and absent positive movement fail closed to no
destination authority. Existing-NPC background development uses
`allowedDevelopmentKinds:["npc_background"]` with
`allowedEntityTypes:[]`, `allowSceneSettingCreation:false`, and
`destinationAuthority:null`; it never creates a substitute NPC or location.

## Campaign and live context

```http
GET /api/gmc/v1/campaigns
POST /api/gmc/v1/campaigns
GET /api/gmc/v1/campaigns/{campaignId}
GET /api/gmc/v1/campaigns/{campaignId}/dashboard
GET /api/gmc/v1/campaigns/{campaignId}/scenes/current
POST /api/gmc/v1/campaigns/{campaignId}/scenes/presence/preview
POST /api/gmc/v1/campaigns/{campaignId}/scenes/transition/resolve
POST /api/gmc/v1/campaigns/{campaignId}/scenes/narrative/validate
POST /api/gmc/v1/campaigns/{campaignId}/scenes
PATCH /api/gmc/v1/scenes/{sceneId}
```

The dashboard aggregates current scene/location, present NPCs, scene-relevant memory, recent session summary, and existing project content summaries. `memoryContext` is the authoritative retrieval projection described below; the legacy `relevantFacts` and `openThreads` fields mirror its FACT and EVENT arrays.

`scenePresenceContract` is the revision-bound narration authority. It includes `exactPresentNpcIds`, resolved `presentNpcs`, `knownNonPresentNpcs`, `unresolvedPresentNpcIds`, and `valid`. Its revision covers the scene identity/update, exact roster, and canonical NPC names/aliases. Consumers must fail closed when the contract is invalid or stale; a known non-present NPC cannot act, speak, observe, carry evidence, guard, or receive an assignment. Commit arrivals/departures through the scene API before narrating from the changed roster.

`scenes/transition/resolve` is the authoritative scene-change resolver. It accepts the current presence revision plus the player instruction and structured `where` and `who` fields. Canonical-only instructions require the destination field to begin with one exact existing location name or alias and resolve every NPC by canonical identity. When `memory/resolve-references` authorizes bounded world generation, the request may also include matching location/NPC `generatedEntities`; GMC assigns deterministic preview identities without writing them and returns them in the revision-bound `gmc.sceneTransition` contract. Consumers must use that exact destination, generated-entity set, and roster contract for validation and application; they must not score generic memory references or substitute a different scene projection.

`scenes/narrative/validate` is the deterministic pre-commit presence authority. It accepts the expected current revision, response mode, narration, and optional scene segment; resolves any destination through the same scene-transition contract; and returns `gmc.narrativePresence` version `2026-07-20.1`. It rejects an absent NPC only when the NPC is declared in the exact scene roster or receives an unambiguous scene-local action. Historical, reported, speculative, remote, and OOC references remain valid and are classified in the response instead of being mistaken for physical presence.

A revision-bound `POST .../scenes` current-scene commit must supply both `expectedCurrentRevision` and the exact `expectedPresenceRevision` returned for the proposed destination. A generated scene additionally supplies the exact transition revision, generated-entity revision, original instruction, and normalized generated entities. GMC independently recomputes every contract, materializes the scene-bound entities, verifies the final presence revision, and then makes the scene current. If that operation fails, GMC removes every newly created entity/scene record and reports compensation failure explicitly. This closes the gap between validation and commit; it never substitutes a different destination or roster and never leaves a silently partial generated scene.

## Player character-sheet review

```http
POST /api/gmc/v1/campaigns/{campaignId}/character-sheet-reviews/observe
POST /api/gmc/v1/campaigns/{campaignId}/character-sheet-reviews/{characterId}/resolve
POST /api/gmc/v1/campaigns/{campaignId}/character-sheet-reviews/confirm-authority-mutation
```

GMC persists the last confirmed VCS character-sheet revision and a normalized snapshot of resources, equipment, weapons, armor, tools, and first-class magic-item fields. Observing a different material revision creates a pending review without changing VCS. GMA must pause automated sheet writes while that review is pending.

`resolve` accepts `keep` only with a human reason of at least eight characters and advances canon to the exact reviewed VCS revision. A `revert` is accepted only after VCS confirms a revision-bound restoration whose normalized snapshot exactly matches the prior baseline. `confirm-authority-mutation` advances the baseline after a successful GMA write or compensation and fails closed if the expected baseline is stale or a player review is pending. Resolution and GMA confirmation history is retained for audit and table rulings.

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
POST /api/gmc/v1/campaigns/{campaignId}/memory/resolve-references
POST /api/gmc/v1/campaigns/{campaignId}/memory/prepare-references
POST /api/gmc/v1/campaigns/{campaignId}/narration/evidence
Content-Type: application/json

{
  "currentLocationId": "location-room-id",
  "presentNpcIds": ["npc-contact-id"]
}
```

The returned `memoryContext` always includes world FACTs, plot ITEMs, and BBEG/lieutenant entity memory. It adds geographic FACTs/EVENTs whose location is in the current ancestry, minor entity memory only when that entity is present, and mundane/currency/furniture ITEMs only when their location or owner is in the scene. `retrieval.included` and `retrieval.excluded` make the selection auditable.

`memory/resolve-references` is read-only. Its result includes a revision-bound `gmc.worldGenerationPolicy`. Canonical cues such as “back,” “same,” “usual,” or “last” remain binding and are never replaced by generated canon. Open-ended intent such as looking for a new mark may authorize only the necessary entity types; a mixed instruction can therefore bind a known location while allowing a new NPC there. With a typed routing projection, location generation additionally requires positive player movement/creation authority. `memory/prepare-references` performs deterministic canonical normalization, then returns the same reference-resolution contract. For example, when a player exactly names an NPC-associated place already stored in that NPC's `details.location`, GMC may materialize the missing typed Location with provenance and a reciprocal relationship only when the typed route permits location normalization. It does not invent an address, layout, business type, or other setting detail.

`narration/evidence` is the narration synchronization gate. It completes the same canonical preparation, then produces one hash-bound snapshot with:

- `evidence`: query-ranked facts, items, threads, locations, selected references, the current location, and compact role/motivation profiles for present NPCs plus only specifically referenced absent NPCs. This is the only GMC data intended for the model prompt.
- `validation`: the complete exclusive scene-presence roster and the same `evidenceRevision`. GMA keeps this outside the model prompt and uses it for deterministic output validation.

GMA must reject a mismatched evidence/validation revision, an instruction-fingerprint mismatch, or a scene-presence revision that changes before narration. This prevents prompt selection and output validation from using different views of canon.
Compact AI routes report context bytes and their tuning target in response headers. The target is observability and adaptive-packing guidance, not a request rejection limit.

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

## Action-directed Story authority (D2)

GMC 1.9.0 persists `gmc.story-graph/2` inside the immutable Story-workspace
revision and exposes one atomic Scene-kit handoff. D2 mutations and the private
scene-context read require trusted service authentication; contract discovery
and the GM-owned graph read retain the existing authenticated integration
boundary. GMA gameplay routing remains disabled until its later integration
phase.

```http
GET  /api/gmc/v1/campaigns/{campaignId}/story/graph
PUT  /api/gmc/v1/campaigns/{campaignId}/story/graph
POST /api/gmc/v1/campaigns/{campaignId}/story/migrate-v2
POST /api/gmc/v1/campaigns/{campaignId}/story/scene-handoffs
GET  /api/gmc/v1/campaigns/{campaignId}/story/scene-context
POST /api/gmc/v1/campaigns/{campaignId}/story/deltas-v2
GET  /api/gmc/v1/campaigns/{campaignId}/story/contracts
```

`POST .../scene-handoffs` accepts an authority envelope containing one
`gmc.scene-handoff-proposal/1`, the exact accepted player-action receipt, the
committed receipts for every proposed source reference, and an optional
timeline anchor. It validates workspace and current-scene revisions, graph
references, provenance, exact cast, scene-local roles, playable locus, active
beat, information states, and byte bounds before writing. A successful call
creates one workspace revision and returns the idempotent
`gmc.scene-handoff-receipt/1`, a bounded `gma.playable-scene-context/2`, and a
service-only director context. A rejection writes nothing.

`POST .../migrate-v2` defaults to `dryRun: true`. Migration preserves legacy
truth and planning states, adds no unsupported hierarchy or completed outcome,
and retains `portfolio.arcs` as a bounded compatibility projection. `PUT
.../graph` and `POST .../deltas-v2` use exact expected revisions and authority
receipts; beat and actual Story impacts commit in the same workspace revision
while unrelated nodes remain byte-identical.

The workspace `activeSceneKitRef` is the only current-scene pointer after a
version 2 handoff. The current locus, present actors, ambient roles, and active
beat are always derived from that Scene kit. A canonical location may remain a
secondary anchor inside `playableLocus`, but it is not a competing current
location.

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

All durable create requests (campaigns, scenes, sessions, facts, items, threads, NPCs, locations, and factions) require a stable `mutationId`. GMC stores or derives a durable operation identity and, for campaign resources, a semantic fingerprint. Repeating the same request returns the original record with `duplicate: true`; reusing an ID for different data returns `409 IDEMPOTENCY_CONFLICT` without changing the original. Exact semantic duplicates are also collapsed, including concurrent retries.

## Typed canon entities

NPC, location, item, and faction resources support list, get, create, and update. NPCs, locations, and items also support structured Gemini generation:

```http
GET|POST /api/gmc/v1/campaigns/{campaignId}/{npcs|locations|items|factions}
GET|PATCH /api/gmc/v1/{npcs|locations|items|factions}/{entityId}
POST /api/gmc/v1/campaigns/{campaignId}/{npcs|locations|items}/generate
POST /api/gmc/v1/items/{itemId}/supersede
```

Active NPC, location, and faction names and aliases are exclusive within a campaign and entity type. A create or rename that collides after case/punctuation normalization returns `409 CANONICAL_ENTITY_IDENTITY_CONFLICT`; callers must update the identified record or choose a distinct identity. Superseded entities remain directly addressable for audit and recovery but are excluded from campaign lists, memory resolution, scene transitions, and narration evidence.

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
POST /api/gmc/v1/ai/plan-encounter-challenge
POST /api/gmc/v1/ai/plan-encounter
POST /api/gmc/v1/ai/plan-combat-turn
```

Narration instructions explicitly prohibit inventing or recomputing VCS mechanics, require locked-canon compliance, and stop at the next player decision. Narration consumes the ordered recent conversation timeline so it continues from the latest established scene rather than replaying a prior beat. OOC responses remain table talk, while retcon responses explicitly supersede contradicted narration.
Encounter planning starts with a separate challenge-direction pass. That pass
compares the live player and support capabilities, resources, recent encounter
performance, action economy, expected accuracy and damage, time to disable,
objectives, and adverse stress cases. Challenge rating is reference-only. The
director also records a threat palette that considers canon-appropriate
monsters, magical creatures, supernatural hazards, and mixed faction/monster
encounters instead of silently defaulting to humanoids. The resulting challenge
plan is binding input to the construction pass, which then
supplies tactical map geometry, opponents, token positions, and VCS-executable
actions. Combat-turn planning controls only non-player combatants; VCS remains
responsible for dice, damage, conditions, initiative, and durable mechanical
state.
