import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  writeSignal,
  readSignal,
  clearSignal,
  startSignalWatcher,
  stopSignalWatcher,
  signalPath,
} from "../src/signal-handler.js";
import type { SignalMessage } from "../src/types.js";
import { mkdtempSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(os.tmpdir(), "piv-signal-test-"));
  mkdirSync(join(tmpDir, ".agents"), { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const testSignal: SignalMessage = {
  action: "pause",
  timestamp: "2026-02-19T10:00:00Z",
  from: "project-a",
};

describe("signalPath", () => {
  it("returns correct path under .agents/", () => {
    const path = signalPath(tmpDir);
    expect(path).toBe(join(tmpDir, ".agents/orchestrator.signal"));
  });
});

describe("writeSignal", () => {
  it("creates JSON file at correct path", () => {
    writeSignal(tmpDir, testSignal);
    expect(existsSync(signalPath(tmpDir))).toBe(true);

    const content = JSON.parse(
      require("node:fs").readFileSync(signalPath(tmpDir), "utf-8")
    );
    expect(content.action).toBe("pause");
    expect(content.from).toBe("project-a");
  });
});

describe("readSignal", () => {
  it("returns null when file does not exist", () => {
    expect(readSignal(tmpDir)).toBeNull();
  });

  it("returns parsed signal when file exists", () => {
    writeSignal(tmpDir, testSignal);
    const signal = readSignal(tmpDir);
    expect(signal).not.toBeNull();
    expect(signal!.action).toBe("pause");
    expect(signal!.from).toBe("project-a");
  });

  it("returns null for invalid JSON", () => {
    const { writeFileSync } = require("node:fs");
    writeFileSync(signalPath(tmpDir), "bad json", "utf-8");
    expect(readSignal(tmpDir)).toBeNull();
  });
});

describe("clearSignal", () => {
  it("removes the signal file", () => {
    writeSignal(tmpDir, testSignal);
    expect(existsSync(signalPath(tmpDir))).toBe(true);
    clearSignal(tmpDir);
    expect(existsSync(signalPath(tmpDir))).toBe(false);
  });

  it("does not throw when file is missing", () => {
    expect(() => clearSignal(tmpDir)).not.toThrow();
  });
});

describe("startSignalWatcher / stopSignalWatcher", () => {
  it("calls onSignal when signal file appears", async () => {
    const onSignal = vi.fn();
    const timer = startSignalWatcher(tmpDir, onSignal, 50);

    // Write signal after a short delay
    await new Promise((resolve) => setTimeout(resolve, 20));
    writeSignal(tmpDir, testSignal);

    // Wait for watcher to pick it up
    await new Promise((resolve) => setTimeout(resolve, 120));

    stopSignalWatcher(timer);

    expect(onSignal).toHaveBeenCalledTimes(1);
    expect(onSignal).toHaveBeenCalledWith(testSignal);
  });

  it("clears signal file after processing", async () => {
    const onSignal = vi.fn();
    const timer = startSignalWatcher(tmpDir, onSignal, 50);

    writeSignal(tmpDir, testSignal);
    await new Promise((resolve) => setTimeout(resolve, 120));

    stopSignalWatcher(timer);

    expect(existsSync(signalPath(tmpDir))).toBe(false);
  });

  it("stopSignalWatcher stops polling", async () => {
    const onSignal = vi.fn();
    const timer = startSignalWatcher(tmpDir, onSignal, 50);

    stopSignalWatcher(timer);

    // Write signal after stopping
    writeSignal(tmpDir, testSignal);
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(onSignal).not.toHaveBeenCalled();
  });
});
