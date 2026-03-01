import { describe, it, expect } from "vitest";
import {
  parseDependencyGraph,
  buildDAG,
  getReadyNodes,
  markNodeComplete,
  markNodeFailed,
} from "../src/mission-planner.js";
import type { DependencyEdge, WorkUnit } from "../src/types.js";

function makeWorkUnit(module: string, slice: string): WorkUnit {
  return {
    module,
    slice,
    sliceStatus: { plan: "not_started", execution: "not_started", validation: "not_run" },
    contextPath: `context/modules/${module}/slices/${slice}/context.md`,
    specPath: `context/modules/${module}/specification.md`,
  };
}

describe("parseDependencyGraph", () => {
  it("parses YAML adjacency list from architecture.md", () => {
    const md = `# Architecture

## Dependencies

\`\`\`yaml
- from: "0-foundation/01-data-model"
  to: "0-foundation/02-api"
  type: schema
- from: "0-foundation/01-data-model"
  to: "1-processing/01-pipeline"
  type: types
\`\`\`
`;
    const edges = parseDependencyGraph(md);
    expect(edges).toHaveLength(2);
    expect(edges[0].from.module).toBe("0-foundation");
    expect(edges[0].from.slice).toBe("01-data-model");
    expect(edges[0].to.module).toBe("0-foundation");
    expect(edges[0].to.slice).toBe("02-api");
    expect(edges[0].type).toBe("schema");
  });

  it("handles object with dependencies key", () => {
    const md = `\`\`\`yaml
dependencies:
  - from: "a/b"
    to: "c/d"
    type: data
\`\`\``;
    const edges = parseDependencyGraph(md);
    expect(edges).toHaveLength(1);
  });

  it("defaults type to data when not specified", () => {
    const md = `\`\`\`yaml
- from: "a/b"
  to: "c/d"
\`\`\``;
    const edges = parseDependencyGraph(md);
    expect(edges[0].type).toBe("data");
  });

  it("returns empty array for no YAML blocks", () => {
    const edges = parseDependencyGraph("# No YAML here\nJust text.");
    expect(edges).toEqual([]);
  });

  it("handles malformed YAML blocks gracefully", () => {
    const md = `\`\`\`yaml
{{not valid yaml
\`\`\``;
    const edges = parseDependencyGraph(md);
    expect(edges).toEqual([]);
  });
});

describe("buildDAG", () => {
  it("builds DAG with correct ready/blocked status", () => {
    const units = [
      makeWorkUnit("mod", "s1"),
      makeWorkUnit("mod", "s2"),
      makeWorkUnit("mod", "s3"),
    ];
    const edges: DependencyEdge[] = [
      { from: { module: "mod", slice: "s1" }, to: { module: "mod", slice: "s2" }, type: "schema" },
      { from: { module: "mod", slice: "s1" }, to: { module: "mod", slice: "s3" }, type: "types" },
    ];

    const plan = buildDAG(edges, units);
    expect(plan.totalSlices).toBe(3);

    const s1 = plan.nodes.find((n) => n.slice === "s1")!;
    const s2 = plan.nodes.find((n) => n.slice === "s2")!;
    const s3 = plan.nodes.find((n) => n.slice === "s3")!;

    expect(s1.status).toBe("ready");
    expect(s2.status).toBe("blocked");
    expect(s3.status).toBe("blocked");
  });

  it("handles independent slices (no edges)", () => {
    const units = [makeWorkUnit("a", "1"), makeWorkUnit("b", "1")];
    const plan = buildDAG([], units);

    expect(plan.nodes.every((n) => n.status === "ready")).toBe(true);
    expect(plan.maxParallelism).toBe(2);
  });

  it("detects circular dependencies", () => {
    const units = [makeWorkUnit("m", "a"), makeWorkUnit("m", "b")];
    const edges: DependencyEdge[] = [
      { from: { module: "m", slice: "a" }, to: { module: "m", slice: "b" }, type: "data" },
      { from: { module: "m", slice: "b" }, to: { module: "m", slice: "a" }, type: "data" },
    ];

    expect(() => buildDAG(edges, units)).toThrow("Circular dependency");
  });

  it("handles empty work units", () => {
    const plan = buildDAG([], []);
    expect(plan.totalSlices).toBe(0);
    expect(plan.nodes).toEqual([]);
  });

  it("ignores edges referencing non-existent work units", () => {
    const units = [makeWorkUnit("m", "s1")];
    const edges: DependencyEdge[] = [
      { from: { module: "m", slice: "s1" }, to: { module: "m", slice: "nonexistent" }, type: "data" },
    ];

    const plan = buildDAG(edges, units);
    expect(plan.nodes).toHaveLength(1);
    expect(plan.nodes[0].status).toBe("ready");
  });
});

describe("getReadyNodes", () => {
  it("returns only ready nodes", () => {
    const units = [makeWorkUnit("m", "s1"), makeWorkUnit("m", "s2")];
    const edges: DependencyEdge[] = [
      { from: { module: "m", slice: "s1" }, to: { module: "m", slice: "s2" }, type: "data" },
    ];
    const plan = buildDAG(edges, units);

    const ready = getReadyNodes(plan);
    expect(ready).toHaveLength(1);
    expect(ready[0].slice).toBe("s1");
  });
});

describe("markNodeComplete", () => {
  it("marks node complete and unblocks dependents", () => {
    const units = [makeWorkUnit("m", "s1"), makeWorkUnit("m", "s2")];
    const edges: DependencyEdge[] = [
      { from: { module: "m", slice: "s1" }, to: { module: "m", slice: "s2" }, type: "data" },
    ];
    const plan = buildDAG(edges, units);
    const updated = markNodeComplete(plan, "m", "s1");

    const s1 = updated.nodes.find((n) => n.slice === "s1")!;
    const s2 = updated.nodes.find((n) => n.slice === "s2")!;

    expect(s1.status).toBe("complete");
    expect(s2.status).toBe("ready");
  });

  it("does not unblock node when other deps still pending", () => {
    const units = [makeWorkUnit("m", "a"), makeWorkUnit("m", "b"), makeWorkUnit("m", "c")];
    const edges: DependencyEdge[] = [
      { from: { module: "m", slice: "a" }, to: { module: "m", slice: "c" }, type: "data" },
      { from: { module: "m", slice: "b" }, to: { module: "m", slice: "c" }, type: "types" },
    ];
    const plan = buildDAG(edges, units);
    const updated = markNodeComplete(plan, "m", "a");

    const c = updated.nodes.find((n) => n.slice === "c")!;
    expect(c.status).toBe("blocked"); // Still waiting on b
  });
});

describe("markNodeFailed", () => {
  it("marks node failed and cascade-blocks dependents", () => {
    const units = [makeWorkUnit("m", "s1"), makeWorkUnit("m", "s2"), makeWorkUnit("m", "s3")];
    const edges: DependencyEdge[] = [
      { from: { module: "m", slice: "s1" }, to: { module: "m", slice: "s2" }, type: "data" },
      { from: { module: "m", slice: "s2" }, to: { module: "m", slice: "s3" }, type: "data" },
    ];
    const plan = buildDAG(edges, units);
    const updated = markNodeFailed(plan, "m", "s1");

    expect(updated.nodes.find((n) => n.slice === "s1")!.status).toBe("failed");
    expect(updated.nodes.find((n) => n.slice === "s2")!.status).toBe("blocked");
    expect(updated.nodes.find((n) => n.slice === "s3")!.status).toBe("blocked");
  });
});
