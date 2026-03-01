// PIV Orchestrator — Resource Manager
//
// Enforces concurrency limits, tracks cumulative cost, and manages
// a work queue for slices waiting for an execution slot.

import type { AgentSession, ResourceState, DAGNode } from "./types.js";

export class ResourceManager {
  private activeAgents: Map<string, AgentSession>; // keyed by session id
  private maxConcurrent: number;
  private totalCostUsd: number;
  private budgetLimitUsd: number;
  private queue: DAGNode[];

  constructor(maxConcurrent: number, budgetLimitUsd: number) {
    this.activeAgents = new Map();
    this.maxConcurrent = maxConcurrent;
    this.totalCostUsd = 0;
    this.budgetLimitUsd = budgetLimitUsd;
    this.queue = [];
  }

  /**
   * Check if a new agent can be spawned (under concurrency and budget limits).
   */
  canSpawn(): boolean {
    return (
      this.activeAgents.size < this.maxConcurrent &&
      this.totalCostUsd < this.budgetLimitUsd
    );
  }

  /**
   * Register a new active agent session.
   */
  registerAgent(session: AgentSession): void {
    this.activeAgents.set(session.id, session);
  }

  /**
   * Release an agent after completion and add its cost to the total.
   */
  releaseAgent(sessionId: string, costUsd: number): void {
    this.activeAgents.delete(sessionId);
    this.totalCostUsd += costUsd;
  }

  /**
   * Get the current resource state snapshot.
   */
  getState(): ResourceState {
    return {
      activeAgents: Array.from(this.activeAgents.values()),
      maxConcurrent: this.maxConcurrent,
      totalCostUsd: this.totalCostUsd,
      budgetLimitUsd: this.budgetLimitUsd,
      queuedWork: [...this.queue],
    };
  }

  /**
   * Queue a work node when it can't be spawned immediately.
   */
  queueWork(node: DAGNode): void {
    this.queue.push(node);
  }

  /**
   * Dequeue the next work item when a slot opens.
   */
  dequeueWork(): DAGNode | null {
    return this.queue.shift() ?? null;
  }

  /**
   * Check if the budget limit has been exceeded.
   */
  isBudgetExceeded(): boolean {
    return this.totalCostUsd >= this.budgetLimitUsd;
  }

  /**
   * Get count of active agents.
   */
  activeCount(): number {
    return this.activeAgents.size;
  }

  /**
   * Get a specific active agent by ID.
   */
  getAgent(sessionId: string): AgentSession | undefined {
    return this.activeAgents.get(sessionId);
  }

  /**
   * Get all active agent sessions.
   */
  getActiveAgents(): AgentSession[] {
    return Array.from(this.activeAgents.values());
  }

  /**
   * Get remaining budget in USD.
   */
  remainingBudget(): number {
    return Math.max(0, this.budgetLimitUsd - this.totalCostUsd);
  }

  /**
   * Get queue length.
   */
  queueLength(): number {
    return this.queue.length;
  }
}

/**
 * Factory function to create a ResourceManager with default or configured limits.
 */
export function createResourceManager(
  maxConcurrent: number = 3,
  budgetLimitUsd: number = 50.0
): ResourceManager {
  return new ResourceManager(maxConcurrent, budgetLimitUsd);
}
