// PIV Orchestrator — Plan-to-Execution Fidelity Checker (F6)

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { FidelityReport } from "./types.js";

/**
 * Parse plan markdown for planned file paths.
 * Looks for:
 * - "Create src/foo.ts" or "create `src/foo.ts`"
 * - Backtick-quoted paths: `src/foo.ts`
 * - src/ paths in task descriptions
 */
export function extractPlannedFiles(planContent: string): string[] {
  const files = new Set<string>();

  // Pattern 1: "Create/Add/Write/Modify src/..." or "Create/Add/Write/Modify `src/..."
  const createPatterns = planContent.matchAll(
    /(?:create|add|write|modify|update|implement)\s+`?([a-zA-Z0-9_./-]+\.[a-zA-Z]{1,6})`?/gi
  );
  for (const match of createPatterns) {
    files.add(match[1]);
  }

  // Pattern 2: Backtick-quoted file paths that look like source files
  const backtickPaths = planContent.matchAll(
    /`((?:src|lib|app|tests?|components?|pages?|api|utils?|hooks?|services?|models?|routes?)[/][a-zA-Z0-9_./-]+\.[a-zA-Z]{1,6})`/g
  );
  for (const match of backtickPaths) {
    files.add(match[1]);
  }

  // Pattern 3: File paths in table cells (| path/to/file.ts |)
  const tablePaths = planContent.matchAll(
    /\|\s*`?((?:src|lib|app|tests?)[/][a-zA-Z0-9_./-]+\.[a-zA-Z]{1,6})`?\s*\|/g
  );
  for (const match of tablePaths) {
    files.add(match[1]);
  }

  return [...files].sort();
}

/**
 * Get files changed since checkpoint via git diff --name-only.
 * If no sinceTag provided, diffs against HEAD~1.
 */
export function getActualChangedFiles(projectDir: string, sinceTag?: string): string[] {
  try {
    const ref = sinceTag ?? "HEAD~1";
    const output = execFileSync(
      "git",
      ["diff", "--name-only", ref, "HEAD"],
      { cwd: projectDir, encoding: "utf-8", timeout: 10_000 }
    ).trim();

    if (!output) return [];
    return output.split("\n").filter((f) => f.length > 0).sort();
  } catch {
    // Fallback: list all tracked files (less accurate but never fails)
    try {
      const output = execFileSync(
        "git",
        ["diff", "--name-only", "--cached"],
        { cwd: projectDir, encoding: "utf-8", timeout: 10_000 }
      ).trim();
      if (!output) return [];
      return output.split("\n").filter((f) => f.length > 0).sort();
    } catch {
      return [];
    }
  }
}

/**
 * Calculate fidelity score: matched / max(planned, actual) * 100.
 */
export function calculateFidelityScore(
  planned: string[],
  actual: string[]
): { matched: string[]; missing: string[]; unplanned: string[]; score: number } {
  const plannedSet = new Set(planned);
  const actualSet = new Set(actual);

  const matched = planned.filter((f) => actualSet.has(f));
  const missing = planned.filter((f) => !actualSet.has(f));
  const unplanned = actual.filter((f) => !plannedSet.has(f));

  const denominator = Math.max(planned.length, actual.length);
  const score = denominator > 0 ? Math.round((matched.length / denominator) * 100) : 100;

  return { matched, missing, unplanned, score };
}

/**
 * Full comparison: plan tasks vs actual file system.
 */
export function checkFidelity(
  projectDir: string,
  planPath: string,
  phase: number
): FidelityReport {
  // Read plan content
  let planContent: string;
  try {
    const fullPath = planPath.startsWith("/") ? planPath : join(projectDir, planPath);
    planContent = readFileSync(fullPath, "utf-8");
  } catch {
    return {
      phase,
      plannedFiles: [],
      actualFiles: [],
      matchedFiles: [],
      missingFiles: [],
      unplannedFiles: [],
      fidelityScore: 0,
      details: [`Could not read plan file: ${planPath}`],
    };
  }

  const plannedFiles = extractPlannedFiles(planContent);

  // Find checkpoint tag for this phase
  const checkpointTag = `piv-checkpoint/phase-${phase}`;
  let sinceTag: string | undefined;
  try {
    const tags = execFileSync(
      "git",
      ["tag", "-l", `${checkpointTag}*`],
      { cwd: projectDir, encoding: "utf-8", timeout: 5_000 }
    ).trim();
    if (tags) {
      // Use the most recent matching tag
      const tagList = tags.split("\n").sort();
      sinceTag = tagList[tagList.length - 1];
    }
  } catch {
    // No checkpoint tag found
  }

  const actualFiles = getActualChangedFiles(projectDir, sinceTag);
  const { matched, missing, unplanned, score } = calculateFidelityScore(plannedFiles, actualFiles);

  const details: string[] = [];
  details.push(`Planned: ${plannedFiles.length} files`);
  details.push(`Actual: ${actualFiles.length} files changed`);
  details.push(`Matched: ${matched.length}`);

  if (missing.length > 0) {
    details.push(`Missing: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` (+${missing.length - 5} more)` : ""}`);
  }
  if (unplanned.length > 0 && unplanned.length <= 10) {
    details.push(`Unplanned: ${unplanned.join(", ")}`);
  } else if (unplanned.length > 10) {
    details.push(`Unplanned: ${unplanned.length} files (expected — generated/config files)`);
  }

  return {
    phase,
    plannedFiles,
    actualFiles,
    matchedFiles: matched,
    missingFiles: missing,
    unplannedFiles: unplanned,
    fidelityScore: score,
    details,
  };
}

/**
 * Format fidelity report for terminal display.
 */
export function formatFidelityReport(report: FidelityReport): string {
  const lines: string[] = [];
  lines.push(`  Fidelity: ${report.matchedFiles.length}/${report.plannedFiles.length} planned`);
  lines.push(`    ${report.missingFiles.length} missing, ${report.unplannedFiles.length} extra`);
  lines.push(`    Score: ${report.fidelityScore}%`);

  if (report.missingFiles.length > 0) {
    const show = report.missingFiles.slice(0, 3);
    lines.push(`    Missing: ${show.join(", ")}${report.missingFiles.length > 3 ? " ..." : ""}`);
  }

  return lines.join("\n");
}
