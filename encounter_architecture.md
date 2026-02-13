# Encounter Architecture Specification

## Objectives
- **Preserve Encounter Canon**
- **Prevent Silent Data Loss**
- **Support Schema Evolution**
- **Enable Robust Authoring & Rendering**

## Domain Model Layer
- **[Source Schema]** Define `schema/encounter/v1.json` capturing metadata, participants, environment, phases, objectives, rewards, and provenance (`sources_used`, `assumptions`, `fact_check_report`).
- **[Type Generation]** Generate TypeScript interfaces (`RawEncounterV1`, `NormalizedEncounterV1`, `PersistedEncounterV1`) from the schema using `ts-json-schema-generator`. Store generated types under `client/src/types/encounter/`.
- **[Separation of Concerns]**
  - **RawEncounter**: Verbatim ingest payload.
  - **NormalizedEncounter**: UI-friendly structure consumed by `client/src/components/generator/`.
  - **PersistedEncounter**: Storage/emission payload including `schemaVersion`.

## Validation & Transformation Pipeline
- **[Strict Validation]** Validate payloads against the schema with AJV. Reject invalid input; never apply silent normalization or fallbacks.
- **[Deterministic Mappers]** Implement pure functions in `encounterUtils.ts`:
  - `mapRawToNormalizedEncounter(raw: RawEncounter): NormalizedEncounter`
  - `mapNormalizedToRawEncounter(normalized: NormalizedEncounter, base?: RawEncounter): RawEncounter`
  Each must have unit tests with fixture snapshots confirming field parity and round-trip stability.
- **[Field Adapters]** Register adapters for complex structures (participants, hazards, phases, reward bundles) in `client/src/components/generator/fieldAdapters/` to allow modular extension.
- **[Round-Trip Guarantee]** Integration tests must confirm `mapNormalizedToRawEncounter(mapRawToNormalizedEncounter(raw))` equals the source (modulo deterministic formatting).
- **[Versioned Migrations]** Store migrations in `scripts/migrations/encounter/` to upgrade persisted data when schema versions bump.

## UI Composition Layer
- **[Section Components]** Refactor encounter forms into typed sections (`EncounterBasicsSection`, `EncounterParticipantsSection`, `EncounterEnvironmentSection`, `EncounterPhasesSection`, `EncounterObjectivesSection`, `EncounterRewardsSection`, `EncounterProvenanceSection`). Each section takes typed props and emits explicit update payloads.
- **[Reusable Editors]** Provide schema-driven editors for participants (NPC references/stat blocks), phase timelines, hazard builders, loot bundles, and objectives. Only fall back to raw JSON editors when the schema allows arbitrary properties.
- **[Validation Feedback]** Surface schema-derived validation errors inline (missing objectives, invalid DCs, unresolved references). No silent coercion.
- **[Provenance Visibility]** Always display `sources_used`, `assumptions`, `fact_check_report`, and audit metadata to maintain context.

## Persistence & Audit Layer
- **[Schema-Aware Serialization]** Extend `normalizedEncounterToRecord()` to include every schema field plus `schemaVersion`, timestamps, editor identity, and change summary.
- **[Audit Trail]** Ensure `SaveContentModal.tsx` captures encounter-specific diffs (participants added/removed, hazard updates) alongside NPC edits.
- **[Reference Resolution]** Resolve external references (NPC IDs, item IDs) during save; warn users about unresolved entities.

## Rendering & Export Layer
- **[Descriptor-Based Rendering]** Use descriptor maps in `EncounterContentView.tsx` so new schema fields render automatically without manual wiring.
- **[Export Utilities]** Offer `exportEncounterMarkdown(normalized)` and `exportEncounterJson(normalized)` that respect schema ordering and include quick-reference tables for phases, participants, and rewards.

## Cross-Cutting Concerns
- **[Testing]**
  - Schema validation success/failure tests.
  - Round-trip mapper tests using real fixtures (e.g., Castle Bloodforge defense encounter).
  - UI snapshot tests per section to catch missing fields.
  - End-to-end ingest → edit → save → reload scenarios.
- **[Documentation]** Maintain `docs/encounter-schema.md` detailing field semantics, UI responsibilities, and migration steps.
- **[Monitoring & Alerts]** Log metrics for validation failures, save issues, and reference resolution errors; trigger alerts when thresholds exceed acceptable levels.
- **[Security & Privacy]** Enforce project scoping; sanitize sensitive notes before export.

## Governance Policy
- **Schema Changes**
  - Require architecture review, schema version bump, migration plan, and updated fixtures/tests.
  - Regenerate TypeScript types and documentation before merge.
- **Code Review Checklist**
  - Schema alignment verified.
  - Validation and round-trip tests updated/passing.
  - UI sections render new data.
  - No fallbacks/normalizers introduced.
- **Release Protocol**
  - Run full encounter + NPC regression suite prior to deploy.
  - Publish release notes summarizing schema/UI changes.
  - Monitor telemetry post-release for anomalies.

By adopting this architecture and policy, encounter content gains the same resilience, fidelity, and auditability as the NPC workflow while remaining extensible for future campaign needs.
