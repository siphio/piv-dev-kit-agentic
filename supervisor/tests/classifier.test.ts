import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { classifyStall, isProcessAlive } from "../src/classifier.js";
import type { RegistryProject, MonitorConfig } from "../src/types.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import yaml from "js-yaml";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(os.tmpdir(), "piv-classifier-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeProject(overrides: Partial<RegistryProject> = {}): RegistryProject {
  return {
    name: "test-project",
    path: tmpDir,
    status: "running",
    heartbeat: new Date().toISOString(),
    currentPhase: 1,
    pivCommandsVersion: "abc1234",
    orchestratorPid: process.pid,
    registeredAt: new Date().toISOString(),
    lastCompletedPhase: null,
    ...overrides,
  };
}

function makeConfig(): MonitorConfig {
  return {
    intervalMs: 900000,
    heartbeatStaleMs: 900000, // 15 min
    maxRestartAttempts: 3,
    improvementLogPath: join(tmpDir, "improvement-log.md"),
    supervisorPidPath: join(tmpDir, "supervisor.pid"),
  };
}

describe("isProcessAlive", () => {
  it("returns true for current process PID", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it("returns false for definitely-dead PID", () => {
    expect(isProcessAlive(999999999)).toBe(false);
  });
});

describe("classifyStall", () => {
  it("returns null for project with fresh heartbeat", () => {
    const config = makeConfig();
    const project = makeProject({
      heartbeat: new Date(Date.now() - 60_000).toISOString(), // 1 minute old
    });

    const result = classifyStall(project, config);
    expect(result).toBeNull();
  });

  it("returns orchestrator_crashed for dead PID + stale heartbeat", () => {
    const config = makeConfig();
    const project = makeProject({
      orchestratorPid: 999999999,
      heartbeat: new Date(Date.now() - 20 * 60_000).toISOString(), // 20 min old
    });

    const result = classifyStall(project, config);
    expect(result).not.toBeNull();
    expect(result!.stallType).toBe("orchestrator_crashed");
    expect(result!.confidence).toBe("high");
    expect(result!.details).toContain("999999999");
    expect(result!.heartbeatAgeMs).toBeGreaterThanOrEqual(20 * 60_000);
  });

  it("returns session_hung for alive PID + stale heartbeat + no manifest clues", () => {
    const config = makeConfig();
    // tmpDir has no .agents/manifest.yaml, so no manifest clues
    const project = makeProject({
      orchestratorPid: process.pid,
      heartbeat: new Date(Date.now() - 20 * 60_000).toISOString(), // 20 min old
    });

    const result = classifyStall(project, config);
    expect(result).not.toBeNull();
    expect(result!.stallType).toBe("session_hung");
    expect(result!.confidence).toBe("low");
    expect(result!.details).toContain("no manifest clues");
  });

  it("returns execution_error for alive PID + stale heartbeat + pending failure in manifest", () => {
    const config = makeConfig();

    // Create .agents/manifest.yaml with a pending failure
    const agentsDir = join(tmpDir, ".agents");
    mkdirSync(agentsDir, { recursive: true });
    const manifest = {
      failures: [{ resolution: "pending", details: "test failure" }],
    };
    writeFileSync(join(agentsDir, "manifest.yaml"), yaml.dump(manifest), "utf-8");

    const project = makeProject({
      orchestratorPid: process.pid,
      heartbeat: new Date(Date.now() - 20 * 60_000).toISOString(), // 20 min old
    });

    const result = classifyStall(project, config);
    expect(result).not.toBeNull();
    expect(result!.stallType).toBe("execution_error");
    expect(result!.confidence).toBe("high");
    expect(result!.details).toContain("pending failure");
  });

  it("returns orchestrator_crashed when heartbeat is missing (empty string)", () => {
    const config = makeConfig();
    const project = makeProject({
      heartbeat: "",
      orchestratorPid: 999999999,
    });

    const result = classifyStall(project, config);
    expect(result).not.toBeNull();
    expect(result!.stallType).toBe("orchestrator_crashed");
  });

  it("returns null when heartbeat is in the future (clock skew)", () => {
    const config = makeConfig();
    const project = makeProject({
      heartbeat: new Date(Date.now() + 60 * 60_000).toISOString(), // 1 hour in the future
    });

    const result = classifyStall(project, config);
    expect(result).toBeNull();
  });

  it("returns null at exact threshold boundary", () => {
    const config = makeConfig();
    // Set heartbeat to exactly staleMs ago — heartbeatAgeMs should equal
    // heartbeatStaleMs, and the condition is strict less-than, so this should
    // NOT be fresh. However, given timing jitter in tests we need to be
    // precise: the code checks `heartbeatAgeMs < config.heartbeatStaleMs`.
    // At exact boundary heartbeatAgeMs === staleMs, so it should NOT be < staleMs,
    // meaning it IS stale. But due to test execution time, Date.now() will have
    // advanced slightly, making heartbeatAgeMs slightly > staleMs.
    //
    // To test the boundary correctly, we set the heartbeat to exactly (staleMs - 1)
    // ms ago, which should be just barely fresh.
    const project = makeProject({
      orchestratorPid: process.pid,
      heartbeat: new Date(Date.now() - config.heartbeatStaleMs + 1).toISOString(),
    });

    const result = classifyStall(project, config);
    // heartbeatAgeMs should be just under staleMs, so project is still fresh
    expect(result).toBeNull();
  });
});
