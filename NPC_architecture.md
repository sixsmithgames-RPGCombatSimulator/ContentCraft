# NPC Architecture Specification

## Objectives
- **Preserve Canonical Data**
- **Prevent Silent Data Loss**
- **Support Schema Evolution**
- **Enable Reliable Editing & Rendering**

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
  - UI sections updated to surface new data.
  - Round-trip tests passing.
- **Release Protocol**
  - Run full ingest/edit/save regression suite before deploying.
  - Publish release notes summarizing schema or UI changes.
  - Monitor telemetry post-release for anomalies.

By enforcing these architectural layers and policies, the NPC editing workflow becomes resilient, auditable, and production-ready while preserving every canonical data element end-to-end.
