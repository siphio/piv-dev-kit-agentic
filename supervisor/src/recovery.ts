// PIV Supervisor — Recovery Actions
// Implements PRD Section 4.2 "Fix or Escalate" and "Agent-Waiting Recovery" decision trees.

import { spawn, type ChildProcess } from "node:child_process";
import type {
  StallClassification,
  RecoveryAction,
  MonitorConfig,
  SupervisorTelegramConfig,
} from "./types.js";
import { telegramSendEscalation } from "./telegram.js";

/**
 * Determine the recovery action based on stall classification and restart history.
 *
 * PRD Section 4.2 decision trees:
 * - orchestrator_crashed → restart (always, from last known phase)
 * - session_hung → restart (escalate after 2 attempts)
 * - agent_waiting_for_input → restart_with_preamble (escalate after 3)
 * - execution_error → escalate (Phase 7 adds diagnosis)
 */
export function determineRecovery(
  classification: StallClassification,
  restartCount: number,
  maxRestartAttempts: number,
): RecoveryAction {
  const base = {
    project: classification.project,
    stallType: classification.stallType,
    details: classification.details,
    restartCount,
  };

  switch (classification.stallType) {
    case "orchestrator_crashed":
      return { ...base, type: "restart" };

    case "session_hung":
      if (restartCount >= 2) {
        return { ...base, type: "escalate" };
      }
      return { ...base, type: "restart" };

    case "agent_waiting_for_input":
      if (restartCount >= maxRestartAttempts) {
        return { ...base, type: "escalate" };
      }
      return { ...base, type: "restart_with_preamble" };

    case "execution_error":
      // Phase 7: Diagnose before escalating
      return { ...base, type: "diagnose" };

    default:
      return { ...base, type: "escalate" };
  }
}

/**
 * Kill a process by PID. Sends SIGTERM, waits, then verifies death.
 * Never throws — returns success/failure.
 */
export async function killProcess(pid: number): Promise<boolean> {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // PID already dead or no permission — that's fine
    return true;
  }

  // Wait 2 seconds for process to exit
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Verify the process is dead
  try {
    process.kill(pid, 0);
    // Still alive — try SIGKILL
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // ignore
    }
    return false;
  } catch {
    // Dead — success
    return true;
  }
}

/**
 * Spawn a new orchestrator process for a project.
 * Detached + unref so supervisor doesn't wait for it.
 */
export function spawnOrchestrator(
  projectPath: string,
  preamble?: string,
): ChildProcess | null {
  const env: Record<string, string> = { ...process.env as Record<string, string> };
  if (preamble) {
    env.PIV_AUTONOMOUS_PREAMBLE = preamble;
  }

  try {
    const child = spawn("npx", ["tsx", ".claude/orchestrator/src/index.ts"], {
      cwd: projectPath,
      detached: true,
      stdio: "ignore",
      env,
    });
    child.unref();
    return child;
  } catch {
    return null;
  }
}

/**
 * Execute a recovery action.
 * Returns a description of what happened for the improvement log.
 */
export async function executeRecovery(
  action: RecoveryAction,
  config: MonitorConfig,
): Promise<string> {
  const pid = action.project.orchestratorPid;

  switch (action.type) {
    case "restart": {
      if (pid !== null) {
        await killProcess(pid);
      }
      const child = spawnOrchestrator(action.project.path);
      if (child) {
        return `Killed PID ${pid ?? "none"}, restarted orchestrator (new PID ${child.pid ?? "unknown"})`;
      }
      return `Killed PID ${pid ?? "none"}, failed to spawn new orchestrator`;
    }

    case "restart_with_preamble": {
      if (pid !== null) {
        await killProcess(pid);
      }
      const preamble = action.restartCount >= 2 ? "strict-no-ask" : "strict";
      const child = spawnOrchestrator(action.project.path, preamble);
      if (child) {
        return `Killed PID ${pid ?? "none"}, restarted with ${preamble} preamble (new PID ${child.pid ?? "unknown"})`;
      }
      return `Killed PID ${pid ?? "none"}, failed to spawn new orchestrator with preamble`;
    }

    case "escalate": {
      if (config.telegramToken && config.telegramChatId) {
        const telegramConfig: SupervisorTelegramConfig = {
          token: config.telegramToken,
          chatId: config.telegramChatId,
        };
        const result = await telegramSendEscalation(
          telegramConfig,
          action.project.name,
          action.project.currentPhase,
          action.stallType,
          action.details,
          `Escalated after ${action.restartCount} restart(s)`,
          action.restartCount,
          config.maxRestartAttempts,
        );
        if (result.ok) {
          return `Escalated to Telegram: ${action.details}`;
        }
        return `Escalation failed (Telegram error: ${result.description ?? "unknown"}), logged locally`;
      }
      return `Escalation required but no Telegram configured — logged locally only`;
    }

    case "diagnose":
      // Diagnosis is handled by the monitor loop (interventor integration)
      // This case is returned as a marker for the monitor to dispatch
      return "Diagnosis requested — delegated to interventor";

    case "skip":
      return "No action needed";

    default:
      return `Unknown action type: ${action.type}`;
  }
}
