// PIV Orchestrator — Full PIV Loop Runner

import { runCommandPairing } from "./session-manager.js";
import {
  readManifest,
  writeManifest,
  mergeManifest,
  appendFailure,
  appendNotification,
  resolveCheckpoint,
  updatePhaseStatus,
  setNextAction,
} from "./manifest-manager.js";
import { determineNextAction, findPendingFailure, findActiveCheckpoint, getNextUnfinishedPhase } from "./state-machine.js";
import { classifyError, getTaxonomy, canRetry } from "./error-classifier.js";
import { createCheckpoint, rollbackToCheckpoint } from "./git-manager.js";
import type {
  SessionResult,
  FailureEntry,
  CheckpointEntry,
  Manifest,
  PivCommand,
} from "./types.js";
import type { TelegramNotifier } from "./telegram-notifier.js";

// --- Command Pairings (from CLAUDE.md Context Window Pairings) ---

function planPairing(phase: number, phaseName: string): { commands: string[]; type: PivCommand } {
  return {
    commands: ["/prime", `/plan-feature "Phase ${phase}: ${phaseName}"`],
    type: "plan-feature",
  };
}

function executePairing(planPath: string): { commands: string[]; type: PivCommand } {
  return {
    commands: ["/prime", `/execute ${planPath}`],
    type: "execute",
  };
}

function validatePairing(): { commands: string[]; type: PivCommand } {
  return {
    commands: ["/prime", "/validate-implementation --full"],
    type: "validate-implementation",
  };
}

function commitPairing(): { commands: string[]; type: PivCommand } {
  return {
    commands: ["/commit"],
    type: "commit",
  };
}

// --- Helpers ---

function getLastResult(results: SessionResult[]): SessionResult {
  return results[results.length - 1];
}

function formatPivError(
  category: string,
  command: string,
  phase: number,
  details: string,
  retryEligible: boolean,
  retriesRemaining: number,
  checkpoint?: string
): string {
  return [
    "\n## PIV-Error",
    `error_category: ${category}`,
    `command: ${command}`,
    `phase: ${phase}`,
    `details: "${details}"`,
    `retry_eligible: ${retryEligible}`,
    `retries_remaining: ${retriesRemaining}`,
    `checkpoint: ${checkpoint ?? "none"}`,
    "",
  ].join("\n");
}

// --- Phase Runner ---

/**
 * Run a single phase through the full PIV loop.
 * Handles plan → execute → validate → commit with retry logic.
 */
export async function runPhase(
  phase: number,
  projectDir: string,
  notifier?: TelegramNotifier,
  pauseCheck?: () => Promise<void>
): Promise<void> {
  let manifest = await readManifest(projectDir);
  const phaseStatus = manifest.phases[phase];

  if (!phaseStatus) {
    console.log(`⚠️ Phase ${phase} not found in manifest`);
    return;
  }

  await notifier?.sendPhaseStart(phase, `Phase ${phase}`);
  const totalCost = { usd: 0 };

  // --- Plan ---
  if (phaseStatus.plan !== "complete") {
    console.log(`\n🗺️  Phase ${phase} — Planning`);
    const pairing = planPairing(phase, `Phase ${phase}`);
    const results = await runCommandPairing(pairing.commands, projectDir, pairing.type);
    const lastResult = getLastResult(results);
    totalCost.usd += results.reduce((sum, r) => sum + r.costUsd, 0);

    if (lastResult.error) {
      await handleError(manifest, projectDir, "plan-feature", phase, lastResult, undefined, notifier);
      return;
    }

    manifest = await readManifest(projectDir);
    manifest = updatePhaseStatus(manifest, phase, { plan: "complete" });
    await writeManifest(projectDir, manifest);
    console.log(`  ✅ Phase ${phase} plan complete`);
  }

  // --- Checkpoint + Execute ---
  if (phaseStatus.execution !== "complete") {
    console.log(`\n⚙️  Phase ${phase} — Executing`);

    // Create or reuse checkpoint
    let checkpointTag: string;
    const activeCheckpoint = findActiveCheckpoint(manifest);
    if (activeCheckpoint && activeCheckpoint.phase === phase) {
      checkpointTag = activeCheckpoint.tag;
      console.log(`  🔖 Reusing checkpoint: ${checkpointTag}`);
    } else {
      checkpointTag = createCheckpoint(projectDir, phase);
      manifest = mergeManifest(manifest, {
        checkpoints: [{
          tag: checkpointTag,
          phase,
          created_before: "execute",
          status: "active",
        }],
      });
      await writeManifest(projectDir, manifest);
      console.log(`  🔖 Checkpoint created: ${checkpointTag}`);
    }

    const planPath = manifest.plans?.find((p) => p.phase === phase)?.path;
    if (!planPath) {
      console.log(`  ❌ No plan file found for phase ${phase}`);
      return;
    }

    const pairing = executePairing(planPath);
    const results = await runCommandPairing(pairing.commands, projectDir, pairing.type);
    const lastResult = getLastResult(results);
    totalCost.usd += results.reduce((sum, r) => sum + r.costUsd, 0);

    if (lastResult.error) {
      await handleError(manifest, projectDir, "execute", phase, lastResult, checkpointTag, notifier);
      return;
    }

    manifest = await readManifest(projectDir);
    manifest = updatePhaseStatus(manifest, phase, { execution: "complete" });
    manifest = mergeManifest(manifest, {
      executions: [{
        phase,
        status: "complete",
        completed_at: new Date().toISOString(),
        tasks_total: 0,
        tasks_done: 0,
        tasks_blocked: 0,
      }],
    });
    await writeManifest(projectDir, manifest);
    console.log(`  ✅ Phase ${phase} execution complete`);
  }

  // --- Validate ---
  if (phaseStatus.validation !== "pass") {
    console.log(`\n🔍 Phase ${phase} — Validating`);
    let validated = false;
    let retries = 0;
    const maxValidationRetries = 2;

    while (!validated && retries <= maxValidationRetries) {
      const pairing = validatePairing();
      const results = await runCommandPairing(pairing.commands, projectDir, pairing.type);
      const lastResult = getLastResult(results);
      totalCost.usd += results.reduce((sum, r) => sum + r.costUsd, 0);

      if (lastResult.error) {
        const category = classifyError(
          lastResult.error.messages.join("; "),
          "validate-implementation"
        );
        const taxonomy = getTaxonomy(category);

        if (retries < maxValidationRetries && !taxonomy.needsHuman) {
          console.log(`  ⚠️ Validation failed (${category}) — attempting refactor (retry ${retries + 1})`);
          retries++;

          // Spawn refactor session
          const refactorResults = await runCommandPairing(
            ["/prime", `Fix the following validation error and re-run tests: ${lastResult.error.messages.join("; ")}`],
            projectDir,
            "execute"
          );
          totalCost.usd += refactorResults.reduce((sum, r) => sum + r.costUsd, 0);
          continue;
        }

        await handleError(manifest, projectDir, "validate-implementation", phase, lastResult, undefined, notifier);
        return;
      }

      // Check hooks for validation status
      const validationStatus = lastResult.hooks["validation_status"];
      if (validationStatus === "pass" || validationStatus === "success" || !lastResult.error) {
        validated = true;
      } else {
        retries++;
        if (retries > maxValidationRetries) {
          console.log(`  ❌ Validation failed after ${maxValidationRetries} retries`);
          await handleError(manifest, projectDir, "validate-implementation", phase, lastResult, undefined, notifier);
          return;
        }
      }
    }

    manifest = await readManifest(projectDir);
    manifest = updatePhaseStatus(manifest, phase, { validation: "pass" });
    await writeManifest(projectDir, manifest);
    console.log(`  ✅ Phase ${phase} validation passed`);
  }

  // --- Commit ---
  console.log(`\n📦 Phase ${phase} — Committing`);
  const commitResults = await runCommandPairing(commitPairing().commands, projectDir, "commit");
  totalCost.usd += commitResults.reduce((sum, r) => sum + r.costUsd, 0);
  const commitResult = getLastResult(commitResults);

  if (commitResult.error) {
    await handleError(manifest, projectDir, "commit", phase, commitResult, undefined, notifier);
    return;
  }

  // Resolve checkpoint
  manifest = await readManifest(projectDir);
  const activeCheckpoint = findActiveCheckpoint(manifest);
  if (activeCheckpoint && activeCheckpoint.phase === phase) {
    manifest = resolveCheckpoint(manifest, activeCheckpoint.tag);
  }
  await writeManifest(projectDir, manifest);

  await notifier?.sendPhaseComplete(phase, totalCost.usd);
  console.log(`\n🎉 Phase ${phase} complete! (total cost: $${totalCost.usd.toFixed(2)})`);
}

/**
 * Run all phases from the manifest sequentially.
 */
export async function runAllPhases(
  projectDir: string,
  notifier?: TelegramNotifier,
  pauseCheck?: () => Promise<void>,
  isRestart?: boolean
): Promise<void> {
  let manifest = await readManifest(projectDir);
  const phases = Object.keys(manifest.phases)
    .map(Number)
    .sort((a, b) => a - b);

  // Send restart notification if recovering from crash/interrupt
  if (isRestart && notifier) {
    const nextPhase = getNextUnfinishedPhase(manifest);
    if (nextPhase !== null) {
      await notifier.sendRestart(nextPhase, "Orchestrator restarted — resuming autonomous execution");
      console.log(`  🔄 Restart notification sent — resuming from Phase ${nextPhase}`);
    }
  }

  console.log(`\n🚀 Starting autonomous execution — ${phases.length} phases\n`);

  let totalCost = 0;

  for (const phase of phases) {
    // Check if paused before starting next phase
    await pauseCheck?.();

    const status = manifest.phases[phase];
    if (
      status.plan === "complete" &&
      status.execution === "complete" &&
      status.validation === "pass"
    ) {
      console.log(`⏭️  Phase ${phase} already complete — skipping`);
      continue;
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`  Phase ${phase}`);
    console.log(`${"=".repeat(60)}`);

    await runPhase(phase, projectDir, notifier, pauseCheck);

    // Re-read manifest after phase (state may have changed)
    manifest = await readManifest(projectDir);

    // Check for blocking failures
    const failure = findPendingFailure(manifest);
    if (failure) {
      console.log(`\n🛑 Stopping — pending failure in phase ${failure.phase}: ${failure.details}`);
      break;
    }
  }

  // Final summary
  manifest = await readManifest(projectDir);
  const nextAction = determineNextAction(manifest);
  manifest = setNextAction(manifest, nextAction);
  await writeManifest(projectDir, manifest);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Execution Summary`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Next action: ${nextAction.command} ${nextAction.argument ?? ""}`);
  console.log(`Reason: ${nextAction.reason}`);

  await notifier?.sendText("✅ <b>All phases complete!</b>");
}

// --- Error Handling ---

async function handleError(
  manifest: Manifest,
  projectDir: string,
  command: PivCommand,
  phase: number,
  result: SessionResult,
  checkpointTag: string | undefined,
  notifier?: TelegramNotifier
): Promise<void> {
  const errorText = result.error?.messages.join("; ") ?? "Unknown error";
  const category = classifyError(errorText, command);
  const taxonomy = getTaxonomy(category);

  // Check for existing failure entry for this phase/command
  const existingFailure = manifest.failures?.find(
    (f) => f.phase === phase && f.command === command && f.resolution === "pending"
  );
  const retryCount = existingFailure ? existingFailure.retry_count + 1 : 0;

  const failure: FailureEntry = {
    command,
    phase,
    error_category: category,
    timestamp: new Date().toISOString(),
    retry_count: retryCount,
    max_retries: taxonomy.maxRetries,
    checkpoint: checkpointTag,
    resolution: "pending",
    details: errorText,
  };

  manifest = appendFailure(manifest, failure);

  const retriesRemaining = Math.max(0, taxonomy.maxRetries - retryCount);
  const pivError = formatPivError(
    category, command, phase, errorText,
    retryCount < taxonomy.maxRetries,
    retriesRemaining,
    checkpointTag
  );
  console.log(pivError);

  // Determine resolution based on error category and retry state
  if (taxonomy.needsHuman) {
    // integration_auth, prd_gap — escalate immediately with blocking notification
    failure.resolution = "escalated_blocking";
    await notifier?.sendEscalation(phase, category, errorText, `Escalated immediately — ${taxonomy.recoveryAction}`);
    manifest = appendNotification(manifest, {
      timestamp: new Date().toISOString(),
      type: "escalation",
      severity: "critical",
      category,
      phase,
      details: `Phase ${phase} ${category}: ${errorText}`,
      blocking: true,
      action_taken: `Escalated immediately — ${taxonomy.recoveryAction}`,
    });
  } else if (checkpointTag && retryCount >= taxonomy.maxRetries) {
    // Retries exhausted with checkpoint — rollback and escalate
    if (category === "partial_execution" && retryCount === 0) {
      // partial_execution first failure: auto-rollback and retry
      console.log(`  🔄 Auto-rolling back to checkpoint: ${checkpointTag}`);
      try {
        rollbackToCheckpoint(projectDir, checkpointTag);
        failure.resolution = "auto_rollback_retry";
        manifest = appendNotification(manifest, {
          timestamp: new Date().toISOString(),
          type: "info",
          severity: "warning",
          category: "partial_execution",
          phase,
          details: `Auto-rolled back Phase ${phase}, retrying execution`,
          blocking: false,
          action_taken: "Rolled back to checkpoint, will retry on next cycle",
        });
      } catch (rollbackErr) {
        console.log(`  ❌ Rollback failed: ${rollbackErr}`);
        failure.resolution = "escalated_blocking";
        manifest = appendNotification(manifest, {
          timestamp: new Date().toISOString(),
          type: "escalation",
          severity: "critical",
          category: "partial_execution",
          phase,
          details: `Phase ${phase} rollback failed — requires human intervention`,
          blocking: true,
          action_taken: "Rollback to checkpoint failed, awaiting human resolution",
        });
      }
    } else {
      // All other exhausted-retry cases: rollback and escalate
      console.log(`  🔄 Rolling back to checkpoint: ${checkpointTag}`);
      try {
        rollbackToCheckpoint(projectDir, checkpointTag);
        failure.resolution = "rolled_back";
      } catch {
        console.log(`  ⚠️ Rollback failed — checkpoint may be stale`);
      }
      failure.resolution = "escalated_blocking";
      manifest = appendNotification(manifest, {
        timestamp: new Date().toISOString(),
        type: "escalation",
        severity: "critical",
        category,
        phase,
        details: `Phase ${phase} ${category} — retries exhausted, rolled back to checkpoint`,
        blocking: true,
        action_taken: "Rolled back and paused execution, awaiting human resolution",
      });
    }
  } else if (retryCount >= taxonomy.maxRetries) {
    // Retries exhausted without checkpoint — escalate only
    failure.resolution = "escalated_blocking";
    manifest = appendNotification(manifest, {
      timestamp: new Date().toISOString(),
      type: "escalation",
      severity: "critical",
      category,
      phase,
      details: `Phase ${phase} ${category} — retries exhausted, no checkpoint available`,
      blocking: true,
      action_taken: "Paused execution, awaiting human resolution",
    });
  }

  await writeManifest(projectDir, manifest);
}
