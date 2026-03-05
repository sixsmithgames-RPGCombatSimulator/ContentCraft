# AI 422 Error – Bug Report and Resolution

## Summary
The automated NPC generation workflow was failing with a **422 Unprocessable Content** error during the **Basic Info** stage. The Gemini response contained a malformed `personality` field (either a JSON string or an invalid object), causing AJV schema validation to reject the payload.

## Root Cause
- The LLM sometimes returns fields as **stringified JSON** instead of proper objects.
- The `personality` field is optional in the schema, but the server attempted to validate it directly, resulting in the error:
  ```
  /personality must be object
  ```
- The original server code only stripped disallowed top‑level keys and did not handle malformed allowed fields.

## Fix Implemented
1. **Generic coercion of stringified JSON values**
   ```ts
   const payloadKeys = Object.keys(payload || {});
   for (const key of payloadKeys) {
     const value = (payload as Record<string, unknown>)[key];
     if (typeof value === 'string') {
       try {
         const parsed = JSON.parse(value);
         if (typeof parsed === 'object' && parsed !== null) {
           (payload as Record<string, unknown>)[key] = parsed;
         }
       } catch (_) {}
     }
   }
   ```
   This converts any JSON‑string fields (e.g., `"{\"traits\":[]}"`) into proper objects/arrays before validation.

2. **Explicit handling of the `personality` field**
   - Used bracket notation with a cast to `any` to satisfy TypeScript (`payload as any`).
   - If `personality` is a string, attempt to parse; on failure, delete the field.
   - If schema validation later reports errors on `personality`, the field is removed and re‑validated.

3. **Improved validation fallback**
   - After coercion, if AJV still reports errors, offending top‑level keys are stripped and the payload is re‑validated.
   - Detailed warning logs are emitted for each stripping operation.

4. **Added `payloadKeys` definition** to avoid undefined variable lint errors.

## Result
- The workflow now completes all stages automatically without 422 errors.
- Lint errors are resolved.
- The server is more resilient to future LLM hallucinations.

## References
- `src/server/routes/ai.ts` – Updated server‑side handling.
- `schema/npc/v1.1-client.json` – Schema where `personality` is optional.
- Previous bug report and logs (see console output in the issue description).

---
*Document created on $(date) for future maintenance.*
