import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { appendToImprovementLog } from "../src/improvement-log.js";
import type { ImprovementLogEntry } from "../src/types.js";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

let tmpDir: string;
let logPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(os.tmpdir(), "piv-improvement-log-test-"));
  logPath = join(tmpDir, "improvement-log.md");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeEntry(overrides: Partial<ImprovementLogEntry> = {}): ImprovementLogEntry {
  return {
    timestamp: "2026-02-20T12:00:00Z",
    project: "test-project",
    phase: 2,
    stallType: "orchestrator_crashed",
    action: "restart",
    outcome: "Orchestrator restarted successfully",
    details: "PID 12345 was dead",
    ...overrides,
  };
}

describe("appendToImprovementLog", () => {
  it("creates log file if missing", () => {
    expect(existsSync(logPath)).toBe(false);

    appendToImprovementLog(makeEntry(), logPath);

    expect(existsSync(logPath)).toBe(true);
  });

  it("creates parent directory if missing", () => {
    const deepPath = join(tmpDir, "subdir", "deep", "improvement-log.md");

    appendToImprovementLog(makeEntry(), deepPath);

    expect(existsSync(deepPath)).toBe(true);
  });

  it("appends entry in correct markdown format", () => {
    appendToImprovementLog(makeEntry(), logPath);

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("# PIV Supervisor — Improvement Log");
    expect(content).toContain("2026-02-20T12:00:00Z");
    expect(content).toContain("test-project");
    expect(content).toContain("orchestrator_crashed");
    expect(content).toContain("Phase 2");
    expect(content).toContain("**Stall:**");
    expect(content).toContain("**Action:** restart");
    expect(content).toContain("**Outcome:** Orchestrator restarted successfully");
    expect(content).toContain("**Details:** PID 12345 was dead");
  });

  it("multiple entries accumulate (don't overwrite)", () => {
    const entry1 = makeEntry({ project: "project-alpha", stallType: "orchestrator_crashed" });
    const entry2 = makeEntry({ project: "project-beta", stallType: "session_hung" });

    appendToImprovementLog(entry1, logPath);
    appendToImprovementLog(entry2, logPath);

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("project-alpha");
    expect(content).toContain("project-beta");
    expect(content).toContain("orchestrator_crashed");
    expect(content).toContain("session_hung");

    // Header should appear only once
    const headerCount = content.split("# PIV Supervisor — Improvement Log").length - 1;
    expect(headerCount).toBe(1);
  });

  it("never throws even with invalid path", () => {
    expect(() => {
      appendToImprovementLog(makeEntry(), "/root/impossible/path.md");
    }).not.toThrow();
  });

  it("handles null phase correctly", () => {
    appendToImprovementLog(makeEntry({ phase: null }), logPath);

    const content = readFileSync(logPath, "utf-8");
    expect(content).toContain("N/A");
    expect(content).not.toContain("Phase null");
  });
});
