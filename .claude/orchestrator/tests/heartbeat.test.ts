import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { writeHeartbeat, startHeartbeat, stopHeartbeat } from "../src/heartbeat.js";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import os from "node:os";

let tmpDir: string;
let registryPath: string;
let projectDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(os.tmpdir(), "piv-heartbeat-test-"));
  registryPath = join(tmpDir, "registry.yaml");
  projectDir = join(tmpDir, "project");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("writeHeartbeat", () => {
  it("creates registry file if missing", () => {
    writeHeartbeat(projectDir, "test-project", 1, "running", registryPath);
    expect(existsSync(registryPath)).toBe(true);
  });

  it("updates existing registry entry", () => {
    // Write initial
    writeHeartbeat(projectDir, "test-project", 1, "running", registryPath);

    // Update
    writeHeartbeat(projectDir, "test-project", 2, "running", registryPath);

    const content = yaml.load(readFileSync(registryPath, "utf-8")) as Record<string, unknown>;
    const projects = content.projects as Record<string, Record<string, unknown>>;
    expect(projects["test-project"].currentPhase).toBe(2);
  });

  it("sets correct fields", () => {
    writeHeartbeat(projectDir, "my-agent", 3, "running", registryPath);

    const content = yaml.load(readFileSync(registryPath, "utf-8")) as Record<string, unknown>;
    const projects = content.projects as Record<string, Record<string, unknown>>;
    const project = projects["my-agent"];

    expect(project.status).toBe("running");
    expect(project.currentPhase).toBe(3);
    expect(project.orchestratorPid).toBe(process.pid);
    expect(project.heartbeat).toBeDefined();
  });

  it("sets orchestratorPid to null when idle", () => {
    writeHeartbeat(projectDir, "test-project", null, "idle", registryPath);

    const content = yaml.load(readFileSync(registryPath, "utf-8")) as Record<string, unknown>;
    const projects = content.projects as Record<string, Record<string, unknown>>;
    expect(projects["test-project"].orchestratorPid).toBeNull();
  });

  it("does not throw on failure", () => {
    // Pass an invalid path (directory that can't be created)
    expect(() => {
      writeHeartbeat(projectDir, "test", 1, "running", "/proc/fake/path/registry.yaml");
    }).not.toThrow();
  });
});

describe("startHeartbeat", () => {
  it("returns a timer", () => {
    const timer = startHeartbeat(projectDir, "test-project", 60000, registryPath);
    expect(timer).toBeDefined();
    clearInterval(timer);
  });

  it("writes initial heartbeat immediately", () => {
    const timer = startHeartbeat(projectDir, "test-project", 60000, registryPath);
    expect(existsSync(registryPath)).toBe(true);

    const content = yaml.load(readFileSync(registryPath, "utf-8")) as Record<string, unknown>;
    const projects = content.projects as Record<string, Record<string, unknown>>;
    expect(projects["test-project"]).toBeDefined();
    expect(projects["test-project"].status).toBe("running");

    clearInterval(timer);
  });
});

describe("stopHeartbeat", () => {
  it("clears interval and writes idle status", () => {
    const timer = startHeartbeat(projectDir, "test-project", 60000, registryPath);
    stopHeartbeat(timer, projectDir, "test-project", registryPath);

    const content = yaml.load(readFileSync(registryPath, "utf-8")) as Record<string, unknown>;
    const projects = content.projects as Record<string, Record<string, unknown>>;
    expect(projects["test-project"].status).toBe("idle");
    expect(projects["test-project"].orchestratorPid).toBeNull();
  });
});
