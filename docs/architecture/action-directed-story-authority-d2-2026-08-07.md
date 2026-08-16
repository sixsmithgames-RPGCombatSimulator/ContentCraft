# Action-directed Story authority — D2 implementation record

- Status: Implemented and production-verified
- Date: 2026-08-07
- Governing design: GMA ADR-005 and Studio ADR-005
- Subordinate plan: GMA action-directed Story implementation plan, phase D2
- Runtime owner: GameMasterCraft (GMC)

## Intent

Implement the GMC half of action-directed Story play without enabling GMA's
gameplay route. GMC will persist the bounded version 2 Story graph and provide
one idempotent, revision-checked scene-handoff operation that makes a single
Scene kit the authority for playable locus, present cast, active beat, and
scene-local established material.

## Scope

This phase adds:

- `gmc.story-graph/2` persistence inside the existing revisioned Story
  workspace;
- an idempotent compatibility projection from version 1 flat arcs and Scene
  kits, without changing their truth state or inventing hierarchy, Story
  bindings, presence, or outcomes;
- bounded graph validation for identity, source provenance, truth/preparation
  state, one primary parent, related links, cycles, depth, counts, and bytes;
- receipt-backed version 2 beat and actual Story-impact deltas that preserve
  every unaffected record and graph node;
- one atomic scene-handoff write supporting reuse, selection, creation, and
  replacement;
- one player-safe `gma.playable-scene-context/2` projection plus a private,
  service-only Story context derived from the same committed revision;
- revision and idempotency receipts suitable for later GMA narration
  validation; and
- health/contract advertisement only after the complete D2 authority boundary
  is deployed.

This phase does not enable action-directed routing in GMA, call an LLM, choose a
player action, apply VCS mechanics, expose private Story preparation to a
player route, or implement the Studio D3 interface.

## Authority and state lifetime

The existing immutable Story-workspace revision document remains the atomic
storage unit. Its additive `storyGraph` field is GMC campaign preparation. A
committed version 2 Scene kit is scene-lifetime authority. The workspace's
`activeSceneKitRef` is the only current-scene pointer; playable locus and cast
are projections of that kit, never separate mutable state.

An accepted handoff records the prior Scene kit's supported exit, writes the
new or selected active Scene kit, advances the graph only through explicit
receipt-backed changes, and produces a single new workspace revision. A failed
validation, stale compare-and-swap, or rejected write produces no new revision.

## Compatibility and migration

- A version 1 arc becomes one graph node with no parent unless a source-backed
  relationship already exists.
- A version 1 Scene kit becomes a version 2 kit with one playable locus, bounded
  beats derived from existing important beats, and no invented Story bindings.
- Existing IDs, truth states, planning states, timeline anchors, mechanics
  receipts, reveal receipts, and frontier candidates are preserved.
- Version 1 `portfolio.arcs` remains a read-only compatibility projection of
  graph nodes during rollout.
- Transit can seed a scene-local locus only when the handoff proposal supplies
  the matching player-direction/source receipt. It is retained as provenance,
  not a second current-scene authority.
- Migration is deterministic and idempotent. Reading can project legacy state;
  the first accepted version 2 write persists it.

## Validation and write order

The handoff operation validates, in order:

1. schema, identifiers, idempotency fingerprint, counts, and byte limits;
2. campaign, player-action fingerprint, source receipts, and proposed fact
   provenance;
3. expected workspace and current-scene revisions;
4. graph references, truth/preparation states, hierarchy, and bounds;
5. Scene-kit readiness, locus, exact present cast, scene-local roles,
   established elements, information states, active beat, exits, and Story
   bindings; and
6. public-projection privacy and single-current-scene invariants.

Only then does one immutable workspace revision commit. GMC never changes a
material proposed fact while keeping its supplied prose. Validation errors
return field paths to the service caller; player wording remains GMA's later
responsibility.

## Bounds and operation budget

- Story graph: 32 active plus 96 retained nodes, depth 8, 6 related links per
  node, 8 pressures and 24 source refs per node, 65,536 bytes.
- Scene kit: 65,536 bytes.
- Scene-handoff proposal/result input: 20,480 bytes.
- Player-safe context: 18,432 bytes.
- Story workspace after graph migration: 196,608 bytes.
- Story delta: 8,192 bytes and 16 changes per bounded collection.
- A handoff is one GMC authority operation and one committed revision.

## Idempotency and concurrency

The operation request hash includes the exact proposal. Reusing an idempotency
key with the same hash returns the original committed receipt and projection.
Reusing it with different content is rejected. The database's unique workspace
revision and idempotency indexes provide the final compare-and-swap boundary;
concurrent contenders cannot both establish current scene authority.

## Rollback

The D2 capability advertisement is removed as one unit. Stored graph and Scene
kit version 2 records remain readable. The compatibility projection supplies
legacy clients, but rollback never reactivates transit or another location
record as a second current-scene authority for a campaign with a committed
version 2 handoff. Rewind supersedes later immutable workspace revisions and
therefore restores graph and current Scene-kit state together.

## Observability

Redacted revision audit records workspace bytes, graph counts/depth, changed
record references, handoff mode, active Scene-kit identity, and receipt refs.
Logs may include internal validation codes and field paths but not private Story
content, player prose, or hidden names. Health exposes contract versions,
limits, authority, and the all-or-none capability bundle.

## Risk assessment

The highest risks are split current-scene authority, partial writes, graph
cycles, possibility-to-fact promotion, private preparation leakage, and replay
of changed content under an old idempotency key. Hard validation, immutable
revision writes, exact request hashing, field allowlists, and public-projection
tests are release gates. This phase deliberately leaves GMA routing off, so a
GMC defect cannot redirect live narration during D2 rollout.

## Verification strategy

Automated tests must cover:

- graph positive, cycle, depth, missing-ref, related-link, count, truth,
  provenance, and byte boundaries;
- deterministic legacy graph and Scene-kit migration with no invented parent,
  binding, cast, information answer, or outcome;
- bounded version 2 deltas preserving unaffected nodes and requiring receipts
  for actual impacts;
- handoff reuse/select/create/replace, canonical and scene-local loci, exact
  cast versus ambient roles, prior-scene exit, active beat, and Story impacts;
- duplicate replay, changed replay, stale workspace, stale current scene,
  concurrent conflict, rejection, rewind, and no half-applied current scene;
- player-safe projection allowlists and private-field leak rejection; and
- compiled server import, server/client production build, migration dry run,
  rollback behavior, health advertisement, and downstream Studio/GMA contract
  compatibility.

## Exit gate and known limitation

D2 is complete only when the full GMC check passes, the migration and rollback
tests pass, production health advertises the complete D2 boundary, and deployed
routes pass smoke tests. GMA continues to advertise `routeEnabled: false` until
D4/D5. Human chaotic playtesting is intentionally deferred until the integrated
route and Studio workflow exist; D2 alone is an authority/API release.

### Completion record

D2 was implemented in GMC 1.9.0 and deployed from `origin/main` on 2026-08-07.
The full provider, LLM-contract, typecheck, lint, 107-file/674-test, server,
client, and serverless-import gates passed. All Vercel targets completed
successfully. Production `GET /api/health` and the service-authenticated Story
contract route advertise the complete four-capability bundle, the exact version
2 contracts, `authority: "gmc"`, and `routeEnabled: false`. GMA gameplay
routing and human chaotic playtesting remain gated for the later integration
phases.

## D5-D7 integration addendum

D5 adds no second Story authority. GMC registry `2026-08-08.8` registers the
combined proposal-only `story.turn.direct` operation with the complete
first-pass locus, cast, beat, payoff, provenance, agency, mechanics, and prose
freedom policy. The operation permits one provider attempt and no fallback;
GMA owns the one focused field repair and one authority rebase budget.

The D7 provider-conformance hardening keeps that authority model unchanged but
separates the two model result shapes. `story.turn.direct` now supplies the
provider with required nested boundaries for the handoff, Scene kit,
material claims, payoff, and agency audit; empty top-level orchestration objects
are not valid drafts. The provider-supported schema is deliberately shallower
inside Scene-kit collections because Gemini rejects the fully expanded schema
as too complex; the versioned first-pass prompt states every leaf requirement
and GMA's deterministic compiler enforces every leaf before any GMC write.
`story.turn.repair` is a distinct proposal-only, single-attempt operation. Its
version 3 result returns the bound correction ID, an optional structured
`sceneKitPatch`, and a bounded `patchesJson` string for the remaining small
field replacements. A whole Scene-kit replacement must use `sceneKitPatch` and
must not be escaped inside `patchesJson`; other decoded keys may contain only
the permitted field paths. This static provider schema avoids both
runtime-generated JSON-schema property names and the truncation/escaping
failure caused by serializing a complete nested Scene kit as one JSON string.
GMA still validates the exact allowed paths and complete replacement values
before merging. The operation cannot commit Story state. Version 2 repair
results remain readable only during the ordered GMC-first/GMA-second rollout.
Integrated whole-Scene-kit correction uses the dedicated
`story.scene-kit.repair` operation. Its provider response is a bounded keyed-row
transport: every required flat Scene-kit field appears exactly once as
`{key,valueJson}`, and each `valueJson` contains only that field's JSON value.
GMC rejects missing, duplicate, unknown, or malformed rows. GMA deterministically
decodes the rows, reassembles `gmc.scene-kit/2`, and runs the unchanged Director
and GMC validators. This provider-preflighted four-field root schema fits
Gemini's schema-complexity ceiling while preventing empty nested placeholders.
Registry client `2026-08-08.4` is intentionally incompatible with this transport;
the ordered GMC-first rollout therefore makes GMA 0.19.12 fail closed until the
matching GMA release is live instead of allowing it to misread a repair result.
The whole-kit repair remains one provider operation. It uses low provider
reasoning and a 7,000-token combined reasoning/output ceiling so the bounded
keyed rows can finish without spending a second attempt; a provider
`MAX_TOKENS` finish is recorded distinctly as truncated output.
Because `valueJson` is provider-opaque, the versioned first-pass system policy
also states every logical join constraint: each information record has at least
one matching access row, beat impacts reference returned beats, and completion,
failure, abandonment, and redirect exits are all present. GMC verifies those
requirements after decoding the rows.
It replaces, rather than adds to, the one focused repair call. Small-field and
manual repairs continue to use `story.turn.repair`; neither operation can
commit authority state. For the integrated flat operation, GMA replaces only
the repair packet's response-format instructions with the registered flat
transport contract; immutable action, evidence, allowed paths, current values,
and field contracts remain unchanged.

Scene-kit information is fact-bearing. Every newly accepted
`gmc.scene-kit/2` information record carries bounded `factText`: the definite
in-world fact preparation established, not a label such as “contents
revealed.” `accessVectors` still describe how it may be learned and `state`
controls disclosure. Concealed or undetermined `factText` appears only in
GMC's service-only Director context; the playable projection strips it.
Plainly visible or confirmed-absent facts may be projected only after accepted
narration states that exact fact. Legacy persisted v2 records without
`factText` remain readable, but GMC reports blocking preparation debt and no
new handoff may commit them unchanged.

An accepted-v1 imported scene can legitimately predate explicit Story
bindings. During that scene's one blocking materialization pass, the private
Director projection includes at most four active GMC Story nodes when exact
kit bindings are absent. If the imported workspace has no graph nodes, GMC
derives exactly one transitional thread from the accepted Scene kit's stable
identity, purpose, dramatic question, pressures, and committed source refs.
That deterministic node has no inferred parent: it appears in the private
Director projection and is persisted in the same atomic workspace revision as
the first accepted v2 handoff. The handoff must bind its active beat to one of
those real nodes; after that commit, projections return to exact Scene-kit
bindings only.

The existing current-scene context response now includes a bounded
`gmc.story-authority-receipt-catalog/1` generated from the same immutable Story
workspace revision as its playable and private projections. GMA may use those
receipts for GMC-owned sources and may mint only its own `gma:` scene-local
sources. Scene handoff remains the same one-write D2 transaction. The prior
registry client version remains accepted only to permit the ordered GMC-first
deployment.

Player-facing `openingNarration` is prose, not an identifier or single-line
metadata field. Its contract permits ordinary line-feed paragraph breaks and
horizontal tabs while continuing to reject every other C0 control character,
DEL, empty text, and text beyond the existing 16,000-character bound. GMA's
Director compiler and GMC's authority validator must accept the same prose
surface so a valid multi-paragraph first pass cannot fail only at commit time.
All identifiers, labels, facts, objectives, and other structured text retain
their existing stricter single-line validation.

The full GMC check passes with 108 test files and 676 tests, including operation
policy, compatibility, receipt-catalog, atomic handoff, typecheck, lint, and
production builds. Commit `4ee49b2db7636a65b9de0e09964d9c770a7489d2`
is on `origin/main`; all three Vercel targets are `READY`. Public health and the
service-authenticated LLM contract confirm GMC 1.9.0, registry `2026-08-07.1`,
32 operations, and `story.turn.direct` with policy
`gma.story-director-policy/1`. GMA gameplay routing remains disabled; D6 may
begin only after separate authorization.

## D9.1 provider-schema convergence addendum — 2026-08-08

GMA ADR-005's Accepted D9.1 amendment keeps GMC's authority boundary unchanged
while closing a model-provider schema split. Registry `2026-08-08.9` adds
`story.current-scene.narrate` for `gma.current-scene-narration-result/4` and
reserves `story.turn.direct` for `gma.story-director-result/2`. Both operations
require `gma.scene-realization/1`: exact prose evidence for requested responder
coverage, concealment continuity, and action-matched capability results, with
unsupported rules explanations kept outside in-character prose. Both are
single-attempt, proposal-only operations. The registered first-pass policies
also require failure risk to be conditional on a concrete failed, detected,
conspicuous, delayed, or otherwise risky course; merely taking another action
cannot fail a scene.

GMA selects the operation from the versioned packet task. GMC does not accept a
ready-scene result through the handoff schema, and GMA does not fall back to
that incompatible operation or to legacy narration. Existing Story workspaces,
Scene kits, receipts, and accepted timeline history require no migration. The
new operation cannot commit Story or mechanics; GMC scene handoff and VCS
receipts remain the only corresponding authorities.

## D9.3 substantive-scene-reveal addendum — 2026-08-09

GMA ADR-005's Accepted D9.3 amendment keeps GMC as the sole owner of prepared
Scene-kit facts while closing the remaining preparation/narration split. A
central story-bearing target named by a Scene kit's purpose or dramatic
question must have a concrete information fact and access vector before that
scene is released. A container label such as “six sealed crates” does not
answer what the crates hold; the prepared fact must name their contents or a
bounded absence.

Registry policy `gma.story-director-policy/3` teaches the Director to resolve
blocking scene-substance debt through the existing one-operation same-scene
replacement. The proposal adds the minimum fixed information row, advances the
Scene-kit revision, and states any directly reached fact exactly in opening
narration before GMC commits it. This is still one atomic D2 handoff and does
not create a second current-scene or Story authority.

Registry policy `gma.current-scene-narration-policy/5` accepts only the bounded
`gma.action-bound-reveal/1` subset supplied by GMA. It may disclose those
action-matched private rows and no others. Directly observable contents appear
before a roll. Each prepared check branch binds a concrete finding, bounded
negative, or specific barrier through `gma.substantive-outcome/1`; the fixed
contents cannot change between outcome bands. VCS may select cost,
completeness, danger, time, or interpretation, but never what GMC prepared as
existing in the scene.

Legacy Scene kits remain readable. If a declared action reaches a target with
no adequate contents fact, GMA creates blocking preparation debt and asks for
one same-scene replacement rather than releasing vague narration or a generic
check. No player action, completed receipt, timeline history, or existing fact
is rewritten. The registry operations remain single-attempt and proposal-only;
GMA retains bounded repair and player-facing recovery responsibility.

The D9.3 GMC implementation completed its automated release gate on 2026-08-09:
provider and generated-contract guards, type checking, lint, 686 tests, and the
production server/client build passed. Production human replay of the retained
cart scene remains the final acceptance gate.

## Accepted D9.4.26 typed-observation authority addendum — 2026-08-16

The governing GMA ADR-005 D9.4.26 and matching Studio ADR-005 amendment are
accepted here by reference following repository-owner direction to implement
the reviewed first-class observation plan and prevent split-brain state.

GMC remains the sole mutable authority for current Scene observable truth.
`gmc.scene-kit/3` adds typed `observables` and `obstructions` beside the existing
Story `information` collection. They are stored, projected, rewound, and
replaced only as part of the same expected-revision, idempotent, atomic Story
workspace transaction as the Scene-kit reference, playable locus, cast, active
beat, and Story design. GMC never accepts an observation-only patch outside that
transaction.

Each observable has a stable ID, subject ref, facet, discriminated typed value,
concrete player-facing statement, perceptible modalities/access condition,
epistemic state, and authority-backed source refs. Each obstruction has a stable
ID, subject/area scope, affected facets and modalities, mobility effect,
concrete player-facing statement, and source refs. Apparent classification is
separate from canonical identity. Undetermined or missing truth is not a
terminal observation result.

GMA may submit a `story.observation.prepare` proposal containing an exact
observation-request fingerprint and expected GMC Story/Scene revisions. GMC
validates the full Scene-kit-v3 replacement and returns one authority receipt.
GMA must then reload the committed GMC projection before resolving or
narrating; the staged proposal or model output is never authority. Duplicate
delivery with the same idempotency key returns the original receipt, a changed
payload under the same key fails, and a timeout is recovered by querying the
original operation rather than issuing a new write.

`gma.playable-scene-context/3` projects the exact current Scene ref, revision,
player-safe observable subset, and private service-only observable/obstruction
catalog from one immutable workspace snapshot. It never merges another cache,
receipt, narration, or display-name match. GMA observation requests and
resolutions are request-local orchestration artifacts; immutable GMA receipts
are historical evidence and cannot update GMC state. VCS remains mechanics and
live capability authority and does not own Scene observables.

GMC readers accept Scene-kit v2 and v3. Version 2 produces no typed observable
authority and therefore requires an expected-revision v3 replacement before a
fresh typed request can narrate; GMC does not infer typed facts from legacy
`factText` or `accessVectors`. New writing and capability advertisement are
all-or-none and remain disabled until Studio and GMA readers are deployed.
Rollback disables new writes but preserves v3 readers and committed revisions.

Release requires exact-key and discriminated-value validation, source and
visibility enforcement, atomic replacement, duplicate/idempotent replay, stale
revision, out-of-order, timeout recovery, partial-result rejection, rewind,
player/private projection, no display-name joins, no observation-only mutation,
cross-service compatibility, full checks/build, exact production health, and
zero split-brain signals during the selected-campaign canary.
