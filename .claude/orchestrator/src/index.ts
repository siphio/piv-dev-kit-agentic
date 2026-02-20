// PIV Orchestrator — CLI Entry Point

import { loadConfig } from "./config.js";
import { runPhase, runAllPhases } from "./piv-runner.js";
import { readManifest, writeManifest, appendFailure } from "./manifest-manager.js";
import { determineNextAction, findActiveCheckpoint, findPendingFailure } from "./state-machine.js";
import { checkForRunningInstance, writePidFile, removePidFile } from "./process-manager.js";
import { hasUncommittedChanges, ensureGitRepo } from "./git-manager.js";
import { registerInstance, deregisterInstance, claimBotOwnership } from "./instance-registry.js";
import { startSignalWatcher, stopSignalWatcher, clearSignal } from "./signal-handler.js";
import { writeHeartbeat } from "./heartbeat.js";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { Bot } from "grammy";
import { TelegramNotifier } from "./telegram-notifier.js";
import { PrdRelay } from "./prd-relay.js";
import { createBot, registerBotCommands } from "./telegram-bot.js";
import type { OrchestratorControls } from "./telegram-bot.js";
import type { SignalMessage } from "./types.js";

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
  const projectPrefix = config.telegram?.projectPrefix ?? basename(projectDir);

  console.log(`📁 Project: ${projectDir}`);
  console.log(`🔑 Auth: OAuth (subscription via CLAUDE_CODE_OAUTH_TOKEN)`);
  console.log(`🧠 Model: ${config.model}`);
  console.log(`📡 Mode: ${config.mode}`);

  // Ensure git repo exists (creates one with initial commit if needed)
  ensureGitRepo(projectDir);

  // Verify manifest exists
  const manifestPath = join(projectDir, ".agents/manifest.yaml");
  if (!existsSync(manifestPath)) {
    console.error("\n❌ No manifest found at .agents/manifest.yaml");
    console.error("   Run /prime first to create the manifest.");
    process.exit(1);
  }

  const manifest = await readManifest(projectDir);

  // Dry run mode: show recommendation and exit (no PID, no bot)
  if (cliArgs.dryRun) {
    const action = determineNextAction(manifest);
    console.log("\n📋 Dry Run — Recommended Next Action:");
    console.log(`   Command:    ${action.command}`);
    console.log(`   Argument:   ${action.argument ?? "(none)"}`);
    console.log(`   Reason:     ${action.reason}`);
    console.log(`   Confidence: ${action.confidence}`);
    return;
  }

  // --- Process Lifecycle: Duplicate Prevention ---
  const instanceCheck = checkForRunningInstance(projectDir);
  if (instanceCheck.running) {
    console.error(`\n❌ Orchestrator already running (PID: ${instanceCheck.pid})`);
    console.error("   Kill the existing process first, or remove .agents/orchestrator.pid if stale.");
    process.exit(1);
  }

  // Write PID file before any other work
  writePidFile(projectDir);
  console.log(`🔒 PID file written (PID: ${process.pid})`);

  // --- Instance Registry: Register & Claim Bot Ownership ---
  let isBotOwner = false;
  let signalWatcherTimer: NodeJS.Timeout | undefined;

  if (config.registryEnabled && config.telegram) {
    isBotOwner = claimBotOwnership(projectDir);
    registerInstance({
      prefix: projectPrefix,
      projectDir,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      manifestPath,
      isBotOwner,
    });
    console.log(`📋 Registry: registered (bot owner: ${isBotOwner ? "yes" : "no"})`);
  }

  // Clear any leftover signal file from previous run
  clearSignal(projectDir);

  // --- Startup Recovery: Check git state ---
  let isRestart = false;
  try {
    if (hasUncommittedChanges(projectDir)) {
      console.log("⚠️ Uncommitted changes detected — validating state before continuing");
    }
  } catch {
    console.log("⚠️ Could not check git state");
  }

  // --- Startup Recovery: Detect crash/interrupt recovery ---
  const activeCheckpoint = findActiveCheckpoint(manifest);
  const pendingFailure = findPendingFailure(manifest);
  if (activeCheckpoint || pendingFailure) {
    isRestart = true;
    const action = determineNextAction(manifest);
    console.log(`🔄 Recovering from previous state — ${action.reason}`);
  }

  // --- Telegram Setup (optional) ---
  let notifier: TelegramNotifier | undefined;
  let prdRelay: PrdRelay | undefined;
  const state = { running: false, paused: false };
  let pauseCheck: (() => Promise<void>) | undefined;
  let telegramBot: Bot | undefined;

  if (config.telegram) {
    console.log(`\n📱 Telegram: enabled (chat: ${config.telegram.chatId}, prefix: ${config.telegram.projectPrefix})`);

    if (isBotOwner) {
      // Bot owner: create bot, start polling, full functionality
      const bot = new Bot(config.telegram.botToken);
      notifier = new TelegramNotifier(bot, config.telegram.chatId, config.telegram.projectPrefix);
      prdRelay = new PrdRelay(projectDir, notifier);
      pauseCheck = createPauseCheck(state);

      const controls: OrchestratorControls = {
        getManifest: () => readManifest(projectDir),
        startExecution: () => {
          if (state.running) return;
          state.running = true;
          state.paused = false;
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
        registryEnabled: config.registryEnabled,
        projectPrefix,
      };

      telegramBot = createBot(config.telegram, controls, notifier);
      await registerBotCommands(telegramBot);
      telegramBot.start();
      console.log("  🤖 Telegram bot polling started (bot owner)");
    } else {
      // Non-bot-owner: notification-only mode (no polling)
      notifier = TelegramNotifier.createNotificationOnly(
        config.telegram.botToken,
        config.telegram.chatId,
        config.telegram.projectPrefix
      );
      pauseCheck = createPauseCheck(state);
      console.log("  📨 Telegram notification-only mode (another instance owns polling)");

      // Start signal watcher for receiving commands from bot owner
      const handleSignal = (signal: SignalMessage) => {
        console.log(`  📩 Signal received: ${signal.action} from [${signal.from}]`);
        switch (signal.action) {
          case "go":
            if (!state.running) {
              state.running = true;
              state.paused = false;
              runAllPhases(projectDir, notifier, pauseCheck).finally(() => {
                state.running = false;
              });
            }
            break;
          case "pause":
            state.paused = true;
            break;
          case "resume":
            state.paused = false;
            break;
          case "shutdown":
            shutdown();
            break;
        }
      };
      signalWatcherTimer = startSignalWatcher(projectDir, handleSignal);
    }

    // Notify Telegram of restart if recovering
    if (isRestart) {
      await notifier.sendText("⚠️ Uncommitted changes detected on restart");
    }
  }

  // --- Unified Graceful Shutdown ---
  const shutdown = () => {
    console.log("\n🛑 Shutting down...");
    try {
      removePidFile(projectDir);
    } catch {
      // Don't fail shutdown on PID removal error
    }
    if (config.registryEnabled) {
      try {
        deregisterInstance(projectDir);
      } catch {
        // Best effort registry cleanup
      }
    }
    if (signalWatcherTimer) {
      stopSignalWatcher(signalWatcherTimer);
    }
    try { writeHeartbeat(projectDir, projectPrefix, null, "idle"); } catch { /* best effort */ }
    telegramBot?.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // --- Uncaught Exception Handler ---
  process.on("uncaughtException", async (err) => {
    console.error(`\n💥 Uncaught exception: ${err.message}`);
    try { writeHeartbeat(projectDir, projectPrefix, null, "error"); } catch { /* best effort */ }
    try {
      removePidFile(projectDir);
    } catch {
      // Best effort PID cleanup
    }
    if (config.registryEnabled) {
      try {
        deregisterInstance(projectDir);
      } catch {
        // Best effort registry cleanup
      }
    }
    try {
      const currentManifest = await readManifest(projectDir);
      const updated = appendFailure(currentManifest, {
        command: "orchestrator",
        phase: cliArgs.phase ?? 0,
        error_category: "orchestrator_crash",
        timestamp: new Date().toISOString(),
        retry_count: 0,
        max_retries: 0,
        resolution: "pending",
        details: err.message,
      });
      await writeManifest(projectDir, updated);
    } catch {
      // Best effort manifest write
    }
    process.exit(1);
  });

  // --- Execute ---
  try {
    state.running = true;
    if (cliArgs.phase !== undefined) {
      console.log(`\n🎯 Running Phase ${cliArgs.phase} only\n`);
      await runPhase(cliArgs.phase, projectDir, notifier, pauseCheck);
    } else {
      await runAllPhases(projectDir, notifier, pauseCheck, isRestart);
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

    // Clean up PID file on error exit
    try {
      removePidFile(projectDir);
    } catch {
      // Best effort
    }

    process.exit(1);
  }
}

main();
