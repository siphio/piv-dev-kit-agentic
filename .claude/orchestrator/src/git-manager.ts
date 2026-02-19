// PIV Orchestrator — Git Checkpoint & Rollback Manager

import { execFileSync } from "node:child_process";

function git(projectDir: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: projectDir,
    encoding: "utf-8",
    timeout: 30_000,
  }).trim();
}

/**
 * Create a git checkpoint tag before execution.
 * Tag format: piv-checkpoint/phase-{N}-{timestamp}
 * Returns the tag name.
 */
export function createCheckpoint(projectDir: string, phase: number): string {
  const timestamp = new Date().toISOString().replace(/:/g, "").replace(/\.\d+Z$/, "Z");
  const tag = `piv-checkpoint/phase-${phase}-${timestamp}`;
  git(projectDir, ["tag", tag]);
  return tag;
}

/**
 * Rollback to a checkpoint: git reset --hard + git clean -fd.
 */
export function rollbackToCheckpoint(projectDir: string, tag: string): void {
  git(projectDir, ["reset", "--hard", tag]);
  git(projectDir, ["clean", "-fd"]);
}

/**
 * Delete a checkpoint tag.
 */
export function deleteCheckpointTag(projectDir: string, tag: string): void {
  git(projectDir, ["tag", "-d", tag]);
}

/**
 * Check if the working tree has uncommitted changes.
 */
export function hasUncommittedChanges(projectDir: string): boolean {
  const status = git(projectDir, ["status", "--porcelain"]);
  return status.length > 0;
}

/**
 * Get the current HEAD short hash.
 */
export function getCurrentHead(projectDir: string): string {
  return git(projectDir, ["rev-parse", "--short", "HEAD"]);
}
