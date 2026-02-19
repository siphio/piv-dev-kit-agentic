// PIV Orchestrator — Adaptive Turn Budget Calculator (F2)

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { BudgetContext, SessionBudget, PhaseStats, Manifest, PivCommand } from "./types.js";

// Caps to prevent runaway budgets
const CAPS: Record<string, { maxTurns: number; maxTimeoutMs: number }> = {
  commit: { maxTurns: 60, maxTimeoutMs: 20 * 60_000 },
  execute: { maxTurns: 400, maxTimeoutMs: 120 * 60_000 },
  "validate-implementation": { maxTurns: 200, maxTimeoutMs: 60 * 60_000 },
};

// Base budgets for commands that don't scale
const STATIC_BUDGETS: Partial<Record<PivCommand, SessionBudget>> = {
  prime: { maxTurns: 30, timeoutMs: 10 * 60_000, reasoning: "prime: static budget (30 turns, 10 min)" },
  "plan-feature": { maxTurns: 100, timeoutMs: 45 * 60_000, reasoning: "plan-feature: static budget (100 turns, 45 min)" },
  "research-stack": { maxTurns: 100, timeoutMs: 30 * 60_000, reasoning: "research-stack: static budget (100 turns, 30 min)" },
  preflight: { maxTurns: 50, timeoutMs: 15 * 60_000, reasoning: "preflight: static budget (50 turns, 15 min)" },
};

/**
 * Count staged files via `git status --porcelain`.
 */
export function countStagedFiles(projectDir: string): number {
  try {
    const output = execFileSync("git", ["status", "--porcelain"], {
      cwd: projectDir,
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
    if (!output) return 0;
    return output.split("\n").length;
  } catch {
    return 0;
  }
}

/**
 * Count task items in a plan markdown file.
 * Looks for: "- [ ]", "- [x]", numbered lists "1.", task headers "### Task"
 */
export function countPlanTasks(planPath: string): number {
  try {
    const content = readFileSync(planPath, "utf-8");
    const taskPatterns = [
      /^[-*]\s*\[[ x]\]/gm,       // Checkbox items
      /^###\s+Task\s/gm,           // ### Task headers
      /^##\s+\d+\.\s/gm,           // ## 1. Numbered section headers
    ];

    let count = 0;
    for (const pattern of taskPatterns) {
      const matches = content.match(pattern);
      if (matches) count += matches.length;
    }

    // Fallback: if no tasks found, count major sections
    if (count === 0) {
      const sectionMatches = content.match(/^##\s+/gm);
      count = sectionMatches ? sectionMatches.length : 1;
    }

    return count;
  } catch {
    return 0;
  }
}

/**
 * Count source files (.py, .ts, .js, .tsx, .jsx) in the project.
 */
export function countSourceFiles(projectDir: string): number {
  try {
    const output = execFileSync(
      "git",
      ["ls-files", "--", "*.py", "*.ts", "*.js", "*.tsx", "*.jsx"],
      { cwd: projectDir, encoding: "utf-8", timeout: 10_000 }
    ).trim();
    if (!output) return 0;
    return output.split("\n").length;
  } catch {
    return 0;
  }
}

/**
 * Count scenarios from manifest for a given phase.
 */
export function countScenarios(manifest: Manifest | undefined, phase: number | undefined): number {
  if (!manifest || phase === undefined) return 0;
  const validation = manifest.validations?.find((v) => v.phase === phase);
  if (validation) {
    return validation.scenarios_passed + validation.scenarios_failed + validation.scenarios_skipped;
  }
  // Estimate from PRD phases_defined
  return 5; // reasonable default per phase
}

/**
 * Extract prior phase execution stats for cross-phase learning.
 */
export function extractPriorPhaseStats(
  manifest: Manifest | undefined,
  phase: number | undefined
): PhaseStats | undefined {
  if (!manifest?.executions || phase === undefined || phase <= 1) return undefined;

  const priorExec = manifest.executions.find((e) => e.phase === phase - 1);
  if (!priorExec) return undefined;

  const priorPlan = manifest.plans?.find((p) => p.phase === phase - 1);
  const taskCount = priorExec.tasks_total || 1;

  // We don't have turnsUsed in the current execution entry, estimate from tasks
  return {
    phase: phase - 1,
    turnsUsed: taskCount * 6, // rough estimate
    taskCount,
    turnsPerTask: 6,
  };
}

/**
 * Main: compute adaptive budget from project context.
 */
export function calculateBudget(context: BudgetContext): SessionBudget {
  // Static commands return fixed budgets
  const staticBudget = STATIC_BUDGETS[context.command];
  if (staticBudget) return staticBudget;

  const cap = CAPS[context.command] ?? { maxTurns: 200, maxTimeoutMs: 60 * 60_000 };

  switch (context.command) {
    case "commit": {
      const staged = countStagedFiles(context.projectDir);
      const raw = Math.ceil(10 + staged * 0.3);
      const maxTurns = Math.min(raw, cap.maxTurns);
      // Timeout scales proportionally: base 5 min + 5 sec per file
      const timeoutMs = Math.min(5 * 60_000 + staged * 5_000, cap.maxTimeoutMs);
      return {
        maxTurns,
        timeoutMs,
        reasoning: `commit: ${staged} staged files × 0.3 + base 10 = ${raw} turns (capped at ${maxTurns})`,
      };
    }

    case "execute": {
      // Try plan task count
      const planPath = context.manifest?.plans?.find((p) => p.phase === context.phase)?.path;
      const fullPlanPath = planPath ? join(context.projectDir, planPath) : "";
      const taskCount = fullPlanPath ? countPlanTasks(fullPlanPath) : 0;

      // Try cross-phase learning
      const priorStats = context.priorPhaseStats ?? extractPriorPhaseStats(context.manifest, context.phase);

      let raw: number;
      let reasoning: string;

      if (priorStats && taskCount > 0) {
        raw = Math.ceil(priorStats.turnsPerTask * taskCount * 1.2);
        reasoning = `execute: ${priorStats.turnsPerTask} turns/task × ${taskCount} tasks × 1.2 = ${raw} turns`;
      } else if (taskCount > 0) {
        raw = Math.ceil(50 + taskCount * 6);
        reasoning = `execute: base 50 + ${taskCount} tasks × 6 = ${raw} turns`;
      } else {
        raw = 200;
        reasoning = `execute: no task count available, using default 200 turns`;
      }

      const maxTurns = Math.min(raw, cap.maxTurns);
      const timeoutMs = Math.min(Math.ceil(maxTurns * 0.3) * 60_000, cap.maxTimeoutMs);
      return { maxTurns, timeoutMs, reasoning: `${reasoning} (capped at ${maxTurns})` };
    }

    case "validate-implementation": {
      const sourceFiles = countSourceFiles(context.projectDir);
      const scenarios = countScenarios(context.manifest, context.phase);
      const raw = Math.ceil(30 + sourceFiles * 0.5 + scenarios * 5);
      const maxTurns = Math.min(raw, cap.maxTurns);
      const timeoutMs = Math.min(Math.ceil(maxTurns * 0.3) * 60_000, cap.maxTimeoutMs);
      return {
        maxTurns,
        timeoutMs,
        reasoning: `validate: base 30 + ${sourceFiles} files × 0.5 + ${scenarios} scenarios × 5 = ${raw} turns (capped at ${maxTurns})`,
      };
    }

    default: {
      // Fallback for any unexpected command
      return {
        maxTurns: 100,
        timeoutMs: 30 * 60_000,
        reasoning: `${context.command}: using fallback budget (100 turns, 30 min)`,
      };
    }
  }
}
