# ADR 015: Complete-owner review capacity admission

- Status: Accepted — explicitly approved by the owner on 2026-10-19, including protected profile-bound issuance
- Date: 2026-10-19
- Companion/governing design: GMA ADR 032,
  `docs/adr/032-complete-owner-review-capacity-admission.md` in GameMaster Assistant
- Scope: Existing Manual test campaign only; VCS and provider activation unchanged
- Protected boundary: GMC versioned review-issuance writer

## Problem and decision proposed

Corrected ADR 014/GMA ADR 031 removes human applicability choices successfully,
but the live complete review needs 161,387 bytes against the fixed 131,072-byte
context ceiling. It combines a 93,383-byte successor, 174,512-byte complete owner
baseline and all 43 sources before existing lossless representation. The owner
stopped before independent issuance or gameplay effects. Exact graph-packing
experiments still need approximately 156 KB. Do not remove evidence or silently
change historical operation limits to force completion.

Adopt the complete accepted GMA ADR 032 design: optional `scene-review-capacity/1`
with an exact `complete_owner_baseline_256k` profile and new registered operation
(existing analysis operation plus `.complete-owner-baseline`), 131,072-byte
target and 262,144-byte hard context limit. Preserve every old definition. Keep
the exact semantic prompt `/19`, assessment `/11`, all strict-save semantics,
same working-set `/2`, all source evidence and existing independent/repair call
counts. No other input, dossier, output, private projection, expansion, record
or source limit is raised. No provider, world/campaign-specific bypass or new
gameplay writer is introduced.

## Ownership, schemas, lifetime and protected writer

GMC owns facts, current source heads, original compiled cache and durable
issuance. GMA measures/assembles; the LLM independently examines; a human supplies
only genuinely missing world facts. Studio hints confer no authority.

GMC review-issuance request/receipt `/2` must bind the exact negotiated profile,
model operation, hard ceiling, logical packet fingerprint, original resume,
validation identities and consumed ledger. It rereads current owners, confirms
the stage is genuinely unissued, measures the registered context independently,
and reserves exactly one original examination. Preserve `/1` readers and
operation discovery. Reject model/browser-chosen profiles, foreign/stale heads,
unknown identities, changed duplicate requests and attempts to reopen an issued
stage. Recover an ambiguous write by original operation, not a new identifier.

New Manual state `/14` carries this profile only after complete negotiation;
old states, prompts and replies remain exact. Allow the new exact operation in
the existing lossless decoder/account guard and canonical semantic validator
wrappers. No unrestricted suffix matching or weakening owner inspection. The
logical assessment and current certificate/binding families retain their exact
semantic meaning; capacity provenance comes from verified issuance, not a model
claim. Complete logical equality and original fingerprint checks remain required.

## Data flow, budgets, validation and repair

Follow GMA ADR 032's full sequence: current complete evidence; evidence-only
feasibility check before fresh costly construction; original-cache recovery;
actual canonical full-context measurement; smallest fitting negotiated profile;
one protected issuance; unchanged independent review, current-owner strict save
and every current readiness consumer; ordinary unfinished execution/observation
receipts. Do not promise an estimate guarantees an unknown future candidate fits.

Keep 96,000-byte successor, 16,384-byte executable authority, 65,536-byte private
projection, 64-source/65-row probes, 1 MiB expansion, output reserves, record
counts and model/repair budgets. Stop above 262,144 bytes; never grow again
automatically or create review batches/additional model calls. A repair retains
the chosen profile, original issuance and consumed allowance. Semantic debt,
stale owners and genuine missing facts retain their existing distinct recovery.

## Compatibility, rollout, failures, rollback and observability

Reader/registry/writer first, GMA and exact Studio pins second. Default off
outside the existing exact test-campaign allowlist. The saved 6 AM ruling is
reused; no event edits, clock changes, repeated GM corrections, observer links,
movement, rolls or fresh live intake are authorized by capacity admission.

Overflow explains the stopped preparation, safe original plan and concrete
existing smaller-boundary/support action; never ask for another AI reply or a
human relevance partition. Missing negotiation, changed sources and prior
issuance conflicts have distinct plain-language messages. Require normalized
second-failure support escalation, simple apology, `info@sixsmithgames.com`,
secondary code, preserved drafts/state and no raw developer diagnostics.

Rollback stops new capacity emission and `/2` reservations but preserves all
receipt readers/discovery and returned replies. Log exact profiles, bytes,
section sizes/counts, fingerprints, original calls and issuance/recovery lineage,
not private prose/keys. Preserve the live overflow as negative evidence.

## Examples, tests and acceptance

The exact 161,387-byte live review fails the historical operation and can fit
the approved new profile without changing facts or calls. A 262,145-byte review
still fails. An old issued prompt cannot select a new tier for a free review.

Require old-definition/issued-packet compatibility; complete and partial
negotiation; exact 128/256 KiB boundaries and full-context measurement; a rich
owner-baseline/near-limit-successor/43-source cross-product fixture; lossless
codec/account inspection; first-pass prompt and equal semantic validation;
foreign/forged/stale capacity, owner and issuance denial; duplicate/conflicting/
lost reservation; no call reset; ruling reuse; cancellation; strict-save and
consumer checks; player copy/action/support/reset/privacy tests. GMC's full
check and both builds, full GMA/Studio checks, actual over-128-KiB frozen blind
browser flow, reload, eight save-loss replays, six historical roll replays,
reader-first main delivery and exact production proof precede original live
continuation. Live completion and broader human-GM quality remain separate gates.

The subordinate implementation plan and all scope/budget/failure/lifetime details
in accepted GMA ADR 032 govern runtime implementation. A material departure
requires documentation review before code proceeds.
