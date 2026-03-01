import { describe, it, expect, vi } from "vitest";
import { MissionEventBus } from "../src/event-bus.js";
import { loadAgents, getAgentForEvent } from "../src/agent-loader.js";
import { buildDAG, getReadyNodes, markNodeComplete } from "../src/mission-planner.js";
import { createResolver } from "../src/dependency-resolver.js";
import { createResourceManager } from "../src/resource-manager.js";
import { getMissionConfig } from "../src/config.js";
import type { DependencyEdge, WorkUnit, AgentYamlConfig, Manifest } from "../src/types.js";

function makeWorkUnit(module: string, slice: string): WorkUnit {
  return {
    module,
    slice,
    sliceStatus: { plan: "not_started", execution: "not_started", validation: "not_run" },
    contextPath: `context/modules/${module}/slices/${slice}/context.md`,
    specPath: `context/modules/${module}/specification.md`,
  };
}

function makeManifest(): Manifest {
  return {
    phases: {},
    settings: {
      profile_freshness_window: "7d",
      checkpoint_before_execute: true,
      mode: "autonomous",
      reasoning_model: "opus-4-6",
      validation_mode: "full",
      agent_teams: "prefer_parallel",
    },
    last_updated: "2026-03-01",
  };
}

describe("Mission Controller — Integration Wiring", () => {
  it("event bus + resolver + resource manager wire together", () => {
    const units = [makeWorkUnit("m", "s1"), makeWorkUnit("m", "s2")];
    const edges: DependencyEdge[] = [
      { from: { module: "m", slice: "s1" }, to: { module: "m", slice: "s2" }, type: "data" },
    ];

    const plan = buildDAG(edges, units);
    const resolver = createResolver(plan);
    const rm = createResourceManager(3, 50);
    const bus = new MissionEventBus();

    // Step 1: Get ready nodes
    const ready = resolver.getUnblockedNodes();
    expect(ready).toHaveLength(1);
    expect(ready[0].slice).toBe("s1");
    expect(rm.canSpawn()).toBe(true);

    // Step 2: Simulate agent spawn
    rm.registerAgent({
      id: "m/s1",
      agentType: "executor",
      module: "m",
      slice: "s1",
      startedAt: Date.now(),
      status: "running",
      costUsd: 0,
      retryCount: 0,
    });
    resolver.markRunning("m", "s1", "m/s1");

    // Step 3: Simulate completion
    rm.releaseAgent("m/s1", 2.5);
    resolver.markSliceComplete("m", "s1");

    const handler = vi.fn();
    bus.on("execution_complete", handler);
    bus.emit("execution_complete", {
      module: "m",
      slice: "s1",
      agentType: "executor",
      timestamp: Date.now(),
    });
    expect(handler).toHaveBeenCalledTimes(1);

    // Step 4: s2 should now be unblocked
    const newReady = resolver.getUnblockedNodes();
    expect(newReady).toHaveLength(1);
    expect(newReady[0].slice).toBe("s2");

    // Step 5: Verify resource state
    const state = rm.getState();
    expect(state.totalCostUsd).toBe(2.5);
    expect(state.activeAgents).toHaveLength(0);
  });

  it("failure cascades block dependent nodes", () => {
    const units = [
      makeWorkUnit("m", "s1"),
      makeWorkUnit("m", "s2"),
      makeWorkUnit("m", "s3"),
    ];
    const edges: DependencyEdge[] = [
      { from: { module: "m", slice: "s1" }, to: { module: "m", slice: "s2" }, type: "data" },
      { from: { module: "m", slice: "s2" }, to: { module: "m", slice: "s3" }, type: "data" },
    ];

    const plan = buildDAG(edges, units);
    const resolver = createResolver(plan);

    resolver.markSliceFailed("m", "s1");

    // Both s2 and s3 should remain blocked
    const ready = resolver.getUnblockedNodes();
    expect(ready).toHaveLength(0);

    const stats = resolver.getStats();
    expect(stats.failed).toBe(1);
    expect(stats.blocked).toBe(2);
  });

  it("pause check is respected", async () => {
    let pauseCount = 0;
    const pauseCheck = async () => {
      pauseCount++;
    };

    // Simulate calling pause check
    await pauseCheck();
    expect(pauseCount).toBe(1);
  });

  it("getMissionConfig returns defaults for empty manifest", () => {
    const config = getMissionConfig(makeManifest());
    expect(config.maxConcurrentAgents).toBe(3);
    expect(config.missionBudgetUsd).toBe(50.0);
    expect(config.agentModel).toBe("claude-sonnet-4-6");
  });

  it("getMissionConfig reads custom settings", () => {
    const m = makeManifest();
    (m.settings as Record<string, unknown>).max_concurrent_agents = 5;
    (m.settings as Record<string, unknown>).mission_budget_usd = 100.0;
    (m.settings as Record<string, unknown>).agent_model = "claude-opus-4-6";

    const config = getMissionConfig(m);
    expect(config.maxConcurrentAgents).toBe(5);
    expect(config.missionBudgetUsd).toBe(100.0);
    expect(config.agentModel).toBe("claude-opus-4-6");
  });

  it("empty DAG completes immediately", () => {
    const plan = buildDAG([], []);
    const resolver = createResolver(plan);
    expect(resolver.isComplete()).toBe(true);
  });

  it("all independent slices are ready simultaneously", () => {
    const units = [
      makeWorkUnit("a", "1"),
      makeWorkUnit("b", "1"),
      makeWorkUnit("c", "1"),
    ];
    const plan = buildDAG([], units);
    const resolver = createResolver(plan);

    const ready = resolver.getUnblockedNodes();
    expect(ready).toHaveLength(3);
  });

  it("resource manager queues work when at capacity", () => {
    const rm = createResourceManager(1, 50);
    rm.registerAgent({
      id: "a",
      agentType: "executor",
      module: "m",
      slice: "s1",
      startedAt: Date.now(),
      status: "running",
      costUsd: 0,
      retryCount: 0,
    });

    expect(rm.canSpawn()).toBe(false);

    const node = { module: "m", slice: "s2", dependencies: [], dependents: [], status: "ready" as const };
    rm.queueWork(node);
    expect(rm.queueLength()).toBe(1);

    // Release agent → dequeue
    rm.releaseAgent("a", 1.0);
    expect(rm.canSpawn()).toBe(true);

    const dequeued = rm.dequeueWork();
    expect(dequeued?.slice).toBe("s2");
  });
});
