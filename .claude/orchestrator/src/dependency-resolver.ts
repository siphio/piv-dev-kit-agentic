// PIV Orchestrator — Dependency Resolver
//
// Tracks deliverables per slice and determines when blocked nodes
// can be unblocked based on completed upstream work.

import type { MissionPlan, DAGNode, DependencyEdge } from "./types.js";
import { markNodeComplete, markNodeFailed, getReadyNodes } from "./mission-planner.js";

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
