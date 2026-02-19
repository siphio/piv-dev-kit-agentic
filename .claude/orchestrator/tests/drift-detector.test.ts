import { describe, it, expect } from "vitest";
import {
  detectTestRunner,
  findTestDirectories,
  runRegressionTests,
} from "../src/drift-detector.js";
import type { Manifest } from "../src/types.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

function baseManifest(): Manifest {
  return {
    phases: {
      1: { plan: "complete", execution: "complete", validation: "pass" },
      2: { plan: "complete", execution: "not_started", validation: "not_run" },
    },
    settings: {
      profile_freshness_window: "7d",
      checkpoint_before_execute: true,
      mode: "autonomous",
      reasoning_model: "opus-4-6",
      validation_mode: "full",
      agent_teams: "prefer_parallel",
    },
    profiles: {},
    last_updated: "2026-02-18",
  };
}

describe("detectTestRunner", () => {
  it("detects vitest from package.json", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "drift-test-"));
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({
      scripts: { test: "vitest run" },
      devDependencies: { vitest: "^3.0.0" },
    }));
    expect(detectTestRunner(tmpDir)).toBe("vitest");
    rmSync(tmpDir, { recursive: true });
  });

  it("detects jest from package.json", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "drift-test-"));
    writeFileSync(join(tmpDir, "package.json"), JSON.stringify({
      scripts: { test: "jest" },
      devDependencies: { jest: "^29.0.0" },
    }));
    expect(detectTestRunner(tmpDir)).toBe("jest");
    rmSync(tmpDir, { recursive: true });
  });

  it("returns unknown for empty directory", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "drift-test-"));
    expect(detectTestRunner(tmpDir)).toBe("unknown");
    rmSync(tmpDir, { recursive: true });
  });
});

describe("findTestDirectories", () => {
  it("finds tests/phase-1 directory", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "drift-test-"));
    mkdirSync(join(tmpDir, "tests", "phase-1"), { recursive: true });
    const dirs = findTestDirectories(tmpDir, 1, baseManifest());
    expect(dirs).toContain("tests/phase-1");
    rmSync(tmpDir, { recursive: true });
  });

  it("returns empty array when no test dirs exist", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "drift-test-"));
    const dirs = findTestDirectories(tmpDir, 1, baseManifest());
    expect(dirs).toHaveLength(0);
    rmSync(tmpDir, { recursive: true });
  });

  it("finds multiple test directory patterns", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "drift-test-"));
    mkdirSync(join(tmpDir, "tests", "phase-1"), { recursive: true });
    mkdirSync(join(tmpDir, "test", "phase-1"), { recursive: true });
    const dirs = findTestDirectories(tmpDir, 1, baseManifest());
    expect(dirs).toHaveLength(2);
    rmSync(tmpDir, { recursive: true });
  });
});

describe("runRegressionTests", () => {
  it("returns no regression for phase 1 (no prior phases)", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "drift-test-"));
    const result = runRegressionTests(tmpDir, 1, baseManifest());
    expect(result.regressionDetected).toBe(false);
    expect(result.testsRun).toBe(0);
    expect(result.phase).toBe(1);
    rmSync(tmpDir, { recursive: true });
  });

  it("returns no regression when no test directories exist", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "drift-test-"));
    const result = runRegressionTests(tmpDir, 2, baseManifest());
    expect(result.regressionDetected).toBe(false);
    expect(result.testsRun).toBe(0);
    rmSync(tmpDir, { recursive: true });
  });

  it("includes duration in results", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "drift-test-"));
    const result = runRegressionTests(tmpDir, 2, baseManifest());
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    rmSync(tmpDir, { recursive: true });
  });
});
