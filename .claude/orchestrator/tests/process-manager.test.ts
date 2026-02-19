import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  writePidFile,
  readPidFile,
  removePidFile,
  isProcessAlive,
  checkForRunningInstance,
} from "../src/process-manager.js";
import { mkdtempSync, existsSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(os.tmpdir(), "piv-test-"));
  mkdirSync(join(tmpDir, ".agents"), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("writePidFile", () => {
  it("writes valid JSON with pid, startedAt, projectDir", () => {
    writePidFile(tmpDir);
    const filePath = join(tmpDir, ".agents/orchestrator.pid");
    expect(existsSync(filePath)).toBe(true);

    const content = JSON.parse(readFileSync(filePath, "utf-8"));
    expect(content.pid).toBe(process.pid);
    expect(content.projectDir).toBe(tmpDir);
    expect(typeof content.startedAt).toBe("string");
    expect(new Date(content.startedAt).getTime()).not.toBeNaN();
  });

  it("creates .agents directory if missing", () => {
    const bareDir = mkdtempSync(join(os.tmpdir(), "piv-bare-"));
    writePidFile(bareDir);
    expect(existsSync(join(bareDir, ".agents/orchestrator.pid"))).toBe(true);
    rmSync(bareDir, { recursive: true, force: true });
  });
});

describe("readPidFile", () => {
  it("returns null when file does not exist", () => {
    expect(readPidFile(tmpDir)).toBeNull();
  });

  it("returns ProcessInfo when file is valid", () => {
    writePidFile(tmpDir);
    const info = readPidFile(tmpDir);
    expect(info).not.toBeNull();
    expect(info!.pid).toBe(process.pid);
    expect(info!.projectDir).toBe(tmpDir);
  });

  it("returns null for invalid JSON", () => {
    const filePath = join(tmpDir, ".agents/orchestrator.pid");
    const { writeFileSync } = require("node:fs");
    writeFileSync(filePath, "not valid json", "utf-8");
    expect(readPidFile(tmpDir)).toBeNull();
  });
});

describe("removePidFile", () => {
  it("deletes the PID file", () => {
    writePidFile(tmpDir);
    const filePath = join(tmpDir, ".agents/orchestrator.pid");
    expect(existsSync(filePath)).toBe(true);
    removePidFile(tmpDir);
    expect(existsSync(filePath)).toBe(false);
  });

  it("does not throw when file is missing", () => {
    expect(() => removePidFile(tmpDir)).not.toThrow();
  });
});

describe("isProcessAlive", () => {
  it("returns true for the current process", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it("returns false for a non-existent PID", () => {
    expect(isProcessAlive(999999999)).toBe(false);
  });
});

describe("checkForRunningInstance", () => {
  it("returns { running: false } when no PID file exists", () => {
    expect(checkForRunningInstance(tmpDir)).toEqual({ running: false });
  });

  it("returns { running: true, pid } when process is alive", () => {
    writePidFile(tmpDir);
    const result = checkForRunningInstance(tmpDir);
    expect(result.running).toBe(true);
    expect(result.pid).toBe(process.pid);
  });

  it("returns { running: false } and removes stale PID file for dead process", () => {
    // Write a PID file with a non-existent PID
    const filePath = join(tmpDir, ".agents/orchestrator.pid");
    const { writeFileSync } = require("node:fs");
    writeFileSync(filePath, JSON.stringify({
      pid: 999999999,
      startedAt: new Date().toISOString(),
      projectDir: tmpDir,
    }), "utf-8");

    const result = checkForRunningInstance(tmpDir);
    expect(result.running).toBe(false);
    expect(existsSync(filePath)).toBe(false);
  });
});
