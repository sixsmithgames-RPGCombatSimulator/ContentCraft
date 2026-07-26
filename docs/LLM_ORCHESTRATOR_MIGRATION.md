# GMC LLM orchestrator migration

The accepted cross-repository architecture decision is
`GameMaster Assistant/docs/adr/001-llm-orchestrator-boundary.md`.

Production startup creates:

- `llm_executions` with unique `{userId, operation, idempotencyKey}`, task,
  correlation, cache, and TTL indexes;
- `authority_outbox` with unique `{userId, operationId, stepId}` and pending
  work indexes.

Compatibility AI routes now construct universal requests and execute the same
registry/provider/validation/ledger pipeline. Entity generation is
proposal-only even when an old caller sends `makeCanon`. Direct provider
transports are confined to `src/server/llm-orchestrator/providers`.

Retention defaults to 30 days through `LLM_EXECUTION_RETENTION_DAYS`. Model
capabilities and pricing are effective-dated in
`config/llm-model-policy.json`; unverified prices remain null.
