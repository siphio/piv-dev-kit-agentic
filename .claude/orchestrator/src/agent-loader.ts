// PIV Orchestrator — YAML Agent Registry
//
// Loads agent definitions from `.claude/agents/*.yaml`, validates schema,
// and provides lookup by lifecycle event. Invalid YAML is skipped gracefully.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import type { AgentYamlConfig, LifecycleEvent, AgentType } from "./types.js";

const VALID_AGENT_TYPES: AgentType[] = [
  "environment-architect", "executor", "pipeline-validator",
  "quality-iterator", "external-service-controller", "research-agent",
  "integration-agent",
];

const VALID_LIFECYCLE_EVENTS: LifecycleEvent[] = [
  "slice_ready", "execution_complete", "validation_failed",
  "quality_gate_passed", "integration_ready", "agent_crash", "module_complete",
];

/**
 * Validate a parsed YAML object against the agent schema.
 * Returns validation result with specific error messages.
 */
export function validateAgentSchema(raw: unknown): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { valid: false, errors: ["Not a valid object"] };
  }

  const obj = raw as Record<string, unknown>;

  if (obj.schema_version !== 1) {
    errors.push(`schema_version must be 1, got ${obj.schema_version}`);
  }
  if (typeof obj.name !== "string" || !obj.name) {
    errors.push("name is required and must be a string");
  }
  if (!VALID_AGENT_TYPES.includes(obj.type as AgentType)) {
    errors.push(`type must be one of: ${VALID_AGENT_TYPES.join(", ")}`);
  }
  if (typeof obj.description !== "string" || !obj.description) {
    errors.push("description is required and must be a string");
  }
  if (!Array.isArray(obj.triggers) || obj.triggers.length === 0) {
    errors.push("triggers must be a non-empty array");
  } else {
    for (const t of obj.triggers) {
      if (!VALID_LIFECYCLE_EVENTS.includes(t as LifecycleEvent)) {
        errors.push(`Invalid trigger: ${t}`);
      }
    }
  }
  if (typeof obj.system_prompt !== "string" || !obj.system_prompt) {
    errors.push("system_prompt is required and must be a string");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Load all agent YAML configs from a directory.
 * Skips invalid files with warnings. Returns empty array if directory missing.
 */
export function loadAgents(agentsDir: string): AgentYamlConfig[] {
  if (!existsSync(agentsDir)) {
    console.log(`  ℹ️ Agent directory not found: ${agentsDir}`);
    return [];
  }

  const files = readdirSync(agentsDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  if (files.length === 0) {
    console.log(`  ℹ️ No agent YAML files found in ${agentsDir}`);
    return [];
  }

  const agents: AgentYamlConfig[] = [];

  for (const file of files) {
    const filePath = join(agentsDir, file);
    try {
      const content = readFileSync(filePath, "utf-8");
      const parsed = yaml.load(content);
      const validation = validateAgentSchema(parsed);

      if (!validation.valid) {
        console.log(`  ⚠️ Skipping ${file}: ${validation.errors.join("; ")}`);
        continue;
      }

      agents.push(parsed as AgentYamlConfig);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ⚠️ Skipping ${file}: YAML parse error — ${msg}`);
    }
  }

  console.log(`  📋 Loaded ${agents.length} agent(s) from ${agentsDir}`);
  return agents;
}

/**
 * Find the agent config triggered by a specific lifecycle event.
 * Returns the first matching agent, or null if none match.
 */
export function getAgentForEvent(
  agents: AgentYamlConfig[],
  event: LifecycleEvent
): AgentYamlConfig | null {
  return agents.find((a) => a.triggers.includes(event)) ?? null;
}

/**
 * Get all agents triggered by a specific lifecycle event.
 */
export function getAgentsForEvent(
  agents: AgentYamlConfig[],
  event: LifecycleEvent
): AgentYamlConfig[] {
  return agents.filter((a) => a.triggers.includes(event));
}
