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

import { runMonitorCycle } from "../src/monitor.js";
import type {
  MonitorConfig,
  RegistryProject,
  CentralRegistry,
  StallClassification,
  RecoveryAction,
} from "../src/types.js";
import { readCentralRegistry, writeCentralRegistry } from "../src/registry.js";
import { classifyStall } from "../src/classifier.js";
import { determineRecovery, executeRecovery } from "../src/recovery.js";
import { appendToImprovementLog } from "../src/improvement-log.js";
import { diagnoseStall, classifyBugLocation, shouldEscalate, applyFrameworkHotFix } from "../src/interventor.js";
import type { DiagnosticResult, HotFixResult } from "../src/types.js";

let tmpDir: string;

function makeConfig(tmpDir: string): MonitorConfig {
  return {
    intervalMs: 900000,
    heartbeatStaleMs: 900000,
    maxRestartAttempts: 3,
    improvementLogPath: join(tmpDir, "improvement-log.md"),
    supervisorPidPath: join(tmpDir, "supervisor.pid"),
  };
}

function makeProject(overrides: Partial<RegistryProject> = {}): RegistryProject {
  return {
    name: "test-project",
    path: "/tmp/test",
    status: "running" as const,
    heartbeat: new Date().toISOString(),
    currentPhase: 1,
    pivCommandsVersion: "abc1234",
    orchestratorPid: process.pid,
    registeredAt: new Date().toISOString(),
    lastCompletedPhase: null,
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

beforeEach(() => {
  tmpDir = mkdtempSync(join(os.tmpdir(), "piv-monitor-test-"));
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("runMonitorCycle", () => {
  it("healthy cycle: all projects fresh → no interventions", async () => {
    const projects = [
      makeProject({ name: "proj-a" }),
      makeProject({ name: "proj-b" }),
      makeProject({ name: "proj-c" }),
    ];
    vi.mocked(readCentralRegistry).mockReturnValue(makeRegistry(projects));
    vi.mocked(classifyStall).mockReturnValue(null);

    const result = await runMonitorCycle(makeConfig(tmpDir));

    expect(result.projectsChecked).toBe(3);
    expect(result.stalled).toBe(0);
    expect(result.recovered).toBe(0);
    expect(result.escalated).toBe(0);
    expect(classifyStall).toHaveBeenCalledTimes(3);
    expect(determineRecovery).not.toHaveBeenCalled();
    expect(executeRecovery).not.toHaveBeenCalled();
  });

  it("detects one crashed project and triggers restart", async () => {
    const healthy = makeProject({ name: "healthy" });
    const crashed = makeProject({ name: "crashed" });
    vi.mocked(readCentralRegistry).mockReturnValue(
      makeRegistry([healthy, crashed]),
    );

    const crashedClassification: StallClassification = {
      project: crashed,
      stallType: "orchestrator_crashed",
      confidence: "high",
      details: "PID 12345 is dead",
      heartbeatAgeMs: 1200000,
    };
    vi.mocked(classifyStall)
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(crashedClassification);

    const restartAction: RecoveryAction = {
      type: "restart",
      project: crashed,
      stallType: "orchestrator_crashed",
      details: "PID 12345 is dead",
      restartCount: 0,
    };
    vi.mocked(determineRecovery).mockReturnValue(restartAction);
    vi.mocked(executeRecovery).mockResolvedValue("restarted");

    const result = await runMonitorCycle(makeConfig(tmpDir));

    expect(result.projectsChecked).toBe(2);
    expect(result.stalled).toBe(1);
    expect(result.recovered).toBe(1);
    expect(result.escalated).toBe(0);
    expect(determineRecovery).toHaveBeenCalledTimes(1);
    expect(executeRecovery).toHaveBeenCalledTimes(1);
  });

  it("diagnoses and escalates on execution_error when shouldEscalate is true", async () => {
    const errorProject = makeProject({ name: "error-proj" });
    vi.mocked(readCentralRegistry).mockReturnValue(
      makeRegistry([errorProject]),
    );

    const errorClassification: StallClassification = {
      project: errorProject,
      stallType: "execution_error",
      confidence: "high",
      details: "PID alive, 2 pending failure(s) in manifest",
      heartbeatAgeMs: 1500000,
    };
    vi.mocked(classifyStall).mockReturnValue(errorClassification);

    const diagnoseAction: RecoveryAction = {
      type: "diagnose",
      project: errorProject,
      stallType: "execution_error",
      details: "PID alive, 2 pending failure(s) in manifest",
      restartCount: 0,
    };
    vi.mocked(determineRecovery).mockReturnValue(diagnoseAction);

    const mockDiagnostic: DiagnosticResult = {
      bugLocation: "human_required",
      confidence: "high",
      rootCause: "Missing API key",
      filePath: null,
      errorCategory: "integration_auth",
      multiProjectPattern: false,
      affectedProjects: ["error-proj"],
    };
    vi.mocked(diagnoseStall).mockResolvedValue(mockDiagnostic);
    vi.mocked(classifyBugLocation).mockReturnValue(mockDiagnostic);
    vi.mocked(shouldEscalate).mockReturnValue(true);

    const result = await runMonitorCycle(makeConfig(tmpDir));

    expect(result.projectsChecked).toBe(1);
    expect(result.stalled).toBe(1);
    expect(result.recovered).toBe(0);
    expect(result.escalated).toBe(1);
    expect(result.interventionsAttempted).toBe(1);
    expect(diagnoseStall).toHaveBeenCalledTimes(1);
  });

  it("diagnoses and fixes framework bug on execution_error", async () => {
    const errorProject = makeProject({ name: "fix-proj" });
    vi.mocked(readCentralRegistry).mockReturnValue(
      makeRegistry([errorProject]),
    );

    const errorClassification: StallClassification = {
      project: errorProject,
      stallType: "execution_error",
      confidence: "high",
      details: "PID alive, 1 pending failure in manifest",
      heartbeatAgeMs: 1500000,
    };
    vi.mocked(classifyStall).mockReturnValue(errorClassification);

    const diagnoseAction: RecoveryAction = {
      type: "diagnose",
      project: errorProject,
      stallType: "execution_error",
      details: "PID alive, 1 pending failure in manifest",
      restartCount: 0,
    };
    vi.mocked(determineRecovery).mockReturnValue(diagnoseAction);

    const mockDiagnostic: DiagnosticResult = {
      bugLocation: "framework_bug",
      confidence: "high",
      rootCause: "Null check missing",
      filePath: ".claude/orchestrator/src/hooks-parser.ts",
      errorCategory: "syntax_error",
      multiProjectPattern: false,
      affectedProjects: ["fix-proj"],
    };
    vi.mocked(diagnoseStall).mockResolvedValue(mockDiagnostic);
    vi.mocked(classifyBugLocation).mockReturnValue(mockDiagnostic);
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

    const result = await runMonitorCycle(makeConfig(tmpDir));

    expect(result.projectsChecked).toBe(1);
    expect(result.stalled).toBe(1);
    expect(result.recovered).toBe(1);
    expect(result.escalated).toBe(0);
    expect(result.interventionsAttempted).toBe(1);
    expect(applyFrameworkHotFix).toHaveBeenCalledTimes(1);
  });

  it("handles empty registry gracefully", async () => {
    vi.mocked(readCentralRegistry).mockReturnValue({
      projects: {},
      lastUpdated: new Date().toISOString(),
    });

    const result = await runMonitorCycle(makeConfig(tmpDir));

    expect(result.projectsChecked).toBe(0);
    expect(result.stalled).toBe(0);
    expect(result.recovered).toBe(0);
    expect(result.escalated).toBe(0);
    expect(classifyStall).not.toHaveBeenCalled();
  });

  it("skips non-running projects", async () => {
    const idle = makeProject({ name: "idle-proj", status: "idle" });
    const complete = makeProject({ name: "done-proj", status: "complete" });
    vi.mocked(readCentralRegistry).mockReturnValue(
      makeRegistry([idle, complete]),
    );

    const result = await runMonitorCycle(makeConfig(tmpDir));

    expect(result.projectsChecked).toBe(0);
    expect(classifyStall).not.toHaveBeenCalled();
  });

  it("logs intervention to improvement log", async () => {
    const stalledProject = makeProject({ name: "stalled-proj", currentPhase: 3 });
    vi.mocked(readCentralRegistry).mockReturnValue(
      makeRegistry([stalledProject]),
    );

    const classification: StallClassification = {
      project: stalledProject,
      stallType: "session_hung",
      confidence: "medium",
      details: "PID alive, manifest also stale",
      heartbeatAgeMs: 2000000,
    };
    vi.mocked(classifyStall).mockReturnValue(classification);

    const restartAction: RecoveryAction = {
      type: "restart",
      project: stalledProject,
      stallType: "session_hung",
      details: "PID alive, manifest also stale",
      restartCount: 0,
    };
    vi.mocked(determineRecovery).mockReturnValue(restartAction);
    vi.mocked(executeRecovery).mockResolvedValue("restarted");

    await runMonitorCycle(makeConfig(tmpDir));

    expect(appendToImprovementLog).toHaveBeenCalledTimes(1);
    const call = vi.mocked(appendToImprovementLog).mock.calls[0];
    const entry = call[0];
    expect(entry).toMatchObject({
      project: "stalled-proj",
      phase: 3,
      stallType: "session_hung",
      action: "restart",
      outcome: "restarted",
      details: "PID alive, manifest also stale",
    });
    expect(entry.timestamp).toBeDefined();
    // Second arg is the log path
    expect(call[1]).toBe(join(tmpDir, "improvement-log.md"));
  });

  it("updates registry after interventions", async () => {
    const project = makeProject({ name: "update-proj" });
    vi.mocked(readCentralRegistry).mockReturnValue(
      makeRegistry([project]),
    );

    const classification: StallClassification = {
      project,
      stallType: "orchestrator_crashed",
      confidence: "high",
      details: "PID dead",
      heartbeatAgeMs: 1200000,
    };
    vi.mocked(classifyStall).mockReturnValue(classification);

    const restartAction: RecoveryAction = {
      type: "restart",
      project,
      stallType: "orchestrator_crashed",
      details: "PID dead",
      restartCount: 0,
    };
    vi.mocked(determineRecovery).mockReturnValue(restartAction);
    vi.mocked(executeRecovery).mockResolvedValue("restarted");

    await runMonitorCycle(makeConfig(tmpDir));

    expect(writeCentralRegistry).toHaveBeenCalledTimes(1);
    const writtenRegistry = vi.mocked(writeCentralRegistry).mock.calls[0][0];
    expect(writtenRegistry.projects).toBeDefined();
  });
});
