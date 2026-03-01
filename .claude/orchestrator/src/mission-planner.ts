// PIV Orchestrator — Mission Planner (DAG Builder)
//
// Parses dependency graphs from architecture.md YAML adjacency lists,
// builds DAG nodes, and provides graph traversal helpers.

import yaml from "js-yaml";
import type { DependencyEdge, DAGNode, MissionPlan, WorkUnit } from "./types.js";

interface RawDependency {
  from: string;   // "module/slice"
  to: string;     // "module/slice"
  type?: string;
}

function parseRef(ref: string): { module: string; slice: string } {
  const parts = ref.split("/");
  return { module: parts[0] ?? ref, slice: parts[1] ?? "" };
}

/**
 * Extract the YAML dependency adjacency list from architecture.md content.
 * Looks for a fenced YAML block labeled "dependencies" or containing dependency entries.
 */
export function parseDependencyGraph(architectureMd: string): DependencyEdge[] {
  // Find YAML fenced blocks
  const yamlBlockRegex = /```ya?ml\s*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  const edges: DependencyEdge[] = [];

  while ((match = yamlBlockRegex.exec(architectureMd)) !== null) {
    const block = match[1];
    try {
      const parsed = yaml.load(block);

      // Handle direct array of dependencies
      if (Array.isArray(parsed)) {
        for (const entry of parsed) {
          if (entry && typeof entry.from === "string" && typeof entry.to === "string") {
            edges.push({
              from: parseRef(entry.from),
              to: parseRef(entry.to),
              type: (entry.type as DependencyEdge["type"]) ?? "data",
            });
          }
        }
        continue;
      }

      // Handle object with "dependencies" key
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const obj = parsed as Record<string, unknown>;
        const deps = obj.dependencies ?? obj.edges ?? obj.dag;
        if (Array.isArray(deps)) {
          for (const entry of deps as RawDependency[]) {
            if (entry && typeof entry.from === "string" && typeof entry.to === "string") {
              edges.push({
                from: parseRef(entry.from),
                to: parseRef(entry.to),
                type: (entry.type as DependencyEdge["type"]) ?? "data",
              });
            }
          }
        }
      }
    } catch {
      // Not valid YAML or not a dependency block — skip
    }
  }

  return edges;
}

/**
 * Build a DAG from dependency edges and work units.
 * Nodes with zero incoming dependencies are marked "ready".
 */
export function buildDAG(edges: DependencyEdge[], workUnits: WorkUnit[]): MissionPlan {
  const nodeMap = new Map<string, DAGNode>();

  // Create nodes for all work units
  for (const wu of workUnits) {
    const key = `${wu.module}/${wu.slice}`;
    nodeMap.set(key, {
      module: wu.module,
      slice: wu.slice,
      dependencies: [],
      dependents: [],
      status: "ready",
      assignedAgent: undefined,
    });
  }

  // Wire edges
  for (const edge of edges) {
    const fromKey = `${edge.from.module}/${edge.from.slice}`;
    const toKey = `${edge.to.module}/${edge.to.slice}`;
    const fromNode = nodeMap.get(fromKey);
    const toNode = nodeMap.get(toKey);

    if (fromNode && toNode) {
      fromNode.dependents.push(edge);
      toNode.dependencies.push(edge);
    }
  }

  // Detect circular dependencies
  if (hasCycle(nodeMap)) {
    throw new Error("Circular dependency detected in DAG");
  }

  // Mark nodes with incoming dependencies as "blocked"
  for (const node of nodeMap.values()) {
    if (node.dependencies.length > 0) {
      node.status = "blocked";
    }
  }

  const nodes = Array.from(nodeMap.values());
  const parallelStreams = computeParallelStreams(nodes);

  return {
    nodes,
    parallelStreams,
    totalSlices: nodes.length,
    maxParallelism: parallelStreams.length > 0
      ? Math.max(...parallelStreams.map((s) => s.length))
      : nodes.length,
  };
}

/**
 * Get all nodes with status "ready".
 */
export function getReadyNodes(plan: MissionPlan): DAGNode[] {
  return plan.nodes.filter((n) => n.status === "ready");
}

/**
 * Mark a node as complete and unblock dependents whose dependencies are all satisfied.
 * Returns a new MissionPlan.
 */
export function markNodeComplete(plan: MissionPlan, module: string, slice: string): MissionPlan {
  const nodes = plan.nodes.map((n) => {
    if (n.module === module && n.slice === slice) {
      return { ...n, status: "complete" as const };
    }
    return { ...n };
  });

  // Check if blocked nodes should be unblocked
  for (const node of nodes) {
    if (node.status !== "blocked") continue;

    const allDepsComplete = node.dependencies.every((dep) => {
      const depNode = nodes.find((n) => n.module === dep.from.module && n.slice === dep.from.slice);
      return depNode?.status === "complete";
    });

    if (allDepsComplete) {
      node.status = "ready";
    }
  }

  return { ...plan, nodes };
}

/**
 * Mark a node as failed and cascade-block all dependents.
 */
export function markNodeFailed(plan: MissionPlan, module: string, slice: string): MissionPlan {
  const nodes = plan.nodes.map((n) => ({ ...n }));
  const targetKey = `${module}/${slice}`;

  // Mark the target as failed
  const target = nodes.find((n) => n.module === module && n.slice === slice);
  if (target) target.status = "failed";

  // Cascade-block: find all transitively dependent nodes
  const blocked = new Set<string>();
  const queue = [targetKey];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentNode = nodes.find((n) => `${n.module}/${n.slice}` === current);
    if (!currentNode) continue;

    for (const dep of currentNode.dependents) {
      const depKey = `${dep.to.module}/${dep.to.slice}`;
      if (!blocked.has(depKey)) {
        blocked.add(depKey);
        queue.push(depKey);
        const depNode = nodes.find((n) => `${n.module}/${n.slice}` === depKey);
        if (depNode && depNode.status !== "complete") {
          depNode.status = "blocked";
        }
      }
    }
  }

  return { ...plan, nodes };
}

// --- Internal helpers ---

export function hasCycle(nodeMap: Map<string, DAGNode>): boolean {
  const visited = new Set<string>();
  const recStack = new Set<string>();

  function dfs(key: string): boolean {
    visited.add(key);
    recStack.add(key);

    const node = nodeMap.get(key);
    if (!node) return false;

    for (const dep of node.dependents) {
      const depKey = `${dep.to.module}/${dep.to.slice}`;
      if (!visited.has(depKey)) {
        if (dfs(depKey)) return true;
      } else if (recStack.has(depKey)) {
        return true;
      }
    }

    recStack.delete(key);
    return false;
  }

  for (const key of nodeMap.keys()) {
    if (!visited.has(key)) {
      if (dfs(key)) return true;
    }
  }

  return false;
}

export function computeParallelStreams(nodes: DAGNode[]): DAGNode[][] {
  // Group nodes by their topological depth (BFS from roots)
  const levels: DAGNode[][] = [];
  const assigned = new Set<string>();

  // Level 0: all ready nodes (no dependencies)
  const level0 = nodes.filter((n) => n.dependencies.length === 0);
  if (level0.length > 0) {
    levels.push(level0);
    level0.forEach((n) => assigned.add(`${n.module}/${n.slice}`));
  }

  // Subsequent levels: nodes whose dependencies are all in prior levels
  let changed = true;
  while (changed) {
    changed = false;
    const nextLevel: DAGNode[] = [];

    for (const node of nodes) {
      const key = `${node.module}/${node.slice}`;
      if (assigned.has(key)) continue;

      const allDepsAssigned = node.dependencies.every((dep) =>
        assigned.has(`${dep.from.module}/${dep.from.slice}`)
      );

      if (allDepsAssigned) {
        nextLevel.push(node);
        assigned.add(key);
        changed = true;
      }
    }

    if (nextLevel.length > 0) {
      levels.push(nextLevel);
    }
  }

  return levels;
}
