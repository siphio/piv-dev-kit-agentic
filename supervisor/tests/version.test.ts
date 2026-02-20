import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getDevKitVersion, getCommandsChecksum } from "../src/version.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import os from "node:os";

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(os.tmpdir(), "piv-version-test-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("getDevKitVersion", () => {
  it("returns 7-char hash in a valid git repo", () => {
    // Create a git repo with a commit
    execFileSync("git", ["init"], { cwd: tmpDir });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "--allow-empty", "-m", "init"], { cwd: tmpDir });

    const version = getDevKitVersion(tmpDir);
    expect(version).toMatch(/^[a-f0-9]{7,}$/);
  });

  it("returns 'unknown' in non-git directory", () => {
    const version = getDevKitVersion(tmpDir);
    expect(version).toBe("unknown");
  });

  it("returns 'unknown' for non-existent directory", () => {
    const version = getDevKitVersion("/tmp/nonexistent-dir-12345");
    expect(version).toBe("unknown");
  });

  it("hash changes after a new commit", () => {
    execFileSync("git", ["init"], { cwd: tmpDir });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "--allow-empty", "-m", "first"], { cwd: tmpDir });
    const hash1 = getDevKitVersion(tmpDir);

    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "--allow-empty", "-m", "second"], { cwd: tmpDir });
    const hash2 = getDevKitVersion(tmpDir);

    expect(hash1).not.toBe(hash2);
  });
});

describe("getCommandsChecksum", () => {
  it("returns a hash when commands directory has commits", () => {
    execFileSync("git", ["init"], { cwd: tmpDir });
    mkdirSync(join(tmpDir, ".claude", "commands"), { recursive: true });
    writeFileSync(join(tmpDir, ".claude", "commands", "test.md"), "# Test", "utf-8");
    execFileSync("git", ["add", "-A"], { cwd: tmpDir });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "-m", "add commands"], { cwd: tmpDir });

    const checksum = getCommandsChecksum(tmpDir);
    expect(checksum).toMatch(/^[a-f0-9]{7,}$/);
  });

  it("falls back to dev kit version when no commands dir", () => {
    execFileSync("git", ["init"], { cwd: tmpDir });
    execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@test.com", "commit", "--allow-empty", "-m", "init"], { cwd: tmpDir });

    const checksum = getCommandsChecksum(tmpDir);
    const devKitVersion = getDevKitVersion(tmpDir);
    expect(checksum).toBe(devKitVersion);
  });
});
