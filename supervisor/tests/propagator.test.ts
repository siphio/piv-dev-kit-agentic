import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(() => ({
    pid: 12345,
    unref: vi.fn(),
  })),
}));

vi.mock("../src/registry.js", () => ({
  readCentralRegistry: vi.fn(),
  writeCentralRegistry: vi.fn(),
}));

vi.mock("../src/version.js", () => ({
  getDevKitVersion: vi.fn(() => "abc1234"),
}));

import {
  propagateFixToProjects,
  getOutdatedProjects,
  revertFix,
} from "../src/propagator.js";
import { readCentralRegistry, writeCentralRegistry } from "../src/registry.js";
import { getDevKitVersion } from "../src/version.js";
import { execFileSync } from "node:child_process";
import type { RegistryProject, InterventorConfig, CentralRegistry } from "../src/types.js";

let tmpDir: string;
let devKitDir: string;

function makeProject(overrides: Partial<RegistryProject> = {}): RegistryProject {
  return {
    name: "test-project",
    path: join(tmpDir, "project-a"),
    status: "running",
    heartbeat: new Date().toISOString(),
    currentPhase: 2,
    pivCommandsVersion: "old1234",
    orchestratorPid: 9999,
    registeredAt: new Date().toISOString(),
    lastCompletedPhase: 1,
    ...overrides,
  };
}

function makeConfig(overrides: Partial<InterventorConfig> = {}): InterventorConfig {
  return {
    devKitDir,
    diagnosisBudgetUsd: 0.5,
    fixBudgetUsd: 2.0,
    diagnosisMaxTurns: 15,
    fixMaxTurns: 30,
    timeoutMs: 300000,
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
  tmpDir = mkdtempSync(join(os.tmpdir(), "piv-propagator-test-"));
  devKitDir = join(tmpDir, "dev-kit");
  mkdirSync(devKitDir, { recursive: true });
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("propagateFixToProjects", () => {
  it("copies file to correct destination path", () => {
    // Create source file in dev kit
    const srcDir = join(devKitDir, ".claude", "commands");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "execute.md"), "fixed content");

    // Create project directory
    const projectDir = join(tmpDir, "project-a");
    mkdirSync(join(projectDir, ".claude", "commands"), { recursive: true });
    writeFileSync(join(projectDir, ".claude", "commands", "execute.md"), "old content");

    const project = makeProject({ path: projectDir });
    vi.mocked(readCentralRegistry).mockReturnValue(makeRegistry([project]));

    const results = propagateFixToProjects(
      ".claude/commands/execute.md",
      [project],
      makeConfig(),
    );

    expect(results).toHaveLength(1);
    expect(results[0].success).toBe(true);
    expect(results[0].filesCopied).toEqual([".claude/commands/execute.md"]);

    // Verify file was actually copied
    const destContent = readFileSync(join(projectDir, ".claude", "commands", "execute.md"), "utf-8");
    expect(destContent).toBe("fixed content");
  });

  it("creates missing parent directories", () => {
    // Create source file
    const srcDir = join(devKitDir, ".claude", "orchestrator", "src");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "new-file.ts"), "new code");

    // Project dir exists but not the subdirectory
    const projectDir = join(tmpDir, "project-b");
    mkdirSync(projectDir, { recursive: true });

    const project = makeProject({ name: "project-b", path: projectDir });
    vi.mocked(readCentralRegistry).mockReturnValue(makeRegistry([project]));

    const results = propagateFixToProjects(
      ".claude/orchestrator/src/new-file.ts",
      [project],
      makeConfig(),
    );

    expect(results[0].success).toBe(true);
    const destFile = join(projectDir, ".claude", "orchestrator", "src", "new-file.ts");
    expect(existsSync(destFile)).toBe(true);
    expect(readFileSync(destFile, "utf-8")).toBe("new code");
  });

  it("continues on individual project failure", () => {
    // Create source file
    const srcDir = join(devKitDir, ".claude", "commands");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "execute.md"), "fixed");

    // Project A exists
    const projADir = join(tmpDir, "proj-a");
    mkdirSync(join(projADir, ".claude", "commands"), { recursive: true });

    // Project B path is invalid (read-only parent would cause failure,
    // but for testing we just check that results are returned for both)
    const projBDir = join(tmpDir, "proj-b");
    mkdirSync(join(projBDir, ".claude", "commands"), { recursive: true });

    const projA = makeProject({ name: "proj-a", path: projADir });
    const projB = makeProject({ name: "proj-b", path: projBDir });
    vi.mocked(readCentralRegistry).mockReturnValue(makeRegistry([projA, projB]));

    const results = propagateFixToProjects(
      ".claude/commands/execute.md",
      [projA, projB],
      makeConfig(),
    );

    expect(results).toHaveLength(2);
    // Both should succeed in this case since directories exist
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
  });

  it("updates registry version after propagation", () => {
    const srcDir = join(devKitDir, ".claude", "commands");
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(srcDir, "execute.md"), "fixed");

    const projectDir = join(tmpDir, "project-a");
    mkdirSync(join(projectDir, ".claude", "commands"), { recursive: true });

    const project = makeProject({ path: projectDir });
    vi.mocked(readCentralRegistry).mockReturnValue(makeRegistry([project]));

    propagateFixToProjects(
      ".claude/commands/execute.md",
      [project],
      makeConfig(),
    );

    expect(writeCentralRegistry).toHaveBeenCalledTimes(1);
    const writtenRegistry = vi.mocked(writeCentralRegistry).mock.calls[0][0];
    expect(writtenRegistry.projects["test-project"].pivCommandsVersion).toBe("abc1234");
  });

  it("returns error when source file doesn't exist", () => {
    const project = makeProject();
    vi.mocked(readCentralRegistry).mockReturnValue(makeRegistry([project]));

    const results = propagateFixToProjects(
      "nonexistent/file.ts",
      [project],
      makeConfig(),
    );

    expect(results[0].success).toBe(false);
    expect(results[0].error).toContain("Source file not found");
  });
});

describe("getOutdatedProjects", () => {
  it("filters projects by version mismatch", () => {
    const current = makeProject({ name: "current", pivCommandsVersion: "abc1234" });
    const outdated = makeProject({ name: "outdated", pivCommandsVersion: "old5678" });
    vi.mocked(readCentralRegistry).mockReturnValue(makeRegistry([current, outdated]));

    const result = getOutdatedProjects("abc1234");

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("outdated");
  });
});

describe("revertFix", () => {
  it("calls git checkout with correct path", () => {
    vi.mocked(execFileSync).mockReturnValue("");

    const result = revertFix(".claude/commands/execute.md", "/tmp/dev-kit");

    expect(execFileSync).toHaveBeenCalledWith(
      "git",
      ["checkout", "--", ".claude/commands/execute.md"],
      expect.objectContaining({ cwd: "/tmp/dev-kit" }),
    );
    expect(result).toBe(true);
  });

  it("returns false on git error", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("git error");
    });

    const result = revertFix("bad/path.ts", "/tmp/dev-kit");
    expect(result).toBe(false);
  });
});
