// PIV Orchestrator — Central Registry Heartbeat Writer
//
// Writes heartbeat data to ~/.piv/registry.yaml every 2 minutes
// so the supervisor (Phase 6+) can detect stalls.
//
// Self-contained: does NOT import from /supervisor/ package.
// Inlines registry read/write to avoid cross-package dependency.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import yaml from "js-yaml";

// --- Inlined registry types (mirrors supervisor/src/types.ts) ---

type ProjectStatus = "idle" | "running" | "stalled" | "complete" | "error";

interface RegistryProject {
  name: string;
  path: string;
  status: ProjectStatus;
  heartbeat: string;
  currentPhase: number | null;
  pivCommandsVersion: string;
  orchestratorPid: number | null;
  registeredAt: string;
  lastCompletedPhase: number | null;
}

interface CentralRegistry {
  projects: Record<string, RegistryProject>;
  lastUpdated: string;
}

// --- Inlined registry I/O ---

const REGISTRY_PATH = join(homedir(), ".piv", "registry.yaml");

function readRegistry(registryPath?: string): CentralRegistry {
  const filePath = registryPath ?? REGISTRY_PATH;
  if (!existsSync(filePath)) {
    return { projects: {}, lastUpdated: new Date().toISOString() };
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = yaml.load(content) as CentralRegistry;
    if (!parsed || typeof parsed.projects !== "object") {
      return { projects: {}, lastUpdated: new Date().toISOString() };
    }
    return parsed;
  } catch {
    return { projects: {}, lastUpdated: new Date().toISOString() };
  }
}

function writeRegistryFile(registry: CentralRegistry, registryPath?: string): void {
  const filePath = registryPath ?? REGISTRY_PATH;
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  registry.lastUpdated = new Date().toISOString();
  writeFileSync(filePath, yaml.dump(registry, { lineWidth: -1 }), "utf-8");
}

// --- Read current phase from manifest (sync, best-effort) ---

function readCurrentPhase(projectDir: string): number | null {
  try {
    const manifestPath = join(projectDir, ".agents", "manifest.yaml");
    if (!existsSync(manifestPath)) return null;
    const content = readFileSync(manifestPath, "utf-8");
    const manifest = yaml.load(content) as Record<string, unknown>;
    if (!manifest || typeof manifest.phases !== "object") return null;
    const phases = manifest.phases as Record<string, Record<string, string>>;
    // Find the first phase where execution is not complete
    const phaseNums = Object.keys(phases).map(Number).sort((a, b) => a - b);
    for (const num of phaseNums) {
      const status = phases[String(num)];
      if (status && status.execution !== "complete") return num;
    }
    // All complete — return last phase
    return phaseNums.length > 0 ? phaseNums[phaseNums.length - 1] : null;
  } catch {
    return null;
  }
}

// --- Public API ---

const DEFAULT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

/**
 * Write a single heartbeat to the central registry.
 * Safe to call from any context — never throws.
 */
export function writeHeartbeat(
  projectDir: string,
  projectName: string,
  phase: number | null,
  status: ProjectStatus,
  registryPath?: string
): void {
  try {
    const registry = readRegistry(registryPath);
    const existing = registry.projects[projectName];

    if (existing) {
      existing.heartbeat = new Date().toISOString();
      existing.currentPhase = phase;
      existing.orchestratorPid = status === "idle" ? null : process.pid;
      existing.status = status;
    } else {
      // Project not registered yet — create minimal entry
      registry.projects[projectName] = {
        name: projectName,
        path: projectDir,
        status,
        heartbeat: new Date().toISOString(),
        currentPhase: phase,
        pivCommandsVersion: "unknown",
        orchestratorPid: status === "idle" ? null : process.pid,
        registeredAt: new Date().toISOString(),
        lastCompletedPhase: null,
      };
    }

    writeRegistryFile(registry, registryPath);
  } catch {
    // Heartbeat failure must NEVER crash the orchestrator
  }
}

/**
 * Start periodic heartbeat writes to the central registry.
 * Returns the interval timer for cleanup.
 */
export function startHeartbeat(
  projectDir: string,
  projectName: string,
  intervalMs?: number,
  registryPath?: string
): NodeJS.Timeout {
  const interval = intervalMs ?? DEFAULT_INTERVAL_MS;

  // Write initial heartbeat immediately
  const phase = readCurrentPhase(projectDir);
  writeHeartbeat(projectDir, projectName, phase, "running", registryPath);

  // Set up periodic writes
  const timer = setInterval(() => {
    try {
      const currentPhase = readCurrentPhase(projectDir);
      writeHeartbeat(projectDir, projectName, currentPhase, "running", registryPath);
    } catch {
      // Best-effort — never crash
    }
  }, interval);

  return timer;
}

/**
 * Stop the heartbeat timer and write a final "idle" status.
 */
export function stopHeartbeat(
  timer: NodeJS.Timeout,
  projectDir: string,
  projectName: string,
  registryPath?: string
): void {
  clearInterval(timer);
  writeHeartbeat(projectDir, projectName, null, "idle", registryPath);
}
