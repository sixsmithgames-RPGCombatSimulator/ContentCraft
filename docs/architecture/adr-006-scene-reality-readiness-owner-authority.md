# ADR-006: GMC-owned Scene reality readiness and atomic emergent expansion

- Status: Proposed
- Date: 2026-09-08
- Owners: GMC world, Story, Scene, actor, object, and timeline authority; Studio shared contracts and GM inspection
- Cross-repository decision: `GameMaster Assistant/docs/adr/011-scene-reality-readiness-and-atomic-emergent-expansion.md`
- Subordinate plan: `GameMaster Assistant/docs/GMA_SCENE_REALITY_READINESS_IMPLEMENTATION_PLAN_2026-09-08.md`

## Implementation gate

This owner decision and its cross-repository ADR must both be Accepted before
runtime implementation begins. Until then, only documentation, measurement,
fixture capture, and read-only inspection are allowed.

## Problem and decision

GMC currently proves that versioned Scene kits satisfy bounded structural
contracts, but structural validity is not sufficient playability. The
production SECOND MOUTH Scene was accepted with a locus, role, beats,
information headings, pressure, exits, and one surface observation while the
guarded interior, material NPC, likely discoveries, and immediate scouting
space remained substantially undefined.

GMC will become the sole owner of revisioned Scene-reality dossiers,
depth-aware readiness certificates, preparation debt, emergent expansion
commits, and immutable expansion receipts. A Scene cannot become current merely
because its `planningState` is `prepared` or `active`, its arrays meet minimum
counts, or GMA can answer one selected interaction.

New Scene activation and true boundary-crossing expansion will commit all
dependent world, Story, actor, fact, timeline, Scene, and certificate records
atomically. GMA will receive bounded projections and receipts but will not
persist a second world model.

## Goals and non-goals

Goals:

- make GMC's ready state mean human-GM-playable at the selected depth;
- store rich private reality while projecting only action-relevant slices;
- prepare material individuals, thresholds, facts, ordinary operations, Story
  alignment, and time dependencies before player-facing narration;
- preserve stable identity and continuity for incidental generated material;
- support receipt-backed, idempotent expansion and compound-program rebase; and
- advertise exact capabilities so incompatible clients fail closed.

Non-goals:

- GMC does not choose player actions or write narration;
- GMC does not own VCS mechanics;
- GMC does not force every transit location to investigative depth;
- a readiness examiner is not an authority writer;
- missing preparation is not a fact, absence, obstruction, refusal, or failed
  check; and
- rollback may not silently restore current-answer-only preparation.

## Authority, state, and lifetime

GMC owns:

- validation of `gma.scene-reality-build-request/1` and
  `gma.scene-reality-proposal/1`;
- `gmc.scene-kit/5` and the sole-current
  `gmc.active-scene-bundle/1` visibility pointer;
- `gmc.scene-reality/1`, `gmc.scene-zone/1`,
  `gmc.scene-actor-frame/1`, `gmc.scene-element/1`, and
  `gmc.scene-fact/1`;
- `gmc.scene-readiness-certificate/1` and dependency invalidation;
- accepted `gma.scene-readiness-assessment/1` references;
- `gma.world-expansion-request/1` validation and
  `gmc.world-expansion-receipt/1` persistence;
- evaluation of `gma.scene-coverage-query/1` through read-only
  `gmc.scene-coverage-decision/1`;
- `gmc.scene-reality-commit-receipt/1` for activation, refresh, and migration;
- `gmc.scene-story-design/3` instruction-independent affordances;
- validation of `gma.story-fact-selection-proposal/1` and persistence of
  `gmc.story-fact-selection-receipt/1`; and
- compound artifact storage of `gma.action-program-rebase-receipt/1`.

Scene-reality facts use canonical, prepared-private-world,
scene-local-stable, prepared-possibility, future-contingent, revealed,
deliberate-unknown, or missing-preparation states as defined by ADR-011. Any
fact cited by an accepted turn remains retrievable. Promotion reuses stable
identity.

The certificate binds immutable reality and dependency dimensions. It does not
expire on every active-state revision. GMC deterministically retains it across
unrelated changes and invalidates affected coverage for presence, zone, access,
material objective, pressure, Story-source, fact-source, or clock-condition
changes.

Certificate coverage is a set of exact zone, target, action-family, access or
threshold, and capability-class tuples. Index arrays never imply a Cartesian
product. GMC verifies the accepted receipt chain from the certificate's active
state floor to the current head, or one owner compaction receipt that covers the
chain; a higher revision alone is insufficient.

Emergent expansion is valid only for a prepared boundary committed before the
player instruction. An unsupported action that should have been inside the
certified envelope invalidates the certificate and records a readiness defect;
it cannot be relabeled as surprise after the fact.

Coverage decisions are `covered`, `boundary_crossing`, `certificate_stale`,
`ambiguous_reference`, or `inside_envelope_defect`. A compound query covers
every causally reachable node through the next player decision, unresolved VCS
result, or semantic stop; checking only the first ready node is invalid.

## Owner contracts and validation

The complete logical schemas, depth profiles, budgets, flows, migration,
examples, and acceptance gates are normative in ADR-011. Shared JSON Schemas
must express exact versions, keys, enums, sizes, identities, refs, visibility,
and receipt lineage.

GMC validation order is:

1. authentication, authorization, tenant, campaign, and operation identity;
2. schemas, versions, keys, counts, and byte ceilings;
3. idempotency, current owner heads, timeline, and replay lineage;
4. stable identity, uniqueness, seed promotion, and visibility;
5. source closure and bounded creation policy;
6. canon, world, Story, actor, topology, and timeline contradictions;
7. epistemic state, access, observation, obstruction, and reveal authority;
8. preparation-depth floor and depth-specific completeness;
9. material-actor and presented-threshold closure;
10. Story connection or explicit incidentality and false-clue prevention;
11. dependency graph, active-state compatibility, and certificate validity;
12. VCS ownership boundaries;
13. accepted examiner shape, evidence, and verdict; and
14. player-safe and GM-private projection separation.

Versioned `/2`, `/3`, and `/4` Scene kits must not bypass owner readiness
validation. Counts and nonblank text remain structural checks only. They cannot
issue a certificate.

## Atomic owner flow

For a new Scene or expansion, GMC:

1. reads exact current world, Story, Scene, active-state, timeline, and relevant
   external receipt heads;
2. executes or receives one registered proposal-only build under bounded
   creation policy;
3. validates the complete dossier and proposed depth;
4. obtains and validates an independent readiness assessment;
5. applies at most one failed-domain repair before commit;
6. atomically writes all new or changed records, the certificate, history row,
   and owner receipt;
7. returns resulting heads and an exact changed/invalidated ref list; and
8. supports lookup by the original operation ID after timeout or lost response.

No player-facing narration is stored in the owner operation. A failed or
ambiguous commit leaves the prior authority current. A duplicate request with
the same identity returns the original receipt; a conflicting duplicate fails
closed.

Atomicity applies to GMC-owned records. GMC uses a database transaction when
available; otherwise it writes one immutable staged bundle and exposes it with
one compare-and-swap of `gmc.active-scene-bundle/1`. The bundle points to the
exact Scene kit, reality, Story design, certificate, active state, timeline, and
clock conditions. No reader may observe a partial bundle. VCS mechanics remain
a separate cross-owner saga joined only by authoritative receipts.

Fact selection against `scene-story-design/3` validates an interaction-scoped
proposal and emits a receipt without modifying the Scene or reality revision.
Historical design `/2` bindings remain readable but are not produced for fresh
negotiated traffic.

## Budgets, compaction, and privacy

GMC enforces ADR-011's initial ceilings: 32 KiB reality index, 24 KiB zone,
12 KiB individual frame, 8 KiB cohort, 4 KiB fact/element, 512 KiB aggregate
current reality, and 32 KiB certificate and receipts. Oversized Scenes split
into linked zones or Scenes; required records are not silently dropped.

The readiness examiner receives complete material fields for one certificate
envelope. If they do not fit the examiner input ceiling, GMC splits and examines
dependency-closed zone certificates and their transitions. A lossy generated
summary cannot authorize an unexamined record.

Public projections expose only already revealed facts, public actor labels,
and accepted current state. GMA private projections are purpose-bound,
action-matched, revisioned, and capped at 64 KiB. Logs contain hashes, counts,
revision classes, and debt kinds—not private facts, hidden names, prompts,
credentials, or cross-tenant identifiers.

## Compatibility, migration, and rollback

New collections and read projections are additive. GMC advertises read support
before write support. Existing Scenes become `legacy_unassessed`; GMC performs
a full contextual assessment before their next player-facing turn rather than
certifying existing counts or accepting a current-question patch.

Observed or receipt-referenced scene-local material retains its stable identity.
Historical receipts and Story-design bindings remain valid. Unknown versions
and stale certificates fail closed.

Rollback disables new writes and activation while retaining accepted records.
It exposes safe recovery or read-only state and never falls back to
per-observation or per-question preparation.

## Player failures and Studio inspection

GMC returns structured private diagnostics with exact issue paths, expected and
actual revision classes, operation identity, and commit disposition. It never
returns private facts in a player-safe error. GMA owns player-facing copy and
the consecutive-failure boundary.

Studio's authenticated GM view shows preparation depth, reality coverage,
actors, thresholds, Story classification, deliberate unknowns, blocking debt,
examiner findings, certificate validity, dependency invalidations, and history.
Human edits invalidate affected coverage and require re-certification. A GM
override may choose lower nonblocking transitional depth but cannot bypass
authority, visibility, revision, receipt, mechanics, or tenant validation.

## Required tests and acceptance

GMC must test contracts, storage, tenant isolation, stable identity,
versioned-Scene readiness, creation policy, topology, actor frames, epistemic
states, Story incidentality, dependency invalidation, active-state compatibility,
atomic commit, duplicate delivery, out-of-order events, stale heads,
timeout-after-commit lookup, partial writes, rewind, migration, compaction,
privacy, and rollback.

Cross-service tests must prove:

- no current Scene without a current certificate;
- no ordinary certified action causes a preparation write;
- fact selection does not mutate Scene authority;
- one boundary crossing creates one reusable expansion receipt;
- one coverage decision evaluates the whole dependency-closed compound window;
- the exact boundary and certificate predate the instruction, and ordinary
  gaps cannot be reclassified as surprise;
- coverage indexes do not authorize an unsupported target/action cross-product;
- compatible active-state changes retain certificates only through a verified
  receipt chain or owner compaction receipt;
- compound cursor, receipts, and resulting owner heads settle atomically;
- SECOND MOUTH supports the full social-and-familiar reconnaissance action;
- a street thumbnail expands one selected shop without generating every shop;
- mundane and bounded-negative results remain concrete and non-misleading;
- human quality gates in ADR-011 pass; and
- rollback cannot restore the superseded just-in-time path.

Acceptance requires this ADR and ADR-011 to be reviewed together, all shared
and owner tests to pass, GMC-first capability deployment, production canaries,
and verified commit/deployment status before GMA enables certificate gating.
