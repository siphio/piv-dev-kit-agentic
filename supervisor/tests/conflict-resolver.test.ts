import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import yaml from "js-yaml";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

import {
  detectConflicts,
  determineUpstream,
  classifyConflict,
  formatConflictResolution,
} from "../src/conflict-resolver.js";
import { execSync } from "node:child_process";
import type { ConflictDetection } from "../src/types.js";

const mockedExecSync = vi.mocked(execSync);

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(os.tmpdir(), "piv-conflict-resolver-test-"));
  vi.clearAllMocks();
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeManifest(dir: string, data: Record<string, unknown>): string {
  const agentsDir = join(dir, ".agents");
  mkdirSync(agentsDir, { recursive: true });
  const manifestPath = join(agentsDir, "manifest.yaml");
  writeFileSync(manifestPath, yaml.dump(data), "utf-8");
  return manifestPath;
}

// --- detectConflicts ---

describe("detectConflicts", () => {
  it("returns null when git status shows no unmerged paths", () => {
    mockedExecSync.mockImplementation((cmd: unknown) => {
      const command = String(cmd);
      if (command.includes("git status --porcelain")) {
        return "M  src/index.ts\n?? new-file.ts\n";
      }
      return "";
    });

    const manifestPath = writeManifest(tmpDir, { modules: {}, agents: {} });
    const result = detectConflicts(tmpDir, manifestPath);

    expect(result).toBeNull();
  });

  it("returns ConflictDetection with conflicting files for UU lines", () => {
    mockedExecSync.mockImplementation((cmd: unknown) => {
      const command = String(cmd);
      if (command.includes("git status --porcelain")) {
        return "UU src/types.ts\nM  src/index.ts\n";
      }
      // git diff for classifyConflict — src/types.ts is architectural, so diff won't be called
      // (types.ts matches ARCHITECTURAL_PATTERNS, classifyConflict returns "escalate" immediately)
      return "";
    });

    const manifestPath = writeManifest(tmpDir, {
      modules: {
        modA: { path: "src/", depends_on: ["modB"] },
        modB: { path: "lib/" },
      },
      agents: {
        agentA: { module: "modA" },
        agentB: { module: "modB" },
      },
    });

    const result = detectConflicts(tmpDir, manifestPath);

    expect(result).not.toBeNull();
    expect(result!.hasConflict).toBe(true);
    expect(result!.conflictingFiles).toEqual(["src/types.ts"]);
    // types.ts is architectural, so resolution = "escalate"
    expect(result!.isArchitectural).toBe(true);
    expect(result!.resolution).toBe("escalate");
    expect(result!.agentA).toBe("agentA");
  });

  it("returns null when git command fails", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("fatal: not a git repository");
    });

    const manifestPath = writeManifest(tmpDir, { modules: {}, agents: {} });
    const result = detectConflicts(tmpDir, manifestPath);

    expect(result).toBeNull();
  });

  it("returns null when manifest is unreadable", () => {
    mockedExecSync.mockImplementation((cmd: unknown) => {
      const command = String(cmd);
      if (command.includes("git status --porcelain")) {
        return "UU src/foo.ts\n";
      }
      return "";
    });

    // Point to a non-existent manifest path
    const badManifestPath = join(tmpDir, "nonexistent", "manifest.yaml");
    const result = detectConflicts(tmpDir, badManifestPath);

    expect(result).toBeNull();
  });
});

// --- determineUpstream ---

describe("determineUpstream", () => {
  it("returns agentB when A depends on B", () => {
    const manifestPath = writeManifest(tmpDir, {
      modules: {
        modA: { depends_on: ["modB"] },
        modB: {},
      },
      agents: {
        agentA: { module: "modA" },
        agentB: { module: "modB" },
      },
    });

    const result = determineUpstream("agentA", "agentB", manifestPath);
    expect(result).toBe("agentB");
  });

  it("returns agentA when B depends on A", () => {
    const manifestPath = writeManifest(tmpDir, {
      modules: {
        modA: {},
        modB: { depends_on: ["modA"] },
      },
      agents: {
        agentA: { module: "modA" },
        agentB: { module: "modB" },
      },
    });

    const result = determineUpstream("agentA", "agentB", manifestPath);
    expect(result).toBe("agentA");
  });

  it("returns null when no dependency exists between agents", () => {
    const manifestPath = writeManifest(tmpDir, {
      modules: {
        modA: {},
        modB: {},
      },
      agents: {
        agentA: { module: "modA" },
        agentB: { module: "modB" },
      },
    });

    const result = determineUpstream("agentA", "agentB", manifestPath);
    expect(result).toBeNull();
  });

  it("returns null when manifest is unreadable", () => {
    const badManifestPath = join(tmpDir, "nonexistent", "manifest.yaml");
    const result = determineUpstream("agentA", "agentB", badManifestPath);
    expect(result).toBeNull();
  });
});

// --- classifyConflict ---

describe("classifyConflict", () => {
  it("returns 'escalate' for architectural files (types.ts)", () => {
    const result = classifyConflict(["src/types.ts"], tmpDir);
    expect(result).toBe("escalate");
    // execSync should not be called because architectural check exits early
    expect(mockedExecSync).not.toHaveBeenCalled();
  });

  it("returns 'additive_no_conflict' when diff shows only additions", () => {
    mockedExecSync.mockImplementation((cmd: unknown) => {
      const command = String(cmd);
      if (command.includes("git diff")) {
        return [
          "--- a/file.ts",
          "+++ b/file.ts",
          "@@ -1,3 +1,5 @@",
          " existing line",
          "+new line 1",
          "+new line 2",
        ].join("\n");
      }
      return "";
    });

    const result = classifyConflict(["src/utils/helpers.ts"], tmpDir);
    expect(result).toBe("additive_no_conflict");
  });

  it("returns 'upstream_wins' when diff shows mixed changes", () => {
    mockedExecSync.mockImplementation((cmd: unknown) => {
      const command = String(cmd);
      if (command.includes("git diff")) {
        return [
          "--- a/file.ts",
          "+++ b/file.ts",
          "@@ -1,3 +1,3 @@",
          "-old line",
          "+new line",
        ].join("\n");
      }
      return "";
    });

    const result = classifyConflict(["src/utils/helpers.ts"], tmpDir);
    expect(result).toBe("upstream_wins");
  });

  it("returns 'escalate' when git diff fails", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("git diff failed");
    });

    const result = classifyConflict(["src/utils/helpers.ts"], tmpDir);
    expect(result).toBe("escalate");
  });
});

// --- formatConflictResolution ---

describe("formatConflictResolution", () => {
  it("formats a normal ConflictDetection into a human-readable string", () => {
    const detection: ConflictDetection = {
      hasConflict: true,
      conflictingFiles: ["src/foo.ts", "src/bar.ts"],
      agentA: "agentAlpha",
      agentB: "agentBeta",
      upstreamAgent: "agentBeta",
      isArchitectural: false,
      resolution: "upstream_wins",
    };

    const result = formatConflictResolution(detection);

    expect(result).toBe(
      "Conflict between agentAlpha and agentBeta on 2 file(s). Resolution: upstream_wins. Upstream: agentBeta.",
    );
  });

  it("formats correctly when upstream is null", () => {
    const detection: ConflictDetection = {
      hasConflict: true,
      conflictingFiles: ["src/single.ts"],
      agentA: "agentX",
      agentB: "agentY",
      upstreamAgent: null,
      isArchitectural: true,
      resolution: "escalate",
    };

    const result = formatConflictResolution(detection);

    expect(result).toBe(
      "Conflict between agentX and agentY on 1 file. Resolution: escalate. Upstream: undetermined.",
    );
  });
});
