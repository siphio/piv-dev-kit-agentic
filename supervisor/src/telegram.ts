// PIV Supervisor — Direct HTTP Telegram Client
// Uses fetch + @grammyjs/types for type safety. No framework dependency.

import type { SupervisorTelegramConfig, StallType, DiagnosticResult, HotFixResult, CoalitionSnapshot, StrategicAction, ConflictDetection, ConvergenceWindow } from "./types.js";

const TELEGRAM_BASE = "https://api.telegram.org";
const MAX_MESSAGE_LENGTH = 4096;

interface TelegramApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  text?: string;
}

/**
 * Escape HTML special characters in dynamic content.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Split a message at newline boundaries so each chunk is <= MAX_MESSAGE_LENGTH.
 */
export function splitMessage(text: string): string[] {
  if (text.length <= MAX_MESSAGE_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= MAX_MESSAGE_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Find last newline within limit
    let splitIdx = remaining.lastIndexOf("\n", MAX_MESSAGE_LENGTH);
    if (splitIdx <= 0) {
      // No newline found — hard split at limit
      splitIdx = MAX_MESSAGE_LENGTH;
    }

    chunks.push(remaining.slice(0, splitIdx));
    remaining = remaining.slice(splitIdx + 1);
  }

  return chunks;
}

async function callTelegram<T>(
  config: SupervisorTelegramConfig,
  method: string,
  body?: Record<string, unknown>,
): Promise<TelegramApiResponse<T>> {
  const url = `${TELEGRAM_BASE}/bot${config.token}/${method}`;

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });

    return await resp.json() as TelegramApiResponse<T>;
  } catch (err) {
    return {
      ok: false,
      description: `Network error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Verify bot token is valid by calling getMe.
 */
export async function telegramGetMe(
  config: SupervisorTelegramConfig,
): Promise<TelegramApiResponse<TelegramUser>> {
  return callTelegram<TelegramUser>(config, "getMe");
}

/**
 * Send a text message. Splits if > 4096 chars. Falls back to no parse_mode on HTML error.
 */
export async function telegramSendMessage(
  config: SupervisorTelegramConfig,
  text: string,
  parseMode: string = "HTML",
): Promise<TelegramApiResponse<TelegramMessage>> {
  const chunks = splitMessage(text);
  let lastResult: TelegramApiResponse<TelegramMessage> = { ok: false, description: "No chunks" };

  for (const chunk of chunks) {
    lastResult = await callTelegram<TelegramMessage>(config, "sendMessage", {
      chat_id: config.chatId,
      text: chunk,
      parse_mode: parseMode,
    });

    // If HTML parse fails (400), retry without parse_mode
    if (!lastResult.ok && lastResult.error_code === 400 && parseMode === "HTML") {
      lastResult = await callTelegram<TelegramMessage>(config, "sendMessage", {
        chat_id: config.chatId,
        text: chunk,
      });
    }

    if (!lastResult.ok) break;
  }

  return lastResult;
}

/**
 * Send a structured escalation message.
 */
export async function telegramSendEscalation(
  config: SupervisorTelegramConfig,
  project: string,
  phase: number | null,
  stallType: StallType,
  details: string,
  actionTaken: string,
  restartCount: number,
  maxRestarts: number,
): Promise<TelegramApiResponse<TelegramMessage>> {
  const message = [
    `<b>🔴 Supervisor Escalation</b>`,
    ``,
    `<b>Project:</b> ${escapeHtml(project)}`,
    `<b>Phase:</b> ${phase ?? "unknown"}`,
    `<b>Stall Type:</b> ${escapeHtml(stallType)}`,
    `<b>Details:</b> ${escapeHtml(details)}`,
    `<b>Action Taken:</b> ${escapeHtml(actionTaken)}`,
    `<b>Restarts:</b> ${restartCount}/${maxRestarts}`,
  ].join("\n");

  return telegramSendMessage(config, message, "HTML");
}

/**
 * Send a structured fix-failure escalation message.
 * Phase 7: Rich escalation with diagnosis and fix details.
 */
export async function telegramSendFixFailure(
  config: SupervisorTelegramConfig,
  project: string,
  phase: number | null,
  diagnostic: DiagnosticResult,
  fixResult: HotFixResult,
): Promise<TelegramApiResponse<TelegramMessage>> {
  const message = [
    `<b>🔴 Hot Fix Failed — Escalation</b>`,
    ``,
    `<b>Project:</b> ${escapeHtml(project)}`,
    `<b>Phase:</b> ${phase ?? "unknown"}`,
    `<b>Bug Type:</b> ${escapeHtml(diagnostic.bugLocation)}`,
    `<b>Root Cause:</b> ${escapeHtml(diagnostic.rootCause)}`,
    `<b>File:</b> ${escapeHtml(diagnostic.filePath ?? "unknown")}`,
    `<b>Fix Attempted:</b> ${escapeHtml(fixResult.details)}`,
    `<b>Validation:</b> ${fixResult.validationPassed ? "Passed" : "Failed"}`,
    `<b>Fix Cost:</b> $${fixResult.sessionCostUsd.toFixed(2)}`,
    ``,
    `<b>Action needed:</b> Manual fix required. ${fixResult.revertedOnFailure ? "Fix was reverted." : ""}`,
  ].join("\n");

  return telegramSendMessage(config, message, "HTML");
}

/**
 * Send a coalition health alert with metrics and strategic actions.
 */
export async function telegramSendCoalitionAlert(
  config: SupervisorTelegramConfig,
  snapshot: CoalitionSnapshot,
  actions: StrategicAction[],
): Promise<TelegramApiResponse<TelegramMessage>> {
  const healthEmoji =
    snapshot.healthStatus === "healthy" ? "🟢" :
    snapshot.healthStatus === "degraded" ? "🟡" :
    snapshot.healthStatus === "critical" ? "🔴" : "🔄";

  const actionLines = actions.length > 0
    ? actions.map((a) => `  • ${escapeHtml(a.type)}: ${escapeHtml(a.reason)}`).join("\n")
    : "  None";

  const message = [
    `<b>${healthEmoji} Coalition Health: ${escapeHtml(snapshot.healthStatus.toUpperCase())}</b>`,
    ``,
    `<b>Agents:</b> ${snapshot.activeAgents} active`,
    `<b>Slices:</b> ${snapshot.completedSlices}/${snapshot.totalSlices} complete, ${snapshot.failedSlices} failed, ${snapshot.runningSlices} running`,
    `<b>Cost:</b> $${snapshot.totalCostUsd.toFixed(2)} / $${snapshot.budgetLimitUsd.toFixed(2)}`,
    `<b>Conflicts:</b> ${snapshot.conflictsDetected}`,
    ``,
    `<b>Strategic Actions:</b>`,
    actionLines,
  ].join("\n");

  return telegramSendMessage(config, message, "HTML");
}

/**
 * Send a conflict detection alert.
 */
export async function telegramSendConflictAlert(
  config: SupervisorTelegramConfig,
  conflict: ConflictDetection,
): Promise<TelegramApiResponse<TelegramMessage>> {
  const files = conflict.conflictingFiles.map((f) => `  • ${escapeHtml(f)}`).join("\n");
  const upstream = conflict.upstreamAgent ?? "undetermined";

  const message = [
    `<b>⚠️ Cross-Agent File Conflict</b>`,
    ``,
    `<b>Agent A:</b> ${escapeHtml(conflict.agentA)}`,
    `<b>Agent B:</b> ${escapeHtml(conflict.agentB)}`,
    `<b>Upstream:</b> ${escapeHtml(upstream)}`,
    `<b>Architectural:</b> ${conflict.isArchitectural ? "Yes" : "No"}`,
    `<b>Resolution:</b> ${escapeHtml(conflict.resolution)}`,
    ``,
    `<b>Conflicting Files:</b>`,
    files,
  ].join("\n");

  return telegramSendMessage(config, message, "HTML");
}

/**
 * Send a convergence trend warning.
 */
export async function telegramSendConvergenceWarning(
  config: SupervisorTelegramConfig,
  convergence: ConvergenceWindow,
): Promise<TelegramApiResponse<TelegramMessage>> {
  const trendEmoji =
    convergence.trend === "improving" ? "📈" :
    convergence.trend === "degrading" ? "📉" :
    convergence.trend === "spinning" ? "🔄" : "➡️";

  const message = [
    `<b>${trendEmoji} Convergence Warning</b>`,
    ``,
    `<b>Trend:</b> ${escapeHtml(convergence.trend)}`,
    `<b>Snapshots:</b> ${convergence.snapshots.length}/${convergence.windowSize}`,
    `<b>Improvement:</b> ${convergence.improvementPercent.toFixed(1)}%`,
    `<b>Spinning:</b> ${convergence.isSpinning ? "Yes ⚠️" : "No"}`,
  ].join("\n");

  return telegramSendMessage(config, message, "HTML");
}
