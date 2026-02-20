// PIV Supervisor — Main Monitor Loop
// Polls the central registry, detects stalls, triggers recovery, logs interventions.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { readCentralRegistry, writeCentralRegistry } from "./registry.js";
import { classifyStall } from "./classifier.js";
import { determineRecovery, executeRecovery } from "./recovery.js";
import { appendToImprovementLog } from "./improvement-log.js";
import type { MonitorConfig, MonitorCycleResult } from "./types.js";

/** In-memory restart tracker: projectName → { phase, count } */
const restartHistory = new Map<string, { phase: number | null; count: number }>();

/**
 * Get restart count for a project+phase. Resets if phase changed.
 */
function getRestartCount(projectName: string, phase: number | null): number {
  const entry = restartHistory.get(projectName);
  if (!entry || entry.phase !== phase) return 0;
  return entry.count;
}

/**
 * Increment restart count for a project+phase.
 */
function incrementRestartCount(projectName: string, phase: number | null): void {
  const current = getRestartCount(projectName, phase);
  restartHistory.set(projectName, { phase, count: current + 1 });
}

/**
 * Run a single monitoring cycle.
 * Reads registry, checks each running project, classifies stalls, executes recovery.
 */
export async function runMonitorCycle(config: MonitorConfig): Promise<MonitorCycleResult> {
  const result: MonitorCycleResult = {
    projectsChecked: 0,
    stalled: 0,
    recovered: 0,
    escalated: 0,
  };

  const registry = readCentralRegistry(config.registryPath);
  const projects = Object.values(registry.projects);

  for (const project of projects) {
    if (project.status !== "running") continue;
    result.projectsChecked++;

    const classification = classifyStall(project, config);
    if (!classification) continue; // healthy

    result.stalled++;

    const restartCount = getRestartCount(project.name, project.currentPhase);
    const action = determineRecovery(classification, restartCount, config.maxRestartAttempts);

    const outcome = await executeRecovery(action, config);

    // Track restart count
    if (action.type === "restart" || action.type === "restart_with_preamble") {
      incrementRestartCount(project.name, project.currentPhase);
      result.recovered++;
    }
    if (action.type === "escalate") {
      result.escalated++;
    }

    // Log the intervention
    appendToImprovementLog(
      {
        timestamp: new Date().toISOString(),
        project: project.name,
        phase: project.currentPhase,
        stallType: classification.stallType,
        action: action.type,
        outcome,
        details: classification.details,
      },
      config.improvementLogPath,
    );

    // Update registry project status
    if (action.type === "restart" || action.type === "restart_with_preamble") {
      project.status = "running";
      project.heartbeat = new Date().toISOString();
    } else if (action.type === "escalate") {
      project.status = "stalled";
    }
  }

  writeCentralRegistry(registry, config.registryPath);

  console.log(
    `Monitor cycle complete: ${result.projectsChecked} checked, ${result.stalled} stalled, ${result.recovered} recovered, ${result.escalated} escalated`,
  );

  return result;
}

/**
 * Check if another supervisor instance is running via PID file.
 */
function isAnotherSupervisorRunning(pidPath: string): boolean {
  if (!existsSync(pidPath)) return false;

  try {
    const pidStr = readFileSync(pidPath, "utf-8").trim();
    const pid = parseInt(pidStr, 10);
    if (isNaN(pid)) return false;

    process.kill(pid, 0);
    return true; // PID is alive
  } catch {
    // PID file exists but process is dead — stale PID file
    return false;
  }
}

/**
 * Start the persistent monitor loop.
 * Writes a PID file, runs cycles on interval, handles graceful shutdown.
 */
export function startMonitor(config: MonitorConfig): void {
  // Check for duplicate instance
  if (isAnotherSupervisorRunning(config.supervisorPidPath)) {
    console.error("❌ Another supervisor instance is already running.");
    console.error(`   PID file: ${config.supervisorPidPath}`);
    process.exit(1);
  }

  // Write PID file
  writeFileSync(config.supervisorPidPath, String(process.pid), "utf-8");
  console.log(`🟢 Supervisor started (PID ${process.pid})`);
  console.log(`   Interval: ${config.intervalMs / 60000} minutes`);
  console.log(`   PID file: ${config.supervisorPidPath}`);

  // Run initial cycle immediately
  runMonitorCycle(config).catch((err) => {
    console.error("Monitor cycle error:", err);
  });

  // Set up interval
  const intervalId = setInterval(() => {
    runMonitorCycle(config).catch((err) => {
      console.error("Monitor cycle error:", err);
    });
  }, config.intervalMs);

  // Graceful shutdown
  const cleanup = () => {
    console.log("\n🔴 Supervisor shutting down...");
    clearInterval(intervalId);
    try {
      unlinkSync(config.supervisorPidPath);
    } catch {
      // ignore
    }
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}
