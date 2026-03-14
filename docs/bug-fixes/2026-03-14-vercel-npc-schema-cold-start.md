# Vercel Cold-Start Crash — NPC Schema & Shared ESM Imports

## Impact
- Deployed `/projects` returned `FUNCTION_INVOCATION_FAILED` before route handlers ran.
- Caused full serverless cold-start failure on Vercel.

## Root Causes
1) **Node ESM import without extension (built runtime):**
   - `dist/shared/generation/workflowStageValidation.js` imported `./workflowRegistry` without `.js`, which is invalid in Node/Vercel ESM at runtime.
2) **NPC schema files not bundled for serverless & module-scope load:**
   - `npcSchemaMapper` and `npcValidator` read JSON from `schema/npc/...` at module load.
   - Build only copied `src/server/schemas` → `dist/server/schemas`; the root `schema/npc` tree was absent in the function bundle, causing file-not-found during import.

## Fixes Applied
- **ESM import hardening:** Added `.js` extensions to shared generation imports in `workflowStageValidation`.
- **Schema path resolution:** NPC loaders now resolve from bundled server path first (`dist/server/schemas/npc`), with source-layout fallback, and throw explicit errors if missing.
- **Build packaging:** `build:server` now copies `schema/npc` into `dist/server/schemas/npc` so Vercel bundles required JSON.

## Verification
- `npm run build:server` passes.
- `node --input-type=module -e "import './dist/server/app.js'"` succeeds.
- `VERCEL=1 node --input-type=module -e "import('./api/index.js')"` logs `VERCEL_HANDLER_IMPORT_OK`.

## Guardrails (added to coding standards)
- Shared/Node ESM imports must include explicit `.js` extensions after build.
- Any module-scope file reads must resolve against bundled server assets and ensure the build copies those assets.
- Add a build-time check: importing `dist/server/app.js` (and `api/index.js` with `VERCEL=1`) is required in CI to catch cold-start crashes before deploy.
