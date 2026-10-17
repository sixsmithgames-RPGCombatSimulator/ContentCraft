import { describe, expect, it } from 'vitest';
import { qualifiedPendingFixture } from '../../shared/llm/fixtures/qualifiedPending.js';
import { createPendingBindingRecord } from '../../shared/llm/scenePendingIntentApplication.js';
import { qualifiedSceneTurnIdentitySources } from './qualifiedSceneTurnSources.js';
import type { JsonObject } from './storyWorkspaceStore.js';
import { readFileSync } from 'node:fs';
import { readQualifiedSceneTurnIdentitySources } from './qualifiedSceneTurnSources.js';
import { freeformJsonDigest } from '../../shared/llm/freeformPlanBinding.js';

function fixture() {
  const f = qualifiedPendingFixture();
  const record = createPendingBindingRecord(f.context, f.bindings, f.assessment(), f.policyFingerprint);
  const bundle = { ...f.context.proposal, pendingIntentBindingRecord: record } as JsonObject;
  const proposal: JsonObject = { campaignId: f.context.source.program.authorityBase.campaignId,
    sceneKitRef: { ...f.context.proposal.sceneKit }, actionSummary: 'Send my rat familiar inside.', interactionId: 'one:compound:enter:2' };
  return { bundle, proposal };
}

describe('qualified movement identity citations', () => {
  function capturedFixture() {
    // Exact owner-data projection from the unedited fictional browser reply09;
    // reconstruct the shared record reference without duplicating its JSON.
    const f = JSON.parse(readFileSync(new URL('./fixtures/qualified-cohort-scout.json', import.meta.url), 'utf8')) as {
      bundle: JsonObject; artifact: JsonObject; proposal: JsonObject };
    f.artifact.intentBindingApplications = [{ record: f.bundle.pendingIntentBindingRecord }];
    return f;
  }
  it('recognizes only the owner-proven mover in an actual /6 shared checked presentation without changing data', () => {
    const f = capturedFixture(), before = structuredClone(f);
    expect(qualifiedSceneTurnIdentitySources(f.bundle, f.proposal, f.artifact)).toEqual(['gmc:observation-actor:c085f9c4bf2656b6dcbfeae3fd5e26bb']);
    expect(f).toEqual(before);
    expect(() => qualifiedSceneTurnIdentitySources(f.bundle, f.proposal)).toThrow();
  });
  it.each(['foreign_interaction', 'changed_prose', 'changed_scene', 'changed_candidate', 'wrong_checkpoint', 'completed_move', 'other_record'] as const)('rejects modern %s rather than granting a broad actor catalog', (kind) => {
    const f = capturedFixture();
    if (kind === 'foreign_interaction') f.proposal.interactionId = 'other:compound:cohort:forged:2';
    if (kind === 'changed_prose') (f.proposal.publishedExchange as JsonObject).assistantNarration = 'A different action happened.';
    if (kind === 'changed_scene') (f.proposal.sceneKitRef as JsonObject).revision = 99;
    if (kind === 'changed_candidate') ((f.artifact.saga as JsonObject).pendingModelCandidate as JsonObject).candidateFingerprint = 'd'.repeat(64);
    if (kind === 'wrong_checkpoint') (f.artifact.cursor as JsonObject).revision = 99;
    if (kind === 'completed_move') (f.artifact.cursor as JsonObject).completedNodeRefs = ['freeform:step:0'];
    if (kind === 'other_record') f.artifact.intentBindingApplications = [];
    if (kind === 'changed_scene' || kind === 'other_record') {
      expect(() => qualifiedSceneTurnIdentitySources(f.bundle, f.proposal, f.artifact)).toThrow();
    } else expect(qualifiedSceneTurnIdentitySources(f.bundle, f.proposal, f.artifact)).toEqual([]);
  });
  it('requires current protected workflow ownership before the modern Scene writer can cite an observer', async () => {
    const f = capturedFixture(), scope = { userId: 'fictional-browser-user', campaignId: 'fictional-browser-campaign' };
    let checked = 0, closed = false;
    type OwnerArtifactRead = Awaited<ReturnType<NonNullable<NonNullable<Parameters<typeof readQualifiedSceneTurnIdentitySources>[1]>['readArtifact']>>>;
    const deps = {
      // Only the injected owner-reader boundary is cast; the captured body is
      // still validated by the real identity/hash/association checks above.
      readArtifact: async () => ({ artifact: f.artifact }) as unknown as OwnerArtifactRead,
      assertWorkflowOpen: async () => { checked++; if (closed) throw new Error('Protected workflow is closed.'); },
    };
    expect(await readQualifiedSceneTurnIdentitySources({ ...scope, ...f }, deps)).toHaveLength(1);
    expect(checked).toBe(1);
    closed = true;
    await expect(readQualifiedSceneTurnIdentitySources({ ...scope, ...f }, deps)).rejects.toThrow('Protected workflow is closed.');
    await expect(readQualifiedSceneTurnIdentitySources({ ...scope, ...f }, { readArtifact: deps.readArtifact })).rejects.toThrow('explicit workflow guard');
  });
  it('grants no special citation for an empty witness set without reopening its completed preparation program', async () => {
    const f = capturedFixture(), record = f.bundle.pendingIntentBindingRecord as JsonObject;
    record.qualifiedObservers = [];
    const { recordId: _id, recordFingerprint: _hash, ...body } = record;
    record.recordFingerprint = freeformJsonDigest(body);
    record.recordId = `pending-binding:${record.recordFingerprint}`;
    const before = structuredClone(f);
    const deps = { readArtifact: async (): Promise<never> => { throw new Error('Old program must not be loaded.'); },
      assertWorkflowOpen: async () => { throw new Error('Old program must not be reopened.'); } };
    expect(await readQualifiedSceneTurnIdentitySources({ userId: 'fictional-browser-user', campaignId: 'fictional-browser-campaign', ...f }, deps)).toEqual([]);
    expect(f).toEqual(before);
    for (const field of ['hash', 'scene', 'campaign']) {
      const changed = structuredClone(f);
      if (field === 'hash') (changed.bundle.pendingIntentBindingRecord as JsonObject).recordFingerprint = '0'.repeat(64);
      if (field === 'scene') (changed.proposal.sceneKitRef as JsonObject).revision = 99;
      if (field === 'campaign') changed.proposal.campaignId = 'campaign:foreign';
      await expect(readQualifiedSceneTurnIdentitySources({ userId: 'fictional-browser-user', campaignId: 'fictional-browser-campaign', ...changed }, deps)).rejects.toThrow();
    }
  });
  it('recognizes only the original mover from the exact certified record, without changing participants or world data', () => {
    const f = fixture(), before = structuredClone(f);
    expect(qualifiedSceneTurnIdentitySources(f.bundle, f.proposal)).toEqual(['actor:familiar']);
    expect(f).toEqual(before);
    for (const [field, value] of [['actionSummary', 'Observe the interior.'], ['interactionId', 'other:compound:enter:2']]) {
      expect(qualifiedSceneTurnIdentitySources(f.bundle, { ...f.proposal, [field]: value })).toEqual([]);
    }
    expect(qualifiedSceneTurnIdentitySources({ ...f.bundle, pendingIntentBindingRecord: null }, f.proposal)).toEqual([]);
  });
  it('rejects altered records, wrong Scenes, campaigns or moved origin frames', () => {
    for (const change of [
      (f: ReturnType<typeof fixture>) => { (f.bundle.pendingIntentBindingRecord as JsonObject).assessmentRef = 'forged'; },
      (f: ReturnType<typeof fixture>) => { (f.proposal.sceneKitRef as JsonObject).revision = 4; },
      (f: ReturnType<typeof fixture>) => { f.proposal.campaignId = 'campaign:foreign'; },
      (f: ReturnType<typeof fixture>) => { (f.bundle.actorFrames as JsonObject[])[1].zoneRef = 'zone:interior'; },
    ]) { const f = fixture(); change(f); expect(() => qualifiedSceneTurnIdentitySources(f.bundle, f.proposal)).toThrow(); }
  });
});
