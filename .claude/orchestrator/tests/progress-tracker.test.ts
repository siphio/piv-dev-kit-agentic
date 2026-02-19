import { describe, it, expect, vi } from "vitest";
import {
  extractToolEvent,
  extractToolTarget,
  formatProgressLine,
  createSessionProgress,
  formatProgressSummary,
  createProgressCallback,
} from "../src/progress-tracker.js";
import type { ToolUseEvent, SessionProgress } from "../src/types.js";

describe("extractToolEvent", () => {
  it("extracts a Read tool_use block", () => {
    const block = { type: "tool_use", name: "Read", input: { file_path: "src/index.ts" } };
    const event = extractToolEvent(block, 3);
    expect(event).not.toBeNull();
    expect(event!.tool).toBe("Read");
    expect(event!.target).toBe("src/index.ts");
    expect(event!.turn).toBe(3);
  });

  it("extracts a Bash tool_use block with truncation", () => {
    const longCmd = "npm run build && npm test && echo done " + "x".repeat(80);
    const block = { type: "tool_use", name: "Bash", input: { command: longCmd } };
    const event = extractToolEvent(block, 5);
    expect(event).not.toBeNull();
    expect(event!.target.length).toBeLessThanOrEqual(84); // 80 + "..."
  });

  it("returns null for non-tool_use blocks", () => {
    const block = { type: "text", text: "hello" };
    expect(extractToolEvent(block, 1)).toBeNull();
  });

  it("returns null for unrecognized tool names", () => {
    const block = { type: "tool_use", name: "UnknownTool", input: {} };
    expect(extractToolEvent(block, 1)).toBeNull();
  });

  it("handles missing input gracefully", () => {
    const block = { type: "tool_use", name: "Glob" };
    const event = extractToolEvent(block, 2);
    expect(event).not.toBeNull();
    expect(event!.target).toBe("unknown");
  });
});

describe("extractToolTarget", () => {
  it("extracts file_path for Read", () => {
    expect(extractToolTarget("Read", { file_path: "foo.ts" })).toBe("foo.ts");
  });

  it("extracts file_path for Write", () => {
    expect(extractToolTarget("Write", { file_path: "bar.ts" })).toBe("bar.ts");
  });

  it("extracts file_path for Edit", () => {
    expect(extractToolTarget("Edit", { file_path: "baz.ts" })).toBe("baz.ts");
  });

  it("extracts pattern for Glob", () => {
    expect(extractToolTarget("Glob", { pattern: "**/*.ts" })).toBe("**/*.ts");
  });

  it("extracts pattern for Grep", () => {
    expect(extractToolTarget("Grep", { pattern: "TODO" })).toBe("TODO");
  });

  it("extracts description for Task", () => {
    expect(extractToolTarget("Task", { description: "find tests" })).toBe("find tests");
  });

  it("extracts query for WebSearch", () => {
    expect(extractToolTarget("WebSearch", { query: "vitest docs" })).toBe("vitest docs");
  });

  it("extracts url for WebFetch", () => {
    expect(extractToolTarget("WebFetch", { url: "https://example.com" })).toBe("https://example.com");
  });

  it("returns 'unknown' for missing input values", () => {
    expect(extractToolTarget("Read", {})).toBe("unknown");
  });
});

describe("formatProgressLine", () => {
  it("formats a progress line with turn number and emoji", () => {
    const event: ToolUseEvent = { turn: 5, tool: "Read", target: "src/index.ts", timestamp: Date.now() };
    const line = formatProgressLine(event);
    expect(line).toContain("[turn 5]");
    expect(line).toContain("Read");
    expect(line).toContain("src/index.ts");
  });
});

describe("createSessionProgress", () => {
  it("returns a fresh progress object with zero counts", () => {
    const progress = createSessionProgress();
    expect(progress.turnCount).toBe(0);
    expect(progress.toolUses).toHaveLength(0);
    expect(progress.filesCreated).toHaveLength(0);
    expect(progress.filesModified).toHaveLength(0);
    expect(progress.testsRun).toBe(0);
    expect(progress.teamSpawns).toBe(0);
    expect(progress.startedAt).toBeGreaterThan(0);
  });
});

describe("formatProgressSummary", () => {
  it("formats a summary with phase, command, and counts", () => {
    const progress = createSessionProgress();
    progress.turnCount = 15;
    progress.toolUses = [
      { turn: 1, tool: "Read", target: "a.ts", timestamp: Date.now() },
      { turn: 2, tool: "Write", target: "b.ts", timestamp: Date.now() },
    ];
    progress.filesCreated = ["b.ts"];
    progress.teamSpawns = 2;

    const summary = formatProgressSummary(1, "execute", progress);
    expect(summary).toContain("Phase 1");
    expect(summary).toContain("execute");
    expect(summary).toContain("Turns: 15");
    expect(summary).toContain("Tools: 2");
    expect(summary).toContain("Files created: 1");
    expect(summary).toContain("Sub-agents spawned: 2");
  });

  it("uses 'Pre-loop' when phase is undefined", () => {
    const progress = createSessionProgress();
    const summary = formatProgressSummary(undefined, "preflight", progress);
    expect(summary).toContain("Pre-loop");
  });
});

describe("createProgressCallback", () => {
  it("creates a callback that logs to console", () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { callback, progress } = createProgressCallback();

    const event: ToolUseEvent = { turn: 1, tool: "Read", target: "test.ts", timestamp: Date.now() };
    callback(event, progress);

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Read"));
    expect(progress.toolUses).toHaveLength(1);
    consoleSpy.mockRestore();
  });

  it("tracks Write events in filesCreated", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { callback, progress } = createProgressCallback();

    const event: ToolUseEvent = { turn: 1, tool: "Write", target: "new-file.ts", timestamp: Date.now() };
    callback(event, progress);

    expect(progress.filesCreated).toContain("new-file.ts");
    vi.restoreAllMocks();
  });

  it("tracks Edit events in filesModified", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { callback, progress } = createProgressCallback();

    const event: ToolUseEvent = { turn: 1, tool: "Edit", target: "existing.ts", timestamp: Date.now() };
    callback(event, progress);

    expect(progress.filesModified).toContain("existing.ts");
    vi.restoreAllMocks();
  });

  it("increments teamSpawns for Task events", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const { callback, progress } = createProgressCallback();

    const event: ToolUseEvent = { turn: 1, tool: "Task", target: "sub-task", timestamp: Date.now() };
    callback(event, progress);

    expect(progress.teamSpawns).toBe(1);
    vi.restoreAllMocks();
  });
});
