// PIV Orchestrator — Telegram Notification Dispatch Layer

import { Bot, InlineKeyboard } from "grammy";
import type { Manifest, ApprovalRequest, ApprovalResult } from "./types.js";
import {
  tagMessage,
  splitMessage,
  formatStatusMessage,
  formatPhaseStartMessage,
  formatPhaseCompleteMessage,
  formatEscalationMessage,
  formatApprovalMessage,
  formatApprovalResultMessage,
} from "./telegram-formatter.js";

const INTER_MESSAGE_DELAY_MS = 1100; // Respect 1 msg/sec per chat rate limit
const APPROVAL_REMINDER_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Dispatches formatted notifications to Telegram.
 * All public methods are safe to call even if the bot connection has issues —
 * errors are logged but never thrown to the caller.
 */
export class TelegramNotifier {
  private bot: Bot;
  private chatId: number;
  private projectPrefix: string;
  private pendingApprovals = new Map<string, {
    resolve: (result: ApprovalResult) => void;
    reminderTimer: ReturnType<typeof setTimeout>;
  }>();

  constructor(bot: Bot, chatId: number, projectPrefix: string) {
    this.bot = bot;
    this.chatId = chatId;
    this.projectPrefix = projectPrefix;
  }

  /**
   * Send a long text message, splitting at paragraph boundaries if needed.
   * Each chunk is tagged with the project prefix.
   */
  async sendText(text: string): Promise<void> {
    const tagged = tagMessage(this.projectPrefix, text);
    const chunks = splitMessage(tagged);

    for (let i = 0; i < chunks.length; i++) {
      try {
        await this.bot.api.sendMessage(this.chatId, chunks[i], { parse_mode: "HTML" });
      } catch (err) {
        console.log(`  ⚠️ Telegram sendText failed: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
      if (i < chunks.length - 1) {
        await this.delay(INTER_MESSAGE_DELAY_MS);
      }
    }
  }

  /**
   * Send manifest status report (SC-009).
   */
  async sendStatus(manifest: Manifest): Promise<void> {
    const message = formatStatusMessage(manifest);
    await this.sendText(message);
  }

  /**
   * Notify phase start.
   */
  async sendPhaseStart(phase: number, phaseName: string): Promise<void> {
    await this.sendText(formatPhaseStartMessage(phase, phaseName));
  }

  /**
   * Notify phase completion with cost.
   */
  async sendPhaseComplete(phase: number, costUsd: number): Promise<void> {
    await this.sendText(formatPhaseCompleteMessage(phase, costUsd));
  }

  /**
   * Send blocking escalation with full failure context.
   */
  async sendEscalation(
    phase: number,
    category: string,
    details: string,
    actionTaken: string
  ): Promise<void> {
    await this.sendText(formatEscalationMessage(phase, category, details, actionTaken));
  }

  /**
   * Notify orchestrator restart with resume context (SC-011).
   */
  async sendRestart(phase: number, reason: string): Promise<void> {
    await this.sendText(
      `🔄 <b>Orchestrator Restarted</b>\nResuming from: Phase ${phase}\nReason: ${reason}`
    );
  }

  /**
   * Send Tier 3 approval request with inline keyboard (SC-006).
   * Returns a Promise that resolves when the user presses a button.
   * Sends a reminder after 30 minutes if no response.
   */
  async requestTier3Approval(request: ApprovalRequest): Promise<ApprovalResult> {
    const text = tagMessage(this.projectPrefix, formatApprovalMessage(request));

    const keyboard = new InlineKeyboard()
      .text("✅ Approve — make live call", `t3a_${request.techName}`)
      .row()
      .text("📋 Use recorded fixture", `t3f_${request.techName}`)
      .row()
      .text("⏭ Skip this test", `t3s_${request.techName}`);

    try {
      await this.bot.api.sendMessage(this.chatId, text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } catch (err) {
      console.log(`  ⚠️ Telegram approval request failed: ${err instanceof Error ? err.message : String(err)}`);
      // Default to skip if Telegram is unreachable
      return { action: "skip", techName: request.techName };
    }

    return new Promise<ApprovalResult>((resolve) => {
      const reminderTimer = setTimeout(async () => {
        try {
          await this.sendText(`⏳ Reminder: Tier 3 approval for <b>${request.techName}</b> is still pending.`);
        } catch {
          // Ignore reminder failures
        }
      }, APPROVAL_REMINDER_MS);

      this.pendingApprovals.set(request.techName, { resolve, reminderTimer });
    });
  }

  /**
   * Resolve a pending Tier 3 approval. Called by the bot's callback query handler.
   * Returns true if the approval was found and resolved.
   */
  resolveApproval(techName: string, action: "approve" | "fixture" | "skip"): boolean {
    const pending = this.pendingApprovals.get(techName);
    if (!pending) return false;

    clearTimeout(pending.reminderTimer);
    pending.resolve({ action, techName });
    this.pendingApprovals.delete(techName);
    return true;
  }

  /**
   * Send the approval result message (edit original or send new).
   */
  async sendApprovalResult(techName: string, action: string): Promise<void> {
    await this.sendText(formatApprovalResultMessage(techName, action));
  }

  /**
   * Send a progress summary (F1). Throttling is handled by the caller.
   */
  async sendProgress(phase: number, summary: string): Promise<void> {
    await this.sendText(summary);
  }

  /**
   * Create a notification-only TelegramNotifier that can send messages
   * without owning the polling connection. Uses a standalone Bot instance
   * purely for its API — never calls bot.start().
   */
  static createNotificationOnly(botToken: string, chatId: number, prefix: string): TelegramNotifier {
    const bot = new Bot(botToken);
    return new TelegramNotifier(bot, chatId, prefix);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
