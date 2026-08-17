# ADR-003: Cross-service observation owner authority

- Status: Accepted
- Date: 2026-08-16
- Decision owners: GameMasterCraft, GameMaster Assistant, Virtual Combat
  Simulator, and GameMaster Studio repository owners
- Governing decision: GMA ADR-007
- Implementation sequence: GMA D9.4.27

## Decision and scope

GameMasterCraft owns every mutable Story-side input to observation: Story and
Scene identity, actors and scene-local roles, presence, position, viewpoints,
bounded access relations, paths, observables, obstructions, epistemic state,
permitted player statements, and current-Scene replacement. GMC also stores
the opaque non-canonical GMA action saga and performs the atomic final
receipt/cursor settlement. It does not own form legality, senses, resources,
action economy, mechanics, rolls, or mechanical results.

This decision incorporates GMA ADR-007's problem, terminology, trust matrix,
logical schemas, limits, validation order, recovery states, compatibility,
rollback, observability, examples, tests, human gate, and all-or-none rollout
as normative requirements. This record fixes the GMC-specific storage, route,
authorization, migration, and operational choices required by that decision.

## Authoritative records

The current `gmc_story_workspace_revisions` document remains the sole Story
workspace and current-Scene selector. Scene-kit `gmc.scene-kit/4` is stored only
inside a complete workspace revision. It adds bounded `actorMechanicsBindings`,
`observationAccess`, `observables`, and `obstructions`; no parallel observation
collection or GMA cache is authoritative.

`gmc.actor-mechanics-binding/1` is an owner-authored row in the Scene kit. It
contains campaign, actor/role, record and revision refs, the exact VCS subject
ref, tenant scope, provenance receipt refs, visibility, and active/retired
state. A model may propose a row only from owner-provided candidate refs; GMC
validates it and authors the accepted binding. Names and display labels are not
binding keys.

The existing `gmc_compound_action_instructions` collection retains immutable
player bytes. The existing `gmc_compound_action_artifact_revisions` collection
stores program `/4`, cursor, execution receipt `/2`, and an additive opaque
`gma.action-saga/1`. Saga data may contain refs, fingerprints, dispositions,
counts, accepted candidate IDs, and one bounded recoverable accepted-model
candidate while an owner commit or presentation settlement is pending. The
candidate is an untrusted proposal, not copied mutable GMC/VCS payload. Saga
storage is capped at 32 KiB, the candidate at 20 KiB, observation program `/4`
at 24 KiB (legacy programs remain 16 KiB), and receipt `/2` at 24 KiB.

## Collections and indexes

No destructive migration is permitted. The following existing indexes remain:

- unique artifact revision on user, campaign, program, revision;
- unique artifact idempotency key on user, campaign, idempotency key;
- active artifact lookup on user, campaign, program, status;
- rewind boundary and replay indexes; and
- unique instruction identity and instruction idempotency indexes.

The migration adds:

- `gmc_compound_action_artifact_revisions`: sparse non-unique lookup
  `{userId, campaignId, programId,
  "saga.operations.idempotencyKey", revision:-1}`; one immutable saga
  operation intentionally appears in multiple artifact revisions while its
  disposition advances, so uniqueness remains on each artifact write's
  idempotency key and the external owner operation;
- `gmc_compound_action_artifact_revisions`: sparse lookup
  `{userId, campaignId, "saga.operations.operationId", revision:-1}`; and
- `gmc_story_workspace_revisions`: lookup
  `{userId, campaignId, "workspace.sceneKits.sceneKitId", revision:-1}`.

Old documents without saga or Scene-kit `/4` remain readable. Prose, old
narration, `information`, or labels are never migrated into typed access or
observable truth.

## Service operations

All routes are service-authenticated and derive user/tenant scope from the
verified integration identity:

- `GET /api/gmc/v1/campaigns/:campaignId/story/observation-authority` returns
  one revision-stamped private projection for exact requested refs.
- `POST /api/gmc/v1/campaigns/:campaignId/story/observation-authority/commit`
  validates and atomically inserts one complete workspace/Scene replacement
  under expected workspace and Scene revisions plus idempotency key.
- `GET /api/gmc/v1/campaigns/:campaignId/story/observation-authority/operations/:operationId`
  returns committed, confirmed-absent, or unresolved status without payload
  leakage.
- Existing interaction-artifact create/read/update/rewind/tombstone routes
  gain saga validation and status lookup.
- `POST /api/gmc/v1/campaigns/:campaignId/story/interaction-artifacts/:programId/settle`
  requires the checkpointed settlement operation, atomically marks it
  committed, appends the immutable execution/presentation receipt (including
  the exact recoverable player presentation), and advances the cursor under
  one expected artifact revision and the same idempotency key.

Every mutation records its deterministic request fingerprint before dispatch.
A duplicate key with the same fingerprint returns the same receipt. A reused
key with different content is a conflict. A timeout after dispatch is
`outcome_unknown`; GMA must call status lookup before any resubmission.

## Owner-side validation

GMC validates tenant/campaign scope, exact contract versions and keys, bounds,
current workspace/Scene heads, complete same-locus replacement, reciprocal VCS
binding evidence, stable IDs, source refs, epistemic disclosure, access scope,
observable cardinality, obstruction applicability, anti-evasion provenance,
unchanged unrelated fields, and one active Scene beat. Unsupported blockers,
private-source disclosure, partial array patches, names-as-bindings, stale
heads, and model-selected routes or revisions are rejected.

Observation preparation is proposal-only. The first-pass
`story.observation.prepare` policy positively requires minimum changes,
concrete routine observables, apparent classification separate from identity,
bounded-negative scope, typed access, unchanged unrelated Scene data, and
preexisting provenance for blockers. At most one field-scoped repair may alter
failed proposal fields; it cannot repair bindings or authority state.

The integrated `action.intent.interpret` first pass uses
`gma.semantic-intent-policy/8`. It positively requires the same discriminated
IR `/3` shapes used by Manual transport: string outcomes for non-information
prerequisites, typed outcomes and complete same-intent local-ID groups for
information, contextual surface-error interpretation with exact typo evidence,
and surface description plus apparent classification for an unqualified closer
look at a visible actor. The response contract supplies complete concrete
non-information and information intent examples using `requestedOutcomes` as
the only legal outcome collection field, all relation defaults, and local
observer/form/subject/method rows. The original prompt forbids helper-derived
field aliases, distinguishes familiar observer kind from method kind, and
marks examples and placeholder content as non-output guidance. It returns only
the requested result root, never an echoed packet. GMC allows a 16,384-byte semantic input envelope and 4,000 output
tokens; GMA independently fixes the accepted response version and byte budget
from its immutable request. GMC's operation schema retains older IRs for
historical calls, but a fresh typed-observation request selects `/3` and cannot
downgrade through model output.

Policy `/8` also requires the result root to copy `interactionId`,
`instructionRef`, and `instructionFingerprint` exactly from the response
contract. Missing or mismatched semantic identity is not eligible for a typed
field repair: GMA discards the whole uncommitted proposal and may issue one
complete same-version rebuild with the rejected proposal excluded. GMC's
integrated operation publishes the identical positive identity requirement and
policy version as Manual GMA; a version or instruction mismatch is a
cross-service release stop.

Fresh observation program `/4` uses GMA compiler policy `/7`. An explicit
observation group is the sole compiled binding record for its observer,
method, optional form, and viewpoint, so an observation node carries one typed
data requirement per requested outcome without duplicating those bindings as
generic presence, canonical-reference, continuity, or capability rows.
Prerequisite nodes retain their complete requirements. GMC remains the
independent storage-boundary enforcer: it accepts the losslessly normalized
program only when every outcome and group is present and the total remains at
or below sixteen, and it rejects any overbound or silently truncated program.
GMC does not reinterpret or re-expand the compiler-owned binding rows.

The first-pass response contract and integrated instruction also publish the
complete facet, value-kind, and precision vocabularies. They positively map a
distance request to `spatial_relation` plus a compatible relation or
measurement value kind and require the local stated relation origin, preventing
models from inventing `distance` enum members.

When one evidence phrase requests multiple compatible outcomes under the same
observer, method, viewpoint, prerequisites, and relation origin, the first pass
requires one information intent and one observation group containing all of
those outcomes. The outcomes may reuse the exact phrase inside that intent but
the writer cannot assign it to separate intents.

## Lifetimes, recovery, and privacy

Scene-kit `/4` and accepted bindings live with workspace revision history.
Read projections are request-local. Saga operations and receipts are immutable
history. Rewind retires later Scene/artifact revisions without deletion and
cannot independently rewind VCS.

GMC returns typed internal error families and bounded status, while GMA/Studio
produce player language from confirmed saga disposition. Diagnostics contain
only hashed IDs, numeric revisions, contract/policy versions, counts,
dispositions, and correlation IDs—never instruction text, names, observable
values, permitted statements, private facts, prompts, or model output.

## Compatibility, rollback, and deployment

Readers accept Scene-kit `/2` and `/3`, playable context `/2` and `/3`, program
`/2` and `/3`, and receipt `/1`. Only the full ADR-007 writer bundle emits
Scene-kit `/4`, program `/4`, saga `/1`, and receipt `/2`. A chain never mixes
generations.

The writer and health advertisement are enabled only with exact
`studio.observation-saga-writer-bundle/1` contracts and passing conformance.
Rollback stops fresh writer emission, preserves committed Scene and artifact
revisions, keeps readers and status lookup, reconciles unknown operations, and
never recreates truth from GMA, Manual packets, browser state, or narration.

Release requires unit, route, database-index, migration, tenant, stale-head,
idempotency, lost-response, status, atomic replacement, blocker, disclosure,
saga, settlement, rewind, privacy, and generated-contract tests; full GMC
checks; a production-safe synthetic create/commit/status/settle/cleanup smoke;
and exact bundle conformance from a verified `main` deployment.

## Review record

Accepted after the containment replay proved that pausing the route was safe
but not a player-complete result. The four repository owners approved the
governing documented plan by directing implementation to proceed. Any material
change to ownership, storage, operation ordering, or settlement reopens this
decision before code changes.
