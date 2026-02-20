// PIV Supervisor — Improvement Log Writer
// Append-only markdown log of all supervisor interventions.

import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ImprovementLogEntry } from "./types.js";

/**
 * Format a log entry as markdown.
 */
function formatEntry(entry: ImprovementLogEntry): string {
  const phase = entry.phase !== null ? `Phase ${entry.phase}` : "N/A";
  return [
    `### ${entry.timestamp} — ${entry.project} (${phase})`,
    `- **Stall:** ${entry.stallType}`,
    `- **Action:** ${entry.action}`,
    `- **Outcome:** ${entry.outcome}`,
    `- **Details:** ${entry.details}`,
    ``,
  ].join("\n");
}

/**
 * Append an intervention entry to the improvement log.
 * Creates the file and parent directory if missing.
 * Never throws — wraps all I/O in try/catch.
 */
export function appendToImprovementLog(entry: ImprovementLogEntry, logPath: string): void {
  try {
    const dir = dirname(logPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const header = !existsSync(logPath)
      ? "# PIV Supervisor — Improvement Log\n\n"
      : "";

    appendFileSync(logPath, header + formatEntry(entry), "utf-8");
  } catch {
    // Best-effort logging — never throw from here
  }
}
