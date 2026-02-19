// PIV Orchestrator — Manifest-Driven State Machine

import type {
  Manifest,
  NextAction,
  FailureEntry,
  CheckpointEntry,
  PhaseStatus,
} from "./types.js";

/**
 * Find the first pending failure (resolution === "pending").
 */
export function findPendingFailure(manifest: Manifest): FailureEntry | null {
  if (!manifest.failures) return null;
  return manifest.failures.find((f) => f.resolution === "pending") ?? null;
}

/**
 * Find the first active checkpoint (status === "active").
 */
export function findActiveCheckpoint(manifest: Manifest): CheckpointEntry | null {
  if (!manifest.checkpoints) return null;
  return manifest.checkpoints.find((cp) => cp.status === "active") ?? null;
}

/**
 * Get the next unfinished phase number.
 * Returns the first phase where plan, execution, or validation is not complete.
 */
export function getNextUnfinishedPhase(manifest: Manifest): number | null {
  const phaseNumbers = Object.keys(manifest.phases)
    .map(Number)
    .sort((a, b) => a - b);

  for (const phase of phaseNumbers) {
    const status: PhaseStatus = manifest.phases[phase];
    if (
      status.plan !== "complete" ||
      status.execution !== "complete" ||
      (status.validation !== "pass" && status.validation !== "not_run")
    ) {
      return phase;
    }
    // Also return if validation is not_run but execution is complete (needs validation)
    if (status.execution === "complete" && status.validation === "not_run") {
      return phase;
    }
  }

  return null;
}

/**
 * Check if a phase is fully complete (plan + execution + validation passed).
 */
function isPhaseComplete(status: PhaseStatus): boolean {
  return (
    status.plan === "complete" &&
    status.execution === "complete" &&
    status.validation === "pass"
  );
}

/**
 * Get the plan file path for a given phase from the manifest.
 */
function getPlanPath(manifest: Manifest, phase: number): string | undefined {
  return manifest.plans?.find((p) => p.phase === phase)?.path;
}

/**
 * Determine the next action the orchestrator should take based on manifest state.
 *
 * Priority logic (highest first):
 * 1. Pending failure with retries remaining → retry
 * 2. Pending failure with no retries → rollback
 * 3. Active checkpoint with no failure → resume execution
 * 4. Stale/missing profiles → research-stack --refresh
 * 5. No PRD → create-prd
 * 6. Next phase needs plan → plan-feature
 * 7. Plan exists, not executed → execute
 * 8. Executed, not validated → validate-implementation
 * 9. Validated → commit
 */
export function determineNextAction(manifest: Manifest): NextAction {
  // 1-2: Check for pending failures
  const pendingFailure = findPendingFailure(manifest);
  if (pendingFailure) {
    const taxonomy = getErrorTaxonomy(pendingFailure.error_category);
    if (pendingFailure.retry_count < taxonomy.maxRetries) {
      return {
        command: pendingFailure.command,
        argument: "retry",
        reason: `Fix: ${pendingFailure.details}`,
        confidence: "medium",
      };
    } else {
      return {
        command: "rollback",
        argument: pendingFailure.checkpoint,
        reason: `Retries exhausted for ${pendingFailure.error_category}: ${pendingFailure.details}`,
        confidence: "high",
      };
    }
  }

  // 3: Active checkpoint with no failure → interrupted execution
  const activeCheckpoint = findActiveCheckpoint(manifest);
  if (activeCheckpoint) {
    const planPath = getPlanPath(manifest, activeCheckpoint.phase);
    return {
      command: "execute",
      argument: planPath ?? "resume",
      reason: "Execution interrupted — resume from last completed step",
      confidence: "high",
    };
  }

  // 4: Stale/missing profiles
  if (manifest.profiles) {
    const staleProfiles = Object.entries(manifest.profiles)
      .filter(([_, p]) => p.freshness === "stale")
      .map(([name]) => name);
    if (staleProfiles.length > 0) {
      return {
        command: "research-stack",
        argument: "--refresh",
        reason: `Stale profiles: ${staleProfiles.join(", ")}`,
        confidence: "high",
      };
    }
  }

  // 5: No PRD
  if (!manifest.prd) {
    return {
      command: "create-prd",
      reason: "No PRD found — create requirements document first",
      confidence: "high",
    };
  }

  // 6-9: Phase progression
  const nextPhase = getNextUnfinishedPhase(manifest);
  if (nextPhase === null) {
    return {
      command: "done",
      reason: "All phases complete",
      confidence: "high",
    };
  }

  const status = manifest.phases[nextPhase];

  if (status.plan !== "complete") {
    return {
      command: "plan-feature",
      argument: `Phase ${nextPhase}`,
      reason: `Phase ${nextPhase} needs a plan`,
      confidence: "high",
    };
  }

  if (status.execution !== "complete") {
    const planPath = getPlanPath(manifest, nextPhase);
    return {
      command: "execute",
      argument: planPath ?? `.agents/plans/phase-${nextPhase}.md`,
      reason: `Phase ${nextPhase} plan complete — ready for execution`,
      confidence: "high",
    };
  }

  if (status.validation !== "pass") {
    return {
      command: "validate-implementation",
      argument: "--full",
      reason: `Phase ${nextPhase} executed — needs validation`,
      confidence: "high",
    };
  }

  return {
    command: "commit",
    reason: `Phase ${nextPhase} validated — ready to commit`,
    confidence: "high",
  };
}

// Inline error taxonomy lookup to avoid circular dependency with error-classifier
function getErrorTaxonomy(category: string): { maxRetries: number } {
  const map: Record<string, number> = {
    syntax_error: 2,
    test_failure: 2,
    scenario_mismatch: 1,
    integration_auth: 0,
    integration_rate_limit: 3,
    stale_artifact: 1,
    prd_gap: 0,
    partial_execution: 1,
    line_budget_exceeded: 1,
  };
  return { maxRetries: map[category] ?? 0 };
}
