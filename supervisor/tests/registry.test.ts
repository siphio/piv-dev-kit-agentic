import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  readCentralRegistry,
  writeCentralRegistry,
  registerProject,
  deregisterProject,
  updateHeartbeat,
  getProject,
  listProjects,
  pruneDeadProjects,
  getRegistryPath,
} from "../src/registry.js";
import type { RegistryProject, CentralRegistry } from "../src/types.js";
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

let tmpDir: string;
let registryPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(os.tmpdir(), "piv-central-registry-test-"));
  registryPath = join(tmpDir, "registry.yaml");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeProject(overrides: Partial<RegistryProject> = {}): RegistryProject {
  return {
    name: "test-project",
    path: "/tmp/test-project",
    status: "idle",
    heartbeat: new Date().toISOString(),
    currentPhase: null,
    pivCommandsVersion: "abc1234",
    orchestratorPid: null,
    registeredAt: new Date().toISOString(),
    lastCompletedPhase: null,
    ...overrides,
  };
}

describe("readCentralRegistry", () => {
  it("returns empty registry when file does not exist", () => {
    const registry = readCentralRegistry(registryPath);
    expect(registry.projects).toEqual({});
    expect(registry.lastUpdated).toBeDefined();
  });

  it("returns parsed registry when file exists", () => {
    const project = makeProject();
    const data: CentralRegistry = {
      projects: { [project.name]: project },
      lastUpdated: new Date().toISOString(),
    };
    const yaml = require("js-yaml");
    writeFileSync(registryPath, yaml.dump(data), "utf-8");

    const registry = readCentralRegistry(registryPath);
    expect(Object.keys(registry.projects)).toHaveLength(1);
    expect(registry.projects["test-project"].name).toBe("test-project");
  });

  it("returns empty registry for invalid YAML", () => {
    writeFileSync(registryPath, ":::invalid yaml:::", "utf-8");
    const registry = readCentralRegistry(registryPath);
    expect(registry.projects).toEqual({});
  });
});

describe("writeCentralRegistry", () => {
  it("creates file with valid YAML", () => {
    const registry: CentralRegistry = {
      projects: { test: makeProject() },
      lastUpdated: "",
    };
    writeCentralRegistry(registry, registryPath);

    expect(existsSync(registryPath)).toBe(true);
    const content = readFileSync(registryPath, "utf-8");
    expect(content).toContain("test-project");
  });

  it("creates parent directory if missing", () => {
    const nestedPath = join(tmpDir, "subdir", "registry.yaml");
    const registry: CentralRegistry = { projects: {}, lastUpdated: "" };
    writeCentralRegistry(registry, nestedPath);
    expect(existsSync(nestedPath)).toBe(true);
  });

  it("updates lastUpdated timestamp", () => {
    const registry: CentralRegistry = { projects: {}, lastUpdated: "" };
    writeCentralRegistry(registry, registryPath);
    expect(registry.lastUpdated).not.toBe("");
  });
});

describe("registerProject", () => {
  it("adds new project and writes to file", () => {
    const project = makeProject();
    const result = registerProject(project, registryPath);
    expect(Object.keys(result.projects)).toHaveLength(1);
    expect(result.projects["test-project"].name).toBe("test-project");
    expect(existsSync(registryPath)).toBe(true);
  });

  it("updates existing project when name matches", () => {
    const p1 = makeProject({ pivCommandsVersion: "old1234" });
    registerProject(p1, registryPath);

    const p2 = makeProject({ pivCommandsVersion: "new5678" });
    const result = registerProject(p2, registryPath);
    expect(Object.keys(result.projects)).toHaveLength(1);
    expect(result.projects["test-project"].pivCommandsVersion).toBe("new5678");
  });

  it("adds multiple projects with different names", () => {
    registerProject(makeProject({ name: "proj-a", path: "/tmp/a" }), registryPath);
    const result = registerProject(
      makeProject({ name: "proj-b", path: "/tmp/b" }),
      registryPath
    );
    expect(Object.keys(result.projects)).toHaveLength(2);
  });
});

describe("deregisterProject", () => {
  it("removes project by name", () => {
    registerProject(makeProject({ name: "a", path: "/tmp/a" }), registryPath);
    registerProject(makeProject({ name: "b", path: "/tmp/b" }), registryPath);

    const result = deregisterProject("a", registryPath);
    expect(Object.keys(result.projects)).toHaveLength(1);
    expect(result.projects["b"]).toBeDefined();
  });

  it("does nothing when name not found", () => {
    registerProject(makeProject(), registryPath);
    const result = deregisterProject("nonexistent", registryPath);
    expect(Object.keys(result.projects)).toHaveLength(1);
  });
});

describe("updateHeartbeat", () => {
  it("updates heartbeat, phase, pid, and status", () => {
    registerProject(makeProject({ name: "my-project" }), registryPath);

    const result = updateHeartbeat("my-project", 3, process.pid, "running", registryPath);
    const project = result.projects["my-project"];
    expect(project.currentPhase).toBe(3);
    expect(project.orchestratorPid).toBe(process.pid);
    expect(project.status).toBe("running");
    expect(project.heartbeat).toBeDefined();
  });

  it("does nothing when project not found (no crash)", () => {
    const result = updateHeartbeat("nonexistent", 1, 123, "running", registryPath);
    expect(Object.keys(result.projects)).toHaveLength(0);
  });
});

describe("getProject", () => {
  it("returns project by name", () => {
    registerProject(makeProject({ name: "lookup-test" }), registryPath);
    const project = getProject("lookup-test", registryPath);
    expect(project).not.toBeNull();
    expect(project!.name).toBe("lookup-test");
  });

  it("returns null when not found", () => {
    const project = getProject("nonexistent", registryPath);
    expect(project).toBeNull();
  });
});

describe("listProjects", () => {
  it("returns all projects as array", () => {
    registerProject(makeProject({ name: "a" }), registryPath);
    registerProject(makeProject({ name: "b" }), registryPath);

    const projects = listProjects(registryPath);
    expect(projects).toHaveLength(2);
  });

  it("returns empty array when no projects", () => {
    const projects = listProjects(registryPath);
    expect(projects).toHaveLength(0);
  });
});

describe("pruneDeadProjects", () => {
  it("sets status to idle for projects with dead PIDs", () => {
    registerProject(
      makeProject({ name: "dead", orchestratorPid: 999999999, status: "running" }),
      registryPath
    );
    registerProject(
      makeProject({ name: "alive", orchestratorPid: process.pid, status: "running" }),
      registryPath
    );

    const result = pruneDeadProjects(registryPath);
    expect(result.projects["dead"].status).toBe("idle");
    expect(result.projects["dead"].orchestratorPid).toBeNull();
    expect(result.projects["alive"].status).toBe("running");
    expect(result.projects["alive"].orchestratorPid).toBe(process.pid);
  });

  it("keeps projects with null PID unchanged", () => {
    registerProject(
      makeProject({ name: "no-pid", orchestratorPid: null, status: "idle" }),
      registryPath
    );

    const result = pruneDeadProjects(registryPath);
    expect(result.projects["no-pid"].status).toBe("idle");
  });
});

describe("getRegistryPath", () => {
  it("returns path under home directory", () => {
    const path = getRegistryPath();
    expect(path).toContain(".piv");
    expect(path).toContain("registry.yaml");
  });
});
