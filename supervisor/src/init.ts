// PIV Supervisor — `piv init` Project Bootstrapper

import { existsSync, mkdirSync, cpSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { getDevKitVersion } from "./version.js";
import { registerProject, getRegistryPath } from "./registry.js";
import type { InitOptions, InitResult } from "./types.js";

/**
 * Bootstrap a new PIV-powered project:
 * 1. Copy .claude/commands/ and .claude/orchestrator/ from dev kit
 * 2. Create .agents/ directory
 * 3. Initialize git if needed
 * 4. Register in central registry
 */
export function pivInit(options: InitOptions): InitResult {
  const { projectName, devKitDir } = options;
  const targetDir = resolve(options.targetDir);
  const errors: string[] = [];

  // Validate source directories exist
  const commandsSrc = join(devKitDir, ".claude", "commands");
  const orchestratorSrc = join(devKitDir, ".claude", "orchestrator");

  if (!existsSync(commandsSrc)) {
    return {
      success: false,
      projectName,
      targetDir,
      registryPath: getRegistryPath(),
      pivCommandsVersion: "unknown",
      errors: [`Source commands directory not found: ${commandsSrc}`],
    };
  }

  if (!existsSync(orchestratorSrc)) {
    return {
      success: false,
      projectName,
      targetDir,
      registryPath: getRegistryPath(),
      pivCommandsVersion: "unknown",
      errors: [`Source orchestrator directory not found: ${orchestratorSrc}`],
    };
  }

  // Create target directory if needed
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  // Copy .claude/commands/
  const commandsDest = join(targetDir, ".claude", "commands");
  try {
    mkdirSync(join(targetDir, ".claude"), { recursive: true });
    cpSync(commandsSrc, commandsDest, { recursive: true });
  } catch (err) {
    errors.push(`Failed to copy commands: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Copy .claude/orchestrator/ (skip node_modules and dist)
  const orchestratorDest = join(targetDir, ".claude", "orchestrator");
  try {
    cpSync(orchestratorSrc, orchestratorDest, {
      recursive: true,
      filter: (src) => !src.includes("node_modules") && !src.includes("/dist/"),
    });
  } catch (err) {
    errors.push(`Failed to copy orchestrator: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Create .agents/ directory
  const agentsDir = join(targetDir, ".agents");
  if (!existsSync(agentsDir)) {
    mkdirSync(agentsDir, { recursive: true });
  }

  // Initialize git if no repo exists
  if (!existsSync(join(targetDir, ".git"))) {
    try {
      execFileSync("git", ["init"], { cwd: targetDir, encoding: "utf-8", timeout: 10_000 });
      execFileSync("git", ["add", "-A"], { cwd: targetDir, encoding: "utf-8", timeout: 10_000 });
      execFileSync("git", ["commit", "-m", `chore: initialize ${projectName} project`], {
        cwd: targetDir,
        encoding: "utf-8",
        timeout: 10_000,
      });
    } catch (err) {
      errors.push(`Git init failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Compute version
  const pivCommandsVersion = getDevKitVersion(devKitDir);

  // Register in central registry
  try {
    const now = new Date().toISOString();
    registerProject({
      name: projectName,
      path: targetDir,
      status: "idle",
      heartbeat: now,
      currentPhase: null,
      pivCommandsVersion,
      orchestratorPid: null,
      registeredAt: now,
      lastCompletedPhase: null,
    });
  } catch (err) {
    errors.push(`Registry registration failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Verify key directories were created
  const expectedDirs = [commandsDest, orchestratorDest, agentsDir];
  for (const dir of expectedDirs) {
    if (!existsSync(dir)) {
      errors.push(`Expected directory not created: ${dir}`);
    }
  }

  // Check commands were actually copied
  if (existsSync(commandsDest)) {
    const copiedFiles = readdirSync(commandsDest);
    if (copiedFiles.length === 0) {
      errors.push("Commands directory is empty after copy");
    }
  }

  return {
    success: errors.length === 0,
    projectName,
    targetDir,
    registryPath: getRegistryPath(),
    pivCommandsVersion,
    errors,
  };
}
