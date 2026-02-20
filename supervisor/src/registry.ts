// PIV Supervisor — Central Project Registry (~/.piv/registry.yaml)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import yaml from "js-yaml";
import type { CentralRegistry, RegistryProject, ProjectStatus } from "./types.js";

const REGISTRY_DIR = join(homedir(), ".piv");
const REGISTRY_FILE = "registry.yaml";

/**
 * Get the default path to the central registry file.
 */
export function getRegistryPath(): string {
  return join(REGISTRY_DIR, REGISTRY_FILE);
}

/**
 * Create an empty registry structure.
 */
function emptyRegistry(): CentralRegistry {
  return { projects: {}, lastUpdated: new Date().toISOString() };
}

/**
 * Read and parse the central registry. Returns empty registry if missing or invalid.
 */
export function readCentralRegistry(registryPath?: string): CentralRegistry {
  const filePath = registryPath ?? getRegistryPath();
  if (!existsSync(filePath)) {
    return emptyRegistry();
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = yaml.load(content) as CentralRegistry;
    if (!parsed || typeof parsed.projects !== "object") {
      return emptyRegistry();
    }
    return parsed;
  } catch {
    return emptyRegistry();
  }
}

/**
 * Write registry to disk. Creates directory if needed. Updates lastUpdated.
 */
export function writeCentralRegistry(registry: CentralRegistry, registryPath?: string): void {
  const filePath = registryPath ?? getRegistryPath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  registry.lastUpdated = new Date().toISOString();
  writeFileSync(filePath, yaml.dump(registry, { lineWidth: -1 }), "utf-8");
}

/**
 * Register or update a project in the central registry.
 */
export function registerProject(project: RegistryProject, registryPath?: string): CentralRegistry {
  const registry = readCentralRegistry(registryPath);
  registry.projects[project.name] = project;
  writeCentralRegistry(registry, registryPath);
  return registry;
}

/**
 * Remove a project from the registry by name.
 */
export function deregisterProject(name: string, registryPath?: string): CentralRegistry {
  const registry = readCentralRegistry(registryPath);
  delete registry.projects[name];
  writeCentralRegistry(registry, registryPath);
  return registry;
}

/**
 * Update heartbeat, phase, PID, and status for a project.
 */
export function updateHeartbeat(
  name: string,
  phase: number | null,
  pid: number | null,
  status: ProjectStatus,
  registryPath?: string
): CentralRegistry {
  const registry = readCentralRegistry(registryPath);
  const project = registry.projects[name];
  if (project) {
    project.heartbeat = new Date().toISOString();
    project.currentPhase = phase;
    project.orchestratorPid = pid;
    project.status = status;
  }
  writeCentralRegistry(registry, registryPath);
  return registry;
}

/**
 * Look up a single project by name.
 */
export function getProject(name: string, registryPath?: string): RegistryProject | null {
  const registry = readCentralRegistry(registryPath);
  return registry.projects[name] ?? null;
}

/**
 * List all registered projects as an array.
 */
export function listProjects(registryPath?: string): RegistryProject[] {
  const registry = readCentralRegistry(registryPath);
  return Object.values(registry.projects);
}

/**
 * Check if a process with the given PID is alive.
 * Uses signal 0 (existence check without sending a signal).
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPERM") return true; // exists but no permission
    return false; // ESRCH = no such process
  }
}

/**
 * Prune projects with dead orchestrator PIDs.
 * Sets their status to "idle" and clears orchestratorPid.
 */
export function pruneDeadProjects(registryPath?: string): CentralRegistry {
  const registry = readCentralRegistry(registryPath);

  for (const project of Object.values(registry.projects)) {
    if (project.orchestratorPid !== null && !isProcessAlive(project.orchestratorPid)) {
      project.status = "idle";
      project.orchestratorPid = null;
    }
  }

  writeCentralRegistry(registry, registryPath);
  return registry;
}
