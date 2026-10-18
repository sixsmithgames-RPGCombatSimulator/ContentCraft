# ADR 010: Application-owned Scene information projection

- Status: Accepted
- Acceptance: Repository owner approved governing GMA ADR 026 on 2026-10-18.
- Governing decision: `docs/adr/026-application-owned-scene-information-projection.md`
  in the registered GameMaster Assistant repository.

Adopt that decision's complete problem, authority/lifetimes, logical schemas,
prompt/data flow, unchanged budgets, repair scopes, player failures, compatibility,
rollback, observability, examples and release gates. This document is subordinate
implementation ownership, not an additional permission or a new protected writer.

GMC owns the canonical pure information projection, closed model/repair schemas,
first-pass policies, operation registrations and early validation. Generated GMA
code must match it exactly. The model selects exact facts and zero-based access
routes rather than duplicating derived display state/text/routes. No fuzzy match,
route widening, text truncation, larger envelope or new model call is permitted.

Keep every historical operation definition unchanged. Four additive Manual-only
operations use preparation policy 14. The new profile and operation must agree;
an old operation cannot accept a new-profile body. A failed selection check cannot
erase an independent foreign-window failure. The complete normalized owner shape
is checked before examination. Independent review binds that exact dossier.

Final GMC commit checks remain strict and independently verify compact state,
fact text and exact access-vector membership, all current owner heads, original
program/qualification and assessment. Policy 14 is an additional known pending
binding fingerprint; older fingerprints remain readable. No world, program,
receipt, historical reply or in-progress builder is migrated or reinterpreted.

The existing approved campaign-only Manual gates remain. No provider or VCS
change. Reader-first delivery follows full checks and fresh Studio proof under
the governing acceptance gates; broader human-GM rollout remains held.
