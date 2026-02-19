// PIV Orchestrator — Telegram Bot Setup and Command Handlers

import { Bot } from "grammy";
import { autoRetry } from "@grammyjs/auto-retry";
import type { TelegramConfig, Manifest } from "./types.js";
import type { TelegramNotifier } from "./telegram-notifier.js";
import { formatStatusMessage, formatMultiStatusMessage, tagMessage, escapeHtml } from "./telegram-formatter.js";
import { listActiveInstances } from "./instance-registry.js";
import { readManifest } from "./manifest-manager.js";
import { writeSignal } from "./signal-handler.js";

/**
 * Interface for orchestrator control functions exposed to the bot.
 */
export interface OrchestratorControls {
  getManifest: () => Promise<Manifest>;
  startExecution: () => void;
  pause: () => void;
  resume: () => void;
  isRunning: () => boolean;
  isPaused: () => boolean;
  startPrdRelay: (chatId: number) => void;
  isPrdRelayActive: () => boolean;
  handlePrdMessage: (text: string) => Promise<string>;
  endPrdRelay: () => Promise<void>;
  projectDir: string;
  registryEnabled: boolean;
  projectPrefix: string;
}

const BOT_COMMANDS = [
  { command: "go", description: "Start execution (or /go <prefix> for specific project)" },
  { command: "pause", description: "Pause execution (or /pause <prefix> for specific project)" },
  { command: "resume", description: "Resume execution (or /resume <prefix> for specific project)" },
  { command: "status", description: "Status (or /status all for all projects)" },
  { command: "create_prd", description: "Start PRD creation conversation" },
  { command: "end_prd", description: "End active PRD creation session" },
  { command: "preflight", description: "Show credential and environment check status" },
];

/**
 * Create and configure the Telegram bot with command handlers.
 * Bot uses long-polling (no webhook needed).
 */
export function createBot(
  config: TelegramConfig,
  controls: OrchestratorControls,
  notifier: TelegramNotifier
): Bot {
  const bot = new Bot(config.botToken);

  // Auto-retry on 429 rate limit errors
  bot.api.config.use(autoRetry({
    maxRetryAttempts: 3,
    maxDelaySeconds: 30,
  }));

  // Security: restrict to authorized chat ID only
  bot.use(async (ctx, next) => {
    if (ctx.chat?.id !== config.chatId) {
      return; // Silently ignore unauthorized messages
    }
    await next();
  });

  // --- Command Handlers ---

  bot.command("status", async (ctx) => {
    const arg = ctx.match?.trim();

    try {
      if (arg === "all" && controls.registryEnabled) {
        // Multi-project status
        const instances = listActiveInstances();
        const instanceData = await Promise.all(
          instances.map(async (inst) => {
            let manifest: Manifest | null = null;
            try {
              manifest = await readManifest(inst.projectDir);
            } catch {
              // Manifest unreadable — will show as unavailable
            }
            return { prefix: inst.prefix, manifest, pid: inst.pid };
          })
        );
        const message = formatMultiStatusMessage(instanceData);
        await ctx.reply(message, { parse_mode: "HTML" });
      } else if (arg && controls.registryEnabled) {
        // Specific project status by prefix
        const instances = listActiveInstances();
        const target = instances.find((i) => i.prefix === arg);
        if (!target) {
          await ctx.reply(`⚠️ No active instance with prefix "${escapeHtml(arg)}".`);
          return;
        }
        try {
          const manifest = await readManifest(target.projectDir);
          const message = tagMessage(target.prefix, formatStatusMessage(manifest));
          await ctx.reply(message, { parse_mode: "HTML" });
        } catch (err) {
          await ctx.reply(`⚠️ Could not read status for ${escapeHtml(arg)}: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        // Current project status (existing behavior)
        const manifest = await controls.getManifest();
        const message = tagMessage(config.projectPrefix, formatStatusMessage(manifest));
        await ctx.reply(message, { parse_mode: "HTML" });
      }
    } catch (err) {
      await ctx.reply(`⚠️ Could not read status: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  bot.command("go", async (ctx) => {
    const arg = ctx.match?.trim();

    // Route to another instance via signal file
    if (arg && controls.registryEnabled) {
      const instances = listActiveInstances();
      const target = instances.find((i) => i.prefix === arg);
      if (!target) {
        await ctx.reply(`⚠️ No active instance with prefix "${escapeHtml(arg)}".`);
        return;
      }
      if (target.projectDir !== controls.projectDir) {
        writeSignal(target.projectDir, {
          action: "go",
          timestamp: new Date().toISOString(),
          from: controls.projectPrefix,
        });
        await ctx.reply(tagMessage(config.projectPrefix, `🚀 Sent /go signal to [${escapeHtml(arg)}]`));
        return;
      }
    }

    // Start local execution
    if (controls.isRunning()) {
      await ctx.reply(tagMessage(config.projectPrefix, "⚠️ Execution already in progress."));
      return;
    }
    controls.startExecution();
    await ctx.reply(tagMessage(config.projectPrefix, "🚀 Autonomous execution starting..."));
  });

  bot.command("pause", async (ctx) => {
    const arg = ctx.match?.trim();

    // Route to another instance
    if (arg && controls.registryEnabled) {
      const instances = listActiveInstances();
      const target = instances.find((i) => i.prefix === arg);
      if (!target) {
        await ctx.reply(`⚠️ No active instance with prefix "${escapeHtml(arg)}".`);
        return;
      }
      if (target.projectDir !== controls.projectDir) {
        writeSignal(target.projectDir, {
          action: "pause",
          timestamp: new Date().toISOString(),
          from: controls.projectPrefix,
        });
        await ctx.reply(tagMessage(config.projectPrefix, `⏸ Sent /pause signal to [${escapeHtml(arg)}]`));
        return;
      }
    }

    if (!controls.isRunning()) {
      await ctx.reply(tagMessage(config.projectPrefix, "⚠️ Nothing is running to pause."));
      return;
    }
    if (controls.isPaused()) {
      await ctx.reply(tagMessage(config.projectPrefix, "⚠️ Already paused."));
      return;
    }
    controls.pause();
    await ctx.reply(tagMessage(config.projectPrefix, "⏸ Pausing after current step completes..."));
  });

  bot.command("resume", async (ctx) => {
    const arg = ctx.match?.trim();

    // Route to another instance
    if (arg && controls.registryEnabled) {
      const instances = listActiveInstances();
      const target = instances.find((i) => i.prefix === arg);
      if (!target) {
        await ctx.reply(`⚠️ No active instance with prefix "${escapeHtml(arg)}".`);
        return;
      }
      if (target.projectDir !== controls.projectDir) {
        writeSignal(target.projectDir, {
          action: "resume",
          timestamp: new Date().toISOString(),
          from: controls.projectPrefix,
        });
        await ctx.reply(tagMessage(config.projectPrefix, `▶️ Sent /resume signal to [${escapeHtml(arg)}]`));
        return;
      }
    }

    if (!controls.isPaused()) {
      await ctx.reply(tagMessage(config.projectPrefix, "⚠️ Not currently paused."));
      return;
    }
    controls.resume();
    await ctx.reply(tagMessage(config.projectPrefix, "▶️ Resuming execution..."));
  });

  bot.command("create_prd", async (ctx) => {
    if (controls.isPrdRelayActive()) {
      await ctx.reply(tagMessage(config.projectPrefix, "⚠️ PRD session already in progress. Send /end_prd to stop it."));
      return;
    }
    controls.startPrdRelay(ctx.chat.id);
    await ctx.reply(tagMessage(config.projectPrefix,
      "📝 PRD creation started. Send your messages and I'll relay them to Claude.\n\nSend /end_prd when finished."
    ));
  });

  bot.command("end_prd", async (ctx) => {
    if (!controls.isPrdRelayActive()) {
      await ctx.reply(tagMessage(config.projectPrefix, "⚠️ No active PRD session."));
      return;
    }
    await controls.endPrdRelay();
    await ctx.reply(tagMessage(config.projectPrefix, "✅ PRD session ended."));
  });

  bot.command("preflight", async (ctx) => {
    try {
      const manifest = await controls.getManifest();
      const pf = manifest.preflight;
      if (!pf) {
        await ctx.reply(tagMessage(config.projectPrefix, "⚠️ Preflight has not been run yet. Run /preflight in VS Code first."));
        return;
      }
      const statusIcon = pf.status === "passed" ? "✅" : "🔴";
      const lines = [
        `<b>Preflight Status:</b> ${statusIcon} ${escapeHtml(pf.status)}`,
        `<b>Credentials verified:</b> ${pf.credentials_verified}`,
        `<b>Technologies:</b> ${pf.technologies_checked.map(escapeHtml).join(", ")}`,
      ];
      if (pf.notes) lines.push(`<b>Notes:</b> ${escapeHtml(pf.notes)}`);
      await ctx.reply(tagMessage(config.projectPrefix, lines.join("\n")), { parse_mode: "HTML" });
    } catch (err) {
      await ctx.reply(`⚠️ Could not read preflight status: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // --- Callback Query Handler (Tier 3 Approvals) ---

  bot.callbackQuery(/^t3(a|f|s)_(.+)$/, async (ctx) => {
    const match = ctx.match!;
    const actionCode = match[1];
    const techName = match[2];

    const action: "approve" | "fixture" | "skip" =
      actionCode === "a" ? "approve"
      : actionCode === "f" ? "fixture"
      : "skip";

    // Answer callback immediately (must be within 30 seconds)
    await ctx.answerCallbackQuery({ text: `${action} selected` });

    // Resolve the pending approval
    const resolved = notifier.resolveApproval(techName, action);
    if (!resolved) {
      await ctx.answerCallbackQuery({ text: "No pending approval found for this action." });
      return;
    }

    // Update the original message to show result
    try {
      const resultText = tagMessage(
        config.projectPrefix,
        `<b>Tier 3 ${action === "approve" ? "Approved" : action === "fixture" ? "Using Fixture" : "Skipped"}: ${escapeHtml(techName)}</b>`
      );
      await ctx.editMessageText(resultText, { parse_mode: "HTML" });
    } catch {
      // editMessageText may fail if message was already edited — safe to ignore
    }
  });

  // --- Catch-all for unhandled callback queries ---
  bot.on("callback_query:data", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // --- Free-text Message Handler (PRD Relay) ---

  bot.on("message:text", async (ctx) => {
    if (!controls.isPrdRelayActive()) {
      // Ignore non-command text when PRD relay is not active
      return;
    }

    const userText = ctx.message.text;
    if (!userText) return;

    try {
      await ctx.reply(tagMessage(config.projectPrefix, "⏳ Relaying to Claude..."));
      const response = await controls.handlePrdMessage(userText);
      await notifier.sendText(response);
    } catch (err) {
      await ctx.reply(
        tagMessage(config.projectPrefix, `⚠️ PRD relay error: ${err instanceof Error ? err.message : String(err)}`)
      );
    }
  });

  // --- Error Handler ---

  bot.catch((err) => {
    console.log(`  ⚠️ Telegram bot error: ${err.message}`);
  });

  return bot;
}

/**
 * Register bot commands with Telegram so they appear in the command menu.
 */
export async function registerBotCommands(bot: Bot): Promise<void> {
  try {
    await bot.api.setMyCommands(BOT_COMMANDS);
    console.log("  📋 Telegram bot commands registered");
  } catch (err) {
    console.log(`  ⚠️ Failed to register bot commands: ${err instanceof Error ? err.message : String(err)}`);
  }
}
