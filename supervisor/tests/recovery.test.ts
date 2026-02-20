import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  StallClassification,
  MonitorConfig,
  RegistryProject,
  RecoveryAction,
} from "../src/types.js";

vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => ({
    pid: 12345,
    unref: vi.fn(),
  })),
}));

vi.mock("../src/telegram.js", () => ({
  telegramSendEscalation: vi.fn(() => Promise.resolve({ ok: true })),
}));

import {
  determineRecovery,
  killProcess,
  spawnOrchestrator,
  executeRecovery,
} from "../src/recovery.js";
import { spawn } from "node:child_process";
import { telegramSendEscalation } from "../src/telegram.js";

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
    stallType: "session_hung",
    confidence: "high",
    details: "No heartbeat update for 5 minutes",
    heartbeatAgeMs: 300_000,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<MonitorConfig> = {}): MonitorConfig {
  return {
    intervalMs: 30_000,
    heartbeatStaleMs: 300_000,
    maxRestartAttempts: 3,
    improvementLogPath: "/tmp/improvement.log",
    supervisorPidPath: "/tmp/supervisor.pid",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("determineRecovery", () => {
  it("orchestrator_crashed → restart action", () => {
    const classification = makeClassification({ stallType: "orchestrator_crashed" });
    const action = determineRecovery(classification, 0, 3);
    expect(action.type).toBe("restart");

    // Always restart regardless of count
    const action2 = determineRecovery(classification, 5, 3);
    expect(action2.type).toBe("restart");
  });

  it("session_hung first occurrence → restart action", () => {
    const classification = makeClassification({ stallType: "session_hung" });
    const action = determineRecovery(classification, 0, 3);
    expect(action.type).toBe("restart");
    expect(action.stallType).toBe("session_hung");
    expect(action.restartCount).toBe(0);
  });

  it("session_hung after 2 restarts → escalate action", () => {
    const classification = makeClassification({ stallType: "session_hung" });
    const action = determineRecovery(classification, 2, 3);
    expect(action.type).toBe("escalate");
    expect(action.restartCount).toBe(2);
  });

  it("agent_waiting first occurrence → restart_with_preamble", () => {
    const classification = makeClassification({ stallType: "agent_waiting_for_input" });
    const action = determineRecovery(classification, 0, 3);
    expect(action.type).toBe("restart_with_preamble");
    expect(action.restartCount).toBe(0);
  });

  it("agent_waiting after 3 restarts → escalate", () => {
    const classification = makeClassification({ stallType: "agent_waiting_for_input" });
    const action = determineRecovery(classification, 3, 3);
    expect(action.type).toBe("escalate");
    expect(action.restartCount).toBe(3);
  });

  it("execution_error → diagnose action (Phase 7)", () => {
    const classification = makeClassification({ stallType: "execution_error" });

    const action0 = determineRecovery(classification, 0, 3);
    expect(action0.type).toBe("diagnose");

    const action5 = determineRecovery(classification, 5, 3);
    expect(action5.type).toBe("diagnose");
  });
});

describe("killProcess", () => {
  it("returns true when PID doesn't exist", async () => {
    const result = await killProcess(999999999);
    expect(result).toBe(true);
  });
});

describe("executeRecovery", () => {
  it("restart action calls spawnOrchestrator", async () => {
    const project = makeProject({ orchestratorPid: null });
    const action: RecoveryAction = {
      type: "restart",
      project,
      stallType: "orchestrator_crashed",
      details: "Process exited unexpectedly",
      restartCount: 0,
    };
    const config = makeConfig();

    const outcome = await executeRecovery(action, config);

    expect(spawn).toHaveBeenCalled();
    expect(outcome).toContain("restarted orchestrator");
    expect(outcome).toContain("12345");
  });

  it("diagnose action returns delegation message", async () => {
    const project = makeProject();
    const action: RecoveryAction = {
      type: "diagnose",
      project,
      stallType: "execution_error",
      details: "Pending failures in manifest",
      restartCount: 0,
    };
    const config = makeConfig();

    const outcome = await executeRecovery(action, config);

    expect(outcome).toContain("Diagnosis requested");
    expect(outcome).toContain("interventor");
  });

  it("escalate action calls telegramSendEscalation when configured", async () => {
    const project = makeProject();
    const action: RecoveryAction = {
      type: "escalate",
      project,
      stallType: "execution_error",
      details: "Build failed repeatedly",
      restartCount: 2,
    };
    const config = makeConfig({
      telegramToken: "fake-token",
      telegramChatId: 12345,
    });

    const outcome = await executeRecovery(action, config);

    expect(telegramSendEscalation).toHaveBeenCalledWith(
      { token: "fake-token", chatId: 12345 },
      project.name,
      project.currentPhase,
      "execution_error",
      "Build failed repeatedly",
      "Escalated after 2 restart(s)",
      2,
      3,
    );
    expect(outcome).toContain("Escalated to Telegram");
  });
});
