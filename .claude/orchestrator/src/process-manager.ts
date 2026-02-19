// PIV Orchestrator — Process Lifecycle Manager (PID file, stale detection)

import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import type { ProcessInfo } from "./types.js";

const PID_RELATIVE = ".agents/orchestrator.pid";

function pidPath(projectDir: string): string {
  return join(projectDir, PID_RELATIVE);
}

/**
 * Write the current process PID + metadata to .agents/orchestrator.pid as JSON.
 * Creates the .agents/ directory if it doesn't exist.
 */
export function writePidFile(projectDir: string): void {
  const filePath = pidPath(projectDir);
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const info: ProcessInfo = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    projectDir,
  };

  writeFileSync(filePath, JSON.stringify(info, null, 2), "utf-8");
}

/**
 * Read and parse the PID file. Returns null if file is missing or invalid.
 */
export function readPidFile(projectDir: string): ProcessInfo | null {
  const filePath = pidPath(projectDir);
  if (!existsSync(filePath)) return null;

  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as ProcessInfo;
  } catch {
    console.log("  ⚠️ PID file exists but is invalid — treating as stale");
    return null;
  }
}

/**
 * Delete the PID file. Silent if missing.
 */
export function removePidFile(projectDir: string): void {
  const filePath = pidPath(projectDir);
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    console.log("  ⚠️ Could not remove PID file");
  }
}

/**
 * Check if a process with the given PID is alive.
 * Uses signal 0 (check existence without sending a signal).
 * Returns true if alive, false if dead or not ours.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "EPERM") {
      // Process exists but we don't have permission — it's alive
      return true;
    }
    // ESRCH = no such process
    return false;
  }
}

/**
 * Check if another orchestrator instance is already running for this project.
 * If PID file exists but process is dead, removes the stale PID file.
 */
export function checkForRunningInstance(projectDir: string): { running: boolean; pid?: number } {
  const info = readPidFile(projectDir);
  if (!info) return { running: false };

  if (isProcessAlive(info.pid)) {
    return { running: true, pid: info.pid };
  }

  // Stale PID file — process is dead, clean up
  console.log(`  ⚠️ Stale PID file found (PID ${info.pid} is dead) — removing`);
  removePidFile(projectDir);
  return { running: false };
}
