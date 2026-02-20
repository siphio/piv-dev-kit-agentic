// PIV Supervisor — Main Monitor Loop
// Polls the central registry, detects stalls, triggers recovery, logs interventions.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { readCentralRegistry, writeCentralRegistry } from "./registry.js";
import { classifyStall } from "./classifier.js";
import { determineRecovery, executeRecovery, killProcess, spawnOrchestrator } from "./recovery.js";
import { appendToImprovementLog } from "./improvement-log.js";
import { loadInterventorConfig } from "./config.js";
import {
  diagnoseStall,
  classifyBugLocation,
  applyFrameworkHotFix,
  applyProjectFix,
  shouldEscalate,
} from "./interventor.js";
import { propagateFixToProjects, getOutdatedProjects } from "./propagator.js";
import { telegramSendFixFailure } from "./telegram.js";
import type {
  MonitorConfig,
  MonitorCycleResult,
  StallClassification,
  SupervisorTelegramConfig,
} from "./types.js";

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
    interventionsAttempted: 0,
  };

  const registry = readCentralRegistry(config.registryPath);
  const projects = Object.values(registry.projects);

  // First pass: classify all stalls
  const stallClassifications: StallClassification[] = [];
  for (const project of projects) {
    if (project.status !== "running") continue;
    result.projectsChecked++;

    const classification = classifyStall(project, config);
    if (classification) {
      stallClassifications.push(classification);
    }
  }

  result.stalled = stallClassifications.length;

  // Process each stalled project
  for (const classification of stallClassifications) {
    const project = classification.project;
    const restartCount = getRestartCount(project.name, project.currentPhase);
    const action = determineRecovery(classification, restartCount, config.maxRestartAttempts);

    let outcome: string;

    if (action.type === "diagnose") {
      // Phase 7: Interventor-based diagnosis and fixing
      result.interventionsAttempted++;
      outcome = await handleDiagnosis(classification, stallClassifications, config);

      if (outcome.startsWith("Fixed")) {
        result.recovered++;
        project.status = "running";
        project.heartbeat = new Date().toISOString();
      } else {
        result.escalated++;
        project.status = "stalled";
      }
    } else {
      outcome = await executeRecovery(action, config);

      if (action.type === "restart" || action.type === "restart_with_preamble") {
        incrementRestartCount(project.name, project.currentPhase);
        result.recovered++;
        project.status = "running";
        project.heartbeat = new Date().toISOString();
      } else if (action.type === "escalate") {
        result.escalated++;
        project.status = "stalled";
      }
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
  }

  writeCentralRegistry(registry, config.registryPath);

  console.log(
    `Monitor cycle complete: ${result.projectsChecked} checked, ${result.stalled} stalled, ${result.recovered} recovered, ${result.escalated} escalated, ${result.interventionsAttempted} interventions`,
  );

  return result;
}

/**
 * Handle diagnosis-based intervention for execution_error stalls.
 * Runs the full interventor pipeline: diagnose → classify → fix → propagate.
 */
async function handleDiagnosis(
  classification: StallClassification,
  allStalled: StallClassification[],
  config: MonitorConfig,
): Promise<string> {
  const interventorConfig = loadInterventorConfig();
  const project = classification.project;

  // Step 1: Diagnose
  const diagnostic = await diagnoseStall(project, classification, interventorConfig);
  const classified = classifyBugLocation(diagnostic, allStalled);

  // Step 2: Check if we should escalate immediately
  if (shouldEscalate(classified, false)) {
    if (config.telegramToken && config.telegramChatId) {
      const tgConfig: SupervisorTelegramConfig = {
        token: config.telegramToken,
        chatId: config.telegramChatId,
      };
      await telegramSendFixFailure(tgConfig, project.name, project.currentPhase, classified, {
        success: false,
        filePath: classified.filePath ?? "unknown",
        linesChanged: 0,
        validationPassed: false,
        revertedOnFailure: false,
        details: "Escalated without fix attempt — " + classified.rootCause,
        sessionCostUsd: 0,
      });
    }
    return `Escalated: ${classified.rootCause}`;
  }

  // Step 3: Apply fix based on bug location
  let fixResult;
  if (classified.bugLocation === "framework_bug") {
    fixResult = await applyFrameworkHotFix(classified, interventorConfig);

    if (fixResult.success) {
      // Propagate to all outdated projects
      const outdated = getOutdatedProjects(
        project.pivCommandsVersion,
        config.registryPath,
      );
      if (outdated.length > 0) {
        propagateFixToProjects(fixResult.filePath, outdated, interventorConfig);
      }

      // Restart the stalled orchestrator
      const pid = project.orchestratorPid;
      if (pid !== null) {
        await killProcess(pid);
      }
      spawnOrchestrator(project.path);

      return `Fixed framework bug in ${fixResult.filePath}, propagated to ${outdated.length} project(s)`;
    }
  } else if (classified.bugLocation === "project_bug") {
    fixResult = await applyProjectFix(project, classified, interventorConfig);

    if (fixResult.success) {
      // Restart the stalled orchestrator
      const pid = project.orchestratorPid;
      if (pid !== null) {
        await killProcess(pid);
      }
      spawnOrchestrator(project.path);

      return `Fixed project bug in ${fixResult.filePath}`;
    }
  }

  // Step 4: Fix failed — escalate
  if (fixResult && !fixResult.success && config.telegramToken && config.telegramChatId) {
    const tgConfig: SupervisorTelegramConfig = {
      token: config.telegramToken,
      chatId: config.telegramChatId,
    };
    await telegramSendFixFailure(
      tgConfig,
      project.name,
      project.currentPhase,
      classified,
      fixResult,
    );
  }

  return `Escalated: fix failed — ${fixResult?.details ?? classified.rootCause}`;
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
