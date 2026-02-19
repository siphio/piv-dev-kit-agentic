// PIV Orchestrator — Environment Configuration

import { basename } from "node:path";
import type { OrchestratorConfig, PivCommand, TelegramConfig } from "./types.js";

const SESSION_DEFAULTS: Record<PivCommand, { maxTurns: number; maxBudgetUsd: number; timeoutMs: number }> = {
  "prime":                    { maxTurns: 30,  maxBudgetUsd: 1.00,  timeoutMs: 10 * 60_000 },   // 10 min
  "plan-feature":             { maxTurns: 100, maxBudgetUsd: 8.00,  timeoutMs: 45 * 60_000 },   // 45 min
  "execute":                  { maxTurns: 200, maxBudgetUsd: 15.00, timeoutMs: 60 * 60_000 },   // 60 min
  "validate-implementation":  { maxTurns: 100, maxBudgetUsd: 5.00,  timeoutMs: 30 * 60_000 },   // 30 min
  "commit":                   { maxTurns: 10,  maxBudgetUsd: 0.50,  timeoutMs: 5 * 60_000 },    //  5 min
  "research-stack":           { maxTurns: 100, maxBudgetUsd: 5.00,  timeoutMs: 30 * 60_000 },   // 30 min
  "preflight":                { maxTurns: 50,  maxBudgetUsd: 2.00,  timeoutMs: 15 * 60_000 },   // 15 min
};

export function loadConfig(): OrchestratorConfig {
  // The Agent SDK spawns `claude` as a subprocess which handles its own auth.
  // CLAUDE_CODE_OAUTH_TOKEN is not required — the CLI uses its configured credentials.
  const hasOAuthToken = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (!hasOAuthToken) {
    console.log("ℹ️  CLAUDE_CODE_OAUTH_TOKEN not set — using claude CLI's own auth");
  }

  const projectDir = process.env.PIV_PROJECT_DIR || process.cwd();
  const model = process.env.PIV_MODEL || "claude-opus-4-6";

  // Telegram configuration (optional)
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatIdRaw = process.env.TELEGRAM_CHAT_ID;
  let telegram: TelegramConfig | undefined;
  let mode: "cli" | "telegram" = "cli";

  if (botToken && chatIdRaw) {
    const chatId = parseInt(chatIdRaw, 10);
    if (isNaN(chatId)) {
      console.log("⚠️ TELEGRAM_CHAT_ID is not a valid number — Telegram disabled");
    } else {
      const projectPrefix = process.env.TELEGRAM_PROJECT_PREFIX || basename(projectDir);
      telegram = { botToken, chatId, projectPrefix };
      mode = "telegram";
    }
  } else if (botToken || chatIdRaw) {
    console.log("⚠️ Both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID required — Telegram disabled");
  }

  const registryEnabled = process.env.PIV_REGISTRY_DISABLED !== "1";

  return { projectDir, model, hasOAuthToken, telegram, mode, registryEnabled };
}

export function getSessionDefaults(command: PivCommand): { maxTurns: number; maxBudgetUsd: number; timeoutMs: number } {
  return SESSION_DEFAULTS[command];
}
