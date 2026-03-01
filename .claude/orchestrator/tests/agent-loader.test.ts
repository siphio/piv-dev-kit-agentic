import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { validateAgentSchema, loadAgents, getAgentForEvent, getAgentsForEvent } from "../src/agent-loader.js";
import type { AgentYamlConfig, LifecycleEvent } from "../src/types.js";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TEST_DIR = join(tmpdir(), "piv-agent-loader-test-" + Date.now());

function validAgentYaml(): Record<string, unknown> {
  return {
    schema_version: 1,
    name: "test-executor",
    type: "executor",
    description: "A test executor agent",
    triggers: ["slice_ready"],
    system_prompt: "You are a test agent.",
    model: "claude-sonnet-4-6",
    budget: { maxTurns: 50, maxBudgetUsd: 2.0 },
    teams: { enabled: true, max_teammates: 3 },
  };
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe("validateAgentSchema", () => {
  it("accepts valid agent config", () => {
    const result = validateAgentSchema(validAgentYaml());
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects null input", () => {
    const result = validateAgentSchema(null);
    expect(result.valid).toBe(false);
  });

  it("rejects wrong schema_version", () => {
    const result = validateAgentSchema({ ...validAgentYaml(), schema_version: 2 });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("schema_version"))).toBe(true);
  });

  it("rejects missing name", () => {
    const { name, ...rest } = validAgentYaml();
    const result = validateAgentSchema(rest);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("name"))).toBe(true);
  });

  it("rejects invalid agent type", () => {
    const result = validateAgentSchema({ ...validAgentYaml(), type: "invalid-type" });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("type"))).toBe(true);
  });

  it("rejects empty triggers", () => {
    const result = validateAgentSchema({ ...validAgentYaml(), triggers: [] });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid trigger event", () => {
    const result = validateAgentSchema({ ...validAgentYaml(), triggers: ["invalid_event"] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid trigger"))).toBe(true);
  });

  it("rejects missing system_prompt", () => {
    const { system_prompt, ...rest } = validAgentYaml();
    const result = validateAgentSchema(rest);
    expect(result.valid).toBe(false);
  });

  it("collects multiple errors", () => {
    const result = validateAgentSchema({ schema_version: 2, type: "bad" });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(2);
  });
});

describe("loadAgents", () => {
  it("returns empty array for missing directory", () => {
    const agents = loadAgents("/nonexistent/path");
    expect(agents).toEqual([]);
  });

  it("returns empty array for empty directory", () => {
    const agents = loadAgents(TEST_DIR);
    expect(agents).toEqual([]);
  });

  it("loads valid YAML file", () => {
    const yamlContent = `
schema_version: 1
name: test-executor
type: executor
description: Test executor
triggers:
  - slice_ready
system_prompt: You are a test agent.
`;
    writeFileSync(join(TEST_DIR, "executor.yaml"), yamlContent);

    const agents = loadAgents(TEST_DIR);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("test-executor");
    expect(agents[0].type).toBe("executor");
  });

  it("skips invalid YAML gracefully", () => {
    writeFileSync(join(TEST_DIR, "bad.yaml"), "{{invalid yaml");
    writeFileSync(join(TEST_DIR, "good.yaml"), `
schema_version: 1
name: good-agent
type: executor
description: Good agent
triggers:
  - slice_ready
system_prompt: Good agent prompt.
`);

    const agents = loadAgents(TEST_DIR);
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("good-agent");
  });

  it("skips YAML with schema errors", () => {
    writeFileSync(join(TEST_DIR, "invalid-schema.yaml"), `
schema_version: 2
name: bad-schema
type: invalid
description: Bad
triggers: []
system_prompt: Test.
`);

    const agents = loadAgents(TEST_DIR);
    expect(agents).toHaveLength(0);
  });

  it("ignores non-yaml files", () => {
    writeFileSync(join(TEST_DIR, "readme.md"), "# Not an agent");
    const agents = loadAgents(TEST_DIR);
    expect(agents).toEqual([]);
  });
});

describe("getAgentForEvent", () => {
  const agents: AgentYamlConfig[] = [
    { ...validAgentYaml(), name: "exec", type: "executor", triggers: ["slice_ready"] } as AgentYamlConfig,
    { ...validAgentYaml(), name: "validator", type: "pipeline-validator", triggers: ["execution_complete"] } as AgentYamlConfig,
  ];

  it("returns matching agent for event", () => {
    const agent = getAgentForEvent(agents, "slice_ready");
    expect(agent?.name).toBe("exec");
  });

  it("returns null for unmatched event", () => {
    const agent = getAgentForEvent(agents, "quality_gate_passed");
    expect(agent).toBeNull();
  });
});

describe("getAgentsForEvent", () => {
  const agents: AgentYamlConfig[] = [
    { ...validAgentYaml(), name: "a1", triggers: ["slice_ready"] } as AgentYamlConfig,
    { ...validAgentYaml(), name: "a2", triggers: ["slice_ready", "execution_complete"] } as AgentYamlConfig,
    { ...validAgentYaml(), name: "a3", triggers: ["execution_complete"] } as AgentYamlConfig,
  ];

  it("returns all agents matching event", () => {
    const result = getAgentsForEvent(agents, "slice_ready");
    expect(result).toHaveLength(2);
    expect(result.map((a) => a.name)).toContain("a1");
    expect(result.map((a) => a.name)).toContain("a2");
  });

  it("returns empty for unmatched event", () => {
    expect(getAgentsForEvent(agents, "module_complete")).toHaveLength(0);
  });
});
