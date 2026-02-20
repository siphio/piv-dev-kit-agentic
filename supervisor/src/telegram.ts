// PIV Supervisor — Direct HTTP Telegram Client
// Uses fetch + @grammyjs/types for type safety. No framework dependency.

import type { SupervisorTelegramConfig, StallType, DiagnosticResult, HotFixResult } from "./types.js";

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
