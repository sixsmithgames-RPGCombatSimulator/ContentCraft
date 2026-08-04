# Living Story authority and preparation implementation

- Release: GameMasterCraft 1.8.0
- Registry: 2026-08-04.1
- Governing design: GMA ADR-004 and Studio ADR-004
- Status: automated implementation complete; chaotic human canary evaluation
  remains required

## Intent and scope

GMC now owns the durable Story workspace used by both manual GM Studio work and
GMA Pro orchestration. This release adds evidence-bound NPC identity reveal,
strict runnable-scene validation, bounded session outlook storage, and three
proposal-only continuous-preparation operations. It does not give a model
authority to create current presence, decide player action, commit canon, or
write mechanics.

## Authority behavior

- Identity promotion updates the same NPC under expected revision and never
  reveals the private name.
- Identity reveal accepts only an existing stable canonical identity, exact NPC
  revision, allowed reveal mode, interaction ID, and SHA-256 narration evidence
  fingerprint. The resulting Story readiness sync stores no private name.
- Runnable scenes require purpose, dramatic question, location, activity,
  two-to-five important beats, stakes, pressures, participant reasons and
  readiness, prepared-information access, and all four exit kinds.
- Story deltas are revision-bound, receipt-grounded, idempotent, bounded, and
  name exact records. Rewind supersedes later revisions by timeline boundary.
- Session outlook is bounded GM preparation and does not establish scene order.

## Risk and rollback

Primary risks are private-name leakage, duplicate identity, future possibility
becoming current fact, railroading, and planner cost. Validation, public
projection tests, exact revisions, source-ref equality, agency rules, and
single-operation caps guard those risks. Rollback disables the new planning
operations and returns GMA to its legacy/shadow reader; stored additive Story
records remain valid and VCS is unaffected.

## Verification

`npm run check` passes with 664 tests, strict TypeScript, generated-contract
guard, provider-boundary guard, and a successful server/client production
build. Focused tests cover identity promotion/reveal, Story persistence and
rewind, bounded session outlook, private projection, casual-mention rejection,
forced-player-action rejection, frontier bounds, participant overlap,
anticipated arrival triggers, critical-information access, and all exit kinds.

## Known remaining gate

Automated checks cannot establish whether the prepared scenes feel alive under
creative play. Flintwake and the broader accepted L8 matrix must be exercised
by a human before 100% primary rollout or legacy cleanup.
