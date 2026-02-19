// PIV Orchestrator — Environment Configuration

import type { OrchestratorConfig, PivCommand } from "./types.js";

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
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

  if (!hasOAuthToken && !hasApiKey) {
    throw new Error(
      "No authentication token found. Set CLAUDE_CODE_OAUTH_TOKEN (subscription) or ANTHROPIC_API_KEY (pay-per-token)."
    );
  }

  const projectDir = process.env.PIV_PROJECT_DIR || process.cwd();
  const model = process.env.PIV_MODEL || "claude-opus-4-6";

  return { projectDir, model, hasOAuthToken, hasApiKey };
}

export function getSessionDefaults(command: PivCommand): { maxTurns: number; maxBudgetUsd: number } {
  return SESSION_DEFAULTS[command];
}
