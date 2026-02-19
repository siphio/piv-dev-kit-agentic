// PIV Orchestrator — Global Instance Registry (multi-instance support)

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { isProcessAlive } from "./process-manager.js";
import type { RegistryInstance, InstanceRegistry } from "./types.js";

const REGISTRY_DIR = join(homedir(), ".piv-orchestrator");
const REGISTRY_FILE = "registry.json";

/**
 * Get the absolute path to the global registry file.
 */
export function getRegistryPath(): string {
  return join(REGISTRY_DIR, REGISTRY_FILE);
}

/**
 * Read and parse the global registry. Returns empty registry if missing or invalid.
 */
export function readRegistry(registryPath?: string): InstanceRegistry {
  const filePath = registryPath ?? getRegistryPath();
  if (!existsSync(filePath)) {
    return { instances: [], lastUpdated: new Date().toISOString() };
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content) as InstanceRegistry;
    if (!Array.isArray(parsed.instances)) {
      return { instances: [], lastUpdated: new Date().toISOString() };
    }
    return parsed;
  } catch {
    return { instances: [], lastUpdated: new Date().toISOString() };
  }
}

/**
 * Write registry to disk. Creates directory if needed.
 */
export function writeRegistry(registry: InstanceRegistry, registryPath?: string): void {
  const filePath = registryPath ?? getRegistryPath();
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  registry.lastUpdated = new Date().toISOString();
  writeFileSync(filePath, JSON.stringify(registry, null, 2), "utf-8");
}

/**
 * Remove entries with dead PIDs from the registry.
 */
export function pruneStaleInstances(registry: InstanceRegistry): InstanceRegistry {
  return {
    ...registry,
    instances: registry.instances.filter((inst) => isProcessAlive(inst.pid)),
  };
}

/**
 * Register an instance. Prunes stale entries first, then adds or updates
 * the entry matching by projectDir.
 */
export function registerInstance(instance: RegistryInstance, registryPath?: string): InstanceRegistry {
  let registry = readRegistry(registryPath);
  registry = pruneStaleInstances(registry);

  // Update existing entry or add new one
  const idx = registry.instances.findIndex((i) => i.projectDir === instance.projectDir);
  if (idx >= 0) {
    registry.instances[idx] = instance;
  } else {
    registry.instances.push(instance);
  }

  writeRegistry(registry, registryPath);
  return registry;
}

/**
 * Remove an instance by projectDir.
 */
export function deregisterInstance(projectDir: string, registryPath?: string): InstanceRegistry {
  let registry = readRegistry(registryPath);
  registry.instances = registry.instances.filter((i) => i.projectDir !== projectDir);
  writeRegistry(registry, registryPath);
  return registry;
}

/**
 * Find the current bot owner (instance with isBotOwner: true).
 */
export function findBotOwner(registry: InstanceRegistry): RegistryInstance | null {
  return registry.instances.find((i) => i.isBotOwner) ?? null;
}

/**
 * Attempt to claim bot ownership for a project.
 * Prunes stale entries first. If no alive bot owner exists, claims ownership.
 * Returns true if ownership was claimed (or already owned by this project).
 */
export function claimBotOwnership(projectDir: string, registryPath?: string): boolean {
  // Re-read fresh to minimize race window
  let registry = readRegistry(registryPath);
  registry = pruneStaleInstances(registry);

  const currentOwner = findBotOwner(registry);

  if (currentOwner) {
    if (currentOwner.projectDir === projectDir) {
      return true; // Already own it
    }
    if (isProcessAlive(currentOwner.pid)) {
      return false; // Another live instance owns it
    }
    // Owner is dead (survived prune somehow) — revoke
    currentOwner.isBotOwner = false;
  }

  // Claim ownership for this project
  const idx = registry.instances.findIndex((i) => i.projectDir === projectDir);
  if (idx >= 0) {
    registry.instances[idx].isBotOwner = true;
  }

  writeRegistry(registry, registryPath);
  return true;
}

/**
 * List all active (alive PID) instances from the registry.
 */
export function listActiveInstances(registryPath?: string): RegistryInstance[] {
  let registry = readRegistry(registryPath);
  registry = pruneStaleInstances(registry);
  writeRegistry(registry, registryPath);
  return registry.instances;
}
