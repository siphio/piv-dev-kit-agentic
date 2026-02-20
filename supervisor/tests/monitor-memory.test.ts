import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

vi.mock("../src/registry.js", () => ({
  readCentralRegistry: vi.fn(),
  writeCentralRegistry: vi.fn(),
}));

vi.mock("../src/classifier.js", () => ({
  classifyStall: vi.fn(),
}));

vi.mock("../src/recovery.js", () => ({
  determineRecovery: vi.fn(),
  executeRecovery: vi.fn(),
  killProcess: vi.fn(() => Promise.resolve(true)),
  spawnOrchestrator: vi.fn(() => ({ pid: 12345, unref: vi.fn() })),
}));

vi.mock("../src/improvement-log.js", () => ({
  appendToImprovementLog: vi.fn(),
}));

vi.mock("../src/config.js", () => ({
  loadInterventorConfig: vi.fn(() => ({
    devKitDir: "/tmp/dev-kit",
    diagnosisBudgetUsd: 0.5,
    fixBudgetUsd: 2.0,
    diagnosisMaxTurns: 15,
    fixMaxTurns: 30,
    timeoutMs: 300000,
  })),
  loadMemoryConfig: vi.fn(() => ({
    apiKey: "sm_test_key",
    enabled: true,
    containerTagPrefix: "project_",
    searchThreshold: 0.4,
    searchLimit: 5,
    entityContext: "Test entity context.",
  })),
}));

vi.mock("../src/interventor.js", () => ({
  diagnoseStall: vi.fn(),
  classifyBugLocation: vi.fn(),
  applyFrameworkHotFix: vi.fn(),
  applyProjectFix: vi.fn(),
  shouldEscalate: vi.fn(),
}));

vi.mock("../src/propagator.js", () => ({
  propagateFixToProjects: vi.fn(() => []),
  getOutdatedProjects: vi.fn(() => []),
}));

vi.mock("../src/telegram.js", () => ({
  telegramSendFixFailure: vi.fn(() => Promise.resolve({ ok: true })),
}));

vi.mock("../src/memory.js", () => ({
  createMemoryClient: vi.fn(),
  recallSimilarFixes: vi.fn(),
  storeFixRecord: vi.fn(),
}));

import { runMonitorCycle } from "../src/monitor.js";
import type {
  MonitorConfig,
  RegistryProject,
  CentralRegistry,
  StallClassification,
  RecoveryAction,
  DiagnosticResult,
  HotFixResult,
} from "../src/types.js";
import { readCentralRegistry, writeCentralRegistry } from "../src/registry.js";
import { classifyStall } from "../src/classifier.js";
import { determineRecovery, executeRecovery } from "../src/recovery.js";
import { appendToImprovementLog } from "../src/improvement-log.js";
import { diagnoseStall, classifyBugLocation, shouldEscalate, applyFrameworkHotFix } from "../src/interventor.js";
import { createMemoryClient, recallSimilarFixes, storeFixRecord } from "../src/memory.js";

let tmpDir: string;

function makeConfig(dir: string): MonitorConfig {
  return {
    intervalMs: 900000,
    heartbeatStaleMs: 900000,
    maxRestartAttempts: 3,
    improvementLogPath: join(dir, "improvement-log.md"),
    supervisorPidPath: join(dir, "supervisor.pid"),
  };
}

function makeProject(overrides: Partial<RegistryProject> = {}): RegistryProject {
  return {
    name: "test-project",
    path: "/tmp/test",
    status: "running" as const,
    heartbeat: new Date().toISOString(),
    currentPhase: 2,
    pivCommandsVersion: "abc1234",
    orchestratorPid: process.pid,
    registeredAt: new Date().toISOString(),
    lastCompletedPhase: 1,
    ...overrides,
  };
}

function makeRegistry(projects: RegistryProject[]): CentralRegistry {
  const map: Record<string, RegistryProject> = {};
  for (const p of projects) {
    map[p.name] = p;
  }
  return { projects: map, lastUpdated: new Date().toISOString() };
}

function setupDiagnoseFlow(project: RegistryProject) {
  const classification: StallClassification = {
    project,
    stallType: "execution_error",
    confidence: "high",
    details: "PID alive, 1 pending failure in manifest",
    heartbeatAgeMs: 1500000,
  };
  vi.mocked(classifyStall).mockReturnValue(classification);

  const diagnoseAction: RecoveryAction = {
    type: "diagnose",
    project,
    stallType: "execution_error",
    details: "PID alive, 1 pending failure in manifest",
    restartCount: 0,
  };
  vi.mocked(determineRecovery).mockReturnValue(diagnoseAction);

  return { classification, diagnoseAction };
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(os.tmpdir(), "piv-monitor-memory-test-"));
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("handleDiagnosis — memory integration", () => {
  it("calls recallSimilarFixes before diagnoseStall when client is available", async () => {
    const project = makeProject({ name: "memory-proj" });
    vi.mocked(readCentralRegistry).mockReturnValue(makeRegistry([project]));
    setupDiagnoseFlow(project);

    // Memory is available
    const mockClient = {} as ReturnType<typeof createMemoryClient>;
    vi.mocked(createMemoryClient).mockReturnValue(mockClient);
    vi.mocked(recallSimilarFixes).mockResolvedValue([
      { id: "mem_1", text: "Past fix: Added null check", similarity: 0.85, metadata: { phase: "2" } },
    ]);

    const diagnostic: DiagnosticResult = {
      bugLocation: "human_required",
      confidence: "high",
      rootCause: "Missing API key",
      filePath: null,
      errorCategory: "integration_auth",
      multiProjectPattern: false,
      affectedProjects: ["memory-proj"],
    };
    vi.mocked(diagnoseStall).mockResolvedValue(diagnostic);
    vi.mocked(classifyBugLocation).mockReturnValue(diagnostic);
    vi.mocked(shouldEscalate).mockReturnValue(true);

    await runMonitorCycle(makeConfig(tmpDir));

    // recallSimilarFixes called twice (project-scoped + cross-project)
    expect(recallSimilarFixes).toHaveBeenCalledTimes(2);
    // diagnoseStall called with memory context
    expect(diagnoseStall).toHaveBeenCalledTimes(1);
    const diagArgs = vi.mocked(diagnoseStall).mock.calls[0];
    // The 4th argument is memoryContext
    expect(diagArgs[3]).toBeDefined();
    expect(diagArgs[3]).toContain("Past fix: Added null check");
  });

  it("calls storeFixRecord after successful framework fix", async () => {
    const project = makeProject({ name: "fix-store-proj" });
    vi.mocked(readCentralRegistry).mockReturnValue(makeRegistry([project]));
    setupDiagnoseFlow(project);

    const mockClient = {} as ReturnType<typeof createMemoryClient>;
    vi.mocked(createMemoryClient).mockReturnValue(mockClient);
    vi.mocked(recallSimilarFixes).mockResolvedValue([]);

    const diagnostic: DiagnosticResult = {
      bugLocation: "framework_bug",
      confidence: "high",
      rootCause: "Null check missing",
      filePath: ".claude/orchestrator/src/hooks-parser.ts",
      errorCategory: "syntax_error",
      multiProjectPattern: false,
      affectedProjects: ["fix-store-proj"],
    };
    vi.mocked(diagnoseStall).mockResolvedValue(diagnostic);
    vi.mocked(classifyBugLocation).mockReturnValue(diagnostic);
    vi.mocked(shouldEscalate).mockReturnValue(false);

    const mockFix: HotFixResult = {
      success: true,
      filePath: ".claude/orchestrator/src/hooks-parser.ts",
      linesChanged: 5,
      validationPassed: true,
      revertedOnFailure: false,
      details: "Added null check",
      sessionCostUsd: 0.25,
    };
    vi.mocked(applyFrameworkHotFix).mockResolvedValue(mockFix);
    vi.mocked(storeFixRecord).mockResolvedValue({ id: "doc_new", status: "queued" });

    await runMonitorCycle(makeConfig(tmpDir));

    expect(storeFixRecord).toHaveBeenCalledTimes(1);
    const storeArgs = vi.mocked(storeFixRecord).mock.calls[0];
    expect(storeArgs[1].metadata.error_category).toBe("syntax_error");
    expect(storeArgs[1].containerTag).toBe("project_fix-store-proj");
  });

  it("completes pipeline without error when memory client is null", async () => {
    const project = makeProject({ name: "no-memory-proj" });
    vi.mocked(readCentralRegistry).mockReturnValue(makeRegistry([project]));
    setupDiagnoseFlow(project);

    // Memory not available
    vi.mocked(createMemoryClient).mockReturnValue(null);

    const diagnostic: DiagnosticResult = {
      bugLocation: "human_required",
      confidence: "high",
      rootCause: "Missing API key",
      filePath: null,
      errorCategory: "integration_auth",
      multiProjectPattern: false,
      affectedProjects: ["no-memory-proj"],
    };
    vi.mocked(diagnoseStall).mockResolvedValue(diagnostic);
    vi.mocked(classifyBugLocation).mockReturnValue(diagnostic);
    vi.mocked(shouldEscalate).mockReturnValue(true);

    const result = await runMonitorCycle(makeConfig(tmpDir));

    expect(result.interventionsAttempted).toBe(1);
    expect(result.escalated).toBe(1);
    expect(recallSimilarFixes).not.toHaveBeenCalled();
    expect(storeFixRecord).not.toHaveBeenCalled();
  });

  it("completes pipeline when memory search fails", async () => {
    const project = makeProject({ name: "search-fail-proj" });
    vi.mocked(readCentralRegistry).mockReturnValue(makeRegistry([project]));
    setupDiagnoseFlow(project);

    const mockClient = {} as ReturnType<typeof createMemoryClient>;
    vi.mocked(createMemoryClient).mockReturnValue(mockClient);
    vi.mocked(recallSimilarFixes).mockResolvedValue([]); // Returns empty on failure

    const diagnostic: DiagnosticResult = {
      bugLocation: "human_required",
      confidence: "low",
      rootCause: "Unknown error",
      filePath: null,
      errorCategory: "execution_error",
      multiProjectPattern: false,
      affectedProjects: ["search-fail-proj"],
    };
    vi.mocked(diagnoseStall).mockResolvedValue(diagnostic);
    vi.mocked(classifyBugLocation).mockReturnValue(diagnostic);
    vi.mocked(shouldEscalate).mockReturnValue(true);

    const result = await runMonitorCycle(makeConfig(tmpDir));

    expect(result.escalated).toBe(1);
    // diagnoseStall called without memory context (empty results → undefined)
    const diagArgs = vi.mocked(diagnoseStall).mock.calls[0];
    expect(diagArgs[3]).toBeUndefined();
  });

  it("fix still reported as successful when memory store fails", async () => {
    const project = makeProject({ name: "store-fail-proj" });
    vi.mocked(readCentralRegistry).mockReturnValue(makeRegistry([project]));
    setupDiagnoseFlow(project);

    const mockClient = {} as ReturnType<typeof createMemoryClient>;
    vi.mocked(createMemoryClient).mockReturnValue(mockClient);
    vi.mocked(recallSimilarFixes).mockResolvedValue([]);

    const diagnostic: DiagnosticResult = {
      bugLocation: "framework_bug",
      confidence: "high",
      rootCause: "Null check missing",
      filePath: ".claude/orchestrator/src/hooks-parser.ts",
      errorCategory: "syntax_error",
      multiProjectPattern: false,
      affectedProjects: ["store-fail-proj"],
    };
    vi.mocked(diagnoseStall).mockResolvedValue(diagnostic);
    vi.mocked(classifyBugLocation).mockReturnValue(diagnostic);
    vi.mocked(shouldEscalate).mockReturnValue(false);

    const mockFix: HotFixResult = {
      success: true,
      filePath: ".claude/orchestrator/src/hooks-parser.ts",
      linesChanged: 5,
      validationPassed: true,
      revertedOnFailure: false,
      details: "Added null check",
      sessionCostUsd: 0.25,
    };
    vi.mocked(applyFrameworkHotFix).mockResolvedValue(mockFix);
    vi.mocked(storeFixRecord).mockResolvedValue(null); // Store failed

    const result = await runMonitorCycle(makeConfig(tmpDir));

    // Fix still counted as recovered despite memory store failure
    expect(result.recovered).toBe(1);
    expect(result.escalated).toBe(0);
  });
});
