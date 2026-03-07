# NPC Architecture Specification

## Objectives
- **Preserve Canonical Data**
- **Prevent Silent Data Loss**
- **Support Schema Evolution**
- **Enable Reliable Editing & Rendering**
- **Make the App the Authoritative Memory for AI Generation**
- **Guarantee Stateless, Deterministic Stage Execution**

## Domain Model Layer
- **[Source Schema]** Maintain a versioned JSON Schema at `schema/npc/v1.json` capturing the full canonical payload, including nested sections such as `personality`, `equipment`, `magicItems`, `factCheckReport`, `speed`, `tactics`, and provenance metadata. Required vs optional fields must be explicit.
- **[Type Generation]** Generate TypeScript interfaces from the schema (e.g., `RawNpcV1`, `NormalizedNpcV1`, `PersistedNpcV1`) during the build using a tool such as `ts-json-schema-generator`. Generated types live under `client/src/types/npc/`.
- **[Separation of Concerns]** Distinguish between:
  - **RawNpc**: Verbatim ingest payload (external API / stored JSON).
  - **NormalizedNpc**: UI-friendly view model consumed by `client/src/components/generator/`.
  - **PersistedNpc**: Payload emitted back to storage or downstream services.

## Validation & Transformation Pipeline
- **[Strict Validation]** Before any transformation, validate incoming data against `schema/npc/v1.json` using AJV (or equivalent). Reject invalid payloads with actionable errors; do **not** auto-normalize away issues (per user rule disallowing normalizers and fallbacks).
- **[Deterministic Mappers]** Implement pure functions managed in `npcUtils.ts`:
  - `mapRawToNormalized(raw: RawNpc): NormalizedNpc`
  - `mapNormalizedToRaw(normalized: NormalizedNpc, base?: RawNpc): RawNpc`
  Each mapper must have unit tests with fixture snapshots confirming field parity and round-trip stability.
- **[Field Adapters]** For complex structures (e.g., equipment, magic items, allies vs foes, spellcasting, fact-check reports), register adapters in `client/src/components/generator/fieldAdapters/` so new fields can be composed without editing monolithic code.
- **[Round-Trip Guarantee]** Add integration tests ensuring `mapNormalizedToRaw(mapRawToNormalized(raw))` matches the original (modulo deterministic formatting) to prevent data loss.

## Generation Memory & Orchestration Layer
- **[App-Owned Memory]** Treat the application as the sole authoritative memory for multi-stage NPC generation. The model must not be relied upon to remember previous prompts, previous chunks, or prior stage outputs.
- **[Generation Memory Model]** Maintain a typed generation-memory object containing:
  - request memory (original prompt, generator type, flags, schema version)
  - decision memory (confirmed answers, inferred choices, unresolved questions)
  - stage memory (authoritative stage outputs and compact stage summaries)
  - canon memory (retrieved facts, entities, provenance)
  - execution memory (current stage, chunk state, retries, autosave checkpoints)
- **[Stage Summary Memory]** Every stage must produce both:
  - an authoritative full stage output for persistence/merging
  - a compact summary used for later stage context budgeting
- **[No Hidden Continuity]** AI chat/session history must never be required for correctness. If a later stage needs information, that information must be present in app-owned memory and explicitly supplied in the stage request.
- **[Deterministic Stage Advancement]** Stage progression, retries, resume, chunk continuation, and user-answer incorporation must flow through the same orchestration path. Do not hand-build one-off prompts outside the stage compiler.

## Prompt Compilation & Budgeting Layer
- **[Single Authoritative Prompt Compiler]** Compile the final outbound stage prompt in exactly one place before execution. The compiled prompt sent to the provider must be byte-for-byte the same prompt that was budgeted and shown to the user.
- **[Budget by Policy]** Stage prompts must be assembled from declarative categories:
  - must-have: stage contract, output format, required stage inputs, explicit user decisions
  - should-have: canon summaries, prior decision summaries
  - nice-to-have: verbose flags, examples, expanded prior outputs
- **[Dependency-Based Context Selection]** Each NPC stage must declare or imply which prior stages it depends on. Do not forward the entire prior stage history by default.
- **[Distilled Context Only]** Use compact stage memory summaries instead of raw prior outputs whenever possible. Full prior outputs are reserved for debugging or explicitly required migrations.
- **[Exact Outbound Measurement]** Prompt budgeting must be computed from the exact final outbound prompt string that the provider adapter sends. Any server-side ceiling checks should be comparable against the same string representation.
- **[Fail Fast on Budget Violations]** If the authoritative compiled prompt exceeds the configured safety ceiling, abort the automated stage run with a clear error instead of silently trimming or relying on provider truncation.

## Stage Execution Contract
- **[Stateless Requests]** Each stage request must be self-contained and include:
  - stable stage key
  - stage contract
  - explicit output shape
  - minimal relevant generation memory
  - minimal canon memory
  - explicit previous decisions and unresolved ambiguities
- **[AI as Pure Transform]** The model should only transform explicit input into structured output for the current stage. It must not own workflow continuity.
- **[Patch Scope Enforcement]** Responses must be constrained to the active stage key and validated against schema-allowed fields before merge.
- **[Retry Semantics]** Retries are new stateless executions with updated app-owned memory and explicit additional guidance. Retries must not append ad hoc prompt text outside the compiled stage request path.

## UI Composition Layer
- **[Section Components]** Break `NpcContentForm.tsx` into focused sections (`NpcBasicsSection`, `NpcStatsSection`, `NpcSpellcastingSection`, `NpcLoreSection`, `NpcEquipmentSection`, etc.). Each section takes typed props (slices of `NormalizedNpc`) and emits explicit update payloads to avoid fragile string keys.
- **[Dynamic Editors]** Implement reusable editors for lists and objects (e.g., equipment tables, magic item cards, relationship matrices) that accept schema-aware descriptors. Provide JSON fallback editors only when the schema explicitly allows arbitrary properties.
- **[Validation Feedback]** Surface validation results inline using schema-driven errors (e.g., missing required fields, invalid spell slot syntax). No silent coercion, no hidden fallbacks.
- **[Provenance Visibility]** Display `sources_used`, `assumptions`, `fact_check_report`, and audit information so editors retain context when modifying NPCs.

## Persistence & Audit Layer
- **[Schema-Aware Serialization]** Update `normalizedNpcToRecord()` in `npcUtils.ts` to emit every schema field, including nested structures, provenance details, and metadata (e.g., schema version, timestamps, edit origin).
- **[Versioned Saves]** Persist a `schemaVersion` field within each stored NPC. On schema upgrades, add migration scripts (`scripts/migrations/npc/`) and document upgrade paths.
- **[Audit Trail]** Attach audit metadata (editor user, timestamp, change summary) when saving through `client/src/components/generator/SaveContentModal.tsx` to support traceability.

## Rendering & Export Layer
- **[Descriptor-Driven Rendering]** Refactor `NpcContentView.tsx` to render sections based on a descriptor map aligned with the schema. This prevents omissions when new fields appear.
- **[Export Utilities]** Provide `exportNpcMarkdown(normalized)` and `exportNpcJson(normalized)` utilities that respect the schema, maintain field ordering, and include provenance blocks.

## Cross-Cutting Concerns
- **[Testing Requirements]**
  - Prompt compiler tests to verify the compiled outbound prompt matches what the integrated runner sends.
  - Stage memory summary tests to ensure summaries are compact, deterministic, and stable across resumes.
  - Integration tests for stateless stage retries and chunk continuations.
  - Unit tests for schema validation success/failure cases.
  - Round-trip mapper tests with real-world fixtures (e.g., `Goran Varus`).
  - Section-level snapshot tests to ensure UI renders all mapped fields.
  - End-to-end tests covering ingest → edit → save → reload.
- **[Documentation]** Keep `docs/npc-schema.md` updated with field semantics, UI responsibilities, and migration notes. Link from developer onboarding materials.
- **[Monitoring & Alerts]** Emit metrics/logs for validation failures, save errors, and mapper mismatches. Configure alerts when thresholds exceed defined budgets (e.g., >1% validation failure rate).
- **[Security & Privacy]** Enforce project-level access controls for provenance data and redact sensitive identifiers before export.

## Governance Policy
- **Schema Changes**
  - Require architecture approval and a version bump for any schema modification.
  - Provide migration scripts and backward compatibility notes.
  - Update generated types and regenerate documentation before merge.
- **Code Review Checklist**
  - Schema alignment confirmed (no missing fields).
  - Validation paths covered by tests; no fallback/normalizer shortcuts added.
  - Multi-stage generation uses app-owned memory, not chat continuity.
  - Compiled prompt shown in UI matches the actual provider request.
  - UI sections updated to surface new data.
  - Round-trip tests passing.
- **Release Protocol**
  - Run full ingest/edit/save regression suite before deploying.
  - Publish release notes summarizing schema or UI changes.
  - Monitor telemetry post-release for anomalies.

By enforcing these architectural layers and policies, the NPC editing workflow becomes resilient, auditable, and production-ready while preserving every canonical data element end-to-end.
