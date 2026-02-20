// PIV Supervisor — Configuration from Environment

import { homedir } from "node:os";
import { join } from "node:path";
import type { MonitorConfig } from "./types.js";

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
