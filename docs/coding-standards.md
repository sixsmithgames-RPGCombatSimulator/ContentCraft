ContentCraft Coding Standards & Zero Regression Guardrails v1.2

Applies to all contributors (human and AI).
A change is not complete unless it satisfies every applicable section below.

The rules in this document apply from the entire application down to specific AI pipelines.
Each section narrows scope from global engineering standards to generator-specific behavior.

1. Global Engineering Guardrails (Entire Application)

These rules apply to all code in the ContentCraft system, regardless of feature area.

1.1 No Silent Fallbacks

Systems must not hide failures.

If something fails:

Surface what was attempted

Surface what failed

Provide actionable remediation guidance

Allowed:

Deterministic normalization that is explicitly logged

Forbidden:

Silent recovery that masks system defects

Fabricating data while reporting success

1.2 Separation of Concerns (Architecture)

Strict layer separation must be preserved.

Engine / State
      ↓
Event emission
      ↓
UI rendering

Rules:

UI must never mutate engine/state directly

UI must not import engine internals

UI must not modify engine-owned objects

All state changes flow through state managers or engine modules

Cross-layer mutation is forbidden.

1.3 Event-Driven Rendering

UI updates must be event driven.

Rules:

Use typed events (CustomEvent or PubSub)

Event payloads must be strongly typed

Event names must be centrally defined constants

Forbidden:

Polling loops

Direct state watchers

Implicit coupling between components

1.4 Engine Determinism

Core logic must be reproducible.

Rules:

RNG must be seeded or injectable

Engine resolution must be deterministic given identical inputs

Engine logic must not depend on UI timing or DOM state

Forbidden:

random behavior inside engine without seed control

async timing dependencies in core mechanics

1.5 Type Safety

TypeScript strict mode is mandatory.

Required:

"strict": true

Rules:

No implicit any

Exported functions must declare return types

Avoid unsafe type assertions

any allowed only when wrapping third-party libraries

Every any must include justification.

1.6 Linting and CI Gates

CI must enforce:

typecheck
lint
tests
build

Rules:

ESLint must report zero warnings

No floating promises

Unused variables must be prefixed _

Lint suppressions must be:

narrowly scoped

justified with comments

avoided in new pipeline code

1.7 Testing Requirements

All core logic changes require tests.

Rules:

npm run test must pass

Tests must cover:

edge cases

failure modes

regression scenarios

Use deterministic replay or snapshots when applicable.

1.8 Error Handling Policy

Errors must be explicit.

Rules:

No silent catch blocks

Log contextual information

Example:

console.error('[NPCPipeline] spellcasting stage failed:', err)

Development behavior:

throw on impossible states

Production behavior:

log error

revert to last safe state where feasible

1.9 Documentation Standard

All exported code requires JSDoc.

Required documentation:

classes

interfaces

public functions

event types

Comments should explain:

WHY the logic exists, not what the code does.

1.10 Change Traceability

Every change must record:

Intent (problem solved)

Scope (files modified)

Risk assessment

Verification steps

Known limitations

1.11 Definition of Done

A change is complete only when:

[ ] CI passes
[ ] Required tests exist
[ ] Visual verification completed
[ ] Documentation updated
[ ] High-risk protocol followed
2. High-Risk File Protocol

High-risk modules require extra discipline.

Includes:

generator pipelines

stage prompt builders

stage validators

schema mappers

normalizers

merger logic

retry builders

AI contracts

Required before modification:

Implementation plan

Impact analysis

Verification strategy

Refactors and feature changes must never share the same PR.

3. Observability & Logging

Structured logs must include context identifiers.

Example:

[NPCPipeline][SpellcastingStage]

Forbidden:

logging sensitive data

excessive console spam in render paths

4. Frontend & API Conventions

Use shared services.

Rules:

Never hardcode localhost

Use API_BASE_URL from services/api

Prefer shared axios client

React rules:

hooks must remain pure

no state updates during render

memoize expensive computations

Components requiring project context must receive a real projectId.

5. Security & CSP

Content Security Policy must remain strict.

Rules:

avoid inline scripts

external scripts must be whitelisted

new origins require explicit CSP updates

6. AI System Guardrails

These rules apply to all AI features across the application.

6.1 Deterministic Mechanics First

If a value can be computed locally, it must be computed locally.

Examples:

proficiency bonus

spellcasting DC

slot progression

derived ability modifiers

AI should not be used for rule-based calculations.

6.2 No Silent AI Recovery

AI output must not be silently corrected.

Normalization is allowed only if:

it is bounded

it is logged

it preserves model intent

If AI output is unusable:

fail the stage

6.3 Retry Safety

AI retries must be loop safe.

Rules:

compute retry signature from:

stage key

normalized inputs

decisions

fix instructions

If the same retry fails twice:

stop automatic retries

6.4 AI Observability

AI stages must log:

raw model response

pruned payload

normalized output

schema validation result

semantic validation result

retry triggers

7. AI Stage Contract Rules

Each AI stage must define a typed contract.

Required contract fields:

allowedKeys
requiredKeys
forbiddenKeys
normalize()
validateSchema()
validateSemantics()
retryPolicy
rawCompliancePolicy
salvagePolicy

Contracts must live in code, not prompts.

7.1 AI Stage Success Criteria

A stage is successful only if:

Raw output parses successfully

Raw payload contains at least one required allowed field

Normalization performs bounded repair only

Schema validation passes

Semantic validation passes

If raw output contains zero required fields:

stage must fail

7.2 Deterministic Repair Boundaries

Allowed repairs:

renaming fields

scalar normalization

minor structural corrections

Forbidden repairs:

fabricating entire stage payloads

replacing missing content with synthetic values and marking success

If deterministic repair produces more than 50% of required fields, the stage must be marked degraded or failed.

8. Generator System Standards

These rules apply to all structured content generators.

8.1 Prompt Design

Prompts must:

define allowed fields

forbid extra fields

require JSON-only responses

Every prompt must include:

⚠️ CRITICAL OUTPUT REQUIREMENT
Return ONLY valid JSON.
No explanations.
No markdown.
No extra text.
8.2 Stage Input Construction

All stage prompts must support:

previous_decisions
canon_reference

These inputs must be explicitly passed.

8.3 Provenance Tracking

Each stage must define:

outputFields

The merger must record:

stage source

repair actions

provenance metadata

9. NPC Pipeline Standards

These rules apply specifically to the NPC generation pipeline.

9.1 Schema Compliance

NPC stages must use shared helpers:

ensureString
ensureArray
ensureObject

Schema extractors must return:

SchemaObject
9.2 Planner Behavior

Planner rules:

proposal IDs must be stable

defaults must be within options

proposals must deduplicate against previous decisions

answered questions must not be asked again

Planner must not ask about deterministic mechanics.

9.3 NPC Stage Validation

Each NPC stage must define semantic invariants.

Examples:

Basic Info:

subclass must not be embedded in class name

Spellcasting:

slot casters must have valid slot progression

spell save DC must be > 0

attack bonus must be > 0

Core Details:

required arrays must be populated independently

hooks-only responses are invalid

9.4 Stage Result Truthfulness

UI stage status must reflect real outcomes.

Possible statuses:

success
repaired
review_required
failed

The UI must never report success when a stage failed validation.

9.5 NPC Pipeline Deterministic Derivation

Certain values must always be derived locally:

proficiency bonus

spellcasting DC

attack bonuses

slot progression

class feature unlocks

AI may assist with:

narrative details

flavor content

descriptive traits

9.6 Pipeline Retry Policy

If a stage fails twice with the same retry signature:

stage → review_required

No infinite retry loops.

Final Principle

The ContentCraft system must prioritize:

determinism
traceability
validation
observability

AI is a tool, not a source of truth.

All outputs must remain verifiable, reproducible, and structurally valid.