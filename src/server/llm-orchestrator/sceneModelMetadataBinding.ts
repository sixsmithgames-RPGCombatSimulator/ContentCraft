/** Fresh Scene-model packets delegate cryptographic bookkeeping to GMA. The
 * owner proposal remains unchanged and GMC independently verifies its hash. */
export const SCENE_MODEL_METADATA_BINDING = Object.freeze({
  schemaVersion: 'gma.scene-model-metadata-binding/1',
  builderPolicyVersion: 'gma.scene-reality-builder-policy/3',
  repairPolicyVersion: 'gma.scene-reality-repair-policy/2',
  proseFingerprintOwner: 'application',
  proseFingerprintAlgorithm: 'sha256-canonical-json-string-utf8',
  proseFingerprintPlaceholder: '0'.repeat(64),
});

/** Reject forged/newer markers rather than guessing a compatible policy. The
 * absence of a marker denotes an unchanged historical operation. */
export function validSceneModelMetadataBinding(value: unknown): boolean {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const marker = value as Record<string, unknown>;
  return Object.keys(marker).length === Object.keys(SCENE_MODEL_METADATA_BINDING).length
    && Object.entries(SCENE_MODEL_METADATA_BINDING).every(([key, expected]) => marker[key] === expected);
}
