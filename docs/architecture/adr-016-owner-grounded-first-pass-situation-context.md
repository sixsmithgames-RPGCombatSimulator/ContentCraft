# ADR 016: Owner-grounded first-pass situation context

- Status: Accepted
- Acceptance: Repository owner explicitly approved updated GMA ADR 033 on
  2026-10-26, including GMC context issuance, immutable source bindings,
  first-pass destination validation and accurate saved-plan recovery.
- Governing decision: `GameMaster Assistant/docs/adr/033-owner-grounded-first-pass-situation-context.md`
- Subordinate plan: `GameMaster Assistant/docs/GMA_FIRST_PASS_SITUATION_IMPLEMENTATION_PLAN_2026-10-23.md`

This owner decision adopts the complete accepted governing design: authority,
public visibility, situation/source schemas, source-head validation, original
versioned policies, budgets, persistence, historical readers, bounded recovery,
rollback, tests and release gates. GMC remains the sole campaign/world owner;
VCS and provider activation are unchanged. No production state is rewritten or
support-closed action reopened by this adoption. Material departures require
review before runtime implementation.

Derived suffixes keep their root causal timeline anchor. Their interpretation
snapshot includes the completed prefix through the current accepted owner head,
as specified by ADR 033. Only the protected workflow service can request that
boundary after checking completed parent progress; HTTP ticket callers cannot.
