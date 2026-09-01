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

Receipt-backed contributions are events, while Scene-kit and Story-design
revisions describe material record content. GMC therefore preserves every new
satisfaction receipt and actual impact even when an obligation remains in its
current coarse state, but it increments the design revision only when a design
field actually changes. Reasserting `partially_satisfied` as
`partially_satisfied` is not a design mutation and cannot create a synthetic
revision conflict.

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

## Proposed D9.4.27 containment and successor — 2026-08-16

A system-of-systems review found that the D9.4.26 capability claim could be
present without the complete temporal GMA/GMC/VCS join, reciprocal bindings,
revision-consistent read set, and distributed settlement required for first-
class observation. Proposed GMA ADR-007 therefore supersedes D9.4.26 for fresh
writer enablement while preserving GMC's accepted storage and reader history.

GMC 1.10.5 withdraws the two fresh-writer capabilities and continues to expose
the established four-capability action-directed Story bundle with
`routeEnabled: false`. Existing Scene-kit `/3` records and readers are not
rewritten or deleted. No fresh typed-observation writer may be advertised until
the matching GMC owner decision is Accepted and deployed conformance proves the
complete successor bundle. This containment changes no canonical Scene data.

GMC 1.10.6 closes the compound-path omission discovered after that release.
The active compound interpreter again emits Accepted semantic IR1 under policy
3, matching the program-2 artifact store and the GMC/VCS/Studio health bundle.
It retains the non-collapsing observation-outcome rule as ordinary strings,
while fresh typed observation requests remain stopped in GMA before model or
authority work. This is containment under the Accepted D9.4 baseline; it does
not accept or implement Proposed ADR-007.

## Accepted D9.4.40 owner-resolved causal Replay checkpoint — 2026-08-18

GMC accepts GMA ADR-005 D9.4.40 and Studio ADR-005 D9.4.40 by reference after
production proved that a surviving browser narration row could carry a future
Story ref. Browser timeline refs are presentation evidence and can no longer
select the Story checkpoint for a compound Replay.

GMC owns the service-private `gmc.compound-replay-story-checkpoint/1` resolver.
It accepts only a bounded campaign-scoped selector containing the selected
timeline boundary, exact saved-instruction fingerprint, stable Replay lineage
when present, optional current-program membership guard, and an observational
browser ref that never participates in selection. Exact stored Replay lineage
is primary. For historical rows without that field, GMC may use only the first
artifact anchor after the selected boundary for the exact fingerprint and must
restrict all candidates to that single anchor. It groups immutable artifact
revisions by program, verifies optional program membership, selects the earliest
Story `authorityBase` across those Replay attempts, and reads that exact
immutable Story revision. Missing, ambiguous, malformed, cross-campaign, mixed-
lineage, or nonmember evidence returns no checkpoint and performs no mutation.

Artifact timeline anchors gain an optional stable `replayLineageId` created by
GMA's browser message and preserved on every Replay. The field is identity and
provenance only; it contains no player text or Story data. Existing artifacts
remain readable, inactive and superseded revisions remain immutable, and legacy
resolution is a lazy compatibility read rather than a migration write.

The checkpoint response contains only the complete immutable
`gmc.story-workspace-ref/1`, selection mode, matched anchor, and bounded counts.
GMA must use that exact ref in GMC's existing exact Story rewind and require the
same ref plus `restoreMode: exact_ref` before artifact rewind or any VCS/canon/
time/XP reversal. A browser-ref disagreement is redacted drift telemetry; the
GMC checkpoint wins. A rejected selector cannot broaden into browser-ref or raw
sequence deletion. The existing expected-head compare-and-swap, stable rewind
idempotency, one GMA rebase, and honest partial-recovery ordering remain.

This adds one bounded owner read and zero LLM operations, tokens, provider
calls, VCS operations, Story writes, or correction rounds. Diagnostics are
limited to hashed lineage/selector identity, selection mode, boundary/anchor,
bounded match counts, revision numbers, and browser-ref agreement. No artifact
body, instruction text, Story body, Scene content, prompt, narration, fact, or
credential may be logged or returned.

Release requires exact and legacy lineage tests; fingerprint, boundary,
campaign, membership, ambiguity, and immutable-base containment; browser-drift
selection; exact-ref equality; idempotency and operation ordering; old-artifact
compatibility; complete GMC/GMA/Studio gates; direct `main` pins; hosted health;
and a production Replay whose rebuilt first packet reads Flintwake before any
movement, with no duplicate owner effect and no Gemini call in Manual AI mode.

## Accepted D9.4.41 instruction-stage origin checkpoint — 2026-08-18

GMC accepts GMA ADR-005 D9.4.41 and Studio ADR-005 D9.4.41 by reference after
the hosted D9.4.40 check proved that an immutable artifact `authorityBase` can
already be post-action state and that artifact availability can hide an older
tombstoned pre-action base. Artifact history remains owner history, but artifact
creation is no longer the primary causal-origin boundary.

GMC adds service-private `gmc.compound-action-origin-checkpoint/1` to the
immutable staged-instruction record. It binds the complete active
`gmc.story-workspace-ref/1` to user, campaign, interaction, exact instruction
fingerprint, stable Replay lineage, message ID, and timeline sequence. During
staging GMC compares GMA's expected full ref to the active canonical Story head
and atomically stores instruction plus checkpoint only on equality. A stale,
malformed, cross-campaign, workspace, revision, or hash mismatch writes nothing
and occurs before semantic planning. Idempotent duplicate staging must return
the identical checkpoint.

The Replay resolver selects exact origin-bearing instruction lineage first and
verifies its immutable Story revision. A present but invalid exact origin fails
closed and cannot broaden. Only a selected historical row explicitly marked as
lacking a verified origin may use legacy artifact evidence. That compatibility
query remains exact-fingerprint and first-post-boundary-anchor scoped, but it
includes available, superseded, inactive, and tombstoned immutable artifact
revisions. Tombstoned records contribute only instruction identity, anchor, and
pre-execution Story-base evidence; they can never be read or restored as active
program/cursor/receipt state. The chosen Story revision is still validated from
the immutable Story store and returned as a complete exact ref.

Freshly replayed rows stage a new origin-bearing instruction and therefore heal
lazily without a migration write. The browser ref remains diagnostic only,
GMA remains orchestration authority, VCS remains mechanics authority, and the
LLM performs no Replay work. Instruction staging adds one current-head compare
inside its existing owner operation; Replay remains one bounded read, capped at
256 candidates, with no additional model, token, VCS, correction, or Story-
write budget. Diagnostics remain redacted to modes, counts, anchors, revisions,
agreement, and hashed identity.

Release requires atomic staging and rollback-on-mismatch, exact ref equality,
idempotent duplicate response, exact-lineage origin selection, terminal invalid
origin, tombstoned legacy evidence without executable reuse, first-anchor and
program grouping, immutable-revision containment, complete GMC/GMA/Studio
gates, exact direct-`main` pins, hosted verification, and production Flintwake-
before-movement plus rat-familiar completion with no duplicate effect or Manual-
mode provider call.

## Accepted D9.4.42 lineage-root owner-timeline predecessor — 2026-08-18

GMC accepts GMA ADR-005 D9.4.42 and Studio ADR-005 D9.4.42 by reference after
the hosted D9.4.41 test proved that a valid descendant retry origin can be
captured from an already incorrect post-action Story head. The stable Replay
lineage identifies a family of attempts; it does not make every attempt a
causal root.

GMC owns the additive service-private
`gmc.compound-replay-story-checkpoint/2`. A caller explicitly requests version
2 with campaign, selected removal boundary, exact instruction fingerprint,
stable Replay lineage/root interaction ID, optional program guard, and optional
observed surviving Story ref. Version 1 remains callable for the old GMA during
deployment skew. Version 2 first reads the instruction whose interaction ID
equals the lineage ID. A valid origin on that exact root wins. If that root
exists without an origin, the lineage is legacy even when later attempts in the
same lineage have valid origins. A descendant origin can never redefine the
root. If no root instruction exists, GMC requires exact-fingerprint artifact
membership at the first post-boundary anchor before compatibility selection;
artifact `authorityBase` is not a Story selector.

For either legacy class, GMC selects the latest available immutable Story
workspace revision with `timelineAnchor.sequence <= boundary`, ordered by
timeline sequence descending and then Story revision descending. The exact
revision and payload hash are re-read from the owner store. If GMA supplied an
observed surviving ref, complete equality is required; disagreement fails
before rewind and does not privilege either the browser or the artifact. The
response returns only the exact ref, selected anchor, root/selection modes,
bounded membership counts, and agreement. It returns no instruction, Story,
Scene, prompt, narration, or receipt body.

The version-2 root instruction lookup and Story-boundary lookup are indexed and
bounded. Artifact membership remains capped at 256 only for rootless legacy
rows. Replay adds no model, token, correction, VCS, Story-write, or narration
budget. Exact rewind retains expected-head compare-and-swap and idempotent
receipt equality. There is no bulk migration: originless roots remain immutable
legacy evidence, poisoned descendant origins remain historical but cannot win,
and newly replayed attempts continue to carry their own origins without
changing the root.

Failures remain player-safe through GMA's established first/repeated recovery
boundary; GMC diagnostics are limited to contract/root/selection mode, hashed
identity, boundary/anchor/revision, counts, and ref agreement. Rollback keeps
the version-2 reader and history while callers can revert to version 1; it never
deletes origin or Story revisions or restores artifact/browser authority.

Release requires fresh-root, legacy-root, poisoned-descendant, rootless-
membership, repeated-text isolation, owner-boundary ordering, available-status,
observed-ref disagreement, missing/ambiguous/cross-campaign, program guard,
version-skew, exact rewind, idempotency, zero-model, and redaction tests; full
GMC/GMA/Studio gates; exact direct-`main` pins; hosted owner/asset verification;
and production Flintwake-before-movement plus rat-familiar completion with no
duplicate effect and Gemini remaining 181.

## Accepted D9.4.43 prepared-boundary cursor coherence — 2026-08-18

GMC accepts GMA ADR-005 D9.4.43 and Studio ADR-005 D9.4.43 by reference. The
hosted failure occurred before GMC could prepare the missing SECOND MOUTH Story
detail: GMA selected a travel node with unresolved destination/approach facts
from a newly persisted `scene_preparation` cursor but validated it against the
older cursor and an observation-only boundary predicate.

GMC's contract and ownership do not change. It continues to accept one
canonical action-directed Story request bound to an interaction, semantic
action, current Story/Scene head, and optional compound program/node/slice. GMA
must derive that node and slice from one prepared boundary snapshot before
calling GMC. An exact prepared `scene_preparation` wait is sufficient to route
its node to GMC even when the node is movement and the missing facts are
`destination_location` or `current_location`; the executor has already assigned
those requirements to GMC. The LLM cannot choose or repair a cursor. GMC must continue to fail
closed on stale request identity or owner revision and must never infer a node
from prose.

There is no new schema, query, write, migration, model operation, token budget,
or GMC deployment requirement. Existing compare-and-swap, exact-ref, bounded
diagnostic, privacy, idempotency, and rollback rules remain unchanged. GMC tests
must continue to prove that one canonical request is accepted and that stale or
mismatched program/node/slice authority is rejected. The new production-shaped
source-cursor/prepared-cursor regression belongs to GMA, with Studio pinning the
exact corrected GMA commit while retaining GMC `1.11.17` unless an independent
GMC change becomes necessary.

## Accepted D9.4.56 role-scoped compound-program persistence negotiation — 2026-08-21

GMC accepts GMA ADR-005 D9.4.56 and Studio ADR-005 D9.4.56 by reference. The
required D9.4.55 browser replay proved that GMA's external semantic result and
local compiler correctly produced the two-member parallel program `/5`, while
GMC rejected that program before persistence because artifact-store `/1`
admitted only programs `/2` and `/4`.

GMA remains logical owner of program meaning, compilation, cohort selection,
execution, and receipt interpretation. GMC remains physical revisioned owner of
the non-canonical interaction artifact and therefore owns storage admission,
instruction binding, graph integrity, byte bounds, idempotency, and revisions.
VCS neither stores nor interprets ordinary program `/5` and is not part of the
storage-reader compatibility relation.

GMC artifact-store contract `/2` adds an explicit bounded
`readableSemanticActionPrograms` advertisement for `/2`, `/4`, and `/5` without
changing the shared GMC/VCS compound-action contract map. GMC accepts `/5` only
when its instruction identity, ordinary dependencies, bounded data requirements,
unique known reciprocal `parallelWith` refs, exact unique relationship count,
and existing ordinary program byte ceiling all validate. GMC must never create,
drop, reorder, or infer a parallel relation; it stores the exact GMA document or
rejects it atomically.

No existing `/2` or `/4` artifact is migrated or rewritten. Their create, read,
advance, settlement, replay, and tombstone behavior remains compatible. Receipt
version selection remains `/1` for ordinary `/2` and `/5` and `/2` for
observation `/4`. A rejected `/5` write leaves no program, cursor, receipt,
narration, Story effect, or mechanic.

GMC deploys before the GMA consumer. New GMC is additive for old GMA writers.
New GMA must require current artifact-store `/2` health and `/5` readability
before a fresh semantic prompt and again before a later Manual acceptance write.
Rollback reverses that order. Diagnostics are limited to store/program versions,
bounded issue metadata, correlation and hashed identities; exact player speech,
prompts, campaign-private data, and credentials remain excluded.

Release requires valid production `/5`, malformed parallel graph, legacy `/2`
and `/4`, update, receipt, replay/tombstone, idempotency, health, skew, and
redaction tests; complete GMC/GMA/Studio gates; direct `main` deployment in owner
then consumer order; and a production replay that persists one exact `/5`
program and narrates both the quoted telepathy and timed rat squeak with one
coherent Scene/cursor/receipt lineage and no Gemini request.

## Accepted D9.4.78 Gemini response-schema projection — 2026-09-01

GMC accepts the production playtest correction authorized under GMA ADR-009.
The exact compound investigation reached GMC within the registered 24,576-byte
context limit, but repeated `action.intent.interpret` calls failed at Gemini
with provider HTTP 500 before a result existed. The logical response contract
contains JSON Schema keywords that Gemini does not support and a deeply nested
shape that the provider may reject opaquely. Retrying the same transport cannot
correct that deterministic provider-boundary mismatch.

The Gemini adapter now projects every registered logical output schema onto
Gemini's documented `responseJsonSchema` subset. String and number `const`
constraints become single-value enums; boolean and null constants retain only
their provider-supported type. Unsupported constraints such as `pattern`,
`minLength`, and `maxLength` are omitted from the provider hint. If that
supported-keyword projection still exceeds 4,096 bytes, the adapter omits
`responseJsonSchema` and uses Gemini's JSON response mode with the exact
registered positive first-pass policy. It never sends a guessed, partially
collapsed schema that could be rejected or teach an incomplete result shape.
The complete versioned schema, semantic validators, positive first-pass prompt
policy, and proposal-only authority boundary remain unchanged and run after
generation.
The projection therefore reduces provider transport complexity without
loosening any result GMA can accept or adding player-phrase classification.

The production JSON-mode replay reached Gemini successfully but exhausted the
old 5,000-token combined reasoning/output ceiling before the native JSON result
closed. `action.intent.interpret` therefore receives a 12,000-token output
ceiling for its existing one provider operation. The eight-intent, twelve-
relationship, six-level, 24,576-byte input, single-attempt, no-fallback, and
proposal-only bounds do not change. Registry `2026-09-01.3` advertises this
provider policy and temporarily accepts client `2026-09-01.2` during the
GMC-first/GMA-second rollout.

Adapter diagnostics record only operation ID, model ID, provider HTTP status,
provider status code, and up to eight bounded provider field paths extracted
from standard field violations. They exclude violation descriptions,
credentials, player text, private Story context, schema bodies, and generated
content. Existing idempotency records are not migrated; a fresh GMA
provider-retry epoch or fresh player turn receives the new transport. Rollback
restores adapter version 1 without changing any Story, Scene, action-program,
mechanics, or timeline record.

The first complete JSON-mode result exposed one remaining first-pass policy
gap: a player-supported conditional branch was returned with an invented
condition-object shape. The validator correctly rejected it, but the exact
non-null shape had not been stated in the original prompt after the oversized
provider schema was omitted. Policy `gma.semantic-intent-policy/17` now states
that every non-null relation condition is exactly
`{predicate,intentRef,description}`, defines the complete predicate vocabulary,
requires an exact controlling intent ID, and forbids alternate keys. This is a
universal structural requirement independent of player wording; the logical
schema and validator are unchanged. Registry `2026-09-01.4` advertises the
prompt-policy correction and temporarily accepts clients `.3` and `.2` during
the owner-first rollout.

Release requires provider-conformance tests proving unsupported keywords are
removed, required nested action-intent structure is retained, the full logical
schema is not mutated, first-pass tests proving the non-null relation shape is
present in policy, complete GMC checks, production health advertising 1.11.43,
and the unchanged natural-language Kerrigan investigation reaching an accepted
model result before broader narration playtesting resumes.
