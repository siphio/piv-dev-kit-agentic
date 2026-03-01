// PIV Supervisor — Strategic Interventor
// Decision engine for coalition-level strategic actions.
// Implements PRD Phase 12 "Strategic Supervisor Coalition Intelligence".
// Pure functions: accept config + data, return typed results. Never throw.

import { readFileSync, writeFileSync } from "node:fs";
import yaml from "js-yaml";
import type {
  CoalitionSnapshot,
  CoalitionMonitorConfig,
  ConvergenceWindow,
  ConflictDetection,
  StrategicAction,
} from "./types.js";

// --- Internal helpers ---

interface ExecutionEntry {
  agent?: string;
  status?: string;
  started_at?: string;
  last_progress?: string;
  slice?: string;
}

interface ManifestNotification {
  timestamp: string;
  type: string;
  severity: string;
  category: string;
  phase: number | null;
  details: string;
  blocking: boolean;
  action_taken: string;
  acknowledged: boolean;
}

interface ManifestData {
  notifications?: ManifestNotification[];
  execution?: ExecutionEntry[];
  [key: string]: unknown;
}

/**
 * Build a StrategicAction with standard timestamp and health fields.
 */
function buildAction(
  type: StrategicAction["type"],
  target: string,
  reason: string,
  healthStatus: CoalitionSnapshot["healthStatus"],
): StrategicAction {
  return {
    type,
    target,
    reason,
    coalitionHealth: healthStatus,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Read and parse a YAML manifest. Returns null on any error.
 */
function readManifest(manifestPath: string): ManifestData | null {
  try {
    const raw = readFileSync(manifestPath, "utf-8");
    const data = yaml.load(raw) as ManifestData;
    if (!data || typeof data !== "object") return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Write a manifest back to disk. Returns true on success.
 */
function writeManifest(manifestPath: string, data: ManifestData): boolean {
  try {
    writeFileSync(manifestPath, yaml.dump(data, { lineWidth: 120 }), "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Append a notification entry to the manifest's notifications array.
 * Reads, appends, writes. Returns true on success, false on any error.
 */
function appendManifestNotification(
  manifestPath: string,
  action: StrategicAction,
): boolean {
  const manifest = readManifest(manifestPath);
  if (!manifest) return false;

  if (!Array.isArray(manifest.notifications)) {
    manifest.notifications = [];
  }

  const notification: ManifestNotification = {
    timestamp: action.timestamp,
    type: action.type === "escalate" ? "escalation" : "info",
    severity: action.type === "pause_coalition" ? "critical" : "warning",
    category: action.type,
    phase: null,
    details: `${action.type}: ${action.reason} (target: ${action.target})`,
    blocking: false,
    action_taken: `Strategic interventor emitted ${action.type} for ${action.target}`,
    acknowledged: false,
  };

  manifest.notifications.push(notification);
  return writeManifest(manifestPath, manifest);
}

// --- Exported functions ---

/**
 * Determine the set of strategic actions for the current coalition state.
 *
 * Decision trees (evaluated in priority order):
 * 1. Critical health → pause_coalition + escalate
 * 2. Spinning convergence → pause least-progressing agent
 * 3. Budget >= 90% → deprioritize non-critical agents
 * 4. Conflict requiring escalation → escalate to human
 * 5. Conflict with upstream winner → resolve_conflict on downstream agent
 *
 * Returns an empty array for a healthy coalition with no issues.
 */
export function determineStrategicActions(
  snapshot: CoalitionSnapshot,
  convergence: ConvergenceWindow,
  conflicts: ConflictDetection | null,
  _config: CoalitionMonitorConfig,
): StrategicAction[] {
  const actions: StrategicAction[] = [];

  // 1. Critical health → pause everything + escalate
  if (snapshot.healthStatus === "critical") {
    actions.push(
      buildAction(
        "pause_coalition",
        "all",
        "Coalition health is critical — pausing all agents",
        snapshot.healthStatus,
      ),
    );
    actions.push(
      buildAction(
        "escalate",
        "human",
        "Coalition health is critical — human intervention required",
        snapshot.healthStatus,
      ),
    );
  }

  // 2. Spinning convergence → pause least-progressing agent
  if (convergence.isSpinning) {
    actions.push(
      buildAction(
        "pause_agent",
        "least-progressing-agent",
        `Coalition is spinning — convergence trend: ${convergence.trend}, improvement: ${convergence.improvementPercent.toFixed(1)}%`,
        snapshot.healthStatus,
      ),
    );
  }

  // 3. Budget approaching limit (>= 90%)
  if (snapshot.budgetLimitUsd > 0 && snapshot.totalCostUsd >= snapshot.budgetLimitUsd * 0.9) {
    actions.push(
      buildAction(
        "deprioritize",
        "non-critical-agents",
        `Budget at ${((snapshot.totalCostUsd / snapshot.budgetLimitUsd) * 100).toFixed(0)}% — deprioritizing non-critical agents`,
        snapshot.healthStatus,
      ),
    );
  }

  // 4. Conflict requiring escalation
  if (conflicts?.hasConflict && conflicts.resolution === "escalate") {
    actions.push(
      buildAction(
        "escalate",
        "human",
        `Conflict between ${conflicts.agentA} and ${conflicts.agentB} on files: ${conflicts.conflictingFiles.join(", ")}${conflicts.isArchitectural ? " (architectural)" : ""}`,
        snapshot.healthStatus,
      ),
    );
  }

  // 5. Conflict with upstream winner → resolve on downstream agent
  if (conflicts?.hasConflict && conflicts.resolution === "upstream_wins") {
    actions.push(
      buildAction(
        "resolve_conflict",
        conflicts.agentB,
        `Upstream agent ${conflicts.agentA} wins conflict on files: ${conflicts.conflictingFiles.join(", ")} — ${conflicts.agentB} must rebase`,
        snapshot.healthStatus,
      ),
    );
  }

  return actions;
}

/**
 * Execute a strategic action by writing it to the manifest.
 *
 * - pause_agent / pause_coalition / deprioritize / reallocate: append notification to manifest
 * - resolve_conflict: append resolution instruction to manifest
 * - escalate: returns false (caller handles Telegram notification)
 *
 * Never throws — all I/O in try/catch, returns false on error.
 */
export function executeStrategicAction(
  action: StrategicAction,
  config: CoalitionMonitorConfig,
): boolean {
  try {
    switch (action.type) {
      case "pause_agent":
      case "pause_coalition":
      case "deprioritize":
      case "reallocate":
        return appendManifestNotification(config.manifestPath, action);

      case "resolve_conflict":
        return appendManifestNotification(config.manifestPath, action);

      case "escalate":
        // Caller handles escalation (Telegram notification)
        return false;

      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Determine whether the coalition should be paused entirely.
 *
 * Returns true if any of:
 * - Budget exceeded (totalCostUsd >= budgetLimitUsd)
 * - Failure rate > 50% (failedSlices / (completedSlices + failedSlices))
 * - Dead coalition (no active agents, no running slices, but work remains)
 */
export function shouldPauseCoalition(snapshot: CoalitionSnapshot): boolean {
  // Budget exceeded
  if (snapshot.totalCostUsd >= snapshot.budgetLimitUsd) {
    return true;
  }

  // Failure rate > 50% (guard against zero division)
  const finished = snapshot.completedSlices + snapshot.failedSlices;
  if (finished > 0 && snapshot.failedSlices / finished > 0.5) {
    return true;
  }

  // Dead coalition: nothing active but work remains
  if (
    snapshot.activeAgents === 0 &&
    snapshot.runningSlices === 0 &&
    snapshot.completedSlices < snapshot.totalSlices
  ) {
    return true;
  }

  return false;
}

/**
 * Identify the agent most likely to be stuck by examining manifest execution entries.
 *
 * Looks for agents with:
 * - Longest elapsed time since start with no recent progress
 * - Status still "running" / "in_progress"
 *
 * Returns the agent identifier string, or null if no stuck agent is found.
 * Never throws — returns null on any error.
 */
export function identifyStuckAgent(
  _snapshot: CoalitionSnapshot,
  manifestPath: string,
): string | null {
  try {
    const manifest = readManifest(manifestPath);
    if (!manifest) return null;

    const execution = manifest.execution;
    if (!Array.isArray(execution) || execution.length === 0) return null;

    let stuckAgent: string | null = null;
    let longestStaleDuration = 0;
    const now = Date.now();

    for (const entry of execution) {
      if (!entry.agent) continue;

      const status = (entry.status ?? "").toLowerCase();
      const isActive = status === "running" || status === "in_progress" || status === "in-progress";
      if (!isActive) continue;

      // Use last_progress if available, otherwise fall back to started_at
      const progressTimestamp = entry.last_progress ?? entry.started_at;
      if (!progressTimestamp) continue;

      const progressTime = new Date(progressTimestamp).getTime();
      if (Number.isNaN(progressTime)) continue;

      const staleDuration = now - progressTime;
      if (staleDuration > longestStaleDuration) {
        longestStaleDuration = staleDuration;
        stuckAgent = entry.agent;
      }
    }

    return stuckAgent;
  } catch {
    return null;
  }
}
