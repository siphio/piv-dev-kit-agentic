// PIV Orchestrator — File-Based IPC via Signal Files

import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { SignalMessage } from "./types.js";

const SIGNAL_FILE = ".agents/orchestrator.signal";

/**
 * Get the absolute path to the signal file for a project directory.
 */
export function signalPath(projectDir: string): string {
  return join(projectDir, SIGNAL_FILE);
}

/**
 * Write a signal message to a project's signal file.
 */
export function writeSignal(projectDir: string, signal: SignalMessage): void {
  writeFileSync(signalPath(projectDir), JSON.stringify(signal, null, 2), "utf-8");
}

/**
 * Read and parse a signal file. Returns null if missing or invalid.
 */
export function readSignal(projectDir: string): SignalMessage | null {
  const filePath = signalPath(projectDir);
  if (!existsSync(filePath)) return null;

  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as SignalMessage;
  } catch {
    return null;
  }
}

/**
 * Delete the signal file. Silent if missing.
 */
export function clearSignal(projectDir: string): void {
  const filePath = signalPath(projectDir);
  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  } catch {
    // Silent on delete failure
  }
}

/**
 * Start polling the signal file at the given interval.
 * When a signal is found, calls onSignal and then clears the file.
 */
export function startSignalWatcher(
  projectDir: string,
  onSignal: (signal: SignalMessage) => void,
  intervalMs: number = 2000
): NodeJS.Timeout {
  return setInterval(() => {
    const signal = readSignal(projectDir);
    if (signal) {
      onSignal(signal);
      clearSignal(projectDir);
    }
  }, intervalMs);
}

/**
 * Stop polling the signal file.
 */
export function stopSignalWatcher(timer: NodeJS.Timeout): void {
  clearInterval(timer);
}
