import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildCoalitionSnapshot, computeHealthMetrics, classifyHealth } from "../src/coalition-monitor.js";
import type { CoalitionMonitorConfig, CoalitionSnapshot, CoalitionHealthMetrics } from "../src/types.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import yaml from "js-yaml";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(os.tmpdir(), "piv-coalition-monitor-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

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

function makeSnapshot(overrides: Partial<CoalitionSnapshot> = {}): CoalitionSnapshot {
  return {
    timestamp: new Date().toISOString(),
    activeAgents: 2,
    totalSlices: 10,
    completedSlices: 5,
    failedSlices: 1,
    blockedSlices: 1,
    runningSlices: 3,
    totalCostUsd: 10,
    budgetLimitUsd: 100,
    conflictsDetected: 0,
    healthStatus: "healthy",
    ...overrides,
  };
}

function writeManifest(tmpDir: string, data: Record<string, unknown>): void {
  const agentsDir = join(tmpDir, ".agents");
  mkdirSync(agentsDir, { recursive: true });
  writeFileSync(join(agentsDir, "manifest.yaml"), yaml.dump(data), "utf-8");
}

// --- buildCoalitionSnapshot ---

describe("buildCoalitionSnapshot", () => {
  it("returns correct slice counts from a monorepo manifest with modules", () => {
    const manifest = {
      modules: {
        foundation: {
          slices: [
            { status: "complete" },
            { status: "running" },
            { status: "failed" },
          ],
          activeAgents: 2,
        },
        api: {
          slices: [
            { status: "complete" },
            { status: "blocked" },
          ],
          activeAgents: 1,
        },
      },
    };
    writeManifest(tmpDir, manifest);

    const config = makeConfig(tmpDir);
    const snapshot = buildCoalitionSnapshot(config);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.totalSlices).toBe(5);
    expect(snapshot!.completedSlices).toBe(2);
    expect(snapshot!.failedSlices).toBe(1);
    expect(snapshot!.blockedSlices).toBe(1);
    expect(snapshot!.runningSlices).toBe(1);
    expect(snapshot!.activeAgents).toBe(3);
  });

  it("returns correct counts from a classic phase manifest", () => {
    const manifest = {
      phases: {
        "1": {
          plan_status: "complete",
          execution_status: "complete",
          validation_status: "complete",
        },
        "2": {
          plan_status: "complete",
          execution_status: "running",
        },
      },
    };
    writeManifest(tmpDir, manifest);

    const config = makeConfig(tmpDir);
    const snapshot = buildCoalitionSnapshot(config);

    expect(snapshot).not.toBeNull();
    // Phase 1: 3 statuses present, Phase 2: 2 statuses present = 5 total
    expect(snapshot!.totalSlices).toBe(5);
    expect(snapshot!.completedSlices).toBe(4);
    expect(snapshot!.runningSlices).toBe(1);
    expect(snapshot!.failedSlices).toBe(0);
    expect(snapshot!.blockedSlices).toBe(0);
  });

  it("returns null when manifest file does not exist", () => {
    const config = makeConfig(tmpDir);
    // No manifest written — file does not exist
    const snapshot = buildCoalitionSnapshot(config);
    expect(snapshot).toBeNull();
  });

  it("returns null when manifest contains corrupt YAML", () => {
    const agentsDir = join(tmpDir, ".agents");
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(
      join(agentsDir, "manifest.yaml"),
      ":\n  - :\n    invalid: [unbalanced",
      "utf-8",
    );

    const config = makeConfig(tmpDir);
    const snapshot = buildCoalitionSnapshot(config);
    expect(snapshot).toBeNull();
  });

  it("returns snapshot with zeros when manifest has no modules or phases", () => {
    const manifest = {
      settings: { budgetLimitUsd: 50 },
    };
    writeManifest(tmpDir, manifest);

    const config = makeConfig(tmpDir);
    const snapshot = buildCoalitionSnapshot(config);

    expect(snapshot).not.toBeNull();
    expect(snapshot!.totalSlices).toBe(0);
    expect(snapshot!.completedSlices).toBe(0);
    expect(snapshot!.failedSlices).toBe(0);
    expect(snapshot!.blockedSlices).toBe(0);
    expect(snapshot!.runningSlices).toBe(0);
    expect(snapshot!.activeAgents).toBe(0);
    expect(snapshot!.budgetLimitUsd).toBe(50);
  });
});

// --- computeHealthMetrics ---

describe("computeHealthMetrics", () => {
  it("returns positive convergence rate when progress has been made", () => {
    const previous = makeSnapshot({ completedSlices: 2 });
    const current = makeSnapshot({ completedSlices: 5 });

    const metrics = computeHealthMetrics(current, previous, 3);

    expect(metrics.convergenceRate).toBe(1); // (5 - 2) / 3
  });

  it("returns zero convergence rate when no progress is made", () => {
    const previous = makeSnapshot({ completedSlices: 5 });
    const current = makeSnapshot({ completedSlices: 5 });

    const metrics = computeHealthMetrics(current, previous, 2);

    expect(metrics.convergenceRate).toBe(0);
  });

  it("computes correct failure rate from completed and failed slices", () => {
    const current = makeSnapshot({
      completedSlices: 6,
      failedSlices: 4,
    });

    const metrics = computeHealthMetrics(current, null, 1);

    // failureRate = 4 / (6 + 4) = 0.4
    expect(metrics.failureRate).toBeCloseTo(0.4);
  });

  it("returns costPerSlice = 0 when no slices are completed (no division by zero)", () => {
    const current = makeSnapshot({
      completedSlices: 0,
      totalCostUsd: 50,
    });

    const metrics = computeHealthMetrics(current, null, 1);

    expect(metrics.costPerSlice).toBe(0);
  });

  it("uses safe default of 1 when elapsedHours is zero", () => {
    const previous = makeSnapshot({ completedSlices: 0 });
    const current = makeSnapshot({ completedSlices: 4, conflictsDetected: 3 });

    const metrics = computeHealthMetrics(current, previous, 0);

    // With safeElapsed = 1: convergenceRate = (4 - 0) / 1 = 4
    expect(metrics.convergenceRate).toBe(4);
    // conflictFrequency = 3 / 1 = 3
    expect(metrics.conflictFrequency).toBe(3);
  });
});

// --- classifyHealth ---

describe("classifyHealth", () => {
  it("returns 'healthy' for low failure rate and positive convergence", () => {
    const config = makeConfig(tmpDir);
    const metrics: CoalitionHealthMetrics = {
      convergenceRate: 2,
      failureRate: 0.05, // below degraded threshold (0.2)
      costPerSlice: 1,
      conflictFrequency: 0,
    };

    expect(classifyHealth(metrics, config)).toBe("healthy");
  });

  it("returns 'degraded' for medium failure rate and positive convergence", () => {
    const config = makeConfig(tmpDir);
    const metrics: CoalitionHealthMetrics = {
      convergenceRate: 1,
      failureRate: 0.3, // above degraded (0.2) but below critical (0.5)
      costPerSlice: 2,
      conflictFrequency: 0,
    };

    expect(classifyHealth(metrics, config)).toBe("degraded");
  });

  it("returns 'critical' for high failure rate", () => {
    const config = makeConfig(tmpDir);
    const metrics: CoalitionHealthMetrics = {
      convergenceRate: 1, // positive convergence, but failure rate is at critical
      failureRate: 0.5, // at or above critical threshold (0.5)
      costPerSlice: 5,
      conflictFrequency: 1,
    };

    expect(classifyHealth(metrics, config)).toBe("critical");
  });

  it("returns 'spinning' for zero convergence rate", () => {
    const config = makeConfig(tmpDir);
    const metrics: CoalitionHealthMetrics = {
      convergenceRate: 0,
      failureRate: 0.1, // low failure rate, but no convergence
      costPerSlice: 1,
      conflictFrequency: 0,
    };

    expect(classifyHealth(metrics, config)).toBe("spinning");
  });

  it("returns 'spinning' for negative convergence rate", () => {
    const config = makeConfig(tmpDir);
    const metrics: CoalitionHealthMetrics = {
      convergenceRate: -1,
      failureRate: 0.1,
      costPerSlice: 1,
      conflictFrequency: 0,
    };

    expect(classifyHealth(metrics, config)).toBe("spinning");
  });
});
