// PIV Orchestrator — Agent SDK Session Manager

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SettingSource } from "@anthropic-ai/claude-agent-sdk";
import type { SessionConfig, SessionResult, PivCommand } from "./types.js";
import { getSessionDefaults } from "./config.js";
import { processSession } from "./response-handler.js";

const FALLBACK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes — only used when no per-command timeout

const ALL_TOOLS = [
  "Read", "Glob", "Grep", "Bash", "Edit", "Write",
  "WebSearch", "WebFetch", "Task",
];

function buildOptions(config: SessionConfig, projectDir: string) {
  const controller = new AbortController();
  const timeoutMs = config.timeoutMs ?? FALLBACK_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  console.log(`  Timeout: ${Math.round(timeoutMs / 60_000)} minutes`);

  // Unset CLAUDECODE to prevent nesting guard when orchestrator runs inside
  // a Claude Code session (e.g. spawned via /go or during development).
  const { CLAUDECODE: _, ...cleanEnv } = process.env;

  const options = {
    model: config.model ?? "claude-opus-4-6",
    cwd: projectDir,
    allowedTools: ALL_TOOLS,
    permissionMode: "bypassPermissions" as const,
    allowDangerouslySkipPermissions: true,
    settingSources: ["project"] as SettingSource[],
    systemPrompt: { type: "preset" as const, preset: "claude_code" as const },
    maxTurns: config.maxTurns,
    abortController: controller,
    env: cleanEnv,
    ...(config.resumeSessionId ? { resume: config.resumeSessionId } : {}),
  };

  return { options, timer };
}

/**
 * Create a new Agent SDK session (fresh context window).
 */
export async function createSession(config: SessionConfig): Promise<SessionResult> {
  const { options, timer } = buildOptions(config, config.cwd);

  try {
    console.log(`  Creating session: "${config.prompt.slice(0, 60)}..."`);
    const gen = query({ prompt: config.prompt, options });
    return await processSession(gen);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // The SDK reports abort as "aborted by user" (not a JS AbortError).
    // This happens when our AbortController fires or when the subprocess is killed.
    const isAbort = err instanceof Error && (
      err.name === "AbortError" ||
      msg.includes("aborted by user") ||
      msg.includes("aborted")
    );
    if (isAbort) {
      const timeoutMs = config.timeoutMs ?? FALLBACK_TIMEOUT_MS;
      console.log(`  ⏰ Session aborted after ${Math.round(timeoutMs / 60_000)} minutes`);
      return {
        sessionId: "",
        output: "",
        hooks: {},
        costUsd: 0,
        durationMs: timeoutMs,
        turns: 0,
        error: { type: "abort_timeout", messages: [`Session timed out after ${Math.round(timeoutMs / 60_000)} minutes`] },
      };
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resume an existing session by session ID.
 */
export async function resumeSession(
  sessionId: string,
  config: SessionConfig
): Promise<SessionResult> {
  return createSession({ ...config, resumeSessionId: sessionId });
}

/**
 * Run a command pairing: first command creates a new session, subsequent
 * commands resume the same session. Returns results for all commands.
 */
export async function runCommandPairing(
  commands: string[],
  projectDir: string,
  commandType: PivCommand
): Promise<SessionResult[]> {
  const defaults = getSessionDefaults(commandType);
  const results: SessionResult[] = [];
  let currentSessionId: string | undefined;

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    console.log(`\n📤 Sending command ${i + 1}/${commands.length}: ${cmd}`);

    const config: SessionConfig = {
      prompt: cmd,
      cwd: projectDir,
      maxTurns: defaults.maxTurns,
      timeoutMs: defaults.timeoutMs,
      resumeSessionId: currentSessionId,
    };

    const result = i === 0
      ? await createSession(config)
      : await resumeSession(currentSessionId!, config);

    results.push(result);

    if (result.error) {
      console.log(`  ❌ Error (${result.error.type}): ${result.error.messages.join("; ")}`);
      break;
    }

    if (!currentSessionId && result.sessionId) {
      currentSessionId = result.sessionId;
    }

    console.log(`  ✅ Complete (cost: $${result.costUsd.toFixed(2)}, turns: ${result.turns})`);
  }

  return results;
}
