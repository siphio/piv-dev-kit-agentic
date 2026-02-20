// PIV Supervisor — Configuration from Environment

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import type { MonitorConfig, InterventorConfig, MemoryConfig } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;      // 15 minutes
const DEFAULT_HEARTBEAT_STALE_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_MAX_RESTART_ATTEMPTS = 3;

/**
 * Load monitor configuration from environment variables with sensible defaults.
 */
export function loadMonitorConfig(): MonitorConfig {
  const pivDir = join(homedir(), ".piv");

  const intervalMs = parseInt(process.env.PIV_MONITOR_INTERVAL_MS ?? "", 10);
  const heartbeatStaleMs = parseInt(process.env.PIV_HEARTBEAT_STALE_MS ?? "", 10);
  const maxRestartAttempts = parseInt(process.env.PIV_MAX_RESTART_ATTEMPTS ?? "", 10);

  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatIdRaw = process.env.TELEGRAM_CHAT_ID;
  const telegramChatId = chatIdRaw ? parseInt(chatIdRaw, 10) : undefined;

  return {
    intervalMs: isNaN(intervalMs) ? DEFAULT_INTERVAL_MS : intervalMs,
    heartbeatStaleMs: isNaN(heartbeatStaleMs) ? DEFAULT_HEARTBEAT_STALE_MS : heartbeatStaleMs,
    maxRestartAttempts: isNaN(maxRestartAttempts) ? DEFAULT_MAX_RESTART_ATTEMPTS : maxRestartAttempts,
    registryPath: process.env.PIV_REGISTRY_PATH,
    telegramToken,
    telegramChatId: telegramChatId && !isNaN(telegramChatId) ? telegramChatId : undefined,
    improvementLogPath: process.env.PIV_IMPROVEMENT_LOG_PATH ?? join(pivDir, "improvement-log.md"),
    supervisorPidPath: process.env.PIV_SUPERVISOR_PID_PATH ?? join(pivDir, "supervisor.pid"),
  };
}

/**
 * Load interventor configuration from environment variables with sensible defaults.
 */
export function loadInterventorConfig(): InterventorConfig {
  return {
    devKitDir: process.env.PIV_DEV_KIT_DIR ?? resolve(__dirname, "..", ".."),
    diagnosisBudgetUsd: parseFloat(process.env.PIV_DIAGNOSIS_BUDGET_USD ?? "0.50"),
    fixBudgetUsd: parseFloat(process.env.PIV_FIX_BUDGET_USD ?? "2.00"),
    diagnosisMaxTurns: parseInt(process.env.PIV_DIAGNOSIS_MAX_TURNS ?? "15", 10),
    fixMaxTurns: parseInt(process.env.PIV_FIX_MAX_TURNS ?? "30", 10),
    timeoutMs: parseInt(process.env.PIV_INTERVENTION_TIMEOUT_MS ?? "300000", 10),
  };
}

/**
 * Load SuperMemory configuration from environment variables with sensible defaults.
 */
export function loadMemoryConfig(): MemoryConfig {
  const apiKey = process.env.SUPERMEMORY_API_KEY;
  return {
    apiKey,
    enabled: !!apiKey,
    containerTagPrefix: process.env.PIV_MEMORY_CONTAINER_PREFIX ?? "project_",
    searchThreshold: parseFloat(process.env.PIV_MEMORY_SEARCH_THRESHOLD ?? "0.4"),
    searchLimit: parseInt(process.env.PIV_MEMORY_SEARCH_LIMIT ?? "5", 10),
    entityContext: "This is an error fix record from a PIV supervisor agent. Extract the error pattern, root cause, fix approach, and outcome as separate searchable facts.",
  };
}
