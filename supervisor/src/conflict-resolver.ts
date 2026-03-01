// PIV Supervisor — Conflict Resolver
// Detects git-based file conflicts between agents and determines resolution strategy.

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import type { ConflictDetection } from "./types.js";

/** Unmerged path prefixes in `git status --porcelain` output. */
const UNMERGED_PREFIXES = ["UU", "AA", "DD", "AU", "UA"];

/** Files considered architectural — conflicts here always escalate. */
const ARCHITECTURAL_PATTERNS = [
  "types.ts",
  "architecture.md",
  "tsconfig.json",
  "package.json",
  ".eslintrc",
  "eslint.config",
  "CLAUDE.md",
];

interface ManifestAgent {
  name?: string;
  module?: string;
  slice?: string;
  path?: string;
  depends_on?: string[];
}

interface ManifestData {
  agents?: Record<string, ManifestAgent>;
  modules?: Record<string, { path?: string; depends_on?: string[] }>;
  slices?: Record<string, { path?: string; agent?: string; depends_on?: string[] }>;
}

/**
 * Parse `git status --porcelain` output and extract unmerged file paths.
 * Returns an empty array if no unmerged paths are found.
 */
function extractUnmergedPaths(porcelainOutput: string): string[] {
  const lines = porcelainOutput.split("\n").filter((l) => l.length > 0);
  const unmerged: string[] = [];

  for (const line of lines) {
    const prefix = line.substring(0, 2);
    if (UNMERGED_PREFIXES.includes(prefix)) {
      // Porcelain format: XY <space> path
      const filePath = line.substring(3).trim();
      if (filePath.length > 0) {
        unmerged.push(filePath);
      }
    }
  }

  return unmerged;
}

/**
 * Read and parse the manifest YAML file.
 * Returns null on any read or parse error.
 */
function readManifest(manifestPath: string): ManifestData | null {
  try {
    const content = readFileSync(manifestPath, { encoding: "utf-8" });
    return yaml.load(content) as ManifestData;
  } catch {
    return null;
  }
}

/**
 * Map a file path to the agent that owns it, based on manifest module/slice paths.
 * Returns the agent name or "unknown" if no match is found.
 */
function fileToAgent(filePath: string, manifest: ManifestData): string {
  // Check slices first (more specific)
  if (manifest.slices) {
    for (const [sliceName, slice] of Object.entries(manifest.slices)) {
      if (slice.path && filePath.startsWith(slice.path)) {
        return slice.agent ?? sliceName;
      }
    }
  }

  // Check modules
  if (manifest.modules) {
    for (const [moduleName, mod] of Object.entries(manifest.modules)) {
      if (mod.path && filePath.startsWith(mod.path)) {
        // Find the agent assigned to this module
        if (manifest.agents) {
          for (const [agentName, agent] of Object.entries(manifest.agents)) {
            if (agent.module === moduleName) {
              return agentName;
            }
          }
        }
        return moduleName;
      }
    }
  }

  // Check agents directly by path
  if (manifest.agents) {
    for (const [agentName, agent] of Object.entries(manifest.agents)) {
      if (agent.path && filePath.startsWith(agent.path)) {
        return agentName;
      }
    }
  }

  return "unknown";
}

/**
 * Detect git merge conflicts between agents in a project.
 *
 * Runs `git status --porcelain` to find unmerged paths, then maps each
 * conflicting file to its owning agent via the manifest.
 *
 * Returns null if there are no conflicts, or if git/manifest operations fail.
 */
export function detectConflicts(
  projectPath: string,
  manifestPath: string,
): ConflictDetection | null {
  let porcelainOutput: string;
  try {
    porcelainOutput = execSync("git status --porcelain", {
      cwd: projectPath,
      encoding: "utf-8",
    });
  } catch {
    return null;
  }

  const unmergedFiles = extractUnmergedPaths(porcelainOutput);
  if (unmergedFiles.length === 0) {
    return null;
  }

  const manifest = readManifest(manifestPath);
  if (manifest === null) {
    return null;
  }

  // Map conflicting files to agents
  const agentFiles = new Map<string, string[]>();
  for (const file of unmergedFiles) {
    const agent = fileToAgent(file, manifest);
    const existing = agentFiles.get(agent) ?? [];
    existing.push(file);
    agentFiles.set(agent, existing);
  }

  // Identify the two primary conflicting agents
  const agents = Array.from(agentFiles.keys()).filter((a) => a !== "unknown");
  const agentA = agents[0] ?? "unknown";
  const agentB = agents[1] ?? "unknown";

  const resolution = classifyConflict(unmergedFiles, projectPath);
  const isArchitectural = resolution === "escalate";
  const upstreamAgent = determineUpstream(agentA, agentB, manifestPath);

  return {
    hasConflict: true,
    conflictingFiles: unmergedFiles,
    agentA,
    agentB,
    upstreamAgent,
    isArchitectural,
    resolution,
  };
}

/**
 * Determine which agent is upstream of the other based on module dependency
 * relationships declared in the manifest.
 *
 * If A's module depends on B's module, B is upstream.
 * If B's module depends on A's module, A is upstream.
 * Returns null if no dependency relationship exists or on any error.
 */
export function determineUpstream(
  agentA: string,
  agentB: string,
  manifestPath: string,
): string | null {
  const manifest = readManifest(manifestPath);
  if (manifest === null) {
    return null;
  }

  // Resolve agent → module mapping
  const agentToModule = new Map<string, string>();
  if (manifest.agents) {
    for (const [agentName, agent] of Object.entries(manifest.agents)) {
      if (agent.module) {
        agentToModule.set(agentName, agent.module);
      }
    }
  }

  const moduleA = agentToModule.get(agentA) ?? agentA;
  const moduleB = agentToModule.get(agentB) ?? agentB;

  // Check module-level dependencies
  if (manifest.modules) {
    const modA = manifest.modules[moduleA];
    const modB = manifest.modules[moduleB];

    // If A's module depends on B's module → B is upstream
    if (modA?.depends_on?.includes(moduleB)) {
      return agentB;
    }

    // If B's module depends on A's module → A is upstream
    if (modB?.depends_on?.includes(moduleA)) {
      return agentA;
    }
  }

  // Check slice-level dependencies as fallback
  if (manifest.slices) {
    for (const slice of Object.values(manifest.slices)) {
      if (slice.agent === agentA && slice.depends_on?.includes(agentB)) {
        return agentB;
      }
      if (slice.agent === agentB && slice.depends_on?.includes(agentA)) {
        return agentA;
      }
    }
  }

  return null;
}

/**
 * Classify the nature of a conflict based on the files involved and their diffs.
 *
 * - "escalate" if any file matches architectural patterns, or on any error
 * - "additive_no_conflict" if all diffs show only additions (no deletions)
 * - "upstream_wins" otherwise
 */
export function classifyConflict(
  files: string[],
  projectPath: string,
): "upstream_wins" | "additive_no_conflict" | "escalate" {
  // Check for architectural files first
  for (const file of files) {
    for (const pattern of ARCHITECTURAL_PATTERNS) {
      if (file.includes(pattern)) {
        return "escalate";
      }
    }
  }

  // Analyze diffs for each conflicting file
  try {
    let allAdditive = true;

    for (const file of files) {
      let diffOutput: string;
      try {
        diffOutput = execSync(`git diff -- "${file}"`, {
          cwd: projectPath,
          encoding: "utf-8",
        });
      } catch {
        return "escalate";
      }

      const diffLines = diffOutput.split("\n");
      for (const line of diffLines) {
        // Skip diff headers: ---, +++, @@
        if (line.startsWith("---") || line.startsWith("+++") || line.startsWith("@@")) {
          continue;
        }
        // Skip empty lines and context lines
        if (line.length === 0 || line.startsWith(" ")) {
          continue;
        }
        // If we see a deletion line (starts with - but not a header), it's not purely additive
        if (line.startsWith("-")) {
          allAdditive = false;
          break;
        }
      }

      if (!allAdditive) {
        break;
      }
    }

    if (allAdditive) {
      return "additive_no_conflict";
    }

    return "upstream_wins";
  } catch {
    return "escalate";
  }
}

/**
 * Format a ConflictDetection into a human-readable summary string.
 */
export function formatConflictResolution(detection: ConflictDetection): string {
  const fileCount = detection.conflictingFiles.length;
  const fileWord = fileCount === 1 ? "file" : "file(s)";
  const upstream = detection.upstreamAgent ?? "undetermined";

  return `Conflict between ${detection.agentA} and ${detection.agentB} on ${fileCount} ${fileWord}. Resolution: ${detection.resolution}. Upstream: ${upstream}.`;
}
