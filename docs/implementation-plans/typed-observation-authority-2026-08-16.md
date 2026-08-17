# Typed observation authority implementation plan

- Governing decisions: GMA ADR-005 D9.4.26, Studio ADR-005 D9.4.26, and the
  Accepted GMC D9.4.26 addendum in
  `docs/architecture/action-directed-story-authority-d2-2026-08-07.md`.
- Status: Contained and superseded for fresh writes by Proposed GMA ADR-007.
- Owner: GMC for mutable Scene observable truth; GMA for transient requests and
  immutable orchestration receipts; VCS for mechanics; Studio for presentation.

## Sequence

1. Add Scene-kit-v3 and playable-context-v3 types, exact validators,
   canonicalizers, projections, and dual readers without enabling writes.
2. Add observable/obstruction source, value, modality, visibility, bound, and
   no-name-join validation to the atomic Story handoff.
3. Add the structured-only `story.observation.prepare` registry operation and
   provider contract. It may propose a complete same-locus Scene replacement
   but cannot commit it or narrate.
4. Persist v3 only through the existing expected-revision/idempotent Story
   workspace transaction. Return and recover one authoritative receipt.
5. Project public and private v3 contexts from the same immutable workspace
   snapshot. Never merge a browser, GMA, narration, or receipt copy.
6. Add duplicate, stale, out-of-order, timeout, partial, rewind, privacy,
   compatibility, and split-brain tests.
7. Advertise the typed-observation capability only after the full GMC boundary
   and checks pass. Deploy before GMA enables typed writers.

## Containment record — 2026-08-16

GMC 1.10.5 withdraws `typed-observation-authority/1` and
`atomic-observation-scene-write/1` from health and contract discovery while the
cross-service observation saga is reviewed. Scene-kit `/3`, playable-context
`/3`, the structured proposal operation, validators, committed revisions, and
historical readers remain installed. Their presence does not advertise or
authorize a fresh writer. GMA must stop before a fresh preparation model call
or Scene mutation, and GMC keeps `routeEnabled: false`.

Fresh writer advertisement may return only as the complete versioned bundle
defined by an Accepted cross-service owner decision. A source build, generated
artifact, or model-operation registration alone is not conformance evidence.

## Stop conditions

Stop rollout on any observation-only mutation, owner/revision mismatch,
duplicate non-idempotent write, projection disagreement, private observable
leak, display-name join, legacy-text inference into v3, or inability to recover
the exact authority result after timeout.
