// PIV Supervisor — Interventor (Agent SDK Sessions for Diagnosis & Fixing)
// Implements PRD Section 4.2 "Bug Location" and "Fix or Escalate" decision trees.

import { query } from "@anthropic-ai/claude-agent-sdk";
import { execFileSync } from "node:child_process";
import type {
  StallClassification,
  RegistryProject,
  DiagnosticResult,
  HotFixResult,
  InterventorConfig,
  BugLocation,
} from "./types.js";

/**
 * Build a diagnostic prompt from stall context.
 */
function buildDiagnosisPrompt(
  project: RegistryProject,
  classification: StallClassification,
): string {
  return [
    "You are diagnosing why a PIV orchestrator stalled.",
    "",
    `Project: ${project.name}`,
    `Path: ${project.path}`,
    `Phase: ${project.currentPhase ?? "unknown"}`,
    `Stall type: ${classification.stallType}`,
    `Details: ${classification.details}`,
    `Heartbeat age: ${Math.round(classification.heartbeatAgeMs / 60000)} minutes`,
    "",
    "Instructions:",
    "1. Read .agents/manifest.yaml for failures section and recent state",
    "2. Check .agents/progress/ for the latest progress file to see blocked tasks",
    "3. If there are error details, trace them to the specific source file and line",
    "4. Determine the root cause — what file has the bug and what needs to change",
    "",
    "Respond with ONLY a JSON object (no markdown, no explanation):",
    "{",
    '  "rootCause": "description of the bug",',
    '  "filePath": "path/to/broken/file.ts or null",',
    '  "errorCategory": "syntax_error|test_failure|integration_auth|etc",',
    '  "bugLocation": "framework_bug|project_bug|human_required",',
    '  "confidence": "high|medium|low"',
    "}",
  ].join("\n");
}

/**
 * Build a fix prompt from diagnosis.
 */
function buildFixPrompt(diagnostic: DiagnosticResult, isFramework: boolean): string {
  const context = isFramework
    ? "You are fixing a framework bug in the PIV Dev Kit."
    : "You are fixing a project-specific bug in generated agent code.";

  return [
    context,
    "",
    `Root cause: ${diagnostic.rootCause}`,
    `File: ${diagnostic.filePath ?? "unknown"}`,
    `Error category: ${diagnostic.errorCategory}`,
    "",
    "Constraints:",
    "- Fix must be in a SINGLE file only",
    "- Fix must be under 30 lines of changes",
    "- After fixing, run: npx tsc --noEmit && npx vitest run",
    "- If the fix requires changes to multiple files, do NOT make the fix. Instead respond with:",
    '  {"success": false, "reason": "multi-file fix required"}',
    "",
    "After fixing, respond with ONLY a JSON object (no markdown):",
    "{",
    '  "success": true,',
    '  "filePath": "path/to/fixed/file.ts",',
    '  "linesChanged": 5,',
    '  "details": "what was changed"',
    "}",
  ].join("\n");
}

/**
 * Parse a JSON response from an Agent SDK session.
 * Extracts JSON from the last result message.
 */
function parseJsonFromSession(messages: Array<{ type: string; subtype?: string; result_text?: string }>): Record<string, unknown> | null {
  for (const msg of messages.reverse()) {
    if (msg.type === "result" && msg.result_text) {
      try {
        // Try to extract JSON from the response text
        const jsonMatch = msg.result_text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

/**
 * Run a read-only Agent SDK diagnosis session.
 */
export async function diagnoseStall(
  project: RegistryProject,
  classification: StallClassification,
  config: InterventorConfig,
): Promise<DiagnosticResult> {
  const prompt = buildDiagnosisPrompt(project, classification);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  // Unset CLAUDECODE to prevent nesting guard
  const { CLAUDECODE: _, ...cleanEnv } = process.env;

  const messages: Array<{ type: string; subtype?: string; result_text?: string; total_cost_usd?: number }> = [];

  try {
    const gen = query({
      prompt,
      options: {
        cwd: project.path,
        model: "claude-sonnet-4-6",
        maxTurns: config.diagnosisMaxTurns,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        allowedTools: ["Read", "Glob", "Grep"],
        settingSources: ["project"],
        systemPrompt: { type: "preset", preset: "claude_code" },
        abortController: controller,
        env: cleanEnv,
      },
    });

    for await (const msg of gen) {
      messages.push(msg as typeof messages[number]);
    }
  } catch (err) {
    // Session failed — return partial diagnosis
    return {
      bugLocation: "human_required",
      confidence: "low",
      rootCause: `Diagnosis session failed: ${err instanceof Error ? err.message : String(err)}`,
      filePath: null,
      errorCategory: classification.stallType,
      multiProjectPattern: false,
      affectedProjects: [project.name],
    };
  } finally {
    clearTimeout(timer);
  }

  const parsed = parseJsonFromSession(messages);

  if (!parsed) {
    return {
      bugLocation: "human_required",
      confidence: "low",
      rootCause: "Diagnosis session returned no parseable result",
      filePath: null,
      errorCategory: classification.stallType,
      multiProjectPattern: false,
      affectedProjects: [project.name],
    };
  }

  return {
    bugLocation: (parsed.bugLocation as BugLocation) ?? "human_required",
    confidence: (parsed.confidence as "high" | "medium" | "low") ?? "low",
    rootCause: (parsed.rootCause as string) ?? "Unknown",
    filePath: (parsed.filePath as string | null) ?? null,
    errorCategory: (parsed.errorCategory as string) ?? classification.stallType,
    multiProjectPattern: false,
    affectedProjects: [project.name],
  };
}

/**
 * Classify bug location based on diagnostic result and cross-project analysis.
 * PRD Section 4.2 "Bug Location" decision tree.
 */
export function classifyBugLocation(
  diagnostic: DiagnosticResult,
  allStalled: StallClassification[],
): DiagnosticResult {
  const updated = { ...diagnostic };

  // Multi-project pattern: 2+ projects stalling with same error at same phase
  if (allStalled.length >= 2) {
    const phases = allStalled.map((s) => s.project.currentPhase);
    const types = allStalled.map((s) => s.stallType);
    const samePhase = phases.every((p) => p === phases[0]);
    const sameType = types.every((t) => t === types[0]);
    if (samePhase && sameType) {
      updated.bugLocation = "framework_bug";
      updated.confidence = "high";
      updated.multiProjectPattern = true;
      updated.affectedProjects = allStalled.map((s) => s.project.name);
      return updated;
    }
  }

  // File path classification
  if (updated.filePath) {
    if (
      updated.filePath.includes(".claude/commands/") ||
      updated.filePath.includes(".claude/orchestrator/")
    ) {
      updated.bugLocation = "framework_bug";
      if (updated.confidence === "low") updated.confidence = "medium";
    } else if (
      updated.filePath.match(/^src\//) ||
      updated.filePath.match(/^tests\//) ||
      updated.filePath.includes("/src/") ||
      updated.filePath.includes("/tests/")
    ) {
      updated.bugLocation = "project_bug";
    }
  }

  // Auth/credential errors → human required
  if (
    updated.errorCategory === "integration_auth" ||
    updated.rootCause.toLowerCase().includes("credential") ||
    updated.rootCause.toLowerCase().includes("api key") ||
    updated.rootCause.toLowerCase().includes("token")
  ) {
    updated.bugLocation = "human_required";
  }

  return updated;
}

/**
 * Apply a hot fix to the dev kit framework via Agent SDK session.
 */
export async function applyFrameworkHotFix(
  diagnostic: DiagnosticResult,
  config: InterventorConfig,
): Promise<HotFixResult> {
  const prompt = buildFixPrompt(diagnostic, true);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  const { CLAUDECODE: _, ...cleanEnv } = process.env;
  const messages: Array<{ type: string; subtype?: string; result_text?: string; total_cost_usd?: number }> = [];
  let sessionCost = 0;

  try {
    const gen = query({
      prompt,
      options: {
        cwd: config.devKitDir,
        model: "claude-sonnet-4-6",
        maxTurns: config.fixMaxTurns,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        allowedTools: ["Read", "Glob", "Grep", "Bash", "Edit", "Write"],
        settingSources: ["project"],
        systemPrompt: { type: "preset", preset: "claude_code" },
        abortController: controller,
        env: cleanEnv,
      },
    });

    for await (const msg of gen) {
      messages.push(msg as typeof messages[number]);
      if ((msg as typeof messages[number]).total_cost_usd) {
        sessionCost = (msg as typeof messages[number]).total_cost_usd!;
      }
    }
  } catch (err) {
    return {
      success: false,
      filePath: diagnostic.filePath ?? "unknown",
      linesChanged: 0,
      validationPassed: false,
      revertedOnFailure: false,
      details: `Fix session failed: ${err instanceof Error ? err.message : String(err)}`,
      sessionCostUsd: sessionCost,
    };
  } finally {
    clearTimeout(timer);
  }

  const parsed = parseJsonFromSession(messages);

  if (!parsed || parsed.success === false) {
    return {
      success: false,
      filePath: diagnostic.filePath ?? "unknown",
      linesChanged: 0,
      validationPassed: false,
      revertedOnFailure: false,
      details: (parsed?.reason as string) ?? "Fix session returned no success confirmation",
      sessionCostUsd: sessionCost,
    };
  }

  // Validate the fix: tsc + vitest
  const validationPassed = validateDevKit(config.devKitDir);

  if (!validationPassed) {
    // Revert the fix
    const reverted = revertFile(diagnostic.filePath, config.devKitDir);
    return {
      success: false,
      filePath: (parsed.filePath as string) ?? diagnostic.filePath ?? "unknown",
      linesChanged: (parsed.linesChanged as number) ?? 0,
      validationPassed: false,
      revertedOnFailure: reverted,
      details: "Fix applied but validation failed — reverted",
      sessionCostUsd: sessionCost,
    };
  }

  return {
    success: true,
    filePath: (parsed.filePath as string) ?? diagnostic.filePath ?? "unknown",
    linesChanged: (parsed.linesChanged as number) ?? 0,
    validationPassed: true,
    revertedOnFailure: false,
    details: (parsed.details as string) ?? "Fix applied and validated",
    sessionCostUsd: sessionCost,
  };
}

/**
 * Apply a fix to project-specific code via Agent SDK session in the project dir.
 */
export async function applyProjectFix(
  project: RegistryProject,
  diagnostic: DiagnosticResult,
  config: InterventorConfig,
): Promise<HotFixResult> {
  const prompt = buildFixPrompt(diagnostic, false);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  const { CLAUDECODE: _, ...cleanEnv } = process.env;
  const messages: Array<{ type: string; subtype?: string; result_text?: string; total_cost_usd?: number }> = [];
  let sessionCost = 0;

  try {
    const gen = query({
      prompt,
      options: {
        cwd: project.path,
        model: "claude-sonnet-4-6",
        maxTurns: config.fixMaxTurns,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        allowedTools: ["Read", "Glob", "Grep", "Bash", "Edit", "Write"],
        settingSources: ["project"],
        systemPrompt: { type: "preset", preset: "claude_code" },
        abortController: controller,
        env: cleanEnv,
      },
    });

    for await (const msg of gen) {
      messages.push(msg as typeof messages[number]);
      if ((msg as typeof messages[number]).total_cost_usd) {
        sessionCost = (msg as typeof messages[number]).total_cost_usd!;
      }
    }
  } catch (err) {
    return {
      success: false,
      filePath: diagnostic.filePath ?? "unknown",
      linesChanged: 0,
      validationPassed: false,
      revertedOnFailure: false,
      details: `Project fix session failed: ${err instanceof Error ? err.message : String(err)}`,
      sessionCostUsd: sessionCost,
    };
  } finally {
    clearTimeout(timer);
  }

  const parsed = parseJsonFromSession(messages);

  return {
    success: parsed?.success === true,
    filePath: (parsed?.filePath as string) ?? diagnostic.filePath ?? "unknown",
    linesChanged: (parsed?.linesChanged as number) ?? 0,
    validationPassed: parsed?.success === true,
    revertedOnFailure: false,
    details: (parsed?.details as string) ?? "Project fix session completed",
    sessionCostUsd: sessionCost,
  };
}

/**
 * Determine if the issue should be escalated rather than hot-fixed.
 * PRD Section 4.2 "Fix or Escalate" decision tree.
 */
export function shouldEscalate(
  diagnostic: DiagnosticResult,
  previousFixFailed: boolean,
): boolean {
  // Auth/credential issues → always escalate
  if (diagnostic.bugLocation === "human_required") return true;

  // Same fix failed before → escalate
  if (previousFixFailed) return true;

  // No root cause identified → escalate
  if (!diagnostic.filePath && diagnostic.confidence === "low") return true;

  return false;
}

/**
 * Validate the dev kit by running tsc and vitest in the supervisor directory.
 */
function validateDevKit(devKitDir: string): boolean {
  try {
    execFileSync("npx", ["tsc", "--noEmit"], {
      cwd: `${devKitDir}/supervisor`,
      encoding: "utf-8",
      timeout: 60_000,
    });
    execFileSync("npx", ["vitest", "run"], {
      cwd: `${devKitDir}/supervisor`,
      encoding: "utf-8",
      timeout: 120_000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Revert a file using git checkout.
 */
function revertFile(filePath: string | null, devKitDir: string): boolean {
  if (!filePath) return false;
  try {
    execFileSync("git", ["checkout", "--", filePath], {
      cwd: devKitDir,
      encoding: "utf-8",
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}
