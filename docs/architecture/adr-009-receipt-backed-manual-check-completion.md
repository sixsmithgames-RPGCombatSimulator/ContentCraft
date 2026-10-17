# ADR 009 Receipt-backed Manual check completion

- Status: Accepted
- Acceptance: Repository owner approved GMC ADR 009 and GMA ADR 023 on 2026-10-16.
- Date: 2026-10-16
- Governing proposal: GMA ADR 023, `docs/adr/023-receipt-backed-manual-check-completion.md` in the registered GameMaster Assistant repository.

Adopt the complete problem, schemas, authority/lifetimes, prompt/data flow,
unchanged budgets, validation/repair, player failure boundary, compatibility,
rollback, observability, examples, implementation plan and gates of GMA ADR 023.
GMC alone verifies and records the saved VCS result, selected Scene branch,
explicit typed or GM-confirmed movement, compound progress and protected root.
No caller-supplied outcome or browser state is authority. Preserve old hashes,
receipts and reader compatibility. No runtime implementation begins until both
documents are Accepted. No VCS or broad rollout changes are authorized.

Compatibility naming clarification: fresh packets use `/16`, policies `/21`,
results/compiled/repair `/14`; existing packet `/14`-`/15` readers retain their
original meanings. Saved `/20` replies remain unchanged. Policy `/21` teaches
the existing required-fact and actor-update validation explicitly on the first
pass, with a complete nested example. This follows the governing ADR without
changing outcome authority, schemas or budgets. Post-settlement publication
reloads the exact saved ledger, Scene, movement and clock receipts; it does not
replay effects after the candidate was cleared. Only original root advancement
may still need completion.

The governing ADR's fresh policy `/22` explicitly teaches the existing NPC
response-eligibility check and its empty-list case. Original `/20` and `/21`
prompts remain on a closed read allowlist with unchanged hashes and semantics.
Participant-reference-only repair changes just the response list, not valid
prose, branches, movement, claims or continuity. No schema or budget changes.
