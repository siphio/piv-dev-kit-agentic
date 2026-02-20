// PIV Supervisor — Stall Classification
// Implements PRD Section 4.2 "Stall Classification" decision tree.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import type { RegistryProject, StallClassification, MonitorConfig } from "./types.js";

/**
 * Check if a process with the given PID is alive.
 * Mirrors registry.ts isProcessAlive() pattern.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true; // exists but no permission
    return false; // ESRCH = no such process
  }
}

interface ManifestSnapshot {
  failures?: Array<{ resolution?: string }>;
  last_updated?: string;
}

/**
 * Read a project's manifest to look for clues about stall type.
 */
function readProjectManifest(projectPath: string): ManifestSnapshot | null {
  const manifestPath = join(projectPath, ".agents", "manifest.yaml");
  if (!existsSync(manifestPath)) return null;

  try {
    const content = readFileSync(manifestPath, "utf-8");
    return yaml.load(content) as ManifestSnapshot;
  } catch {
    return null;
  }
}

/**
 * Classify the stall type for a project.
 *
 * Returns null if the project is healthy (heartbeat is fresh).
 *
 * Decision tree (PRD Section 4.2):
 * - heartbeat stale AND PID dead → orchestrator_crashed
 * - heartbeat stale AND PID alive AND pending failure in manifest → execution_error
 * - heartbeat stale AND PID alive AND manifest last_updated also stale → session_hung
 * - heartbeat stale AND PID alive (default) → session_hung
 */
export function classifyStall(
  project: RegistryProject,
  config: MonitorConfig,
): StallClassification | null {
  // Compute heartbeat age
  const heartbeatTime = project.heartbeat ? new Date(project.heartbeat).getTime() : 0;
  const now = Date.now();
  const heartbeatAgeMs = now - heartbeatTime;

  // Future timestamps (clock skew) → treat as fresh
  if (heartbeatAgeMs < 0) return null;

  // Heartbeat is fresh — not stalled
  if (heartbeatAgeMs < config.heartbeatStaleMs) return null;

  // Heartbeat is stale — classify
  const pid = project.orchestratorPid;

  // No PID or PID is dead → orchestrator_crashed
  if (pid === null || !isProcessAlive(pid)) {
    return {
      project,
      stallType: "orchestrator_crashed",
      confidence: "high",
      details: pid === null
        ? "No orchestrator PID recorded"
        : `PID ${pid} is dead`,
      heartbeatAgeMs,
    };
  }

  // PID alive — read manifest for clues
  const manifest = readProjectManifest(project.path);

  if (manifest) {
    // Check for pending failures
    const pendingFailures = (manifest.failures ?? []).filter(
      (f) => f.resolution === "pending",
    );
    if (pendingFailures.length > 0) {
      return {
        project,
        stallType: "execution_error",
        confidence: "high",
        details: `PID ${pid} alive, ${pendingFailures.length} pending failure(s) in manifest`,
        heartbeatAgeMs,
      };
    }

    // Check if manifest itself is stale
    if (manifest.last_updated) {
      const manifestAge = now - new Date(manifest.last_updated).getTime();
      if (manifestAge > config.heartbeatStaleMs) {
        return {
          project,
          stallType: "session_hung",
          confidence: "medium",
          details: `PID ${pid} alive, manifest also stale (${Math.round(manifestAge / 60000)} min)`,
          heartbeatAgeMs,
        };
      }
    }
  }

  // Default: PID alive, heartbeat stale, no clear clues
  return {
    project,
    stallType: "session_hung",
    confidence: "low",
    details: `PID ${pid} alive, heartbeat stale (${Math.round(heartbeatAgeMs / 60000)} min), no manifest clues`,
    heartbeatAgeMs,
  };
}
