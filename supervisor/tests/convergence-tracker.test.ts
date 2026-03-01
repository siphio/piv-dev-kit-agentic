import { describe, it, expect } from "vitest";
import { createConvergenceTracker } from "../src/convergence-tracker.js";
import type { CoalitionSnapshot } from "../src/types.js";

function makeSnapshot(overrides: Partial<CoalitionSnapshot> = {}): CoalitionSnapshot {
  return {
    timestamp: new Date().toISOString(),
    activeAgents: 2,
    totalSlices: 10,
    completedSlices: 3,
    failedSlices: 0,
    blockedSlices: 1,
    runningSlices: 2,
    totalCostUsd: 5.0,
    budgetLimitUsd: 100,
    conflictsDetected: 0,
    healthStatus: "healthy",
    ...overrides,
  };
}

describe("window management", () => {
  it("retains all snapshots up to window size", () => {
    const tracker = createConvergenceTracker(5, 0.01);
    for (let i = 0; i < 5; i++) {
      tracker.addSnapshot(makeSnapshot({ completedSlices: i }));
    }
    const win = tracker.getWindow();
    expect(win.snapshots).toHaveLength(5);
  });

  it("drops oldest snapshots when exceeding window size", () => {
    const tracker = createConvergenceTracker(3, 0.01);
    for (let i = 0; i < 5; i++) {
      tracker.addSnapshot(makeSnapshot({ completedSlices: i }));
    }
    const win = tracker.getWindow();
    expect(win.snapshots).toHaveLength(3);
    // Oldest two (completedSlices 0 and 1) should be dropped
    expect(win.snapshots[0].completedSlices).toBe(2);
    expect(win.snapshots[2].completedSlices).toBe(4);
  });

  it("returns stable trend and 0% improvement for empty window", () => {
    const tracker = createConvergenceTracker(5, 0.01);
    const win = tracker.getWindow();
    expect(win.trend).toBe("stable");
    expect(win.improvementPercent).toBe(0);
    expect(win.snapshots).toHaveLength(0);
  });

  it("resets to empty window with stable trend", () => {
    const tracker = createConvergenceTracker(5, 0.01);
    tracker.addSnapshot(makeSnapshot({ completedSlices: 5 }));
    tracker.addSnapshot(makeSnapshot({ completedSlices: 8 }));
    tracker.reset();
    const win = tracker.getWindow();
    expect(win.snapshots).toHaveLength(0);
    expect(win.trend).toBe("stable");
    expect(win.improvementPercent).toBe(0);
  });
});

describe("convergence detection", () => {
  it("detects improving trend with increasing completedSlices", () => {
    const tracker = createConvergenceTracker(10, 0.01);
    for (const completed of [1, 3, 5, 7]) {
      tracker.addSnapshot(makeSnapshot({ completedSlices: completed }));
    }
    const win = tracker.getWindow();
    expect(win.trend).toBe("improving");
    // Overall improvement: (7 - 1) / 10 = 0.6 = 60%
    expect(win.improvementPercent).toBe(60);
  });

  it("detects spinning when completedSlices is flat for 3+ snapshots", () => {
    const tracker = createConvergenceTracker(10, 0.01);
    for (let i = 0; i < 4; i++) {
      tracker.addSnapshot(makeSnapshot({ completedSlices: 3 }));
    }
    const win = tracker.getWindow();
    expect(win.trend).toBe("spinning");
    expect(win.isSpinning).toBe(true);
  });

  it("detects degrading trend with decreasing completedSlices", () => {
    const tracker = createConvergenceTracker(10, 0.01);
    for (const completed of [8, 6, 4, 2]) {
      tracker.addSnapshot(makeSnapshot({ completedSlices: completed }));
    }
    const win = tracker.getWindow();
    expect(win.trend).toBe("degrading");
    // Overall improvement: (2 - 8) / 10 = -0.6 = -60%
    expect(win.improvementPercent).toBe(-60);
  });

  it("returns stable or improving for mixed but net positive progress", () => {
    const tracker = createConvergenceTracker(10, 0.01);
    // Mixed: up, down, up — net positive
    for (const completed of [2, 4, 3, 5]) {
      tracker.addSnapshot(makeSnapshot({ completedSlices: completed }));
    }
    const win = tracker.getWindow();
    // Net improvement: (5 - 2) / 10 = 0.3 = 30% → improving
    // Not spinning because some consecutive pairs have abs improvement >= 0.01
    expect(["stable", "improving"]).toContain(win.trend);
    expect(win.improvementPercent).toBeGreaterThan(0);
  });
});

describe("threshold sensitivity", () => {
  it("reports spinning when improvement is below threshold", () => {
    const tracker = createConvergenceTracker(10, 0.01);
    // 0.9% improvement per step is below the 1% threshold
    // Each pair: (completedSlices diff) / totalSlices
    // We need abs(pair improvement) < 0.01 for all pairs
    // totalSlices = 1000, diff = 1 per step → 1/1000 = 0.001 < 0.01
    for (let i = 0; i < 4; i++) {
      tracker.addSnapshot(makeSnapshot({ totalSlices: 1000, completedSlices: 100 + i }));
    }
    const win = tracker.getWindow();
    expect(win.isSpinning).toBe(true);
    expect(win.trend).toBe("spinning");
  });

  it("reports improving when improvement exceeds threshold", () => {
    const tracker = createConvergenceTracker(10, 0.01);
    // 1.5% improvement per step: diff=15, totalSlices=1000 → 15/1000 = 0.015 > 0.01
    for (let i = 0; i < 4; i++) {
      tracker.addSnapshot(makeSnapshot({ totalSlices: 1000, completedSlices: 100 + i * 15 }));
    }
    const win = tracker.getWindow();
    expect(win.isSpinning).toBe(false);
    expect(win.trend).toBe("improving");
  });
});

describe("edge cases", () => {
  it("handles window size of 1 with stable trend", () => {
    const tracker = createConvergenceTracker(1, 0.01);
    tracker.addSnapshot(makeSnapshot({ completedSlices: 5 }));
    const win = tracker.getWindow();
    expect(win.snapshots).toHaveLength(1);
    // Single snapshot: improvement = (5-5)/10 = 0 → stable
    expect(win.trend).toBe("stable");
    expect(win.improvementPercent).toBe(0);
  });

  it("returns 0 improvement when totalSlices is 0", () => {
    const tracker = createConvergenceTracker(5, 0.01);
    for (let i = 0; i < 4; i++) {
      tracker.addSnapshot(makeSnapshot({ totalSlices: 0, completedSlices: 0 }));
    }
    const win = tracker.getWindow();
    expect(win.improvementPercent).toBe(0);
    // With 4 identical snapshots and 0 improvement per pair, detectSpinning
    // returns true (all pairs below threshold with >= 3 snapshots)
    expect(win.trend).toBe("spinning");
  });

  it("does not detect spinning with only 2 snapshots", () => {
    const tracker = createConvergenceTracker(5, 0.01);
    tracker.addSnapshot(makeSnapshot({ completedSlices: 3 }));
    tracker.addSnapshot(makeSnapshot({ completedSlices: 3 }));
    const win = tracker.getWindow();
    // Only 2 snapshots — spinning needs 3+
    expect(win.isSpinning).toBe(false);
    // Improvement is 0, but not spinning → stable
    expect(win.trend).toBe("stable");
  });

  it("isSpinning() convenience method matches window.isSpinning", () => {
    const tracker = createConvergenceTracker(10, 0.01);
    // Not spinning initially
    expect(tracker.isSpinning()).toBe(tracker.getWindow().isSpinning);

    // Make it spin
    for (let i = 0; i < 4; i++) {
      tracker.addSnapshot(makeSnapshot({ completedSlices: 3 }));
    }
    expect(tracker.isSpinning()).toBe(true);
    expect(tracker.isSpinning()).toBe(tracker.getWindow().isSpinning);
  });
});
