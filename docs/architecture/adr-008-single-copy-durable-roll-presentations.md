# ADR 008 Single-copy durable roll presentations

- Status: Accepted
- Acceptance: Repository owner approved GMC ADR 008 and GMA ADR 022 on 2026-10-16.
- Date: 2026-10-16
- Governing proposal: GMA ADR 022, `docs/adr/022-single-copy-durable-roll-presentations.md` in the registered GameMaster Assistant repository.

Adopt GMA ADR 022's complete problem, terminology, authority/lifetimes,
closed versioned schemas, data flow, unchanged budgets, validation/recovery,
player-facing failures, compatibility, rollback, observability, examples,
implementation plan and acceptance gates before changing GMC runtime code.

GMC remains the sole protected durable artifact owner. Additive candidate `/2`
support must validate exact identity, JSON fingerprint, closed transport metadata
and existing byte bounds, and advertise its exact capability. It grants no
mechanics, Scene movement or campaign-time authority. Historical candidate `/1`
and all completed receipts remain immutable and readable. No runtime behavior
is authorized while either governing proposal remains Proposed.
