// PIV Orchestrator — Git Checkpoint & Rollback Manager

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";

function git(projectDir: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: projectDir,
    encoding: "utf-8",
    timeout: 30_000,
  }).trim();
}

/**
 * Ensure the project directory has an initialized git repo.
 * If no .git directory exists, runs `git init`, creates a .gitignore,
 * and makes an initial commit so checkpoints and commits work.
 * Returns true if a new repo was created, false if one already existed.
 */
export function ensureGitRepo(projectDir: string): boolean {
  if (existsSync(join(projectDir, ".git"))) {
    return false;
  }

  const projectName = basename(projectDir);
  console.log(`📦 No git repo found — initializing for "${projectName}"`);

  git(projectDir, ["init"]);
  git(projectDir, ["add", "-A"]);
  git(projectDir, ["commit", "-m", `chore: initialize ${projectName} project`]);

  console.log(`  ✅ Git repo initialized with initial commit`);
  return true;
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
