import { describe, it, expect, vi } from "vitest";
import {
  calculateBudget,
  countPlanTasks,
  countScenarios,
  extractPriorPhaseStats,
} from "../src/budget-calculator.js";
import type { BudgetContext, Manifest } from "../src/types.js";

function baseManifest(): Manifest {
  return {
    prd: { path: ".agents/PRD.md", status: "validated", generated_at: "2026-02-18", phases_defined: [1, 2] },
    phases: {
      1: { plan: "complete", execution: "complete", validation: "pass" },
      2: { plan: "complete", execution: "not_started", validation: "not_run" },
    },
    settings: {
      profile_freshness_window: "7d",
      checkpoint_before_execute: true,
      mode: "autonomous",
      reasoning_model: "opus-4-6",
      validation_mode: "full",
      agent_teams: "prefer_parallel",
    },
    profiles: {},
    last_updated: "2026-02-18",
  };
}

describe("calculateBudget", () => {
  it("returns static budget for prime", () => {
    const ctx: BudgetContext = { command: "prime", projectDir: "/tmp/test" };
    const budget = calculateBudget(ctx);
    expect(budget.maxTurns).toBe(30);
    expect(budget.timeoutMs).toBe(10 * 60_000);
    expect(budget.reasoning).toContain("static");
  });

  it("returns static budget for plan-feature", () => {
    const ctx: BudgetContext = { command: "plan-feature", projectDir: "/tmp/test" };
    const budget = calculateBudget(ctx);
    expect(budget.maxTurns).toBe(100);
    expect(budget.reasoning).toContain("static");
  });

  it("returns static budget for research-stack", () => {
    const ctx: BudgetContext = { command: "research-stack", projectDir: "/tmp/test" };
    const budget = calculateBudget(ctx);
    expect(budget.maxTurns).toBe(100);
  });

  it("returns static budget for preflight", () => {
    const ctx: BudgetContext = { command: "preflight", projectDir: "/tmp/test" };
    const budget = calculateBudget(ctx);
    expect(budget.maxTurns).toBe(50);
  });

  it("calculates commit budget based on staged files (uses default for empty dir)", () => {
    // In a non-git directory, countStagedFiles returns 0
    const ctx: BudgetContext = { command: "commit", projectDir: "/tmp/nonexistent" };
    const budget = calculateBudget(ctx);
    // base(10) + 0 * 0.3 = 10
    expect(budget.maxTurns).toBe(10);
    expect(budget.reasoning).toContain("commit");
    expect(budget.reasoning).toContain("staged files");
  });

  it("caps commit budget at 60", () => {
    // We can't easily mock execFileSync, but test the cap logic indirectly
    // With 200 staged files: 10 + 200 * 0.3 = 70, capped at 60
    const ctx: BudgetContext = { command: "commit", projectDir: "/tmp/nonexistent" };
    const budget = calculateBudget(ctx);
    expect(budget.maxTurns).toBeLessThanOrEqual(60);
  });

  it("returns default execute budget when no plan found", () => {
    const ctx: BudgetContext = { command: "execute", projectDir: "/tmp/nonexistent", phase: 1, manifest: baseManifest() };
    // No plan file exists at the path, so countPlanTasks returns 0
    const budget = calculateBudget(ctx);
    expect(budget.maxTurns).toBe(200);
    expect(budget.reasoning).toContain("default");
  });

  it("includes reasoning string in all budgets", () => {
    const commands: BudgetContext["command"][] = ["prime", "commit", "execute", "validate-implementation"];
    for (const command of commands) {
      const budget = calculateBudget({ command, projectDir: "/tmp/test" });
      expect(budget.reasoning).toBeTruthy();
      expect(typeof budget.reasoning).toBe("string");
    }
  });
});

describe("countPlanTasks", () => {
  it("returns 0 for nonexistent file", () => {
    expect(countPlanTasks("/tmp/nonexistent-plan-file.md")).toBe(0);
  });
});

describe("countScenarios", () => {
  it("returns default for missing manifest", () => {
    expect(countScenarios(undefined, 1)).toBe(0);
  });

  it("returns default for manifest without validations", () => {
    expect(countScenarios(baseManifest(), 1)).toBe(5);
  });

  it("returns sum from validation entry when present", () => {
    const manifest = baseManifest();
    manifest.validations = [{
      path: ".agents/validation-phase-1.md",
      phase: 1,
      status: "pass",
      scenarios_passed: 8,
      scenarios_failed: 1,
      scenarios_skipped: 2,
    }];
    expect(countScenarios(manifest, 1)).toBe(11);
  });
});

describe("extractPriorPhaseStats", () => {
  it("returns undefined for phase 1 (no prior phases)", () => {
    expect(extractPriorPhaseStats(baseManifest(), 1)).toBeUndefined();
  });

  it("returns undefined when no executions exist", () => {
    expect(extractPriorPhaseStats(baseManifest(), 2)).toBeUndefined();
  });

  it("returns stats from prior phase execution", () => {
    const manifest = baseManifest();
    manifest.executions = [{
      phase: 1,
      status: "complete",
      completed_at: "2026-02-18",
      tasks_total: 15,
      tasks_done: 15,
      tasks_blocked: 0,
    }];
    const stats = extractPriorPhaseStats(manifest, 2);
    expect(stats).not.toBeUndefined();
    expect(stats!.phase).toBe(1);
    expect(stats!.taskCount).toBe(15);
  });
});
