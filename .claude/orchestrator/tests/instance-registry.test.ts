import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  readRegistry,
  writeRegistry,
  registerInstance,
  deregisterInstance,
  pruneStaleInstances,
  claimBotOwnership,
  findBotOwner,
  listActiveInstances,
  getRegistryPath,
} from "../src/instance-registry.js";
import type { RegistryInstance, InstanceRegistry } from "../src/types.js";
import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

let tmpDir: string;
let registryPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(os.tmpdir(), "piv-registry-test-"));
  registryPath = join(tmpDir, "registry.json");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function makeInstance(overrides: Partial<RegistryInstance> = {}): RegistryInstance {
  return {
    prefix: "test-project",
    projectDir: "/tmp/test-project",
    pid: process.pid,
    startedAt: new Date().toISOString(),
    manifestPath: "/tmp/test-project/.agents/manifest.yaml",
    isBotOwner: false,
    ...overrides,
  };
}

describe("readRegistry", () => {
  it("returns empty registry when file does not exist", () => {
    const registry = readRegistry(registryPath);
    expect(registry.instances).toEqual([]);
    expect(registry.lastUpdated).toBeDefined();
  });

  it("returns parsed registry when file exists", () => {
    const data: InstanceRegistry = {
      instances: [makeInstance()],
      lastUpdated: new Date().toISOString(),
    };
    const { writeFileSync } = require("node:fs");
    writeFileSync(registryPath, JSON.stringify(data), "utf-8");

    const registry = readRegistry(registryPath);
    expect(registry.instances).toHaveLength(1);
    expect(registry.instances[0].prefix).toBe("test-project");
  });

  it("returns empty registry for invalid JSON", () => {
    const { writeFileSync } = require("node:fs");
    writeFileSync(registryPath, "not valid json", "utf-8");
    const registry = readRegistry(registryPath);
    expect(registry.instances).toEqual([]);
  });
});

describe("writeRegistry", () => {
  it("creates file with valid JSON", () => {
    const registry: InstanceRegistry = {
      instances: [makeInstance()],
      lastUpdated: new Date().toISOString(),
    };
    writeRegistry(registry, registryPath);

    expect(existsSync(registryPath)).toBe(true);
    const content = JSON.parse(readFileSync(registryPath, "utf-8"));
    expect(content.instances).toHaveLength(1);
  });

  it("creates parent directory if missing", () => {
    const nestedPath = join(tmpDir, "subdir", "registry.json");
    const registry: InstanceRegistry = { instances: [], lastUpdated: "" };
    writeRegistry(registry, nestedPath);
    expect(existsSync(nestedPath)).toBe(true);
  });
});

describe("registerInstance", () => {
  it("adds new entry and writes to file", () => {
    const inst = makeInstance();
    const result = registerInstance(inst, registryPath);
    expect(result.instances).toHaveLength(1);
    expect(result.instances[0].prefix).toBe("test-project");
    expect(existsSync(registryPath)).toBe(true);
  });

  it("updates existing entry when projectDir matches", () => {
    const inst1 = makeInstance({ prefix: "old-name" });
    registerInstance(inst1, registryPath);

    const inst2 = makeInstance({ prefix: "new-name" });
    const result = registerInstance(inst2, registryPath);
    expect(result.instances).toHaveLength(1);
    expect(result.instances[0].prefix).toBe("new-name");
  });

  it("adds multiple entries for different projects", () => {
    registerInstance(makeInstance({ projectDir: "/tmp/a", prefix: "proj-a" }), registryPath);
    const result = registerInstance(
      makeInstance({ projectDir: "/tmp/b", prefix: "proj-b" }),
      registryPath
    );
    expect(result.instances).toHaveLength(2);
  });
});

describe("deregisterInstance", () => {
  it("removes entry by projectDir", () => {
    registerInstance(makeInstance({ projectDir: "/tmp/a", prefix: "a" }), registryPath);
    registerInstance(makeInstance({ projectDir: "/tmp/b", prefix: "b" }), registryPath);

    const result = deregisterInstance("/tmp/a", registryPath);
    expect(result.instances).toHaveLength(1);
    expect(result.instances[0].prefix).toBe("b");
  });

  it("does nothing when projectDir not found", () => {
    registerInstance(makeInstance(), registryPath);
    const result = deregisterInstance("/tmp/nonexistent", registryPath);
    expect(result.instances).toHaveLength(1);
  });
});

describe("pruneStaleInstances", () => {
  it("removes entries with dead PIDs", () => {
    const registry: InstanceRegistry = {
      instances: [
        makeInstance({ pid: 999999999, prefix: "dead" }),
        makeInstance({ pid: process.pid, prefix: "alive" }),
      ],
      lastUpdated: new Date().toISOString(),
    };

    const pruned = pruneStaleInstances(registry);
    expect(pruned.instances).toHaveLength(1);
    expect(pruned.instances[0].prefix).toBe("alive");
  });

  it("keeps all entries when all PIDs are alive", () => {
    const registry: InstanceRegistry = {
      instances: [makeInstance({ pid: process.pid })],
      lastUpdated: new Date().toISOString(),
    };

    const pruned = pruneStaleInstances(registry);
    expect(pruned.instances).toHaveLength(1);
  });
});

describe("findBotOwner", () => {
  it("returns instance with isBotOwner true", () => {
    const registry: InstanceRegistry = {
      instances: [
        makeInstance({ prefix: "a", isBotOwner: false }),
        makeInstance({ prefix: "b", isBotOwner: true }),
      ],
      lastUpdated: "",
    };
    const owner = findBotOwner(registry);
    expect(owner).not.toBeNull();
    expect(owner!.prefix).toBe("b");
  });

  it("returns null when no bot owner", () => {
    const registry: InstanceRegistry = {
      instances: [makeInstance({ isBotOwner: false })],
      lastUpdated: "",
    };
    expect(findBotOwner(registry)).toBeNull();
  });
});

describe("claimBotOwnership", () => {
  it("returns true when no current owner exists", () => {
    registerInstance(makeInstance({ projectDir: "/tmp/a", isBotOwner: false }), registryPath);
    const claimed = claimBotOwnership("/tmp/a", registryPath);
    expect(claimed).toBe(true);

    // Verify the registry was updated
    const registry = readRegistry(registryPath);
    expect(registry.instances[0].isBotOwner).toBe(true);
  });

  it("returns false when alive owner exists for different project", () => {
    registerInstance(
      makeInstance({ projectDir: "/tmp/owner", isBotOwner: true, pid: process.pid }),
      registryPath
    );
    registerInstance(
      makeInstance({ projectDir: "/tmp/requester", isBotOwner: false }),
      registryPath
    );

    const claimed = claimBotOwnership("/tmp/requester", registryPath);
    expect(claimed).toBe(false);
  });

  it("returns true when owner PID is dead (claims ownership)", () => {
    registerInstance(
      makeInstance({ projectDir: "/tmp/dead-owner", isBotOwner: true, pid: 999999999 }),
      registryPath
    );
    registerInstance(
      makeInstance({ projectDir: "/tmp/claimer", isBotOwner: false }),
      registryPath
    );

    const claimed = claimBotOwnership("/tmp/claimer", registryPath);
    expect(claimed).toBe(true);
  });

  it("returns true when already the owner", () => {
    registerInstance(
      makeInstance({ projectDir: "/tmp/self", isBotOwner: true, pid: process.pid }),
      registryPath
    );

    const claimed = claimBotOwnership("/tmp/self", registryPath);
    expect(claimed).toBe(true);
  });
});

describe("listActiveInstances", () => {
  it("returns pruned list of instances", () => {
    registerInstance(makeInstance({ projectDir: "/tmp/alive", pid: process.pid }), registryPath);
    registerInstance(makeInstance({ projectDir: "/tmp/dead", pid: 999999999 }), registryPath);

    const active = listActiveInstances(registryPath);
    expect(active).toHaveLength(1);
    expect(active[0].projectDir).toBe("/tmp/alive");
  });

  it("returns empty array when no instances", () => {
    const active = listActiveInstances(registryPath);
    expect(active).toEqual([]);
  });
});

describe("getRegistryPath", () => {
  it("returns path under home directory", () => {
    const path = getRegistryPath();
    expect(path).toContain(".piv-orchestrator");
    expect(path).toContain("registry.json");
  });
});
