// PIV Orchestrator — CLI Entry Point

import { loadConfig } from "./config.js";
import { runPhase, runAllPhases } from "./piv-runner.js";
import { readManifest, writeManifest, appendFailure } from "./manifest-manager.js";
import { determineNextAction } from "./state-machine.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Bot } from "grammy";
import { TelegramNotifier } from "./telegram-notifier.js";
import { PrdRelay } from "./prd-relay.js";
import { createBot, registerBotCommands } from "./telegram-bot.js";
import type { OrchestratorControls } from "./telegram-bot.js";

interface CliArgs {
  projectDir?: string;
  phase?: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { dryRun: false };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--project" && argv[i + 1]) {
      args.projectDir = argv[++i];
    } else if (arg === "--phase" && argv[i + 1]) {
      args.phase = parseInt(argv[++i], 10);
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    }
  }

  return args;
}

/**
 * Create a pause check function that blocks while paused.
 * Polls every 2 seconds until the paused flag is cleared.
 */
function createPauseCheck(state: { paused: boolean }): () => Promise<void> {
  return async () => {
    while (state.paused) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  };
}

async function main(): Promise<void> {
  console.log("🤖 PIV Orchestrator v0.1.0\n");

  const cliArgs = parseArgs(process.argv);

  // Load and validate config
  const config = loadConfig();
  const projectDir = cliArgs.projectDir ?? config.projectDir;

  console.log(`📁 Project: ${projectDir}`);
  console.log(`🔑 Auth: OAuth (subscription via CLAUDE_CODE_OAUTH_TOKEN)`);
  console.log(`🧠 Model: ${config.model}`);
  console.log(`📡 Mode: ${config.mode}`);

  // Verify manifest exists
  const manifestPath = join(projectDir, ".agents/manifest.yaml");
  if (!existsSync(manifestPath)) {
    console.error("\n❌ No manifest found at .agents/manifest.yaml");
    console.error("   Run /prime first to create the manifest.");
    process.exit(1);
  }

  const manifest = await readManifest(projectDir);

  // Dry run mode: show recommendation and exit (no bot needed)
  if (cliArgs.dryRun) {
    const action = determineNextAction(manifest);
    console.log("\n📋 Dry Run — Recommended Next Action:");
    console.log(`   Command:    ${action.command}`);
    console.log(`   Argument:   ${action.argument ?? "(none)"}`);
    console.log(`   Reason:     ${action.reason}`);
    console.log(`   Confidence: ${action.confidence}`);
    return;
  }

  // --- Telegram Setup (optional) ---
  let notifier: TelegramNotifier | undefined;
  let bot: Bot | undefined;
  let prdRelay: PrdRelay | undefined;
  const state = { running: false, paused: false };
  let pauseCheck: (() => Promise<void>) | undefined;

  if (config.telegram) {
    console.log(`\n📱 Telegram: enabled (chat: ${config.telegram.chatId}, prefix: ${config.telegram.projectPrefix})`);

    bot = new Bot(config.telegram.botToken);
    notifier = new TelegramNotifier(bot, config.telegram.chatId, config.telegram.projectPrefix);
    prdRelay = new PrdRelay(projectDir, notifier);
    pauseCheck = createPauseCheck(state);

    const controls: OrchestratorControls = {
      getManifest: () => readManifest(projectDir),
      startExecution: () => {
        if (state.running) return;
        state.running = true;
        state.paused = false;
        // Trigger execution asynchronously — don't block the bot handler
        runAllPhases(projectDir, notifier, pauseCheck).finally(() => {
          state.running = false;
        });
      },
      pause: () => { state.paused = true; },
      resume: () => { state.paused = false; },
      isRunning: () => state.running,
      isPaused: () => state.paused,
      startPrdRelay: (_chatId: number) => {
        prdRelay!.startConversation().catch((err) => {
          console.log(`  ⚠️ PRD relay start failed: ${err instanceof Error ? err.message : String(err)}`);
        });
      },
      isPrdRelayActive: () => prdRelay!.isActive(),
      handlePrdMessage: (text: string) => prdRelay!.handleUserMessage(text),
      endPrdRelay: () => prdRelay!.endConversation(),
      projectDir,
    };

    const telegramBot = createBot(config.telegram, controls, notifier);

    // Graceful shutdown
    const shutdown = () => {
      console.log("\n🛑 Shutting down...");
      telegramBot.stop();
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);

    // Register commands and start polling (non-blocking)
    await registerBotCommands(telegramBot);
    telegramBot.start();
    console.log("  🤖 Telegram bot polling started");

    bot = telegramBot;
  }

  // Execute
  try {
    state.running = true;
    if (cliArgs.phase !== undefined) {
      console.log(`\n🎯 Running Phase ${cliArgs.phase} only\n`);
      await runPhase(cliArgs.phase, projectDir, notifier, pauseCheck);
    } else {
      await runAllPhases(projectDir, notifier, pauseCheck);
    }
    state.running = false;
  } catch (err: unknown) {
    state.running = false;
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`\n💥 Uncaught error: ${errorMsg}`);

    // Write failure to manifest
    try {
      const currentManifest = await readManifest(projectDir);
      const updated = appendFailure(currentManifest, {
        command: "orchestrator",
        phase: cliArgs.phase ?? 0,
        error_category: "partial_execution",
        timestamp: new Date().toISOString(),
        retry_count: 0,
        max_retries: 1,
        resolution: "pending",
        details: errorMsg,
      });
      await writeManifest(projectDir, updated);
    } catch {
      console.error("  (Could not write failure to manifest)");
    }

    await notifier?.sendEscalation(
      cliArgs.phase ?? 0,
      "partial_execution",
      errorMsg,
      "Orchestrator crashed — awaiting human intervention"
    );

    console.error("\n## PIV-Error");
    console.error(`error_category: partial_execution`);
    console.error(`command: orchestrator`);
    console.error(`phase: ${cliArgs.phase ?? 0}`);
    console.error(`details: "${errorMsg}"`);
    console.error(`retry_eligible: true`);
    console.error(`retries_remaining: 1`);
    console.error(`checkpoint: none`);

    process.exit(1);
  }
}

main();
