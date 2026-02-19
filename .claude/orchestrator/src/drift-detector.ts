// PIV Orchestrator — Cross-Phase Drift Detection (F5)

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { DriftResult, Manifest } from "./types.js";

const TEST_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes per suite

type TestRunner = "vitest" | "pytest" | "jest" | "unknown";

/**
 * Detect the test runner used by the project.
 * Checks package.json scripts and config files.
 */
export function detectTestRunner(projectDir: string): TestRunner {
  try {
    const pkgPath = join(projectDir, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(execFileSync("cat", [pkgPath], {
        encoding: "utf-8",
        timeout: 5_000,
      }));
      const testScript = pkg.scripts?.test ?? "";
      if (testScript.includes("vitest")) return "vitest";
      if (testScript.includes("jest")) return "jest";

      // Check devDependencies
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.vitest) return "vitest";
      if (deps.jest) return "jest";
    }
  } catch {
    // Fall through
  }

  // Check for pytest
  try {
    if (existsSync(join(projectDir, "pytest.ini")) ||
        existsSync(join(projectDir, "pyproject.toml")) ||
        existsSync(join(projectDir, "setup.cfg"))) {
      return "pytest";
    }
  } catch {
    // Fall through
  }

  return "unknown";
}

/**
 * Find test directories for a given phase.
 * Checks common patterns: tests/phase-N/, test/phase-N/, tests/phase_N/
 */
export function findTestDirectories(
  projectDir: string,
  phase: number,
  _manifest: Manifest
): string[] {
  const patterns = [
    `tests/phase-${phase}`,
    `test/phase-${phase}`,
    `tests/phase_${phase}`,
    `test/phase_${phase}`,
    `tests/phase${phase}`,
  ];

  const found: string[] = [];
  for (const pattern of patterns) {
    const dir = join(projectDir, pattern);
    if (existsSync(dir)) {
      found.push(pattern);
    }
  }

  return found;
}

interface TestSuiteResult {
  passed: number;
  failed: number;
  failedTests: string[];
}

/**
 * Run a single test suite, parse pass/fail counts.
 */
export function runTestSuite(
  projectDir: string,
  testDir: string,
  runner: TestRunner,
  timeoutMs: number = TEST_TIMEOUT_MS
): TestSuiteResult {
  const fullPath = join(projectDir, testDir);

  try {
    let cmd: string;
    let args: string[];

    switch (runner) {
      case "vitest":
        cmd = "npx";
        args = ["vitest", "run", fullPath, "--reporter=verbose"];
        break;
      case "jest":
        cmd = "npx";
        args = ["jest", fullPath, "--verbose"];
        break;
      case "pytest":
        cmd = "python";
        args = ["-m", "pytest", fullPath, "-v"];
        break;
      default:
        return { passed: 0, failed: 0, failedTests: [] };
    }

    const output = execFileSync(cmd, args, {
      cwd: projectDir,
      encoding: "utf-8",
      timeout: timeoutMs,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return parseTestOutput(output, runner);
  } catch (err: unknown) {
    // Test runners exit with non-zero on failures — parse the output
    if (err && typeof err === "object" && "stdout" in err) {
      const errObj = err as Record<string, unknown>;
      const output = String(errObj.stdout ?? "");
      const stderr = String(errObj.stderr ?? "");
      return parseTestOutput(output + "\n" + stderr, runner);
    }
    return { passed: 0, failed: 1, failedTests: ["(test runner failed to execute)"] };
  }
}

function parseTestOutput(output: string, runner: TestRunner): TestSuiteResult {
  let passed = 0;
  let failed = 0;
  const failedTests: string[] = [];

  switch (runner) {
    case "vitest": {
      // Vitest output: "Tests  3 passed | 1 failed"
      const summaryMatch = output.match(/Tests\s+(\d+)\s+passed(?:\s+\|\s+(\d+)\s+failed)?/);
      if (summaryMatch) {
        passed = parseInt(summaryMatch[1], 10);
        failed = summaryMatch[2] ? parseInt(summaryMatch[2], 10) : 0;
      }
      // Extract failed test names: "FAIL  path/to/test.ts > describe > test name"
      const failMatches = output.matchAll(/FAIL\s+(.+)/g);
      for (const match of failMatches) {
        failedTests.push(match[1].trim());
      }
      break;
    }
    case "jest": {
      // Jest output: "Tests:  1 failed, 3 passed, 4 total"
      const summaryMatch = output.match(/Tests:\s+(?:(\d+)\s+failed,\s+)?(\d+)\s+passed/);
      if (summaryMatch) {
        failed = summaryMatch[1] ? parseInt(summaryMatch[1], 10) : 0;
        passed = parseInt(summaryMatch[2], 10);
      }
      // Extract: "FAIL path/to/test.ts"
      const failMatches = output.matchAll(/FAIL\s+(.+)/g);
      for (const match of failMatches) {
        failedTests.push(match[1].trim());
      }
      break;
    }
    case "pytest": {
      // Pytest output: "3 passed, 1 failed" or "3 passed"
      const summaryMatch = output.match(/(\d+)\s+passed(?:,\s+(\d+)\s+failed)?/);
      if (summaryMatch) {
        passed = parseInt(summaryMatch[1], 10);
        failed = summaryMatch[2] ? parseInt(summaryMatch[2], 10) : 0;
      }
      // Extract: "FAILED tests/test_foo.py::test_bar"
      const failMatches = output.matchAll(/FAILED\s+(.+)/g);
      for (const match of failMatches) {
        failedTests.push(match[1].trim());
      }
      break;
    }
  }

  return { passed, failed, failedTests };
}

/**
 * Run prior-phase test suites, return regression results.
 * Returns regressionDetected: false if no prior-phase test dirs found.
 */
export function runRegressionTests(
  projectDir: string,
  currentPhase: number,
  manifest: Manifest
): DriftResult {
  const startTime = Date.now();
  const runner = detectTestRunner(projectDir);

  let totalPassed = 0;
  let totalFailed = 0;
  const allFailedTests: string[] = [];

  // Run tests for all prior phases
  for (let phase = 1; phase < currentPhase; phase++) {
    const testDirs = findTestDirectories(projectDir, phase, manifest);
    if (testDirs.length === 0) continue;

    for (const testDir of testDirs) {
      console.log(`    Running ${testDir} tests...`);
      const result = runTestSuite(projectDir, testDir, runner);
      totalPassed += result.passed;
      totalFailed += result.failed;
      allFailedTests.push(...result.failedTests);
    }
  }

  return {
    phase: currentPhase,
    testsRun: totalPassed + totalFailed,
    testsPassed: totalPassed,
    testsFailed: totalFailed,
    failedTests: allFailedTests,
    regressionDetected: totalFailed > 0,
    durationMs: Date.now() - startTime,
  };
}
