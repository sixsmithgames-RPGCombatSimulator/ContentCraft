# Compound-action instruction staging and model contracts

GameMasterCraft 1.10.1 completes the D9.4 instruction-first persistence
boundary required by ADR-005. The exact immutable player instruction is staged
before semantic interpretation. The finished program, cursor, and receipts are
then created against that staged instruction through revisioned, idempotent,
non-canonical interaction storage.

The release also registers the bounded `action.program.interpret`,
`action.slice.narrate`, and `action.slice.repair` operations. Their original
versioned prompt policies contain the positive evidence, player-facing outcome,
prepared-substance, immediate NPC decision, pending-mechanic, and typed
field-only repair requirements that the deterministic validators enforce.

The interaction-instruction and compound-action records are private workflow
artifacts. They do not become campaign canon, Story facts, NPC knowledge, or
scene content without the existing accepted proposal and receipt boundaries.
The D9.4 gameplay route remains disabled until GMA and Studio complete their
cross-service acceptance gates.
