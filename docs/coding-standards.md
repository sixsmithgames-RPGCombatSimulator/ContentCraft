# ContentCraft Coding Standards & Zero Regression Guardrails v1.1

> **Applies to all contributors (human and AI). No change is complete unless it satisfies every applicable section below.**

## 0. No Fallbacks
- Do not rely on silent fallbacks. Trap errors and surface clear messages: what was attempted, what failed, and how to fix it.

## 1. Architectural Guardrails (Non-Negotiable)
### 1.1 Separation of Concerns
- UI MUST NOT mutate engine/state directly, import engine internals, or modify engine-owned objects.
- All state transitions flow through: Engine/State Manager → Event emission → UI listens/reacts.
- No direct cross-layer coupling.

### 1.2 Event-Driven Rendering
- Updates occur via typed events (`CustomEvent`/PubSub) using centrally defined event constants.
- No polling loops to “check” state.
- Event payloads must be strongly typed; no `any`.

### 1.3 Engine Determinism
- RNG must be seeded or injectable.
- Core resolution must be reproducible given identical inputs.
- Engine logic must not depend on UI timing, DOM state, or async side effects.

## 2. Type Safety & Linting (CI Gates)
- TypeScript strict mode required (`"strict": true`).
- No implicit `any`. No untyped exported/public functions. Avoid `any` unless wrapping untyped third-party (document why).
- No unsafe type assertions without justification.
- ESLint: zero warnings. Unused vars prefixed with `_`. No floating promises.
- CI must pass: typecheck, lint, tests, build.

## 3. High-Risk File Protocol
- High-risk modules (e.g., NPC pipeline, generator stage prompts, schema mappers/normalizers) require:
  1) `implementation_plan.md`
  2) Impact analysis (consumers, dependent events, visual impacts)
  3) At least one of: new/updated unit test, replay/snapshot update, or manual verification checklist.
- Do not mix feature changes and refactors in the same change set.

## 4. Planning & Change Discipline
- Document intended vs. current vs. expected behavior, edge cases, and regression risks before core logic changes.
- If refactor and feature are both needed, split into separate PRs.

## 5. Testing & Validation
- `npm run test` must pass.
- Engine logic changes require new/updated tests; cover edge cases and ensure failures on old behavior.
- Use replay/snapshot or deterministic resume where applicable to catch invisible regressions.

## 6. Error Handling Policy
- No silent failures. Catch blocks must log context (e.g., `console.error('[Component] failed:', err)`).
- Fail fast: throw in dev for impossible states; in production log and revert to last safe state if feasible.

## 7. Documentation Standard
- JSDoc required for every class, interface, public method, and event type.
- Inline comments explain **why**, not what (e.g., math rationale, ordering requirements, rounding rules).

## 8. Change Traceability (Agentic Contributions)
Every change must record:
- Intent (problem solved)
- Scope (files modified)
- Risk assessment
- Verification steps executed
- Known limitations

## 9. Definition of Done
- [ ] CI gates pass (typecheck, lint, tests, build)
- [ ] Required tests exist and pass
- [ ] Manual visual verification completed (where applicable)
- [ ] Documentation updated
- [ ] High-risk protocol followed (if applicable)

## Frontend & API Conventions (ContentCraft-specific)
- Use `API_BASE_URL` from `services/api`; never hardcode `localhost`. Prefer the shared axios client.
- Keep hooks pure; no state updates during render. Memoize expensive/pure computations with `useMemo`; guard async handlers with `saving` flags.
- Remove noisy `console.log` from render paths; keep logs structured and minimal.
- Components that need project context must receive a real `projectId` (no magic `'default'`).
- Preserve CSP compliance: avoid inline scripts/styles unless explicitly allowed; external scripts must be whitelisted in Helmet.
- Follow existing Tailwind utility style and accessible controls; disable actions while loading.

## Generator/NPC Pipeline Standards (from workflow docs)
- Follow existing patterns in NPC pipeline files.
- Use TypeScript strict-mode compatible types.
- Include JSDoc on exported functions.
- Use helpers like `ensureString`, `ensureArray`, `ensureObject` from generatedContentMapper.
- Schema extractors return `SchemaObject`.
- Stage prompts must include the **“⚠️ CRITICAL OUTPUT REQUIREMENT”** JSON-only instruction.
- All `buildUserPrompt` must handle `previous_decisions` and `canon_reference`.
- Section chunks must define `outputFields` for merger provenance.

## Logging & Observability
- Prefer contextual logs with identifiers (component/feature prefix).
- Avoid logging sensitive data.

## Routing & Navigation
- Project-scoped actions (e.g., generator/save) must be initiated from a project context; routes must enforce or prompt for a valid `projectId`.

## API Contracts
- Validate payloads before sending; strip empty/problematic fields as in `SaveContentModal`.
- Surface meaningful error messages to users; include what was tried and suggested fixes.

## Deployment & CSP
- Helmet CSP must explicitly allow required script/connect sources; avoid introducing new origins without updating CSP.
- No inline scripts unless hashed/nonce’d and documented.
