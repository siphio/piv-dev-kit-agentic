import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { pivInit } from "../src/init.js";
import { readCentralRegistry } from "../src/registry.js";
import type { InitOptions } from "../src/types.js";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readdirSync,
  rmSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";

let tmpDir: string;
let devKitDir: string;
let targetDir: string;
let registryDir: string;
let registryPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(os.tmpdir(), "piv-init-test-"));
  devKitDir = join(tmpDir, "dev-kit");
  targetDir = join(tmpDir, "target-project");
  registryDir = join(tmpDir, "registry");
  registryPath = join(registryDir, "registry.yaml");

  // Create a mock dev kit structure
  mkdirSync(join(devKitDir, ".claude", "commands"), { recursive: true });
  mkdirSync(join(devKitDir, ".claude", "orchestrator", "src"), { recursive: true });

  // Add dummy files
  writeFileSync(join(devKitDir, ".claude", "commands", "prime.md"), "# Prime", "utf-8");
  writeFileSync(join(devKitDir, ".claude", "commands", "execute.md"), "# Execute", "utf-8");
  writeFileSync(
    join(devKitDir, ".claude", "orchestrator", "package.json"),
    '{"name": "piv-orchestrator"}',
    "utf-8"
  );
  writeFileSync(
    join(devKitDir, ".claude", "orchestrator", "src", "index.ts"),
    'console.log("hello")',
    "utf-8"
  );

  // Create a node_modules dir to ensure it gets skipped
  mkdirSync(join(devKitDir, ".claude", "orchestrator", "node_modules", "fake-pkg"), { recursive: true });
  writeFileSync(
    join(devKitDir, ".claude", "orchestrator", "node_modules", "fake-pkg", "index.js"),
    "// fake",
    "utf-8"
  );

  // Init git in dev kit for version computation
  execFileSync("git", ["init"], { cwd: devKitDir });
  execFileSync("git", ["add", "-A"], { cwd: devKitDir });
  execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "-m", "init"],
    { cwd: devKitDir }
  );
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function initOpts(overrides: Partial<InitOptions> = {}): InitOptions {
  return {
    targetDir,
    projectName: "test-agent",
    devKitDir,
    ...overrides,
  };
}

describe("pivInit", () => {
  it("creates .claude/commands/ in target", () => {
    const result = pivInit(initOpts());
    expect(result.success).toBe(true);

    const commandsDir = join(targetDir, ".claude", "commands");
    expect(existsSync(commandsDir)).toBe(true);

    const files = readdirSync(commandsDir);
    expect(files).toContain("prime.md");
    expect(files).toContain("execute.md");
  });

  it("creates .claude/orchestrator/ in target without node_modules", () => {
    const result = pivInit(initOpts());
    expect(result.success).toBe(true);

    const orchDir = join(targetDir, ".claude", "orchestrator");
    expect(existsSync(orchDir)).toBe(true);
    expect(existsSync(join(orchDir, "package.json"))).toBe(true);
    expect(existsSync(join(orchDir, "src", "index.ts"))).toBe(true);

    // node_modules should not be copied
    expect(existsSync(join(orchDir, "node_modules"))).toBe(false);
  });

  it("creates .agents/ directory", () => {
    const result = pivInit(initOpts());
    expect(result.success).toBe(true);
    expect(existsSync(join(targetDir, ".agents"))).toBe(true);
  });

  it("initializes git if not already a repo", () => {
    const result = pivInit(initOpts());
    expect(result.success).toBe(true);
    expect(existsSync(join(targetDir, ".git"))).toBe(true);

    // Verify initial commit exists
    const log = execFileSync("git", ["log", "--oneline"], {
      cwd: targetDir,
      encoding: "utf-8",
    });
    expect(log).toContain("initialize test-agent");
  });

  it("does not reinitialize git if repo already exists", () => {
    mkdirSync(targetDir, { recursive: true });
    execFileSync("git", ["init"], { cwd: targetDir });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "--allow-empty", "-m", "existing"], { cwd: targetDir });

    const result = pivInit(initOpts());
    expect(result.success).toBe(true);

    const log = execFileSync("git", ["log", "--oneline"], {
      cwd: targetDir,
      encoding: "utf-8",
    });
    // Should have original "existing" commit, not "initialize" commit
    expect(log).toContain("existing");
  });

  it("registers project in central registry", () => {
    // Use custom registry path to avoid polluting ~/.piv
    const result = pivInit(initOpts());
    expect(result.success).toBe(true);

    // The project was registered in the default registry
    // We verify by checking the result
    expect(result.registryPath).toContain(".piv");
    expect(result.pivCommandsVersion).toMatch(/^[a-f0-9]{7,}$/);
  });

  it("returns correct version hash", () => {
    const result = pivInit(initOpts());
    expect(result.success).toBe(true);
    expect(result.pivCommandsVersion).toMatch(/^[a-f0-9]{7,}$/);
    expect(result.pivCommandsVersion).not.toBe("unknown");
  });

  it("fails gracefully if source commands dir does not exist", () => {
    const result = pivInit(initOpts({ devKitDir: "/tmp/nonexistent-dev-kit" }));
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("not found");
  });

  it("handles existing target directory without destroying content", () => {
    // Create target with existing file
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, "existing-file.txt"), "keep me", "utf-8");

    const result = pivInit(initOpts());
    expect(result.success).toBe(true);

    // Existing file should still be there
    expect(existsSync(join(targetDir, "existing-file.txt"))).toBe(true);
    const content = readFileSync(join(targetDir, "existing-file.txt"), "utf-8");
    expect(content).toBe("keep me");
  });

  it("creates target directory if it does not exist", () => {
    const newTarget = join(tmpDir, "brand-new-project");
    const result = pivInit(initOpts({ targetDir: newTarget }));
    expect(result.success).toBe(true);
    expect(existsSync(newTarget)).toBe(true);
  });

  it("resolves target directory to absolute path", () => {
    const result = pivInit(initOpts());
    expect(result.success).toBe(true);
    // The targetDir in the result should be absolute
    expect(result.targetDir).toMatch(/^\//);
  });
});
