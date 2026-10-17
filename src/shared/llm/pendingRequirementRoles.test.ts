import { describe, expect, it } from 'vitest';
import { freeformTextDigest } from './freeformPlanBinding.js';
import { createPendingIntentWindow } from './pendingIntentWindow.js';
import { pendingRequirementRoleIssues, projectPendingRequirementRoles, PENDING_REQUIREMENT_ROLE_POLICY } from './pendingRequirementRoles.js';
import { READ_EFFECT_CONTRACTS } from './readEffectContracts.js';

function fixture() {
  const text = 'I nod. Then I smile.';
  const source = { instruction: { instructionRef: 'instruction:one', exactText: text, instructionFingerprint: freeformTextDigest(text) },
    program: { schemaVersion: 'gma.semantic-action-program/5', programId: 'program:one', instructionRef: 'instruction:one',
      instructionFingerprint: freeformTextDigest(text), authorityBase: { campaignId: 'campaign:one' },
      planner: { source: 'freeform_intent_compiler', policyVersion: 'gma.semantic-action-compiler-policy/12' },
      nodes: [{ nodeId: 'nod', ordinal: 1, kind: 'other', summary: 'Nod', dependsOn: [], parallelWith: [], condition: null,
        authorityRequirements: ['gmc'], evidenceSpans: [{ start: 0, end: 6 }], dataRequirements: [
          { dimension: 'who', kind: 'scene_presence', query: 'Player', targetRole: 'actor', targetRef: 'actor:player' },
          { dimension: 'what', kind: 'story_fact', query: 'Nod once' },
        ] },
      { nodeId: 'smile', ordinal: 2, kind: 'other', summary: 'Smile', dependsOn: ['nod'], parallelWith: [], condition: null,
        authorityRequirements: ['gmc'], evidenceSpans: [{ start: 7, end: 20 }], dataRequirements: [
          { dimension: 'who', kind: 'scene_presence', query: 'Player', targetRole: 'actor', targetRef: 'actor:player' },
          { dimension: 'what', kind: 'story_fact', query: 'Smile' },
        ] }],
    }, cursor: { programId: 'program:one', revision: 1, authorityHead: { storyWorkspaceRevision: 1, sceneRevision: 1, vcsCharacterRevision: 0 },
      completedNodeRefs: [], skippedNodeRefs: [], readyNodeRefs: ['nod'], remainingNodeRefs: ['smile'], waiting: null },
    artifactRevision: 1, receipts: [] as Record<string, any>[],
  };
  const window = createPendingIntentWindow(source);
  const classification = { schemaVersion: READ_EFFECT_CONTRACTS.classification, classificationId: 'roles:one',
    windowFingerprint: window.windowFingerprint, programFingerprint: window.programFingerprint,
    nodes: window.nodes.map((node: any) => ({ nodeRef: node.nodeRef, roles: node.requirements.map((row: any) => ({
      requirementRef: row.requirementId, role: row.value.kind === 'story_fact' ? 'effect' : 'read',
      resolution: row.value.kind === 'story_fact' ? 'narrative_self_action' : null,
      instructionEvidence: structuredClone(node.instructionEvidence[0]),
    })) })),
  };
  return { source, classification };
}

describe('reviewed pending-only role partition', () => {
  it.each(['source', 'compiler', 'version'] as const)('an all-read partition cannot create absent %s provenance', (field) => {
    const f = fixture();
    if (field === 'source') f.source.program.planner.source = 'semantic_llm';
    if (field === 'compiler') f.source.program.planner.policyVersion = 'gma.semantic-action-compiler-policy/11';
    if (field === 'version') f.source.program.schemaVersion = 'gma.semantic-action-program/3';
    if (field !== 'version') {
      const window = createPendingIntentWindow(f.source);
      f.classification.windowFingerprint = window.windowFingerprint;
      f.classification.programFingerprint = window.programFingerprint;
    }
    for (const node of f.classification.nodes) for (const role of node.roles) {
      role.role = 'read'; role.resolution = null;
    }
    expect(pendingRequirementRoleIssues(f.classification, f.source)).toEqual(['/source/compiler']);
    expect(() => projectPendingRequirementRoles(f.source, f.classification)).toThrow();
  });
  it('retains real actor reads while projecting attempted effects without changing stored input', () => {
    const f = fixture(), original = structuredClone(f);
    expect(pendingRequirementRoleIssues(f.classification, f.source)).toEqual([]);
    const projected = projectPendingRequirementRoles(f.source, f.classification);
    expect(projected.schemaVersion).toBe(READ_EFFECT_CONTRACTS.program);
    expect(projected.nodes.map((node: any) => node.dataRequirements.map((row: any) => row.kind))).toEqual([['scene_presence'], ['scene_presence']]);
    expect(projected.nodes.map((node: any) => node.requestedEffects[0].attempt)).toEqual(['Nod once', 'Smile']);
    expect(projected.nodes[1].dependsOn).toEqual(['nod']);
    expect(f).toEqual(original);
  });
  it.each(['missing', 'duplicate', 'foreign', 'evidence', 'scope', 'structural', 'mechanic'] as const)('rejects %s classification before any projection', (kind) => {
    const f: any = fixture(), roles = f.classification.nodes[0].roles;
    if (kind === 'missing') roles.pop();
    if (kind === 'duplicate') roles[1].requirementRef = roles[0].requirementRef;
    if (kind === 'foreign') roles[1].requirementRef = 'foreign:requirement';
    if (kind === 'evidence') roles[1].instructionEvidence.quote = 'I win.';
    if (kind === 'scope') f.classification.programFingerprint = 'f'.repeat(64);
    if (kind === 'structural') { roles[0].role = 'effect'; roles[0].resolution = 'narrative_self_action'; }
    if (kind === 'mechanic') f.source.program.nodes[0].dataRequirements[1].kind = 'mechanic';
    expect(pendingRequirementRoleIssues(f.classification, f.source).length).toBeGreaterThan(0);
    expect(() => projectPendingRequirementRoles(f.source, f.classification)).toThrow();
  });
  it('a completed node cannot be classified or changed by a later pending window', () => {
    const f: any = fixture();
    f.source.cursor.completedNodeRefs = ['nod']; f.source.cursor.readyNodeRefs = ['smile']; f.source.cursor.remainingNodeRefs = [];
    f.source.receipts = [{ programId: 'program:one', nodeId: 'nod', receiptId: 'receipt:nod', authorityReceipts: ['gmc:receipt:nod'] }];
    const window = createPendingIntentWindow(f.source);
    f.classification.windowFingerprint = window.windowFingerprint;
    expect(pendingRequirementRoleIssues(f.classification, f.source).length).toBeGreaterThan(0);
    f.classification.nodes = f.classification.nodes.filter((node: any) => node.nodeRef === 'smile');
    const projected = projectPendingRequirementRoles(f.source, f.classification);
    const { requestedEffects, ...completed } = projected.nodes[0];
    expect(requestedEffects).toEqual([]);
    expect(completed).toEqual(f.source.program.nodes[0]);
    expect(f.source.receipts[0].receiptId).toBe('receipt:nod');
  });
  it('the original policy states partition, preservation, independent review and no future-fact repair', () => {
    for (const phrase of ['every exact original pending requirement once', 'completed or skipped', 'prepared_possibility', 'independently', 'no permission']) {
      expect(PENDING_REQUIREMENT_ROLE_POLICY.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });
});
