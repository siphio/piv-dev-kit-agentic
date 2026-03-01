import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { assembleContext } from "../src/agent-spawner.js";
import type { AgentYamlConfig, WorkUnit } from "../src/types.js";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), "piv-agent-spawner-test-" + Date.now());

function makeWorkUnit(): WorkUnit {
  return {
    module: "0-foundation",
    slice: "01-data-model",
    sliceStatus: { plan: "complete", execution: "not_started", validation: "not_run" },
    contextPath: "context/modules/0-foundation/slices/01-data-model/context.md",
    specPath: "context/modules/0-foundation/specification.md",
  };
}

function makeAgentConfig(): AgentYamlConfig {
  return {
    schema_version: 1,
    name: "test-executor",
    type: "executor",
    description: "Test executor",
    triggers: ["slice_ready"],
    system_prompt: "You are a test executor.",
    model: "claude-sonnet-4-6",
    budget: { maxTurns: 50, maxBudgetUsd: 2.0, timeoutMs: 60000 },
    teams: { enabled: true, max_teammates: 3 },
  };
}

describe("assembleContext", () => {
  beforeEach(() => {
    mkdirSync(join(TEST_DIR, "context/modules/0-foundation/slices/01-data-model"), { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  it("includes slice context when file exists", () => {
    writeFileSync(
      join(TEST_DIR, "context/modules/0-foundation/slices/01-data-model/context.md"),
      "# Slice Context\nTechnology: PostGIS"
    );

    const context = assembleContext(makeWorkUnit(), TEST_DIR);
    expect(context).toContain("Slice Context");
    expect(context).toContain("PostGIS");
  });

  it("includes module specification summary", () => {
    writeFileSync(
      join(TEST_DIR, "context/modules/0-foundation/specification.md"),
      "# Module Specification\nPurpose: Foundation module"
    );

    const context = assembleContext(makeWorkUnit(), TEST_DIR);
    expect(context).toContain("Module Specification");
  });

  it("includes architecture excerpt when provided", () => {
    const context = assembleContext(
      makeWorkUnit(),
      TEST_DIR,
      "## Architecture\nModule 0 provides data layer"
    );
    expect(context).toContain("Architecture Context");
    expect(context).toContain("data layer");
  });

  it("includes technology profiles when paths provided", () => {
    const profileDir = join(TEST_DIR, ".agents/reference");
    mkdirSync(profileDir, { recursive: true });
    writeFileSync(join(profileDir, "postgis-profile.md"), "# PostGIS Profile\nVersion: 3.4");

    const context = assembleContext(
      makeWorkUnit(),
      TEST_DIR,
      undefined,
      [".agents/reference/postgis-profile.md"]
    );
    expect(context).toContain("Technology Profile");
    expect(context).toContain("PostGIS Profile");
  });

  it("includes work assignment details", () => {
    const context = assembleContext(makeWorkUnit(), TEST_DIR);
    expect(context).toContain("Module: 0-foundation");
    expect(context).toContain("Slice: 01-data-model");
  });

  it("handles missing files gracefully", () => {
    // No files exist in fresh dir
    const freshDir = join(tmpdir(), "piv-spawner-empty-" + Date.now());
    mkdirSync(freshDir, { recursive: true });

    const context = assembleContext(makeWorkUnit(), freshDir);
    expect(context).toContain("Work Assignment");
    // Should not throw, just skip missing files

    rmSync(freshDir, { recursive: true, force: true });
  });

  it("separates sections with dividers", () => {
    writeFileSync(
      join(TEST_DIR, "context/modules/0-foundation/slices/01-data-model/context.md"),
      "# Context"
    );
    writeFileSync(
      join(TEST_DIR, "context/modules/0-foundation/specification.md"),
      "# Spec"
    );

    const context = assembleContext(makeWorkUnit(), TEST_DIR);
    expect(context).toContain("---");
  });
});

// Note: spawnAgent() is not tested here because it calls the real Agent SDK.
// Integration tests with mocked SDK would go in a separate test file.
// The assembleContext function is the main testable unit.
describe("agent config mapping", () => {
  it("agent config has required fields", () => {
    const config = makeAgentConfig();
    expect(config.schema_version).toBe(1);
    expect(config.budget?.maxTurns).toBe(50);
    expect(config.budget?.maxBudgetUsd).toBe(2.0);
    expect(config.model).toBe("claude-sonnet-4-6");
  });
});
