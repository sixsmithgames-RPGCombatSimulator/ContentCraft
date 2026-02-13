/**
 * © 2025 Sixsmith Games. All rights reserved.
 * This software and associated documentation files are proprietary and confidential.
 */

import { getDb } from '../config/mongo.js';
import type { Filter } from 'mongodb';
import type { Run, StageName } from '../models/Run.js';
import type { Artifact } from '../models/Artifact.js';
import { getStageOrder } from '../models/Run.js';
import { nanoid } from 'nanoid';
import { logger } from '../utils/logger.js';

// Import stages
import { runPlanner } from './stages/Planner.js';
import { runRetriever } from './stages/Retriever.js';
import { runWorldCoherence } from './stages/WorldCoherence.js';
import { runCreator } from './stages/Creator.js';
import { runFactCheck } from './stages/FactCheck.js';
import { runRulesVerifier } from './stages/RulesVerifier.js';
import { runPhysicsMagic } from './stages/PhysicsMagic.js';
import { runBalanceLints } from './stages/BalanceLints.js';
import { runStylist } from './stages/Stylist.js';
import { runFinalizer } from './stages/Finalizer.js';

export interface StageOutput {
  artifact?: any;
  notes?: string[];
  error?: string;
}

/**
 * Main orchestrator for running the multi-stage pipeline
 */
export class Orchestrator {
  private db = getDb();

  /**
   * Start a new run
   */
  async startRun(runId: string): Promise<void> {
    logger.info(`Starting run: ${runId}`);

    const runsCollection = this.db.collection<Run>('runs');
    const runFilter: Filter<Run> = { _id: runId as any };

    const run = await runsCollection.findOne(runFilter);

    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    // Update run status
    await runsCollection.updateOne(
      runFilter,
      {
        $set: {
          status: 'running',
          updatedAt: new Date(),
        },
      }
    );

    // Execute stages in order
    try {
      const stages = getStageOrder();

      for (const stage of stages) {
        logger.info(`Running stage: ${stage}`, { runId });

        await this.runStage(runId, stage);

        // Check if stage failed
        const updatedRun = await runsCollection.findOne(runFilter);
        if (updatedRun?.stages[stage].status === 'fail') {
          logger.error(`Stage ${stage} failed, stopping pipeline`, { runId });
          await runsCollection.updateOne(
            runFilter,
            {
              $set: {
                status: 'failed',
                error: `Failed at stage: ${stage}`,
                updatedAt: new Date(),
              },
            }
          );
          return;
        }
      }

      // All stages complete
      await runsCollection.updateOne(
        runFilter,
        {
          $set: {
            status: 'completed',
            updatedAt: new Date(),
          },
        }
      );

      logger.info(`Run completed successfully: ${runId}`);
    } catch (error: any) {
      logger.error(`Run failed with exception: ${runId}`, error);

      await runsCollection.updateOne(
        runFilter,
        {
          $set: {
            status: 'failed',
            error: error.message || 'Unknown error',
            updatedAt: new Date(),
          },
        }
      );
    }
  }

  /**
   * Run a specific stage
   */
  async runStage(runId: string, stage: StageName): Promise<void> {
    const runsCollection = this.db.collection<Run>('runs');
    const artifactsCollection = this.db.collection<Artifact>('artifacts');
    const runFilter: Filter<Run> = { _id: runId as Run['_id'] };

    const run = await runsCollection.findOne(runFilter);

    if (!run) {
      throw new Error(`Run not found: ${runId}`);
    }

    // Mark stage as running
    await runsCollection.updateOne(
      runFilter,
      {
        $set: {
          [`stages.${stage}.status`]: 'ok',
          [`stages.${stage}.started_at`]: new Date(),
          current_stage: stage,
          updatedAt: new Date(),
        },
      }
    );

    try {
      // Get previous artifacts if needed
      const inputArtifacts = await this.getInputArtifacts(run, stage);

      // Run the stage
      let result: StageOutput;

      switch (stage) {
        case 'planner':
          result = await runPlanner(run);
          break;
        case 'retriever':
          result = await runRetriever(run, inputArtifacts);
          break;
        case 'coherence_pre':
          result = await runWorldCoherence(run, inputArtifacts, 'pre');
          break;
        case 'creator':
          result = await runCreator(run, inputArtifacts);
          break;
        case 'fact_check':
          result = await runFactCheck(run, inputArtifacts);
          break;
        case 'rules':
          result = await runRulesVerifier(run, inputArtifacts);
          break;
        case 'physics':
          result = await runPhysicsMagic(run, inputArtifacts);
          break;
        case 'balance':
          result = await runBalanceLints(run, inputArtifacts);
          break;
        case 'coherence_post':
          result = await runWorldCoherence(run, inputArtifacts, 'post');
          break;
        case 'stylist':
          result = await runStylist(run, inputArtifacts);
          break;
        case 'finalizer':
          result = await runFinalizer(run, inputArtifacts);
          break;
        default:
          throw new Error(`Unknown stage: ${stage}`);
      }

      // Handle result
      if (result.error) {
        // Stage failed
        await runsCollection.updateOne(
          runFilter,
          {
            $set: {
              [`stages.${stage}.status`]: 'fail',
              [`stages.${stage}.error`]: result.error,
              [`stages.${stage}.notes`]: result.notes || [],
              [`stages.${stage}.completed_at`]: new Date(),
              updatedAt: new Date(),
            },
          }
        );
      } else {
        // Stage succeeded
        let artifactId: string | undefined;

        if (result.artifact) {
          // Store artifact
          artifactId = nanoid();
          await artifactsCollection.insertOne({
            _id: artifactId,
            run_id: runId,
            stage,
            data: result.artifact,
            created_at: new Date(),
          } as Artifact);
        }

        await runsCollection.updateOne(
          runFilter,
          {
            $set: {
              [`stages.${stage}.status`]: 'ok',
              [`stages.${stage}.artifact_id`]: artifactId,
              [`stages.${stage}.notes`]: result.notes || [],
              [`stages.${stage}.completed_at`]: new Date(),
              updatedAt: new Date(),
            },
          }
        );
      }
    } catch (error: any) {
      logger.error(`Stage ${stage} threw exception`, error);

      await runsCollection.updateOne(
        runFilter,
        {
          $set: {
            [`stages.${stage}.status`]: 'fail',
            [`stages.${stage}.error`]: error.message || 'Unknown error',
            [`stages.${stage}.completed_at`]: new Date(),
            updatedAt: new Date(),
          },
        }
      );
    }
  }

  /**
   * Get input artifacts needed for a stage
   */
  private async getInputArtifacts(run: Run, stage: StageName): Promise<Record<string, any>> {
    const inputs: Record<string, any> = {};
    const artifactsCollection = this.db.collection<Artifact>('artifacts');

    // Map which artifacts each stage needs
    const dependencies: Record<StageName, StageName[]> = {
      planner: [],
      retriever: ['planner'],
      coherence_pre: ['retriever'],
      creator: ['planner', 'retriever'],
      fact_check: ['creator', 'retriever'],
      rules: ['creator', 'fact_check'],
      physics: ['creator'],
      balance: ['creator'],
      coherence_post: ['creator'],
      stylist: ['creator', 'fact_check', 'rules', 'physics', 'balance'],
      finalizer: ['stylist', 'creator'],
    };

    const requiredStages = dependencies[stage] || [];

    for (const depStage of requiredStages) {
      const artifactId = run.stages[depStage]?.artifact_id;

      if (artifactId) {
        const artifactDoc = await artifactsCollection.findOne({ _id: artifactId as Artifact['_id'] });
        if (artifactDoc) {
          inputs[depStage] = artifactDoc.data;
        }
      }
    }

    return inputs;
  }
}
