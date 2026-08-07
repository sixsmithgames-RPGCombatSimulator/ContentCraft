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

## D5 integration addendum

D5 adds no second Story authority. GMC registry `2026-08-07.1` registers the
combined proposal-only `story.turn.direct` operation with the complete
first-pass locus, cast, beat, payoff, provenance, agency, mechanics, and prose
freedom policy. The operation permits one provider attempt and no fallback;
GMA owns the one focused field repair and one authority rebase budget.

The existing current-scene context response now includes a bounded
`gmc.story-authority-receipt-catalog/1` generated from the same immutable Story
workspace revision as its playable and private projections. GMA may use those
receipts for GMC-owned sources and may mint only its own `gma:` scene-local
sources. Scene handoff remains the same one-write D2 transaction. The prior
registry client version remains accepted only to permit the ordered GMC-first
deployment.

The full GMC check passes with 108 test files and 676 tests, including operation
policy, compatibility, receipt-catalog, atomic handoff, typecheck, lint, and
production builds. GMA gameplay routing remains disabled; production
verification of this D5 addendum is pending before D6 may begin.
