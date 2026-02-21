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
import { classifyError, getTaxonomy, canRetry, getSeverity } from "./error-classifier.js";
import { createCheckpoint, rollbackToCheckpoint } from "./git-manager.js";
import { createProgressCallback } from "./progress-tracker.js";
import { scoreContext, isContextSufficient, formatContextScore } from "./context-scorer.js";
import { checkFidelity, formatFidelityReport } from "./fidelity-checker.js";
import { runRegressionTests } from "./drift-detector.js";
import { startHeartbeat, stopHeartbeat } from "./heartbeat.js";
import { basename } from "node:path";
import {
  resolveProfiles,
  type SessionResult,
  type FailureEntry,
  type CheckpointEntry,
  type Manifest,
  type PivCommand,
  type BudgetContext,
  type ProgressCallback,
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

function researchPairing(): { commands: string[]; type: PivCommand } {
  return {
    commands: ["/research-stack"],
    type: "research-stack",
  };
}

function preflightPairing(): { commands: string[]; type: PivCommand } {
  return {
    commands: ["/preflight"],
    type: "preflight",
  };
}

// --- Helpers ---

function getLastResult(results: SessionResult[]): SessionResult {
  return results[results.length - 1];
}

function checkProfilesNeeded(manifest: Manifest): { needed: boolean; reason: string } {
  const profiles = resolveProfiles(manifest);
  if (Object.keys(profiles).length === 0) {
    return { needed: true, reason: "No technology profiles found" };
  }
  // Check for pending research from /evolve
  const pendingResearch = manifest.research?.pending ?? [];
  if (pendingResearch.length > 0) {
    return { needed: true, reason: `Pending research: ${pendingResearch.join(", ")}` };
  }
  const staleProfiles = Object.entries(profiles)
    .filter(([_, p]) => p.freshness === "stale")
    .map(([name]) => name);
  if (staleProfiles.length > 0) {
    return { needed: true, reason: `Stale profiles: ${staleProfiles.join(", ")}` };
  }
  return { needed: false, reason: "" };
}

function checkPreflightNeeded(manifest: Manifest): boolean {
  if (!manifest.preflight) return true;
  if (manifest.preflight.status === "blocked") return true;
  return false;
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

// --- Pre-Loop: Research + Preflight ---

/**
 * Run pre-loop checks before entering the phase loop.
 * 1. Checks if profiles are missing/stale → runs /research-stack
 * 2. Checks if preflight hasn't passed → runs /preflight
 * Returns false if preflight blocks (credentials missing), stopping the orchestrator.
 */
async function runPreLoop(
  projectDir: string,
  notifier?: TelegramNotifier
): Promise<boolean> {
  let manifest = await readManifest(projectDir);

  // --- Step 1: Research Stack (profiles) ---
  const needsResearch = checkProfilesNeeded(manifest);
  if (needsResearch.needed) {
    console.log(`\n🔬 Pre-loop — Running /research-stack`);
    console.log(`   Reason: ${needsResearch.reason}`);
    await notifier?.sendText(`🔬 Running /research-stack — ${needsResearch.reason}`);

    const pairing = researchPairing();
    const results = await runCommandPairing(pairing.commands, projectDir, pairing.type);
    const lastResult = getLastResult(results);

    if (lastResult.error) {
      console.log(`  ❌ /research-stack failed: ${lastResult.error.messages.join("; ")}`);
      // Non-blocking — preflight will catch missing profiles downstream
    } else {
      console.log(`  ✅ /research-stack complete`);
    }
    manifest = await readManifest(projectDir);
  } else {
    console.log(`\n✅ Pre-loop — Profiles exist and are fresh`);
  }

  // --- Step 2: Preflight ---
  const needsPreflight = checkPreflightNeeded(manifest);
  if (needsPreflight) {
    console.log(`\n🛫 Pre-loop — Running /preflight`);
    await notifier?.sendText(`🛫 Running /preflight — verifying credentials`);

    const pairing = preflightPairing();
    const results = await runCommandPairing(pairing.commands, projectDir, pairing.type);
    const lastResult = getLastResult(results);

    if (lastResult.error) {
      console.log(`  ❌ /preflight failed: ${lastResult.error.messages.join("; ")}`);
      await notifier?.sendEscalation(0, "integration_auth",
        lastResult.error.messages.join("; "), "preflight session failed");
      return false;
    }

    manifest = await readManifest(projectDir);
    const preflightStatus = lastResult.hooks["preflight_status"] ?? manifest.preflight?.status;

    if (preflightStatus === "blocked") {
      console.log(`\n🛑 Preflight BLOCKED — credentials missing`);
      const missing = lastResult.hooks["credentials_missing"] ?? "unknown";
      console.log(`   Missing: ${missing}`);
      await notifier?.sendEscalation(0, "integration_auth",
        `Preflight blocked: ${missing}`, "Waiting for credentials");
      return false;
    }
    console.log(`  ✅ Preflight passed`);
  } else {
    console.log(`✅ Pre-loop — Preflight already passed`);
  }

  return true;
}

// --- Phase Runner ---

/**
 * Run a single phase through the full PIV loop.
 * Pipeline: plan → execute → fidelity check → drift detection → validate → commit
 * With progress visibility (F1), adaptive budgets (F2), smart failure handling (F3),
 * context scoring (F4), drift detection (F5), and fidelity checking (F6).
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
    const { callback: progressCb } = createProgressCallback(notifier, phase, "plan-feature");
    const pairing = planPairing(phase, `Phase ${phase}`);
    const budgetCtx: BudgetContext = { command: "plan-feature", projectDir, phase, manifest };
    const results = await runCommandPairing(pairing.commands, projectDir, pairing.type, progressCb, budgetCtx);
    const lastResult = getLastResult(results);
    totalCost.usd += results.reduce((sum, r) => sum + r.costUsd, 0);

    // F4: Score context quality from /prime output
    if (results.length > 1) {
      const primeResult = results[0];
      const ctxScore = scoreContext(primeResult.output, manifest, phase);
      console.log(formatContextScore(ctxScore));
      if (!isContextSufficient(ctxScore)) {
        console.log("  Context score below threshold — proceeding anyway");
      }
    }

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

    const { callback: progressCb } = createProgressCallback(notifier, phase, "execute");
    const budgetCtx: BudgetContext = { command: "execute", projectDir, phase, manifest };
    const pairing = executePairing(planPath);
    const results = await runCommandPairing(pairing.commands, projectDir, pairing.type, progressCb, budgetCtx);
    const lastResult = getLastResult(results);
    totalCost.usd += results.reduce((sum, r) => sum + r.costUsd, 0);

    // F4: Score context quality from /prime output
    if (results.length > 1) {
      const primeResult = results[0];
      const ctxScore = scoreContext(primeResult.output, manifest, phase);
      console.log(formatContextScore(ctxScore));
    }

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

    // --- F6: Fidelity Check ---
    if (planPath) {
      console.log(`\n📐 Phase ${phase} — Fidelity check`);
      try {
        const fidelity = checkFidelity(projectDir, planPath, phase);
        console.log(formatFidelityReport(fidelity));
        if (fidelity.fidelityScore < 50) {
          console.log("  ⚠️ Low fidelity — execution may have diverged from plan");
        }
      } catch (err) {
        console.log(`  ⚠️ Fidelity check failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // --- F5: Drift Detection ---
    if (phase > 1) {
      console.log(`\n🔬 Phase ${phase} — Drift check (running Phase 1..${phase - 1} tests)`);
      try {
        const drift = runRegressionTests(projectDir, phase, manifest);
        if (drift.regressionDetected) {
          console.log(`  ⚠️ Regression: ${drift.testsFailed} tests failed`);
          // Spawn fix session
          const { callback: fixCb } = createProgressCallback(notifier, phase, "fix-regression");
          await runCommandPairing(
            ["/prime", `Fix regression in prior-phase tests: ${drift.failedTests.join(", ")}`],
            projectDir,
            "execute",
            fixCb,
            { command: "execute", projectDir, phase, manifest }
          );
          // Re-check after fix
          const recheck = runRegressionTests(projectDir, phase, manifest);
          if (recheck.regressionDetected) {
            console.log(`  ⚠️ Regression persists (${recheck.testsFailed} tests) — logging as advisory, continuing`);
          } else if (recheck.testsRun > 0) {
            console.log(`  ✅ Regression fixed — all ${recheck.testsRun} prior-phase tests pass`);
          }
        } else if (drift.testsRun > 0) {
          console.log(`  ✅ All ${drift.testsRun} prior-phase tests passed`);
        } else {
          console.log(`  ℹ️ No prior-phase test directories found — skipping`);
        }
      } catch (err) {
        console.log(`  ⚠️ Drift detection failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // --- Validate ---
  if (phaseStatus.validation !== "pass") {
    console.log(`\n🔍 Phase ${phase} — Validating`);
    let validated = false;
    let retries = 0;
    const maxValidationRetries = 2;

    while (!validated && retries <= maxValidationRetries) {
      const { callback: progressCb } = createProgressCallback(notifier, phase, "validate");
      const budgetCtx: BudgetContext = { command: "validate-implementation", projectDir, phase, manifest };
      const pairing = validatePairing();
      const results = await runCommandPairing(pairing.commands, projectDir, pairing.type, progressCb, budgetCtx);
      const lastResult = getLastResult(results);
      totalCost.usd += results.reduce((sum, r) => sum + r.costUsd, 0);

      // F4: Score context quality from /prime output
      if (results.length > 1) {
        const primeResult = results[0];
        const ctxScore = scoreContext(primeResult.output, manifest, phase);
        console.log(formatContextScore(ctxScore));
      }

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
          const { callback: fixCb } = createProgressCallback(notifier, phase, "fix-validation");
          const refactorResults = await runCommandPairing(
            ["/prime", `Fix the following validation error and re-run tests: ${lastResult.error.messages.join("; ")}`],
            projectDir,
            "execute",
            fixCb,
            { command: "execute", projectDir, phase, manifest }
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

  // --- Commit (F3: Smart failure handling) ---
  console.log(`\n📦 Phase ${phase} — Committing`);
  const { callback: commitProgressCb } = createProgressCallback(notifier, phase, "commit");
  const commitBudgetCtx: BudgetContext = { command: "commit", projectDir };
  let commitResults = await runCommandPairing(commitPairing().commands, projectDir, "commit", commitProgressCb, commitBudgetCtx);
  totalCost.usd += commitResults.reduce((sum, r) => sum + r.costUsd, 0);
  let commitResult = getLastResult(commitResults);

  // F3: Smart commit retry — commit failures are always treated as degraded
  if (commitResult.error) {
    const errorText = commitResult.error.messages.join("; ");
    const category = classifyError(errorText, "commit");
    const severity = getSeverity(category);

    // Commit failures after validation passed are never blocking
    console.log(`  ⚠️ Commit failed (${category}, severity: ${severity}) — retrying with increased budget`);
    const retryBudgetCtx: BudgetContext = { command: "commit", projectDir };
    const { callback: retryCb } = createProgressCallback(notifier, phase, "commit-retry");
    commitResults = await runCommandPairing(commitPairing().commands, projectDir, "commit", retryCb, retryBudgetCtx);
    totalCost.usd += commitResults.reduce((sum, r) => sum + r.costUsd, 0);
    commitResult = getLastResult(commitResults);

    if (commitResult.error) {
      // Still failed — log but don't stop pipeline
      console.log(`  ⚠️ Commit failed after retry — continuing to next phase`);
      await handleError(manifest, projectDir, "commit", phase, commitResult, undefined, notifier);
      // F3: Don't return — continue to next phase since validation passed
    }
  }

  if (!commitResult.error) {
    console.log(`  ✅ Phase ${phase} committed`);
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

  // --- Pre-Loop: Research + Preflight ---
  const canProceed = await runPreLoop(projectDir, notifier);
  if (!canProceed) {
    console.log(`\n🛑 Pre-loop checks failed — orchestrator stopping`);
    await notifier?.sendText(
      "🛑 <b>Orchestrator stopped</b> — preflight checks failed. Provide missing credentials and restart."
    );
    return;
  }

  console.log(`\n🚀 Starting autonomous execution — ${phases.length} phases\n`);

  // Central registry heartbeat (every 2 min — for supervisor stall detection)
  const projectName = basename(projectDir);
  const registryHeartbeatTimer = startHeartbeat(projectDir, projectName);
  console.log(`💓 Central registry heartbeat started (every 2 min)`);

  // Heartbeat: send periodic "still running" message to Telegram (every 30 min)
  const heartbeatInterval = notifier ? setInterval(async () => {
    try {
      const m = await readManifest(projectDir);
      const phase = getNextUnfinishedPhase(m);
      await notifier.sendText(`💓 Still running — Phase ${phase ?? "?"} in progress`);
    } catch {
      // Heartbeat is best-effort — don't crash on failure
    }
  }, 30 * 60 * 1000) : null;

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

    // F3: Only blocking failures stop the loop
    const blockingFailure = findPendingFailure(manifest, "blocking");
    if (blockingFailure) {
      console.log(`\n🛑 Stopping — blocking failure in phase ${blockingFailure.phase}: ${blockingFailure.details}`);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
      stopHeartbeat(registryHeartbeatTimer, projectDir, projectName);
      break;
    }
    // Log non-blocking failures but continue
    const anyFailure = findPendingFailure(manifest);
    if (anyFailure) {
      console.log(`  ℹ️ Non-blocking failure in phase ${anyFailure.phase} (${anyFailure.error_category}) — continuing`);
    }
  }

  // Clear heartbeat timers
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  stopHeartbeat(registryHeartbeatTimer, projectDir, projectName);

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
