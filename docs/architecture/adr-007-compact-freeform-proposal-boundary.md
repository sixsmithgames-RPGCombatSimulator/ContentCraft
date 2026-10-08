# ADR-007: Protected compact freeform proposal boundary

- Status: Accepted
- Date: 2026-10-07
- Acceptance: Repository owner approved the complete cross-repository ADR 012 on 2026-10-07, including GMC operation and protected workflow storage.
- Governing decision: `GameMaster Assistant/docs/adr/012-universal-freeform-intake-and-compact-llm-proposals.md`
- Subordinate plan: `GameMaster Assistant/docs/GMA_FREEFORM_INTAKE_IMPLEMENTATION_PLAN_2026-10-07.md`

This owner record adopts ADR 012, including its authority, schema, budget,
privacy, repair, compatibility, rollback, evaluation, and release requirements.
It does not authorize any departure from that decision.

On 2026-10-08 the owner accepted the governing ADR's Manual-first amendment:
development uses an external-LLM subagent and zero-provider Manual validation.
Native-provider acceptance is deferred, not passed, and remains a future
integrated-activation gate. The blind rehearsal does not certify gameplay,
human quality or production activation; all protected ticket, owner authority,
recovery and Manual rollout gates remain unchanged.

The first blind Manual development rehearsal now passes six unedited fictional
external-LLM replies through the actual schema/semantic checks and protected
ticket acceptance/replay/reconciliation with memory-only storage and no provider
calls. See `npm run rehearse:freeform:manual` and the governing GMA plan for
the evidence and limits. This does not enable the operation or certify a
compiler, browser flow, prepared-fact retrieval, settled turn or human canary.

## Initial delivery boundary

GMC registers `input.freeform.interpret` with proposal-only authority and a
closed `gma.freeform-intent-proposal/1` schema generated into the shared
registry. Its first-pass policy is `gma.freeform-intake-policy/1`. The operation
is disabled by default; GMA does not emit fresh programs in this delivery.
The schema remains descriptive enough for future non-action kinds, but this
initial ticket issuer accepts only action mode. Mixed steps and state/event
conditions cannot execute; their durable workflow remains a later gate.

`llm_freeform_tickets` is protected execution metadata, not campaign canon.
An authenticated service integration first stages an exact instruction using
the existing owner endpoint. Ticket issuance loads that immutable instruction
and checks campaign ownership. It binds user, campaign, interaction, selected
actor, action mode, transport, registry, policy, immutable request, attempt,
and a 24-hour expiry. An actor selection must be an exact campaign-owned
actor reference. This initial service-only issuer does not export private
Scene facts or provide a browser/player ticket API. Broader role-sensitive
context retrieval remains gated on the later GMA integration.

The ticket is random and opaque, but is not authentication. Unique indexes
make issuance idempotent by caller key and instruction/attempt. A failed reply
retires its ticket; one explicit replacement may reference that retired first
attempt. The server never keeps the rejected reply in the ticket record.
Accepted replies retain a digest for exact replay, not authority to execute.
The authenticated service retirement endpoint closes a ticket when its
workflow is retired; cancellation cannot authorize a replacement. Wiring
that endpoint into GMA's workflow retirement is required before activation.
Matching failures at the second attempt record a support stop. Expiry or a
retired ticket is checked before cache replay or provider submission.

Manual validation calls the same deterministic proposal checks without a
provider. Integrated execution has one attempt and no fallback. Native Gemini
schema attachment is mandatory for this operation and must stay within the
existing 4,096-byte adapter bound. The whole provider envelope is measured
against the 24,576-byte hard context ceiling, including the larger of Gemini
and OpenAI framing (a 256-byte model-name reserve and an exact OpenAI pre-send
recheck). The OpenAI adapter disables SDK retries for this operation only;
the one-attempt limit includes transport retries. Output is bounded to 16,384 bytes
and 6,000 tokens. Policy, exact prefix, evidence, indexes, catalog provenance,
graph bounds, explicit observer/method/form/viewpoint relationships, and
action-only activation restrictions are tested before any program is created.

The artifact store adds an explicitly advertised compiler `/12` reader for
source `freeform_intent_compiler`, without confidence or review claims. This
reader does not enable an emitter or loosen historical policy validation.
Rollback disables new intake while preserving the reader and accepted records.
Historical instruction, program, receipt, and observation readers stay intact.

No world, character, Scene, mechanics, or conversation mutation is part of
proposal issuance or interpretation. Support-facing diagnostics remain behind
the integration boundary; the later GMA recovery layer must supply ADR 012's
player-safe copy and stopping boundary before any player-facing activation.

Required release evidence: closed-schema and semantic fixtures, isolation,
expiry, duplicate/concurrent issuance and replay, one replacement, second-stop,
no rejected-payload retention, native projection, original-policy inclusion,
no-provider Manual acceptance/rejection, existing reader regression, full GMC
checks, and exact deployment status. Real-provider acceptance, fictional GMA
end-to-end settlement, human canary and quality evaluation remain activation
gates; registration or a Ready deployment is not a release certificate.
