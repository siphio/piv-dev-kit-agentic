// PIV Supervisor — Fix Propagator
// Copies fixed framework files to all registered projects, updates versions, restarts orchestrators.

import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { readCentralRegistry, writeCentralRegistry } from "./registry.js";
import { getDevKitVersion } from "./version.js";
import { spawnOrchestrator } from "./recovery.js";
import type { RegistryProject, PropagationResult, InterventorConfig } from "./types.js";

/**
 * Propagate a fixed file from the dev kit to all registered projects.
 * Framework is canonical — overwrites project copies (per SC-008).
 *
 * For each project:
 * 1. Compute the relative path within the dev kit
 * 2. Copy the file to the same relative path in the project
 * 3. Update pivCommandsVersion in the registry
 * 4. Restart the orchestrator
 */
export function propagateFixToProjects(
  fixedFilePath: string,
  projects: RegistryProject[],
  config: InterventorConfig,
): PropagationResult[] {
  const results: PropagationResult[] = [];
  const currentVersion = getDevKitVersion(config.devKitDir);
  const srcAbsolute = join(config.devKitDir, fixedFilePath);

  if (!existsSync(srcAbsolute)) {
    return projects.map((p) => ({
      project: p.name,
      success: false,
      filesCopied: [],
      newVersion: currentVersion,
      orchestratorRestarted: false,
      error: `Source file not found: ${srcAbsolute}`,
    }));
  }

  for (const project of projects) {
    try {
      const destAbsolute = join(project.path, fixedFilePath);
      const destDir = dirname(destAbsolute);

      // Create destination directory if needed
      if (!existsSync(destDir)) {
        mkdirSync(destDir, { recursive: true });
      }

      // Copy the fixed file (overwrite — framework is canonical)
      cpSync(srcAbsolute, destAbsolute);

      // Restart the orchestrator
      const child = spawnOrchestrator(project.path);
      const restarted = child !== null;

      results.push({
        project: project.name,
        success: true,
        filesCopied: [fixedFilePath],
        newVersion: currentVersion,
        orchestratorRestarted: restarted,
      });
    } catch (err) {
      results.push({
        project: project.name,
        success: false,
        filesCopied: [],
        newVersion: currentVersion,
        orchestratorRestarted: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Update registry versions for successful propagations
  try {
    const registryPath = config.devKitDir
      ? undefined // use default registry path
      : undefined;
    const registry = readCentralRegistry(registryPath);
    for (const result of results) {
      if (result.success && registry.projects[result.project]) {
        registry.projects[result.project].pivCommandsVersion = result.newVersion;
      }
    }
    writeCentralRegistry(registry, registryPath);
  } catch {
    // Best-effort registry update — propagation itself succeeded
  }

  return results;
}

/**
 * Get projects whose pivCommandsVersion doesn't match the current dev kit version.
 */
export function getOutdatedProjects(
  currentVersion: string,
  registryPath?: string,
): RegistryProject[] {
  const registry = readCentralRegistry(registryPath);
  return Object.values(registry.projects).filter(
    (p) => p.pivCommandsVersion !== currentVersion,
  );
}

/**
 * Revert a file in the dev kit using git checkout.
 * Returns true on success, false on failure.
 */
export function revertFix(filePath: string, devKitDir: string): boolean {
  try {
    execFileSync("git", ["checkout", "--", filePath], {
      cwd: devKitDir,
      encoding: "utf-8",
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
}
