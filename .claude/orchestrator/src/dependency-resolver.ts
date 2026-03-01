// PIV Orchestrator — Dependency Resolver
//
// Tracks deliverables per slice and determines when blocked nodes
// can be unblocked based on completed upstream work.

import type { MissionPlan, DAGNode, DependencyEdge } from "./types.js";
import { markNodeComplete, markNodeFailed, getReadyNodes, hasCycle, computeParallelStreams } from "./mission-planner.js";

export class DependencyResolver {
  private plan: MissionPlan;
  private deliverables: Set<string>; // "module/slice:type" entries

  constructor(plan: MissionPlan) {
    this.plan = plan;
    this.deliverables = new Set();
  }

  /**
   * Record that a deliverable from a slice is ready.
   */
  markDeliverable(module: string, slice: string, type: DependencyEdge["type"]): void {
    this.deliverables.add(`${module}/${slice}:${type}`);
  }

  /**
   * Mark all deliverable types for a completed slice.
   */
  markSliceComplete(module: string, slice: string): void {
    const types: DependencyEdge["type"][] = ["data", "schema", "infrastructure", "types"];
    for (const type of types) {
      this.deliverables.add(`${module}/${slice}:${type}`);
    }
    this.plan = markNodeComplete(this.plan, module, slice);
  }

  /**
   * Mark a slice as failed and cascade-block dependents.
   */
  markSliceFailed(module: string, slice: string): void {
    this.plan = markNodeFailed(this.plan, module, slice);
  }

  /**
   * Get nodes that are currently ready for execution.
   */
  getUnblockedNodes(): DAGNode[] {
    return getReadyNodes(this.plan);
  }

  /**
   * Check if all nodes are either complete or failed.
   */
  isComplete(): boolean {
    return this.plan.nodes.every(
      (n) => n.status === "complete" || n.status === "failed"
    );
  }

  /**
   * Get the dependency edges blocking a specific node.
   */
  getBlockedBy(module: string, slice: string): DependencyEdge[] {
    const node = this.plan.nodes.find(
      (n) => n.module === module && n.slice === slice
    );
    if (!node) return [];

    return node.dependencies.filter((dep) => {
      const depNode = this.plan.nodes.find(
        (n) => n.module === dep.from.module && n.slice === dep.from.slice
      );
      return depNode?.status !== "complete";
    });
  }

  /**
   * Get the current mission plan state.
   */
  getPlan(): MissionPlan {
    return this.plan;
  }

  /**
   * Mark a node as running.
   */
  markRunning(module: string, slice: string, agentId: string): void {
    this.plan = {
      ...this.plan,
      nodes: this.plan.nodes.map((n) => {
        if (n.module === module && n.slice === slice) {
          return { ...n, status: "running" as const, assignedAgent: agentId };
        }
        return n;
      }),
    };
  }

  /**
   * Merge new work into the live plan without disrupting in-progress nodes.
   * Returns the list of newly added node keys ("module/slice").
   */
  mergeNewWork(newNodes: DAGNode[], newEdges: DependencyEdge[]): string[] {
    const existingKeys = new Set(
      this.plan.nodes.map((n) => `${n.module}/${n.slice}`)
    );

    // Filter to genuinely new nodes
    const toAdd = newNodes.filter((n) => !existingKeys.has(`${n.module}/${n.slice}`));
    if (toAdd.length === 0) return [];

    // Append new nodes with clean state
    const addedKeys: string[] = [];
    for (const node of toAdd) {
      this.plan.nodes.push({
        module: node.module,
        slice: node.slice,
        dependencies: [],
        dependents: [],
        status: "ready",
        assignedAgent: undefined,
      });
      addedKeys.push(`${node.module}/${node.slice}`);
    }

    // Wire new edges (skip duplicates)
    for (const edge of newEdges) {
      const fromKey = `${edge.from.module}/${edge.from.slice}`;
      const toKey = `${edge.to.module}/${edge.to.slice}`;
      const fromNode = this.plan.nodes.find((n) => `${n.module}/${n.slice}` === fromKey);
      const toNode = this.plan.nodes.find((n) => `${n.module}/${n.slice}` === toKey);

      if (!fromNode || !toNode) continue;

      // Skip duplicate edges
      const alreadyDependent = fromNode.dependents.some(
        (e) => e.to.module === edge.to.module && e.to.slice === edge.to.slice && e.type === edge.type
      );
      if (!alreadyDependent) {
        fromNode.dependents.push(edge);
      }

      const alreadyDependency = toNode.dependencies.some(
        (e) => e.from.module === edge.from.module && e.from.slice === edge.from.slice && e.type === edge.type
      );
      if (!alreadyDependency) {
        toNode.dependencies.push(edge);
      }
    }

    // Cycle check on full graph
    const nodeMap = new Map<string, DAGNode>();
    for (const n of this.plan.nodes) {
      nodeMap.set(`${n.module}/${n.slice}`, n);
    }
    if (hasCycle(nodeMap)) {
      // Roll back: remove added nodes and edges
      this.plan.nodes = this.plan.nodes.filter(
        (n) => !addedKeys.includes(`${n.module}/${n.slice}`)
      );
      for (const edge of newEdges) {
        const fromNode = this.plan.nodes.find(
          (n) => n.module === edge.from.module && n.slice === edge.from.slice
        );
        const toNode = this.plan.nodes.find(
          (n) => n.module === edge.to.module && n.slice === edge.to.slice
        );
        if (fromNode) {
          fromNode.dependents = fromNode.dependents.filter(
            (e) => !(e.to.module === edge.to.module && e.to.slice === edge.to.slice && e.type === edge.type)
          );
        }
        if (toNode) {
          toNode.dependencies = toNode.dependencies.filter(
            (e) => !(e.from.module === edge.from.module && e.from.slice === edge.from.slice && e.type === edge.type)
          );
        }
      }
      throw new Error("Circular dependency detected when merging new work");
    }

    // Set correct initial status for new nodes
    for (const key of addedKeys) {
      const node = this.plan.nodes.find((n) => `${n.module}/${n.slice}` === key)!;
      if (node.dependencies.length > 0) {
        const allDepsComplete = node.dependencies.every((dep) => {
          const depNode = this.plan.nodes.find(
            (n) => n.module === dep.from.module && n.slice === dep.from.slice
          );
          return depNode?.status === "complete";
        });
        node.status = allDepsComplete ? "ready" : "blocked";
      }
      // If no dependencies, stays "ready" (set above)
    }

    // Recompute plan metadata
    this.plan.parallelStreams = computeParallelStreams(this.plan.nodes);
    this.plan.totalSlices = this.plan.nodes.length;
    this.plan.maxParallelism = this.plan.parallelStreams.length > 0
      ? Math.max(...this.plan.parallelStreams.map((s) => s.length))
      : this.plan.nodes.length;

    return addedKeys;
  }

  /**
   * Get summary stats for reporting.
   */
  getStats(): { total: number; ready: number; running: number; complete: number; failed: number; blocked: number } {
    const nodes = this.plan.nodes;
    return {
      total: nodes.length,
      ready: nodes.filter((n) => n.status === "ready").length,
      running: nodes.filter((n) => n.status === "running").length,
      complete: nodes.filter((n) => n.status === "complete").length,
      failed: nodes.filter((n) => n.status === "failed").length,
      blocked: nodes.filter((n) => n.status === "blocked").length,
    };
  }
}

/**
 * Factory function to create a DependencyResolver from a MissionPlan.
 */
export function createResolver(plan: MissionPlan): DependencyResolver {
  return new DependencyResolver(plan);
}
