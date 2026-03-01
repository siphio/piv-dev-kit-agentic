// PIV Orchestrator — Agent Spawner
//
// Creates Agent SDK sessions per specialist agent YAML config.
// Assembles context from slice context.md + technology profiles + architecture excerpt + system prompt.

import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SettingSource } from "@anthropic-ai/claude-agent-sdk";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { processSession } from "./response-handler.js";
import { classifyError } from "./error-classifier.js";
import type { AgentYamlConfig, AgentSession, WorkUnit } from "./types.js";

const DEFAULT_MAX_TURNS = 200;
const DEFAULT_MAX_BUDGET_USD = 5.0;
const DEFAULT_TIMEOUT_MS = 60 * 60_000; // 60 min
const DEFAULT_MODEL = "claude-sonnet-4-6";

const ALL_TOOLS = [
  "Read", "Glob", "Grep", "Bash", "Edit", "Write",
  "WebSearch", "WebFetch", "Task",
];

/**
 * Assemble the context prompt for a specialist agent.
 * Concatenates slice context, technology profiles, architecture excerpt, and agent system prompt.
 */
export function assembleContext(
  workUnit: WorkUnit,
  projectDir: string,
  architectureExcerpt?: string,
  profilePaths?: string[]
): string {
  const parts: string[] = [];

  // Slice context
  const contextPath = join(projectDir, workUnit.contextPath);
  if (existsSync(contextPath)) {
    parts.push(`## Slice Context\n\n${readFileSync(contextPath, "utf-8")}`);
  }

  // Module specification
  const specPath = join(projectDir, workUnit.specPath);
  if (existsSync(specPath)) {
    const specContent = readFileSync(specPath, "utf-8");
    // First 100 lines as summary
    const summary = specContent.split("\n").slice(0, 100).join("\n");
    parts.push(`## Module Specification (summary)\n\n${summary}`);
  }

  // Technology profiles
  if (profilePaths) {
    for (const pp of profilePaths) {
      const fullPath = join(projectDir, pp);
      if (existsSync(fullPath)) {
        parts.push(`## Technology Profile: ${pp}\n\n${readFileSync(fullPath, "utf-8")}`);
      }
    }
  }

  // Architecture excerpt
  if (architectureExcerpt) {
    parts.push(`## Architecture Context\n\n${architectureExcerpt}`);
  }

  parts.push(`## Work Assignment\n\nModule: ${workUnit.module}\nSlice: ${workUnit.slice}`);

  return parts.join("\n\n---\n\n");
}

/**
 * Spawn a specialist agent session via the Agent SDK.
 * Returns an AgentSession with status, cost, and session ID.
 */
export async function spawnAgent(
  config: AgentYamlConfig,
  workUnit: WorkUnit,
  projectDir: string,
  contextAssembly: string
): Promise<AgentSession> {
  const sessionId = randomUUID();
  const agentSession: AgentSession = {
    id: sessionId,
    agentType: config.type,
    module: workUnit.module,
    slice: workUnit.slice,
    startedAt: Date.now(),
    status: "spawning",
    costUsd: 0,
    retryCount: 0,
  };

  const maxTurns = config.budget?.maxTurns ?? DEFAULT_MAX_TURNS;
  const timeoutMs = config.budget?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const model = config.model ?? DEFAULT_MODEL;
  const tools = config.tools ?? ALL_TOOLS;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Strip CLAUDECODE to prevent nesting guard
  const { CLAUDECODE: _, ...cleanEnv } = process.env;

  try {
    agentSession.status = "running";
    console.log(`  🤖 Spawning ${config.name} for ${workUnit.module}/${workUnit.slice} (${model}, ${maxTurns} turns)`);

    const prompt = `${contextAssembly}\n\n---\n\n${config.system_prompt}`;

    const gen = query({
      prompt,
      options: {
        model,
        cwd: projectDir,
        allowedTools: tools,
        permissionMode: "bypassPermissions" as const,
        allowDangerouslySkipPermissions: true,
        settingSources: ["project"] as SettingSource[],
        systemPrompt: { type: "preset" as const, preset: "claude_code" as const },
        maxTurns,
        abortController: controller,
        env: cleanEnv,
      },
    });

    const result = await processSession(gen);

    agentSession.sessionId = result.sessionId;
    agentSession.costUsd = result.costUsd;
    agentSession.status = result.error ? "failed" : "complete";

    if (result.error) {
      console.log(`  ❌ ${config.name} failed: ${result.error.messages.join("; ")}`);
    } else {
      console.log(`  ✅ ${config.name} complete (cost: $${result.costUsd.toFixed(2)}, turns: ${result.turns})`);
    }

    return agentSession;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const isAbort = err instanceof Error && (
      err.name === "AbortError" ||
      msg.includes("aborted by user") ||
      msg.includes("aborted")
    );

    agentSession.status = isAbort ? "crashed" : "failed";
    console.log(`  ❌ ${config.name} ${isAbort ? "timed out" : "errored"}: ${msg}`);
    return agentSession;
  } finally {
    clearTimeout(timer);
  }
}
