import { describe, expect, it } from 'vitest';
import { addProgressEntry, attachWorkflowSessionMetadata, createProgressSession, prepareProgressForPersistence, updateProgressResponse } from './generationProgress';

describe('generationProgress', () => {
  it('persists confirmed workflow metadata on the last completed progress entry', () => {
    const session = addProgressEntry(
      createProgressSession({ type: 'npc', prompt: 'Create Thyra' }),
      'Creator: Basic Info',
      null,
      'SYSTEM\nUSER',
    );

    const updated = updateProgressResponse(
      session,
      '{"name":"Thyra"}',
      'completed',
      undefined,
      {
        confirmedStageId: 'Creator: Basic Info',
        confirmedStageKey: 'basic_info',
        confirmedWorkflowType: 'npc',
      },
    );

    expect(updated.progress.at(-1)).toEqual(
      expect.objectContaining({
        confirmedStageId: 'Creator: Basic Info',
        confirmedStageKey: 'basic_info',
        confirmedWorkflowType: 'npc',
      }),
    );
  });

  it('attaches persisted workflow run state additively to saved sessions', () => {
    const updated = attachWorkflowSessionMetadata(
      createProgressSession({ type: 'npc', prompt: 'Create Thyra' }),
      {
        workflowType: 'npc',
        workflowStageSequence: ['keyword_extractor', 'planner', 'basic_info'],
        workflowRunState: {
          runId: 'run-1',
          workflowType: 'npc',
          workflowLabel: 'NPC Creator',
          executionMode: 'integrated',
          status: 'awaiting_user_input',
          stageSequence: ['keyword_extractor', 'planner', 'basic_info'],
          stageLabels: {
            keyword_extractor: 'Keyword Extractor',
            planner: 'Planner',
            basic_info: 'Creator: Basic Info',
          },
          currentStageKey: 'planner',
          currentStageLabel: 'Planner',
          currentStageIndex: 1,
          currentAttemptId: 'attempt-1',
          attempts: [],
          acceptanceState: 'review_required_conflict',
          memory: {
            request: {
              prompt: 'Retry the planner output.',
              generatorType: 'npc',
              schemaVersion: 'v1.1-client',
            },
            stage: {
              currentStageKey: 'planner',
              currentStageLabel: 'Planner',
              currentStageIndex: 1,
              completedStages: ['keyword_extractor'],
              currentStageData: {
                proposals: [{ question: 'Should Thyra remain exiled from the Azure Court?' }],
              },
              summaries: {
                keyword_extractor: { summary: 'Identified exile and court canon hooks.' },
              },
            },
            decisions: {
              confirmed: {},
              unresolvedQuestions: ['Should Thyra remain exiled from the Azure Court?'],
            },
            canon: {
              groundingStatus: 'project',
              factCount: 12,
              entityNames: ['Thyra'],
              gaps: [],
            },
            conflicts: {
              reviewRequired: true,
              alignedCount: 11,
              additiveCount: 0,
              ambiguityCount: 0,
              conflictCount: 1,
              unsupportedCount: 0,
              items: [
                {
                  key: 'azure_court_service',
                  status: 'conflicting',
                  message: 'Thyra now serves the Azure Court directly despite project canon marking her as exiled.',
                },
              ],
            },
          },
          retrieval: {
            groundingStatus: 'project',
            provenance: 'project',
            factsFound: 12,
            lastUpdatedAt: 1000,
            resourceCheckTarget: '#resources-panel',
          },
          warnings: [],
          resourceCheckTarget: '#resources-panel',
          startedAt: 1000,
          updatedAt: 1000,
        },
        compiledStageRequest: {
          requestId: 'req-1',
          stageKey: 'planner',
          stageLabel: 'Planner',
          prompt: 'Retry the planner output.',
          systemPrompt: 'SYSTEM',
          userPrompt: 'USER',
          promptBudget: {
            measuredChars: 25,
            safetyCeiling: 7200,
            hardLimit: 8000,
            mode: 'packed',
            droppedSections: [],
            warnings: [],
            compressionApplied: false,
          },
          memory: {
            request: {
              prompt: 'Retry the planner output.',
              stageKey: 'planner',
              stageLabel: 'Planner',
            },
            completedStages: [],
            currentStageData: {},
            priorStageSummaries: {},
            previousDecisions: {},
            factpack: {
              factCount: 0,
              entityNames: [],
              gaps: [],
              groundingStatus: 'ungrounded',
            },
            canon: {
              groundingStatus: 'ungrounded',
              factCount: 0,
              entityNames: [],
              gaps: [],
            },
            conflicts: {
              reviewRequired: false,
              alignedCount: 0,
              additiveCount: 0,
              ambiguityCount: 0,
              conflictCount: 0,
              unsupportedCount: 0,
              items: [],
            },
            execution: {
              workflowType: 'npc',
              executionMode: 'integrated',
              currentStageIndex: 1,
            },
          },
        },
      },
    );

    expect(updated.workflowType).toBe('npc');
    expect(updated.workflowStageSequence).toEqual(['keyword_extractor', 'planner', 'basic_info']);
    expect(updated.workflowRunState).toEqual(
      expect.objectContaining({
        executionMode: 'integrated',
        currentStageKey: 'planner',
        currentAttemptId: 'attempt-1',
        acceptanceState: 'review_required_conflict',
        memory: expect.objectContaining({
          stage: expect.objectContaining({
            currentStageData: {
              proposals: [{ question: 'Should Thyra remain exiled from the Azure Court?' }],
            },
          }),
          conflicts: expect.objectContaining({
            reviewRequired: true,
            conflictCount: 1,
          }),
        }),
      }),
    );
    expect(updated.compiledStageRequest).toEqual(
      expect.objectContaining({
        requestId: 'req-1',
        stageKey: 'planner',
      }),
    );
  });

  it('compacts oversized autosave payloads while preserving resume-critical workflow metadata', () => {
    let session = createProgressSession({ type: 'npc', prompt: 'Create an archmage NPC' });

    for (let index = 0; index < 40; index += 1) {
      session = addProgressEntry(
        session,
        `Stage ${index}`,
        null,
        `PROMPT-${index}-` + 'P'.repeat(20_000),
      );
      session = updateProgressResponse(
        session,
        `RESPONSE-${index}-` + 'R'.repeat(30_000),
        'completed',
      );
    }

    const stageResults = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [
        `stage_${index}`,
        {
          description: 'D'.repeat(20_000),
          nested: {
            entries: Array.from({ length: 50 }, () => ({
              text: 'N'.repeat(2_000),
            })),
          },
        },
      ]),
    );

    const persisted = prepareProgressForPersistence({
      ...session,
      stageResults,
      factpack: {
        facts: Array.from({ length: 120 }, (_, index) => ({ text: `fact-${index}-` + 'F'.repeat(2_000) })),
        entities: Array.from({ length: 250 }, (_, index) => `entity-${index}`),
        gaps: Array.from({ length: 250 }, (_, index) => `gap-${index}`),
      },
      workflowType: 'npc',
      workflowStageSequence: ['keyword_extractor', 'planner', 'basic_info'],
      workflowRunState: {
        runId: 'run-oversized',
        workflowType: 'npc',
        workflowLabel: 'NPC Creator',
        executionMode: 'integrated',
        status: 'running',
        stageSequence: ['keyword_extractor', 'planner', 'basic_info'],
        stageLabels: {
          keyword_extractor: 'Keyword Extractor',
          planner: 'Planner',
          basic_info: 'Creator: Basic Info',
        },
        currentStageKey: 'planner',
        currentStageLabel: 'Planner',
        currentStageIndex: 1,
        attempts: [],
        retrieval: {
          groundingStatus: 'project',
          provenance: 'project',
          factsFound: 120,
          lastUpdatedAt: 2,
          resourceCheckTarget: '#resources-panel',
        },
        warnings: [],
        startedAt: 1,
        updatedAt: 2,
      },
      compiledStageRequest: {
        requestId: 'req-large',
        stageKey: 'planner',
        stageLabel: 'Planner',
        prompt: 'Q'.repeat(25_000),
        systemPrompt: 'S'.repeat(25_000),
        userPrompt: 'U'.repeat(25_000),
        promptBudget: {
          measuredChars: 75_000,
          safetyCeiling: 7_200,
          hardLimit: 8_000,
          mode: 'packed',
          droppedSections: [],
          warnings: [],
          compressionApplied: true,
        },
        memory: {
          request: {
            prompt: 'M'.repeat(25_000),
            stageKey: 'planner',
            stageLabel: 'Planner',
          },
          completedStages: ['keyword_extractor'],
          currentStageData: {
            giant: 'G'.repeat(25_000),
          },
          priorStageSummaries: {
            keyword_extractor: {
              notes: 'K'.repeat(25_000),
            },
          },
          previousDecisions: {},
          factpack: {
            factCount: 120,
            entityNames: ['wizard'],
            gaps: ['missing lineage provenance'],
            groundingStatus: 'project',
          },
          canon: {
            groundingStatus: 'project',
            factCount: 120,
            entityNames: ['wizard'],
            gaps: ['missing lineage provenance'],
          },
          conflicts: {
            reviewRequired: false,
            alignedCount: 120,
            additiveCount: 0,
            ambiguityCount: 0,
            conflictCount: 0,
            unsupportedCount: 0,
            items: [],
          },
          execution: {
            workflowType: 'npc',
            executionMode: 'integrated',
            currentStageIndex: 1,
          },
        },
      },
    });

    expect(JSON.stringify(persisted).length).toBeLessThan(3_000_000);
    expect(persisted.progress.length).toBeLessThanOrEqual(24);
    expect(persisted.workflowType).toBe('npc');
    expect(persisted.workflowStageSequence).toEqual(['keyword_extractor', 'planner', 'basic_info']);
    expect(persisted.compiledStageRequest?.requestId).toBe('req-large');
    expect((persisted.compiledStageRequest?.prompt.length ?? 0)).toBeLessThan(25_000);
  });
});
