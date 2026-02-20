// PIV Supervisor — Version Computation from Git

import { execFileSync } from "node:child_process";

/**
 * Get the PIV dev kit version as a short git hash.
 * Returns "unknown" if the directory is not a git repo or git fails.
 */
export function getDevKitVersion(devKitDir: string): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: devKitDir,
      encoding: "utf-8",
      timeout: 10_000,
    }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Get a commands-specific version hash.
 * Falls back to getDevKitVersion if the commands-specific hash fails.
 */
export function getCommandsChecksum(devKitDir: string): string {
  try {
    return execFileSync(
      "git",
      ["log", "-1", "--format=%h", "--", ".claude/commands/"],
      { cwd: devKitDir, encoding: "utf-8", timeout: 10_000 }
    ).trim() || getDevKitVersion(devKitDir);
  } catch {
    return getDevKitVersion(devKitDir);
  }
}
