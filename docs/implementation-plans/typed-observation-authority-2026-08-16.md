# Typed observation authority implementation plan

- Governing decisions: GMA ADR-005 D9.4.26, Studio ADR-005 D9.4.26, and the
  Accepted GMC D9.4.26 addendum in
  `docs/architecture/action-directed-story-authority-d2-2026-08-07.md`.
- Status: Historical v3 plan; fresh writes are implemented by Accepted GMA
  ADR-007 and GMC ADR-003.
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

### Compound-path containment correction

The first containment release removed the Action Directed Story writer flags
but left `action.intent.interpret` on Proposed IR2/policy 4 while GMC's
compound-action health surface still advertised the Accepted program-2 bundle.
That was a split-brain contract even though neither side performed a canonical
write. GMC 1.10.6 restores the active interpreter to semantic IR1/policy 3 and
keeps the positive first-pass rule that appearance, apparent ancestry or
species, identity, distance, contents, activity, presence, and quantity remain
separate requested outcomes. The IR2 operation shape remains design history,
not an active writer contract.

GMA must advertise the same exact four-capability program-2 bundle as GMC,
VCS, and Studio, and must contain a fresh compound observation before this
interpreter, authority retrieval, instruction staging, or artifact creation.
The cross-repository alignment check compares all four bundles plus this
operation's active prompt and result schema.

## Atomic presentation batch correction — 2026-08-17

- Accept a bounded `executionReceipts` array on the settlement route while
  retaining `executionReceipt` as the matching primary compatibility field.
- Validate version, program, unique receipt identity, cursor membership, and
  the one committed settlement operation before writing.
- Append the entire receipt set and cursor advance in one artifact revision;
  idempotent replay must match every receipt.
- Test one and multiple receipts, mismatched primary, duplicate IDs, mixed
  programs, stale revisions, lost responses, and exact replay.

## Stop conditions

Stop rollout on any observation-only mutation, owner/revision mismatch,
duplicate non-idempotent write, projection disagreement, private observable
leak, display-name join, legacy-text inference into v3, or inability to recover
the exact authority result after timeout.
