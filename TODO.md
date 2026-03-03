# TODO

## Type Error Remediation Plan (ManualGenerator.tsx)

### 1) Catalog & Group Errors (already observed)
- LiveMap/Space shape: JsonRecord[] vs SpaceLike[]/LiveMapSpace[], missing x/y, size_ft, dimensions.
- Canon/Conflict schema drift: CanonFact missing type; conflicting Conflict definitions.
- Stage metadata: Stage missing id.
- Unsafe casts: JsonRecord ↔ arrays/numbers/content.

### 2) Needed Definitions / Sources to Inspect
- **SpaceLike (doorSync.ts authoritative)**: `name: string; size_ft: { width: number; height: number }; doors?: DoorLike[]; [key: string]: unknown` @client/src/utils/doorSync.ts#21-27. Requires size_ft and doors typed with DoorLike.
- **LiveMapSpace (liveMapTypes.ts authoritative)**: optional `dimensions?: LiveMapDimensions` (string or {width?,height?,unit?}), `size_ft?: { width?: number; height?: number; }`, `position?: { x: number; y: number }`, etc. @client/src/types/liveMapTypes.ts#10-44.
- **Space validation helper**: `locationSpaceValidation.ts` expects size_ft { width, height } or dimensions { width, height }. @client/src/utils/locationSpaceValidation.ts#21-51.
- **CanonFact**: currently used shape in ManualGenerator lacks `type`; need authoritative canon fact interface (check canon schemas/server models) and add `type` if required.
- **Conflict**: two conflicting interfaces exist; find canonical conflict type (likely from canon/validation outputs) and align ManualGenerator usage.
- **Stage metadata**: Stage type in ManualGenerator now has optional `routerKey`; confirm if `id` (or routerKey) should be required from stage configs (e.g., NPC stages/other stage configs).

### 3) Next Steps / Fix Plan
1) **Spaces/LiveMap types alignment**
   - Import and reuse `SpaceLike` from `client/src/utils/doorSync.ts` where door sync/validation is called.
   - For map/editor paths, use `LiveMapSpace` from `client/src/types/liveMapTypes.ts`; when converting generic JSON, build objects that include `size_ft {width,height}` and optionally `dimensions {width,height}` plus `position {x,y}` to satisfy errors about missing x/y.
   - Before calling functions expecting `SpaceLike[]`/`LiveMapSpace[]`, map `JsonRecord[]` into properly shaped typed objects (ensure numeric width/height, x/y present, and doors typed).
   - Ensure `extractSpaceForMap` and downstream merges always set `size_ft` (source of truth) and keep `dimensions` in sync.

2) **CanonFact schema**
   - Locate authoritative CanonFact type (canon schemas/server models). Add required fields (e.g., `type`) to the ManualGenerator CanonFact interface and ensure fetch/parsing code maps that field.

3) **Conflict type unification**
   - Identify canonical `Conflict` interface (from canon validation outputs). Remove duplicate definition in ManualGenerator; import/use the canonical type. Update usages expecting `new_claim` vs required fields accordingly.

4) **Stage metadata**
   - Decide on required stage identifier (`id` or `routerKey`) from stage configs. Update `Stage` interface accordingly and populate each stage definition with the required key.

5) **Unsafe casts cleanup**
   - Replace unsafe casts (JsonRecord ↔ arrays/numbers/content) with proper narrowing or typed adapters before use.

6) **Verification**
   - After applying the above, rerun `npm run typecheck` to confirm errors resolved in ManualGenerator.tsx and related modules.

### 3) Trace Error Sites in ManualGenerator.tsx
- Identify the data source for each offending value (map rendering, space sizing, canon facts, stage navigation).
- Confirm expected runtime shape vs inferred type; note any true unknown/JsonRecord inputs from API or uploads.

### 4) Fix Strategy (per coding standards)
- LiveMap/Space: add runtime guards and typed mappers before passing to SpaceLike/LiveMapSpace consumers; ensure x/y, size_ft, dimensions present; surface clear errors if invalid.
- Canon/Conflict: align CanonFact fields with schema; import the correct Conflict type and delete duplicates; adjust consumers accordingly.
- Stage metadata: use the Stage type that exists (routerKey/name) or add id only if part of the real model; avoid assuming id if not defined.
- Unsafe casts: replace direct casts with narrowers/validators; avoid JsonRecord→array/number without checks.

### 5) Validation & Regression
- After type fixes, rerun TS/ESLint; run npm run build.
- Spot-check runtime paths: LiveMap rendering, space approval/geometry, canon facts usage, stage navigation.

Notes: These errors are currently IDE-only (build passes) but mark weak points for runtime shape issues, especially in map/space flows.
