import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import yaml from "js-yaml";

import {
  determineStrategicActions,
  executeStrategicAction,
  shouldPauseCoalition,
  identifyStuckAgent,
} from "../src/strategic-interventor.js";
import type {
  CoalitionSnapshot,
  ConvergenceWindow,
  ConflictDetection,
  CoalitionMonitorConfig,
} from "../src/types.js";

// --- Factories ---

function makeSnapshot(overrides: Partial<CoalitionSnapshot> = {}): CoalitionSnapshot {
  return {
    timestamp: new Date().toISOString(),
    activeAgents: 2,
    totalSlices: 10,
    completedSlices: 5,
    failedSlices: 0,
    blockedSlices: 1,
    runningSlices: 2,
    totalCostUsd: 10,
    budgetLimitUsd: 100,
    conflictsDetected: 0,
    healthStatus: "healthy",
    ...overrides,
  };
}

function makeConvergence(overrides: Partial<ConvergenceWindow> = {}): ConvergenceWindow {
  return {
    snapshots: [],
    windowSize: 5,
    isSpinning: false,
    trend: "improving",
    improvementPercent: 10,
    ...overrides,
  };
}

function makeConfig(tmpDir: string): CoalitionMonitorConfig {
  return {
    projectPath: tmpDir,
    manifestPath: join(tmpDir, ".agents", "manifest.yaml"),
    convergenceWindowSize: 5,
    spinningThreshold: 0.01,
    failureRateCritical: 0.5,
    failureRateDegraded: 0.2,
    conflictCheckEnabled: true,
    crossProjectLearning: true,
  };
}

// --- Test suites ---

describe("determineStrategicActions", () => {
  it("returns empty actions for a healthy coalition", () => {
    const snapshot = makeSnapshot();
    const convergence = makeConvergence();
    const config = makeConfig("/tmp/fake");

    const actions = determineStrategicActions(snapshot, convergence, null, config);
    expect(actions).toEqual([]);
  });

  it("returns pause_coalition + escalate for critical health", () => {
    const snapshot = makeSnapshot({ healthStatus: "critical" });
    const convergence = makeConvergence();
    const config = makeConfig("/tmp/fake");

    const actions = determineStrategicActions(snapshot, convergence, null, config);
    expect(actions).toHaveLength(2);
    expect(actions[0].type).toBe("pause_coalition");
    expect(actions[1].type).toBe("escalate");
  });

  it("returns pause_agent for spinning convergence", () => {
    const snapshot = makeSnapshot();
    const convergence = makeConvergence({ isSpinning: true, trend: "spinning", improvementPercent: 0.5 });
    const config = makeConfig("/tmp/fake");

    const actions = determineStrategicActions(snapshot, convergence, null, config);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("pause_agent");
    expect(actions[0].target).toBe("least-progressing-agent");
  });

  it("returns deprioritize when budget is at 90%+", () => {
    const snapshot = makeSnapshot({ totalCostUsd: 92, budgetLimitUsd: 100 });
    const convergence = makeConvergence();
    const config = makeConfig("/tmp/fake");

    const actions = determineStrategicActions(snapshot, convergence, null, config);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("deprioritize");
  });

  it("returns escalate for conflict with resolution 'escalate'", () => {
    const snapshot = makeSnapshot();
    const convergence = makeConvergence();
    const config = makeConfig("/tmp/fake");
    const conflict: ConflictDetection = {
      hasConflict: true,
      conflictingFiles: ["src/api.ts"],
      agentA: "agent-1",
      agentB: "agent-2",
      upstreamAgent: null,
      isArchitectural: false,
      resolution: "escalate",
    };

    const actions = determineStrategicActions(snapshot, convergence, conflict, config);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("escalate");
    expect(actions[0].target).toBe("human");
  });

  it("returns resolve_conflict targeting agentB for upstream_wins", () => {
    const snapshot = makeSnapshot();
    const convergence = makeConvergence();
    const config = makeConfig("/tmp/fake");
    const conflict: ConflictDetection = {
      hasConflict: true,
      conflictingFiles: ["src/models.ts"],
      agentA: "agent-upstream",
      agentB: "agent-downstream",
      upstreamAgent: "agent-upstream",
      isArchitectural: false,
      resolution: "upstream_wins",
    };

    const actions = determineStrategicActions(snapshot, convergence, conflict, config);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("resolve_conflict");
    expect(actions[0].target).toBe("agent-downstream");
  });

  it("returns multiple actions when critical + spinning", () => {
    const snapshot = makeSnapshot({ healthStatus: "critical" });
    const convergence = makeConvergence({ isSpinning: true, trend: "spinning", improvementPercent: 0 });
    const config = makeConfig("/tmp/fake");

    const actions = determineStrategicActions(snapshot, convergence, null, config);
    // critical => pause_coalition + escalate, spinning => pause_agent
    expect(actions.length).toBeGreaterThanOrEqual(3);

    const types = actions.map((a) => a.type);
    expect(types).toContain("pause_coalition");
    expect(types).toContain("escalate");
    expect(types).toContain("pause_agent");
  });
});

describe("executeStrategicAction", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(os.tmpdir(), "strat-interventor-"));
    mkdirSync(join(tmpDir, ".agents"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("pause_agent writes a notification to manifest", () => {
    const manifestPath = join(tmpDir, ".agents", "manifest.yaml");
    writeFileSync(manifestPath, yaml.dump({ notifications: [] }), "utf-8");

    const config = makeConfig(tmpDir);
    const action = {
      type: "pause_agent" as const,
      target: "agent-1",
      reason: "Agent is stuck",
      coalitionHealth: "degraded" as const,
      timestamp: new Date().toISOString(),
    };

    const result = executeStrategicAction(action, config);
    expect(result).toBe(true);

    // Verify notification was appended
    const raw = yaml.load(
      require("node:fs").readFileSync(manifestPath, "utf-8"),
    ) as { notifications: unknown[] };
    expect(raw.notifications).toHaveLength(1);
    expect((raw.notifications[0] as Record<string, unknown>).category).toBe("pause_agent");
  });

  it("escalate returns false (caller handles Telegram)", () => {
    const manifestPath = join(tmpDir, ".agents", "manifest.yaml");
    writeFileSync(manifestPath, yaml.dump({ notifications: [] }), "utf-8");

    const config = makeConfig(tmpDir);
    const action = {
      type: "escalate" as const,
      target: "human",
      reason: "Critical failure",
      coalitionHealth: "critical" as const,
      timestamp: new Date().toISOString(),
    };

    const result = executeStrategicAction(action, config);
    expect(result).toBe(false);
  });

  it("returns false for invalid manifest path (does not throw)", () => {
    const config = makeConfig(join(tmpDir, "nonexistent"));
    const action = {
      type: "pause_agent" as const,
      target: "agent-1",
      reason: "Agent is stuck",
      coalitionHealth: "degraded" as const,
      timestamp: new Date().toISOString(),
    };

    const result = executeStrategicAction(action, config);
    expect(result).toBe(false);
  });
});

describe("shouldPauseCoalition", () => {
  it("returns true when budget is exceeded", () => {
    const snapshot = makeSnapshot({ totalCostUsd: 100, budgetLimitUsd: 100 });
    expect(shouldPauseCoalition(snapshot)).toBe(true);
  });

  it("returns true when failure rate exceeds 50%", () => {
    const snapshot = makeSnapshot({
      completedSlices: 3,
      failedSlices: 5,
    });
    expect(shouldPauseCoalition(snapshot)).toBe(true);
  });

  it("returns true for dead coalition (0 active, 0 running, work remaining)", () => {
    const snapshot = makeSnapshot({
      activeAgents: 0,
      runningSlices: 0,
      completedSlices: 3,
      totalSlices: 10,
    });
    expect(shouldPauseCoalition(snapshot)).toBe(true);
  });

  it("returns false under normal conditions", () => {
    const snapshot = makeSnapshot();
    expect(shouldPauseCoalition(snapshot)).toBe(false);
  });
});

describe("identifyStuckAgent", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(os.tmpdir(), "strat-stuck-"));
    mkdirSync(join(tmpDir, ".agents"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns agent name when a stalled agent is found", () => {
    const manifestPath = join(tmpDir, ".agents", "manifest.yaml");
    const oldDate = new Date(Date.now() - 3_600_000).toISOString(); // 1 hour ago
    writeFileSync(
      manifestPath,
      yaml.dump({
        execution: [
          {
            agent: "agent-stalled",
            status: "running",
            started_at: oldDate,
            last_progress: oldDate,
            slice: "slice-3",
          },
        ],
      }),
      "utf-8",
    );

    const snapshot = makeSnapshot();
    const result = identifyStuckAgent(snapshot, manifestPath);
    expect(result).toBe("agent-stalled");
  });

  it("returns null when all agents are progressing", () => {
    const manifestPath = join(tmpDir, ".agents", "manifest.yaml");
    writeFileSync(
      manifestPath,
      yaml.dump({
        execution: [
          {
            agent: "agent-ok",
            status: "completed",
            started_at: new Date().toISOString(),
            last_progress: new Date().toISOString(),
            slice: "slice-1",
          },
        ],
      }),
      "utf-8",
    );

    const snapshot = makeSnapshot();
    const result = identifyStuckAgent(snapshot, manifestPath);
    expect(result).toBeNull();
  });

  it("returns null when no active agents exist", () => {
    const manifestPath = join(tmpDir, ".agents", "manifest.yaml");
    writeFileSync(
      manifestPath,
      yaml.dump({
        execution: [],
      }),
      "utf-8",
    );

    const snapshot = makeSnapshot();
    const result = identifyStuckAgent(snapshot, manifestPath);
    expect(result).toBeNull();
  });

  it("returns null when manifest does not exist", () => {
    const snapshot = makeSnapshot();
    const result = identifyStuckAgent(snapshot, join(tmpDir, "nonexistent", "manifest.yaml"));
    expect(result).toBeNull();
  });
});
