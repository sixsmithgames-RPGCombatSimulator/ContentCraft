# ADR 014: GM-owned Scene temporal scope and rulings

- Status: Accepted — explicitly approved by the owner on 2026-10-19, including the protected timing-and-scope writer
- Date: 2026-10-19
- Governing decision: GMA ADR 031, `docs/adr/031-gm-owned-scene-temporal-scope-and-rulings.md`
- Scope: Studio Manual / approved test campaign only; VCS unchanged
- Protected boundary: GMC temporal-scope decision and timing-ruling writer

Adopt the governing proposal's complete problem/non-goals, authority hierarchy,
lifetimes, versioned logical schemas, protected prepare/confirm/operation flow,
human controls, prompt/data flow, unchanged budgets, validation/repair, player
failure/support boundaries, compatibility, rollback, observability, examples,
tests, delivery and acceptance gates. Both governing decisions are now Accepted.

QUEST and EVENT/thread records are distinct owner sources. A complete temporal
catalog must not silently omit either. A GM may explicitly decide an exhaustive
Scene applicability partition and map an exact existing Scene timing constraint
to an explicit calendar instant/interval through an audited, revision-checked,
idempotent protected decision. The model cannot author that decision or infer a
bell's numeric meaning. It does not edit or close an event, advance time, reveal
information or repeat a completed action. New/changed source heads invalidate
applicability; actual deadline crossings stop reuse before observation.

The dedicated writer remains default off and exact-campaign gated. Reader-first
delivery and all fresh browser/automated/lost-confirmation/deployment gates
precede live recovery. Original replies, receipts and budgets remain immutable.

## Implementation and pre-delivery evidence — 2026-10-19

The canonical owner projection reads `gmc.scene-kit-ref/1.payloadHash` and
`bundle.sceneReality.preparedBoundaries`; malformed or alias-only saved views
stop. The new review's lossless source table uses measured reference costs,
without changing older operation packing, decoded evidence or limits.

GMC's full check passed 1,632 tests, type checking, lint and both builds. Frozen
Studio rehearsals 4402 (two construction chunks, exact day-5 06:00 ruling) and
4403 (native one-chunk construction, human identity/origin decisions) each
completed 3/3 receipts and the root, with one movement, one shared Scene turn,
one clock update, one independent review, two publications, and no provider or
external-network calls. Reload retained the results. Eight accepted-write-loss
replays passed for each run; six historical pending-check replays also passed.

These are fictional, isolated pre-delivery proofs, not a claim of production
activation or live campaign recovery. Reader-first delivery, exact Studio pins,
the production package/auth checks and explicit live GM decisions remain gates.
