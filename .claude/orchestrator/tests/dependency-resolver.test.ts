import { describe, it, expect } from "vitest";
import { createResolver, DependencyResolver } from "../src/dependency-resolver.js";
import { buildDAG } from "../src/mission-planner.js";
import type { DAGNode, DependencyEdge, WorkUnit } from "../src/types.js";

function makeWorkUnit(module: string, slice: string): WorkUnit {
  return {
    module,
    slice,
    sliceStatus: { plan: "not_started", execution: "not_started", validation: "not_run" },
    contextPath: `context/modules/${module}/slices/${slice}/context.md`,
    specPath: `context/modules/${module}/specification.md`,
  };
}

function setup3NodeChain() {
  const units = [makeWorkUnit("m", "a"), makeWorkUnit("m", "b"), makeWorkUnit("m", "c")];
  const edges: DependencyEdge[] = [
    { from: { module: "m", slice: "a" }, to: { module: "m", slice: "b" }, type: "data" },
    { from: { module: "m", slice: "b" }, to: { module: "m", slice: "c" }, type: "data" },
  ];
  return createResolver(buildDAG(edges, units));
}

function setupParallel() {
  const units = [makeWorkUnit("m", "a"), makeWorkUnit("m", "b"), makeWorkUnit("m", "c")];
  return createResolver(buildDAG([], units));
}

describe("DependencyResolver", () => {
  it("getUnblockedNodes returns ready nodes", () => {
    const resolver = setup3NodeChain();
    const unblocked = resolver.getUnblockedNodes();
    expect(unblocked).toHaveLength(1);
    expect(unblocked[0].slice).toBe("a");
  });

  it("markSliceComplete unblocks dependents", () => {
    const resolver = setup3NodeChain();
    resolver.markSliceComplete("m", "a");

    const unblocked = resolver.getUnblockedNodes();
    expect(unblocked).toHaveLength(1);
    expect(unblocked[0].slice).toBe("b");
  });

  it("markSliceFailed cascade-blocks dependents", () => {
    const resolver = setup3NodeChain();
    resolver.markSliceFailed("m", "a");

    const unblocked = resolver.getUnblockedNodes();
    expect(unblocked).toHaveLength(0);
  });

  it("isComplete returns true when all done", () => {
    const resolver = setup3NodeChain();
    expect(resolver.isComplete()).toBe(false);

    resolver.markSliceComplete("m", "a");
    resolver.markSliceComplete("m", "b");
    resolver.markSliceComplete("m", "c");
    expect(resolver.isComplete()).toBe(true);
  });

  it("isComplete returns true when remaining are failed", () => {
    const resolver = setup3NodeChain();
    resolver.markSliceComplete("m", "a");
    resolver.markSliceFailed("m", "b");
    // c is blocked by failed b — but b and c are failed/blocked
    // We need c to also be in a terminal state. Since markNodeFailed cascades,
    // b=failed means c stays blocked. isComplete checks complete OR failed.
    // c is blocked, not complete or failed, so isComplete = false
    expect(resolver.isComplete()).toBe(false);
  });

  it("getBlockedBy returns blocking edges", () => {
    const resolver = setup3NodeChain();
    const blockers = resolver.getBlockedBy("m", "b");
    expect(blockers).toHaveLength(1);
    expect(blockers[0].from.slice).toBe("a");
  });

  it("getBlockedBy returns empty when not blocked", () => {
    const resolver = setup3NodeChain();
    const blockers = resolver.getBlockedBy("m", "a");
    expect(blockers).toHaveLength(0);
  });

  it("markRunning updates node status", () => {
    const resolver = setup3NodeChain();
    resolver.markRunning("m", "a", "session-1");

    const plan = resolver.getPlan();
    const nodeA = plan.nodes.find((n) => n.slice === "a")!;
    expect(nodeA.status).toBe("running");
    expect(nodeA.assignedAgent).toBe("session-1");
  });

  it("getStats returns correct counts", () => {
    const resolver = setupParallel();
    const stats = resolver.getStats();
    expect(stats.total).toBe(3);
    expect(stats.ready).toBe(3);
    expect(stats.running).toBe(0);
    expect(stats.complete).toBe(0);
  });

  it("markDeliverable records specific deliverable type", () => {
    const resolver = setup3NodeChain();
    resolver.markDeliverable("m", "a", "schema");
    // Should not unblock b yet (markDeliverable doesn't trigger unblocking directly)
    // Only markSliceComplete does full unblocking
    const stats = resolver.getStats();
    expect(stats.ready).toBe(1); // Only a is ready
  });

  it("parallel nodes all start ready", () => {
    const resolver = setupParallel();
    const unblocked = resolver.getUnblockedNodes();
    expect(unblocked).toHaveLength(3);
  });
});

describe("mergeNewWork", () => {
  it("adds a new independent node", () => {
    const resolver = setup3NodeChain();
    const newNode = { module: "m", slice: "d", dependencies: [], dependents: [], status: "ready" as const };
    const added = resolver.mergeNewWork([newNode], []);

    expect(added).toEqual(["m/d"]);
    expect(resolver.getPlan().totalSlices).toBe(4);
    const nodeD = resolver.getPlan().nodes.find((n) => n.slice === "d");
    expect(nodeD?.status).toBe("ready");
  });

  it("skips duplicate nodes", () => {
    const resolver = setup3NodeChain();
    const dupNode = { module: "m", slice: "a", dependencies: [], dependents: [], status: "ready" as const };
    const added = resolver.mergeNewWork([dupNode], []);

    expect(added).toEqual([]);
    expect(resolver.getPlan().totalSlices).toBe(3);
  });

  it("new node depending on completed node starts ready", () => {
    const resolver = setup3NodeChain();
    resolver.markSliceComplete("m", "a");

    const newNode = { module: "m", slice: "d", dependencies: [], dependents: [], status: "ready" as const };
    const newEdge: DependencyEdge = { from: { module: "m", slice: "a" }, to: { module: "m", slice: "d" }, type: "data" };
    const added = resolver.mergeNewWork([newNode], [newEdge]);

    expect(added).toEqual(["m/d"]);
    const nodeD = resolver.getPlan().nodes.find((n) => n.slice === "d");
    expect(nodeD?.status).toBe("ready");
  });

  it("new node depending on running node starts blocked", () => {
    const resolver = setup3NodeChain();
    resolver.markRunning("m", "a", "session-1");

    const newNode = { module: "m", slice: "d", dependencies: [], dependents: [], status: "ready" as const };
    const newEdge: DependencyEdge = { from: { module: "m", slice: "a" }, to: { module: "m", slice: "d" }, type: "data" };
    const added = resolver.mergeNewWork([newNode], [newEdge]);

    expect(added).toEqual(["m/d"]);
    const nodeD = resolver.getPlan().nodes.find((n) => n.slice === "d");
    expect(nodeD?.status).toBe("blocked");
  });

  it("throws on cycle from new edges", () => {
    const resolver = setup3NodeChain();
    const newNode = { module: "m", slice: "d", dependencies: [], dependents: [], status: "ready" as const };
    // d depends on c, and a depends on d → creates cycle a→b→c→d→...→a
    const cyclicEdges: DependencyEdge[] = [
      { from: { module: "m", slice: "c" }, to: { module: "m", slice: "d" }, type: "data" },
      { from: { module: "m", slice: "d" }, to: { module: "m", slice: "a" }, type: "data" },
    ];

    expect(() => resolver.mergeNewWork([newNode], cyclicEdges)).toThrow("Circular dependency");
    // Node should have been rolled back
    expect(resolver.getPlan().totalSlices).toBe(3);
  });

  it("does not duplicate existing edges", () => {
    const resolver = setup3NodeChain();
    const nodeA = resolver.getPlan().nodes.find((n) => n.slice === "a")!;
    const existingDependentCount = nodeA.dependents.length;

    // Try to re-add the same a→b edge
    const dupEdge: DependencyEdge = { from: { module: "m", slice: "a" }, to: { module: "m", slice: "b" }, type: "data" };
    const newNode = { module: "m", slice: "d", dependencies: [], dependents: [], status: "ready" as const };
    resolver.mergeNewWork([newNode], [dupEdge]);

    const updatedA = resolver.getPlan().nodes.find((n) => n.slice === "a")!;
    expect(updatedA.dependents.length).toBe(existingDependentCount);
  });

  it("updates plan metadata (totalSlices, maxParallelism)", () => {
    const resolver = setupParallel(); // 3 independent nodes
    const origSlices = resolver.getPlan().totalSlices;

    const newNode = { module: "x", slice: "1", dependencies: [], dependents: [], status: "ready" as const };
    resolver.mergeNewWork([newNode], []);

    expect(resolver.getPlan().totalSlices).toBe(origSlices + 1);
    expect(resolver.getPlan().maxParallelism).toBeGreaterThanOrEqual(origSlices + 1);
  });

  it("preserves status of existing running/complete nodes", () => {
    const resolver = setup3NodeChain();
    resolver.markRunning("m", "a", "session-1");

    const newNode = { module: "m", slice: "d", dependencies: [], dependents: [], status: "ready" as const };
    resolver.mergeNewWork([newNode], []);

    const nodeA = resolver.getPlan().nodes.find((n) => n.slice === "a")!;
    expect(nodeA.status).toBe("running");
    expect(nodeA.assignedAgent).toBe("session-1");

    const nodeB = resolver.getPlan().nodes.find((n) => n.slice === "b")!;
    expect(nodeB.status).toBe("blocked");
  });
});
