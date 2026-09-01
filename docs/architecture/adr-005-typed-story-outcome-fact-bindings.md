# ADR-005: GMC-owned typed story-outcome fact bindings

- Status: Accepted
- Date: 2026-08-31
- Extends: active Scene, Story-design, and action-directed handoff authority

GMC will validate and persist `gmc.scene-story-design/2`. Its required
`storyFactBindings` rows bind one immutable instruction and semantic requirement
fingerprint to one exact design affordance, one or more exact Scene information
refs, and `direct` or `provisional_check` resolution.

GMC validates bounded size, exact keys, unique binding identity, unique
instruction-plus-requirement scope, 64-character fingerprints, existing
affordance refs, fact refs present on that affordance, fact refs present in the
exact Scene-kit revision, and atomic design/Scene revision alignment. GMC does
not infer a binding from prose and does not reveal the fact merely by storing
preparation metadata.

Version-1 designs remain readable. Fresh version-2 writes are advertised only
after validation, persistence, projection, duplicate/reconciliation, rewind,
and compatibility tests pass. Unknown versions and stale revisions fail closed.
Player-facing recovery remains in GMA; GMC logs bounded diagnostic identities
without private fact prose.

