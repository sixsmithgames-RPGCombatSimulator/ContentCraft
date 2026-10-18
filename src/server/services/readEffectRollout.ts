/** Default-off Manual canary. Reading old operations remains available during
 * rollback; this predicate guards only new emission and role applications. */
export function readEffectWritesEnabled(campaignId: string): boolean {
  return process.env.GMC_MANUAL_READ_EFFECTS_ENABLED === '1'
    && String(process.env.GMC_MANUAL_READ_EFFECTS_CAMPAIGN_ALLOWLIST ?? '').split(',').map((value) => value.trim()).includes(campaignId);
}
/** New emission is a narrower Manual canary, never implied by reader support. */
export function typedReferenceWritesEnabled(campaignId: string): boolean {
  return readEffectWritesEnabled(campaignId) && process.env.GMC_TYPED_REFERENCE_BINDINGS === '1';
}
