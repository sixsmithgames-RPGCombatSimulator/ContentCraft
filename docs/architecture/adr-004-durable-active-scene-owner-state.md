# ADR-004: Durable active-scene owner state

- Status: Accepted
- Date: 2026-08-22
- Owner: GameMasterCraft
- Parent decision: GameMaster Assistant ADR-008

The repository owner directed the reviewed durable active-scene design to be
implemented and made first-class on 2026-08-22. This matching owner decision
authorizes GMC runtime work.

## Decision

GMC is the sole durable authority for the evolving fictional state of the
active Story Scene. Scene kits continue to own prepared possibilities. A new
bounded active-scene snapshot owns what accepted play has made true now, and a
new append-only receipt ledger records how each accepted turn changed it.

GMA submits only a versioned proposal compiled from a narration result that has
already passed its original prompt policy and deterministic validation. GMC
validates exact campaign, workspace, Scene-kit and state revisions; stable
subjects; source references; sequence; idempotency; and byte/count limits before
committing. Model text is never authority by itself. VCS remains sole owner of
mechanical outcomes and must supply an exact receipt for a mechanical claim.

## Storage and contracts

`gmc_active_scene_states` stores one current `gmc.active-scene-state/1` document
per user, campaign, and stable Scene-kit ID. Its independent revision is
monotonic across compatible revisions of that Scene kit. It contains bounded
actor states, continuity states, revealed information refs, settled material
facts, open prepared threads, recent event summaries, latest receipt ref, and
compaction counters. It is capped at 32 KiB.

`gmc_scene_turn_receipts` stores immutable `gmc.scene-turn-receipt/1` and
compatible `gmc.scene-turn-receipt/2` documents.
Unique indexes cover user/campaign/idempotency key and
user/campaign/Scene-kit/state-after revision. Receipts contain hashes and
bounded summaries. Version 1 contains no exact exchange. Version 2 may contain
only the exact final player-visible exchange; neither version may contain full
prompts, hidden model work, rejected drafts, or private Story context.

GMC accepts `gma.scene-turn-proposal/1` with `gma.scene-state-delta/1`. The
proposal is capped at 24 KiB. The delta may update only refs already present in
the current Scene kit, active design, or active snapshot. It cannot create
canon, actors, locations, objects, beats, obligations, or Story nodes.

The existing service-only Scene context gains an additive
`activeSceneContext:gma.active-scene-context/1` containing the bounded snapshot
and up to eight recent receipt summaries. A missing stored snapshot projects as
revision zero from the exact current Scene kit, so migration is lazy and does
not promote historical prose into facts.

The existing private Scene Director context also projects only the current
participants' bounded NPC Scene cards and readiness records. GMA exposes these
to narration as `gma.scene-participant-context/1`, so the narrator can make
prepared NPC decisions without treating private motives as player knowledge or
reconstructing them from transcript prose.

## State rules and compaction

Actor updates are keyed by current actor or scene-local role ref. Continuity is
keyed by aspect. Reveals must target a current Scene information ref. Settled
facts retain their narration evidence, supporting fact refs, and source turn.
Threads must bind to a prepared beat, Story node, obligation, information,
element, observable, obstruction, or existing thread ref.

After 24 turns or at 75 percent of the snapshot byte limit, deterministic
compaction retains latest keyed state, every reveal, open threads, the newest 24
events, and the newest supported settled statement for each stable fact key.
Receipts are never removed by compaction. Scene transitions select another
snapshot without deleting history. Rewind uses an audited superseding operation;
it never deletes receipts in place.

## API and flow

- `GET .../story/scene-context` additively returns active-scene context.
- `POST .../story/scene-turns` validates and commits one proposal, returning the
  exact receipt and new snapshot.
- `GET .../story/scene-turns/operations/:operationId` recovers an ambiguous
  commit without replaying it.

GMC performs one transactional write when MongoDB transactions are available.
In collection-injected tests or deployments without transactions, idempotent
receipt insertion and compare-and-swap state replacement converge safely: a
receipt is authoritative only when it names the accepted after-revision, and a
retry queries by the original operation identity.

## Bounds, compatibility, and failures

The prompt projection is capped at 24 KiB, the state at 32 KiB, a proposal at
24 KiB, each receipt at 8 KiB, and each context read at eight receipt summaries.
Validation is linear over fixed arrays. The health contract advertises
`durable-active-scene/1`, `scene-turn-receipts/1`, the exact schema versions, and
bounds only after routes and indexes are installed.

Old GMA ignores the additive context. New GMA emits writes only after capability
negotiation. Rollback stops writers first and retains readers and data. GMC
returns typed internal diagnostics; GMA translates them into player language.
No owner rejection changes state. Duplicate identical input returns the original
receipt; a duplicate key with different input fails.

## Observability

Audit fields include versions, hashed operation identity, workspace/Scene/state
revisions, counts, bytes, compaction reason, duplicate outcome, validation
family, and latency. Logs exclude full narration, prompts, private facts, exact
player speech, and credentials.

## Required tests and acceptance

Tests cover empty lazy projection, first commit, exact replay, conflicting
replay, stale workspace/Scene/state, unknown/private refs, reveal and thread
authority, sequence ordering, all count and byte bounds, deterministic
compaction over 500 turns, scene transition, operation lookup, stored privacy,
and route/health advertisement. Existing Story workspace, handoff, observation,
history, Replay, Rewind, and migration tests remain green. Complete GMC checks
must pass before the GMC commit is pushed and deployed ahead of GMA.

## Accepted durable published-conversation addendum — 2026-09-17

The repository owner requested a better conversation record, bounded to the
latest fifty interactions, and then explicitly directed careful implementation
without regressions. This addendum is Accepted and authorizes the corresponding
owner changes.

### Problem, goals, and non-goals

The version 1 receipt summaries preserve authority but cannot restore the
actual conversation after browser storage is cleared. GMC will therefore retain
the exact player message and exact narration that were actually published for
new accepted turns. The goal is reload-safe presentation continuity without a
second write or a new authority source. This does not persist prompts, hidden
reasoning, alternate drafts, corrections that were rejected, tool payloads,
private Story preparation, or arbitrary chat outside an accepted scene turn.
The stored exchange is not canon and is never supplied to a model as owner fact.

### Contracts, authority, and lifetimes

`gma.scene-turn-proposal/2` extends version 1 with one required
`publishedExchange:gma.published-exchange/1`. It contains the exact bounded
`playerMessage`, exact bounded `assistantNarration`, and response mode. GMC
validates that the player-message and narration fingerprints match the proposal
before accepting it. `gmc.scene-turn-receipt/2` stores that exchange inside the
same immutable receipt and active-state compare-and-swap recovery record.
Consequently a successful turn cannot save fictional state while losing its
published exchange, and an ambiguous response recovers both with the original
operation ID. The history reader repairs a missing append-only receipt from
that bounded recovery record before it projects the conversation.

`gmc.conversation-history/1` is a service-only, player-safe presentation
projection over accepted version 2 receipts. It returns no more than fifty
active exchanges, oldest first, with receipt, interaction, Scene-kit, phase,
sequence, and commit metadata. Version 1 receipts remain readable and their
existing summaries remain available through active Scene context. Each v2
receipt carries the current owner conversation-lineage ID. A separate
append-only rewind marker records rewind ID, parent lineage, and boundary
sequence; its rewind ID becomes the next lineage. A receipt is suppressed only
when it is beyond the boundary of a descendant lineage marker. Later branch
receipts remain visible independently of wall-clock timing. Receipts and markers are audit
history; the read window, not the immutable audit ledger, is limited to fifty.

### Flow, budgets, validation, and recovery

GMA compiles the final validated player-facing strings before the existing turn
commit. GMC accepts both strings only inside that commit, validates exact keys,
versions, fingerprints, control characters, and byte limits, then performs the
existing revision/idempotency checks. Version 2 proposals are capped at 64 KiB,
receipts at 48 KiB, player messages at 8 KiB, and narration at 24 KiB. The
history projection is capped at fifty exchanges and 2 MiB. It is never added to
the narration prompt; prompt and operation budgets from the parent decision are
unchanged.

If a history read is unavailable, gameplay remains safe because it is a
read-only presentation projection. GMA labels the degraded view, says no game
state changed, offers one refresh, and uses existing owner summaries rather than
inventing prose. The second consecutive identical failure follows GMA's support
boundary. A failed version 2 commit releases no narration. Duplicate identical
input returns the original receipt and exact exchange; different input under an
existing key fails.

### Compatibility, migration, rollback, and observability

GMC deploys first, continues accepting version 1, advertises
`durable-conversation-history/1` plus the v2 contract versions, and exposes an
additive history route. GMA emits v2 only after exact capability negotiation.
No legacy backfill is attempted because old exact prose is unavailable; the UI
continues to show version 1 summaries. Rollback disables v2 writers first and
leaves v1 readers, all receipts, and markers intact.

Metrics may record versions, counts, byte sizes, truncation, duplicate/recovery
outcomes, rewind-marker outcomes, and latency. Logs, traces, errors, and support
codes must not record the player message or narration. Access remains scoped by
user and campaign through the existing service integration boundary.

### Required tests and release gates

Tests cover v1 unchanged behavior; v2 first commit, exact replay, conflicting
replay, hash mismatch, size/control-character rejection, and crash recovery;
mixed v1/v2 projection, chronological order, fifty-entry and byte bounds,
campaign isolation, no private fields, and no prompt injection; rewind,
duplicate rewind, and new-branch visibility; route and capability advertisement;
and GMA dashboard reload/degraded-copy behavior. Existing Story, active Scene,
observation, action-directed, mechanics, Manual AI, Replay, Rewind, migration,
and 500-turn suites remain green. Complete GMC and GMA checks and Studio
compatibility validation are release gates; deployment order is GMC, GMA, then
Studio pinning.
