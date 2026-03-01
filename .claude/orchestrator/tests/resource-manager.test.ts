import { describe, it, expect } from "vitest";
import { createResourceManager, ResourceManager } from "../src/resource-manager.js";
import type { AgentSession, DAGNode } from "../src/types.js";

function makeSession(id: string, overrides?: Partial<AgentSession>): AgentSession {
  return {
    id,
    agentType: "executor",
    module: "test",
    slice: "s1",
    startedAt: Date.now(),
    status: "running",
    costUsd: 0,
    retryCount: 0,
    ...overrides,
  };
}

function makeNode(module: string, slice: string): DAGNode {
  return {
    module,
    slice,
    dependencies: [],
    dependents: [],
    status: "ready",
  };
}

describe("ResourceManager", () => {
  it("canSpawn returns true when under limits", () => {
    const rm = createResourceManager(3, 50);
    expect(rm.canSpawn()).toBe(true);
  });

  it("canSpawn returns false when at concurrency limit", () => {
    const rm = createResourceManager(2, 50);
    rm.registerAgent(makeSession("a"));
    rm.registerAgent(makeSession("b"));
    expect(rm.canSpawn()).toBe(false);
  });

  it("canSpawn returns true after releasing an agent", () => {
    const rm = createResourceManager(1, 50);
    rm.registerAgent(makeSession("a"));
    expect(rm.canSpawn()).toBe(false);

    rm.releaseAgent("a", 1.0);
    expect(rm.canSpawn()).toBe(true);
  });

  it("tracks cost accumulation", () => {
    const rm = createResourceManager(3, 50);
    rm.registerAgent(makeSession("a"));
    rm.releaseAgent("a", 5.0);
    rm.registerAgent(makeSession("b"));
    rm.releaseAgent("b", 3.0);

    const state = rm.getState();
    expect(state.totalCostUsd).toBe(8.0);
  });

  it("canSpawn returns false when budget exceeded", () => {
    const rm = createResourceManager(3, 10);
    rm.registerAgent(makeSession("a"));
    rm.releaseAgent("a", 10.0);
    expect(rm.canSpawn()).toBe(false);
  });

  it("isBudgetExceeded works correctly", () => {
    const rm = createResourceManager(3, 10);
    expect(rm.isBudgetExceeded()).toBe(false);

    rm.registerAgent(makeSession("a"));
    rm.releaseAgent("a", 10.0);
    expect(rm.isBudgetExceeded()).toBe(true);
  });

  it("queue and dequeue work in FIFO order", () => {
    const rm = createResourceManager(1, 50);
    const n1 = makeNode("m", "s1");
    const n2 = makeNode("m", "s2");

    rm.queueWork(n1);
    rm.queueWork(n2);

    expect(rm.queueLength()).toBe(2);
    expect(rm.dequeueWork()?.slice).toBe("s1");
    expect(rm.dequeueWork()?.slice).toBe("s2");
    expect(rm.dequeueWork()).toBeNull();
  });

  it("activeCount tracks registered agents", () => {
    const rm = createResourceManager(3, 50);
    expect(rm.activeCount()).toBe(0);

    rm.registerAgent(makeSession("a"));
    expect(rm.activeCount()).toBe(1);

    rm.registerAgent(makeSession("b"));
    expect(rm.activeCount()).toBe(2);

    rm.releaseAgent("a", 1.0);
    expect(rm.activeCount()).toBe(1);
  });

  it("getActiveAgents returns current sessions", () => {
    const rm = createResourceManager(3, 50);
    rm.registerAgent(makeSession("a", { module: "mod1" }));
    rm.registerAgent(makeSession("b", { module: "mod2" }));

    const agents = rm.getActiveAgents();
    expect(agents).toHaveLength(2);
    expect(agents.map((a) => a.module)).toContain("mod1");
  });

  it("remainingBudget calculates correctly", () => {
    const rm = createResourceManager(3, 50);
    expect(rm.remainingBudget()).toBe(50);

    rm.registerAgent(makeSession("a"));
    rm.releaseAgent("a", 20.0);
    expect(rm.remainingBudget()).toBe(30);
  });

  it("getState returns complete snapshot", () => {
    const rm = createResourceManager(3, 50);
    rm.registerAgent(makeSession("a"));
    rm.queueWork(makeNode("m", "s1"));

    const state = rm.getState();
    expect(state.maxConcurrent).toBe(3);
    expect(state.budgetLimitUsd).toBe(50);
    expect(state.activeAgents).toHaveLength(1);
    expect(state.queuedWork).toHaveLength(1);
  });
});
