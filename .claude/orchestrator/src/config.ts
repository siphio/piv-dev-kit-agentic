// PIV Orchestrator — Environment Configuration

import { basename } from "node:path";
import type { OrchestratorConfig, PivCommand, TelegramConfig } from "./types.js";

const SESSION_DEFAULTS: Record<PivCommand, { maxTurns: number; maxBudgetUsd: number }> = {
  "prime":                    { maxTurns: 30,  maxBudgetUsd: 1.00 },
  "plan-feature":             { maxTurns: 100, maxBudgetUsd: 8.00 },
  "execute":                  { maxTurns: 200, maxBudgetUsd: 15.00 },
  "validate-implementation":  { maxTurns: 100, maxBudgetUsd: 5.00 },
  "commit":                   { maxTurns: 10,  maxBudgetUsd: 0.50 },
  "research-stack":           { maxTurns: 100, maxBudgetUsd: 5.00 },
};

export function loadConfig(): OrchestratorConfig {
  const hasOAuthToken = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;

  if (!hasOAuthToken) {
    throw new Error(
      "No OAuth token found. Set CLAUDE_CODE_OAUTH_TOKEN to use your Anthropic subscription.\n" +
      "Generate via: claude setup-token"
    );
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

  return { projectDir, model, hasOAuthToken, telegram, mode };
}

export function getSessionDefaults(command: PivCommand): { maxTurns: number; maxBudgetUsd: number } {
  return SESSION_DEFAULTS[command];
}
