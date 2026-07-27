# LLM orchestrator operations and security policy

Version: 2026-07-26.2

## Runtime boundary

GMA makes the deterministic gameplay decision and selects an operation ID. GMC
owns the provider-neutral execution boundary, operation registry, context
retrieval, provider/model routing, validation, and durable execution ledger.
GMC canon and VCS mechanics remain authoritative. Model output is always a
proposal and cannot select or perform an authority write.

Compatibility AI routes are thin adapters over the same universal contract.
They carry an explicit removal version and may be selected as rollback targets,
but they do not own provider transport or durable execution state.

## Reliability and budgets

`config/llm-slos.json` is the effective SLO contract. Every execution records
operation class, provider/model route, latency, attempts, schema and semantic
validation, exact provider usage when available, cache status, and effective
pricing version. Null prices stay null; they are never reported as zero.

Prompt-size values in operation manifests are adaptive targets, not ordinary
hard limits. Required authority evidence is never silently truncated. The
2 MB ceiling is a fail-closed abuse and infrastructure safety boundary, not a
creative or gameplay content limit.

Saved observability dimensions and queries live in
`config/llm-observability-queries.json`. The authenticated
`GET /api/gmc/v1/llm/observability` endpoint reports route mix, p95 latency,
schema success, retries, fallback, cache, pricing coverage, and actionable SLO
alerts. Execution details are queryable by task, correlation, and operation.

## Trace, retention, and deletion

- `llm_executions` and `llm_generation_workflows` expire after 30 days by
  default through MongoDB TTL indexes. Operators may change the duration with
  `LLM_EXECUTION_RETENTION_DAYS` and `LLM_WORKFLOW_RETENTION_DAYS`.
- Operational events store redacted metadata. Secrets, authorization headers,
  raw prompts, raw campaign prose, and validated output payloads are removed
  from event data before persistence.
- The protected execution response is retained only because idempotent replay
  requires the exact validated proposal. Access is user-scoped through GMC
  integration authentication and campaign ownership checks.
- Payload sampling is disabled. Enabling sampled payloads requires a separate
  encrypted store, explicit access policy, expiry, and a new contract version.
- User deletion removes that user's executions, workflows, authority operations,
  and outbox rows. Campaign deletion must delete the same records by user and
  referenced campaign metadata before completion is acknowledged.

### GMA mechanics recovery ledger

GMA writes a bounded `gma_mechanics_ledger` receipt before requesting
narration for a VCS skill check or standalone combat action. The unique key is
`{userId, campaignId, interactionId}` and a different request under the same
interaction ID is rejected. The receipt contains the completed VCS result,
resolved roll request, bounded conversation/scene context, and the identifiers
needed to refresh current VCS and GMC context. It does not replace VCS or GMC
authority and it does not store credentials or provider headers.

`PUT /api/gmc/v1/llm/mechanics-ledger/{campaignId}/{interactionId}` is the
idempotent write path. `GET` on the same path is the recovery path used when a
GMA generation trace is missing after a Vercel instance rotation. User-data
retention removes these receipts with the other orchestrator records.

## Rollout and rollback

`config/llm-rollout-policy.json` controls each operation independently. Modes
are disabled, shadow, canary, and primary. Shadow results remain proposal-only
and never invoke commit gateways. The rollout decision and policy version are
written to the durable execution event stream.

Rollback changes only the operation's routing mode/target. It does not change
the universal request, idempotency key, execution fingerprint, or authority
mutation ID. Retrying after rollback therefore replays an existing validated
result or deterministically conflicts; it cannot double-write.

Deployment order:

1. Deploy GMC registry/adapter compatibility.
2. Verify contract and provider guards.
3. Deploy GMA with the matching registry version.
4. Shadow and canary one operation at a time.
5. Exercise same-key replay and rollback before increasing traffic.
6. Remove a compatibility adapter only after its declared rollback window.

## Incident response

Provider outage, throttling, timeouts, invalid output, stale references, and
database failures are normalized with retryability and provenance. Deterministic
GMA/VCS/GMC operations continue without a model. Manual copy/paste is a
transport fallback through the same schema and semantic validators.

If durable completion fails, GMC discards the generated proposal from the
response. If an authority sequence fails, the durable outbox records completed
receipts, the failed step, pending receipts, and compensations. Operators retry
with the same IDs; they do not create a replacement operation.
