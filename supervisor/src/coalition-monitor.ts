// PIV Supervisor — Coalition Monitor
// Builds CoalitionSnapshot from manifest and computes health metrics.
// Implements PRD Phase 12 "Strategic Supervisor Coalition Intelligence".

import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import type {
  CoalitionSnapshot,
  CoalitionHealthMetrics,
  CoalitionHealthStatus,
  CoalitionMonitorConfig,
} from "./types.js";

// --- Internal helpers ---

interface SliceEntry {
  status?: string;
}

interface ModuleEntry {
  slices?: SliceEntry[];
  activeAgents?: number;
}

interface PhaseEntry {
  plan_status?: string;
  execution_status?: string;
  validation_status?: string;
}

interface ExecutionEntry {
  status?: string;
}

interface ManifestData {
  modules?: Record<string, ModuleEntry>;
  phases?: Record<string, PhaseEntry>;
  execution?: ExecutionEntry[];
  totalCostUsd?: number;
  settings?: { budgetLimitUsd?: number };
  conflicts?: unknown[];
}

/**
 * Normalise a status string to one of the tracked categories.
 * Returns null for unrecognised statuses so callers can skip them.
 */
function normaliseSliceStatus(
  raw: string | undefined,
): "complete" | "failed" | "blocked" | "running" | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === "complete" || lower === "completed" || lower === "done") return "complete";
  if (lower === "failed" || lower === "error") return "failed";
  if (lower === "blocked") return "blocked";
  if (lower === "running" || lower === "in_progress" || lower === "in-progress") return "running";
  return null;
}

/**
 * Count slices from monorepo-mode modules.
 */
function countModuleSlices(modules: Record<string, ModuleEntry>): {
  total: number;
  completed: number;
  failed: number;
  blocked: number;
  running: number;
  activeAgents: number;
} {
  let total = 0;
  let completed = 0;
  let failed = 0;
  let blocked = 0;
  let running = 0;
  let activeAgents = 0;

  for (const mod of Object.values(modules)) {
    if (mod.activeAgents && typeof mod.activeAgents === "number") {
      activeAgents += mod.activeAgents;
    }
    const slices = mod.slices ?? [];
    for (const slice of slices) {
      total++;
      const status = normaliseSliceStatus(slice.status);
      if (status === "complete") completed++;
      else if (status === "failed") failed++;
      else if (status === "blocked") blocked++;
      else if (status === "running") running++;
    }
  }

  return { total, completed, failed, blocked, running, activeAgents };
}

/**
 * Count slices from classic-mode phases.
 * Each phase contributes up to 3 "slices": plan, execution, validation.
 */
function countPhaseSlices(phases: Record<string, PhaseEntry>): {
  total: number;
  completed: number;
  failed: number;
  blocked: number;
  running: number;
} {
  let total = 0;
  let completed = 0;
  let failed = 0;
  let blocked = 0;
  let running = 0;

  for (const phase of Object.values(phases)) {
    const statusFields = [phase.plan_status, phase.execution_status, phase.validation_status];
    for (const raw of statusFields) {
      if (!raw) continue;
      total++;
      const status = normaliseSliceStatus(raw);
      if (status === "complete") completed++;
      else if (status === "failed") failed++;
      else if (status === "blocked") blocked++;
      else if (status === "running") running++;
    }
  }

  return { total, completed, failed, blocked, running };
}

/**
 * Count active agents from execution entries (classic mode fallback).
 */
function countActiveAgentsFromExecution(execution: ExecutionEntry[]): number {
  let count = 0;
  for (const entry of execution) {
    const lower = (entry.status ?? "").toLowerCase();
    if (lower === "in_progress" || lower === "in-progress" || lower === "running") {
      count++;
    }
  }
  return count;
}

// --- Exported functions ---

/**
 * Build a CoalitionSnapshot from a manifest file.
 *
 * Handles both monorepo mode (manifest has `modules` key with slices)
 * and classic mode (manifest has `phases` key).
 *
 * Returns null if the manifest is unreadable or unparseable.
 */
export function buildCoalitionSnapshot(
  config: CoalitionMonitorConfig,
): CoalitionSnapshot | null {
  let raw: string;
  try {
    raw = readFileSync(config.manifestPath, "utf-8");
  } catch {
    return null;
  }

  let manifest: ManifestData;
  try {
    manifest = yaml.load(raw) as ManifestData;
  } catch {
    return null;
  }

  if (!manifest || typeof manifest !== "object") {
    return null;
  }

  let totalSlices = 0;
  let completedSlices = 0;
  let failedSlices = 0;
  let blockedSlices = 0;
  let runningSlices = 0;
  let activeAgents = 0;

  const isMonorepo = manifest.modules && typeof manifest.modules === "object";

  if (isMonorepo) {
    const counts = countModuleSlices(manifest.modules!);
    totalSlices = counts.total;
    completedSlices = counts.completed;
    failedSlices = counts.failed;
    blockedSlices = counts.blocked;
    runningSlices = counts.running;
    activeAgents = counts.activeAgents;
  } else if (manifest.phases && typeof manifest.phases === "object") {
    const counts = countPhaseSlices(manifest.phases);
    totalSlices = counts.total;
    completedSlices = counts.completed;
    failedSlices = counts.failed;
    blockedSlices = counts.blocked;
    runningSlices = counts.running;
  }

  // Fallback active agents from execution entries
  if (activeAgents === 0 && Array.isArray(manifest.execution)) {
    activeAgents = countActiveAgentsFromExecution(manifest.execution);
  }

  const totalCostUsd = typeof manifest.totalCostUsd === "number" ? manifest.totalCostUsd : 0;
  const budgetLimitUsd =
    manifest.settings && typeof manifest.settings.budgetLimitUsd === "number"
      ? manifest.settings.budgetLimitUsd
      : 100;
  const conflictsDetected = Array.isArray(manifest.conflicts) ? manifest.conflicts.length : 0;

  // Compute health metrics for classification (using snapshot-only data, no previous)
  const metrics = computeHealthMetrics(
    {
      timestamp: "",
      activeAgents,
      totalSlices,
      completedSlices,
      failedSlices,
      blockedSlices,
      runningSlices,
      totalCostUsd,
      budgetLimitUsd,
      conflictsDetected,
      healthStatus: "healthy", // placeholder, will be overwritten
    },
    null,
    1, // default 1 hour elapsed for single-snapshot classification
  );

  const healthStatus = classifyHealth(metrics, config);

  return {
    timestamp: new Date().toISOString(),
    activeAgents,
    totalSlices,
    completedSlices,
    failedSlices,
    blockedSlices,
    runningSlices,
    totalCostUsd,
    budgetLimitUsd,
    conflictsDetected,
    healthStatus,
  };
}

/**
 * Compute health metrics from current and optional previous snapshot.
 *
 * - convergenceRate: completed slices per hour
 * - failureRate: fraction of finished slices that failed
 * - costPerSlice: cost per completed slice
 * - conflictFrequency: conflicts per hour
 *
 * Guards against division by zero in all computations.
 */
export function computeHealthMetrics(
  current: CoalitionSnapshot,
  previous: CoalitionSnapshot | null,
  elapsedHours: number,
): CoalitionHealthMetrics {
  const safeElapsed = elapsedHours > 0 ? elapsedHours : 1;

  const convergenceRate =
    (current.completedSlices - (previous?.completedSlices ?? 0)) / safeElapsed;

  const finished = current.completedSlices + current.failedSlices;
  const failureRate = finished > 0 ? current.failedSlices / finished : 0;

  const costPerSlice =
    current.completedSlices > 0 ? current.totalCostUsd / current.completedSlices : 0;

  const conflictFrequency = current.conflictsDetected / safeElapsed;

  return {
    convergenceRate,
    failureRate,
    costPerSlice,
    conflictFrequency,
  };
}

/**
 * Classify overall coalition health from metrics and config thresholds.
 *
 * - healthy:  converging AND failure rate below degraded threshold
 * - degraded: converging AND failure rate below critical threshold
 * - spinning: not converging (convergenceRate <= 0)
 * - critical: failure rate at or above critical threshold
 */
export function classifyHealth(
  metrics: CoalitionHealthMetrics,
  config: CoalitionMonitorConfig,
): CoalitionHealthStatus {
  if (metrics.convergenceRate > 0 && metrics.failureRate < config.failureRateDegraded) {
    return "healthy";
  }
  if (metrics.convergenceRate > 0 && metrics.failureRate < config.failureRateCritical) {
    return "degraded";
  }
  if (metrics.convergenceRate <= 0) {
    return "spinning";
  }
  return "critical";
}
