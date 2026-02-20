import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  RegistryProject,
  StallClassification,
  DiagnosticResult,
  InterventorConfig,
  BugLocation,
} from "../src/types.js";

// Mock Agent SDK
vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  query: vi.fn(),
}));

// Mock child_process for validation/revert
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import {
  diagnoseStall,
  classifyBugLocation,
  applyFrameworkHotFix,
  applyProjectFix,
  shouldEscalate,
} from "../src/interventor.js";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { execFileSync } from "node:child_process";

function makeProject(overrides: Partial<RegistryProject> = {}): RegistryProject {
  return {
    name: "test-project",
    path: "/tmp/test-project",
    status: "running",
    heartbeat: new Date().toISOString(),
    currentPhase: 2,
    pivCommandsVersion: "abc1234",
    orchestratorPid: 9999,
    registeredAt: new Date().toISOString(),
    lastCompletedPhase: 1,
    ...overrides,
  };
}

function makeClassification(overrides: Partial<StallClassification> = {}): StallClassification {
  return {
    project: makeProject(),
    stallType: "execution_error",
    confidence: "high",
    details: "PID alive, 1 pending failure(s) in manifest",
    heartbeatAgeMs: 1200000,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<InterventorConfig> = {}): InterventorConfig {
  return {
    devKitDir: "/tmp/piv-dev-kit",
    diagnosisBudgetUsd: 0.5,
    fixBudgetUsd: 2.0,
    diagnosisMaxTurns: 15,
    fixMaxTurns: 30,
    timeoutMs: 300000,
    ...overrides,
  };
}

function makeDiagnostic(overrides: Partial<DiagnosticResult> = {}): DiagnosticResult {
  return {
    bugLocation: "framework_bug",
    confidence: "high",
    rootCause: "Missing null check in session-manager.ts",
    filePath: ".claude/orchestrator/src/session-manager.ts",
    errorCategory: "syntax_error",
    multiProjectPattern: false,
    affectedProjects: ["test-project"],
    ...overrides,
  };
}

// Helper to create an async generator from an array of messages
function mockQueryGenerator(messages: Array<Record<string, unknown>>) {
  return async function* () {
    for (const msg of messages) {
      yield msg;
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("diagnoseStall", () => {
  it("runs read-only diagnosis session and parses result", async () => {
    const jsonResult = JSON.stringify({
      rootCause: "Missing null check in hooks-parser.ts",
      filePath: ".claude/orchestrator/src/hooks-parser.ts",
      errorCategory: "syntax_error",
      bugLocation: "framework_bug",
      confidence: "high",
    });

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([
        { type: "system", session_id: "test-session" },
        { type: "result", subtype: "success", result_text: jsonResult },
      ])() as ReturnType<typeof query>,
    );

    const result = await diagnoseStall(
      makeProject(),
      makeClassification(),
      makeConfig(),
    );

    expect(query).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(query).mock.calls[0][0];
    expect(callArgs.options.allowedTools).toEqual(["Read", "Glob", "Grep"]);
    expect(callArgs.options.cwd).toBe("/tmp/test-project");
    expect(result.bugLocation).toBe("framework_bug");
    expect(result.rootCause).toContain("hooks-parser.ts");
    expect(result.filePath).toBe(".claude/orchestrator/src/hooks-parser.ts");
  });

  it("uses read-only tools only for diagnosis", async () => {
    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([
        { type: "system", session_id: "test-session" },
        { type: "result", subtype: "success", result_text: '{"rootCause":"test","filePath":null,"errorCategory":"test","bugLocation":"human_required","confidence":"low"}' },
      ])() as ReturnType<typeof query>,
    );

    await diagnoseStall(makeProject(), makeClassification(), makeConfig());

    const callArgs = vi.mocked(query).mock.calls[0][0];
    expect(callArgs.options.allowedTools).toEqual(["Read", "Glob", "Grep"]);
    expect(callArgs.options.allowedTools).not.toContain("Bash");
    expect(callArgs.options.allowedTools).not.toContain("Edit");
    expect(callArgs.options.allowedTools).not.toContain("Write");
  });

  it("returns human_required when session fails", async () => {
    vi.mocked(query).mockReturnValue(
      (async function* () {
        throw new Error("Session timeout");
      })() as ReturnType<typeof query>,
    );

    const result = await diagnoseStall(
      makeProject(),
      makeClassification(),
      makeConfig(),
    );

    expect(result.bugLocation).toBe("human_required");
    expect(result.confidence).toBe("low");
    expect(result.rootCause).toContain("Session timeout");
  });
});

describe("classifyBugLocation", () => {
  it("classifies .claude/commands/ path as framework_bug", () => {
    const diagnostic = makeDiagnostic({
      filePath: ".claude/commands/execute.md",
      bugLocation: "project_bug",
    });

    const result = classifyBugLocation(diagnostic, []);
    expect(result.bugLocation).toBe("framework_bug");
  });

  it("classifies .claude/orchestrator/ path as framework_bug", () => {
    const diagnostic = makeDiagnostic({
      filePath: ".claude/orchestrator/src/session-manager.ts",
      bugLocation: "project_bug",
    });

    const result = classifyBugLocation(diagnostic, []);
    expect(result.bugLocation).toBe("framework_bug");
  });

  it("classifies src/ path as project_bug", () => {
    const diagnostic = makeDiagnostic({
      filePath: "src/api/handler.ts",
      bugLocation: "framework_bug",
    });

    const result = classifyBugLocation(diagnostic, []);
    expect(result.bugLocation).toBe("project_bug");
  });

  it("detects multi-project pattern (2+ same phase+type)", () => {
    const diagnostic = makeDiagnostic({ bugLocation: "project_bug" });
    const stall1 = makeClassification({
      project: makeProject({ name: "proj-a", currentPhase: 2 }),
      stallType: "execution_error",
    });
    const stall2 = makeClassification({
      project: makeProject({ name: "proj-b", currentPhase: 2 }),
      stallType: "execution_error",
    });

    const result = classifyBugLocation(diagnostic, [stall1, stall2]);
    expect(result.bugLocation).toBe("framework_bug");
    expect(result.confidence).toBe("high");
    expect(result.multiProjectPattern).toBe(true);
    expect(result.affectedProjects).toEqual(["proj-a", "proj-b"]);
  });

  it("credential error → human_required", () => {
    const diagnostic = makeDiagnostic({
      errorCategory: "integration_auth",
      bugLocation: "framework_bug",
    });

    const result = classifyBugLocation(diagnostic, []);
    expect(result.bugLocation).toBe("human_required");
  });
});

describe("applyFrameworkHotFix", () => {
  it("success path: SDK fixes, validation passes", async () => {
    const jsonResult = JSON.stringify({
      success: true,
      filePath: ".claude/orchestrator/src/hooks-parser.ts",
      linesChanged: 5,
      details: "Added null check for empty hooks",
    });

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([
        { type: "system", session_id: "fix-session" },
        { type: "result", subtype: "success", result_text: jsonResult, total_cost_usd: 0.25 },
      ])() as ReturnType<typeof query>,
    );

    // Validation succeeds (tsc + vitest)
    vi.mocked(execFileSync).mockReturnValue("");

    const result = await applyFrameworkHotFix(
      makeDiagnostic(),
      makeConfig(),
    );

    expect(result.success).toBe(true);
    expect(result.validationPassed).toBe(true);
    expect(result.linesChanged).toBe(5);
    expect(result.revertedOnFailure).toBe(false);
  });

  it("failure path: validation fails, git revert called", async () => {
    const jsonResult = JSON.stringify({
      success: true,
      filePath: ".claude/orchestrator/src/hooks-parser.ts",
      linesChanged: 3,
      details: "Attempted fix",
    });

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([
        { type: "system", session_id: "fix-session" },
        { type: "result", subtype: "success", result_text: jsonResult },
      ])() as ReturnType<typeof query>,
    );

    // Validation fails (tsc fails)
    vi.mocked(execFileSync)
      .mockImplementationOnce(() => { throw new Error("tsc error"); })
      .mockReturnValue(""); // git checkout succeeds

    const result = await applyFrameworkHotFix(
      makeDiagnostic(),
      makeConfig(),
    );

    expect(result.success).toBe(false);
    expect(result.validationPassed).toBe(false);
    expect(result.revertedOnFailure).toBe(true);
    expect(result.details).toContain("validation failed");
  });
});

describe("applyProjectFix", () => {
  it("opens session with project cwd", async () => {
    const project = makeProject({ path: "/tmp/my-agent" });
    const jsonResult = JSON.stringify({
      success: true,
      filePath: "src/api/handler.ts",
      linesChanged: 10,
      details: "Fixed null pointer",
    });

    vi.mocked(query).mockReturnValue(
      mockQueryGenerator([
        { type: "system", session_id: "proj-fix" },
        { type: "result", subtype: "success", result_text: jsonResult },
      ])() as ReturnType<typeof query>,
    );

    const result = await applyProjectFix(
      project,
      makeDiagnostic({ bugLocation: "project_bug" }),
      makeConfig(),
    );

    const callArgs = vi.mocked(query).mock.calls[0][0];
    expect(callArgs.options.cwd).toBe("/tmp/my-agent");
    expect(result.success).toBe(true);
  });
});

describe("shouldEscalate", () => {
  it("returns true for human_required", () => {
    const diagnostic = makeDiagnostic({ bugLocation: "human_required" });
    expect(shouldEscalate(diagnostic, false)).toBe(true);
  });

  it("returns true when same fix failed before", () => {
    const diagnostic = makeDiagnostic({ bugLocation: "framework_bug" });
    expect(shouldEscalate(diagnostic, true)).toBe(true);
  });

  it("returns true for low confidence with no file path", () => {
    const diagnostic = makeDiagnostic({
      bugLocation: "framework_bug",
      confidence: "low",
      filePath: null,
    });
    expect(shouldEscalate(diagnostic, false)).toBe(true);
  });

  it("returns false for actionable framework bug", () => {
    const diagnostic = makeDiagnostic({
      bugLocation: "framework_bug",
      confidence: "high",
      filePath: ".claude/commands/execute.md",
    });
    expect(shouldEscalate(diagnostic, false)).toBe(false);
  });
});
