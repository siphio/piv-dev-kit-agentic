// PIV Supervisor — Convergence Tracker
// Sliding window convergence analysis for coalition intelligence.

import type { CoalitionSnapshot, ConvergenceWindow } from "./types.js";

/**
 * Interface for a convergence tracker that monitors coalition progress
 * over a sliding window of snapshots.
 */
export interface ConvergenceTracker {
  addSnapshot(snapshot: CoalitionSnapshot): ConvergenceWindow;
  getWindow(): ConvergenceWindow;
  isSpinning(): boolean;
  reset(): void;
}

/**
 * Build an empty ConvergenceWindow with safe defaults.
 */
function emptyWindow(windowSize: number): ConvergenceWindow {
  return {
    snapshots: [],
    windowSize,
    isSpinning: false,
    trend: "stable",
    improvementPercent: 0,
  };
}

/**
 * Compute improvement ratio between two snapshots.
 * Returns 0 when totalSlices is 0 (avoids division by zero).
 */
function computeImprovement(
  first: CoalitionSnapshot,
  last: CoalitionSnapshot,
): number {
  if (first.totalSlices === 0) return 0;
  return (last.completedSlices - first.completedSlices) / first.totalSlices;
}

/**
 * Detect spinning: need >= 3 snapshots, and every consecutive pair
 * shows improvement below the threshold.
 */
function detectSpinning(
  snapshots: CoalitionSnapshot[],
  spinningThreshold: number,
): boolean {
  if (snapshots.length < 3) return false;

  for (let i = 0; i < snapshots.length - 1; i++) {
    const pairImprovement = computeImprovement(snapshots[i], snapshots[i + 1]);
    if (Math.abs(pairImprovement) >= spinningThreshold) {
      return false;
    }
  }

  return true;
}

/**
 * Determine trend from improvement value, spinning state, and threshold.
 */
function computeTrend(
  improvement: number,
  spinning: boolean,
  spinningThreshold: number,
): ConvergenceWindow["trend"] {
  if (spinning) return "spinning";
  if (improvement > spinningThreshold) return "improving";
  if (improvement < -spinningThreshold) return "degrading";
  return "stable";
}

/**
 * Create a convergence tracker with a sliding window of fixed size.
 *
 * @param windowSize    Maximum number of snapshots retained in the window.
 * @param spinningThreshold  Minimum improvement ratio to count as progress.
 * @returns ConvergenceTracker backed by in-memory state.
 */
export function createConvergenceTracker(
  windowSize: number,
  spinningThreshold: number,
): ConvergenceTracker {
  // Internal state — closure-scoped, never exposed directly.
  let snapshots: CoalitionSnapshot[] = [];

  function buildWindow(): ConvergenceWindow {
    if (snapshots.length === 0) {
      return emptyWindow(windowSize);
    }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    const improvement = computeImprovement(first, last);
    const spinning = detectSpinning(snapshots, spinningThreshold);
    const trend = computeTrend(improvement, spinning, spinningThreshold);

    return {
      snapshots: [...snapshots],
      windowSize,
      isSpinning: spinning,
      trend,
      improvementPercent: improvement * 100,
    };
  }

  return {
    addSnapshot(snapshot: CoalitionSnapshot): ConvergenceWindow {
      snapshots.push(snapshot);
      if (snapshots.length > windowSize) {
        snapshots = snapshots.slice(snapshots.length - windowSize);
      }
      return buildWindow();
    },

    getWindow(): ConvergenceWindow {
      return buildWindow();
    },

    isSpinning(): boolean {
      return detectSpinning(snapshots, spinningThreshold);
    },

    reset(): void {
      snapshots = [];
    },
  };
}
