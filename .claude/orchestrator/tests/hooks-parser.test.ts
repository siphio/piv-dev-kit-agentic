import { describe, it, expect } from "vitest";
import { parseHooks } from "../src/hooks-parser.js";

describe("parseHooks", () => {
  it("extracts valid hooks from text", () => {
    const text = `Some output here

## PIV-Automator-Hooks
plan_status: ready
confidence: high
next_command: execute`;

    const hooks = parseHooks(text);
    expect(hooks).toEqual({
      plan_status: "ready",
      confidence: "high",
      next_command: "execute",
    });
  });

  it("returns empty object when no hooks block exists", () => {
    const text = "Just some regular text without hooks";
    expect(parseHooks(text)).toEqual({});
  });

  it("returns empty object for empty input", () => {
    expect(parseHooks("")).toEqual({});
  });

  it("skips malformed lines and extracts valid ones", () => {
    const text = `## PIV-Automator-Hooks
valid_key: valid_value
THIS IS NOT VALID
another_key: another_value
: missing_key
no_colon_here`;

    const hooks = parseHooks(text);
    expect(hooks).toEqual({
      valid_key: "valid_value",
      another_key: "another_value",
    });
  });

  it("uses the last hooks block when multiple exist", () => {
    const text = `## PIV-Automator-Hooks
first_key: first_value

Some text in between

## PIV-Automator-Hooks
second_key: second_value`;

    const hooks = parseHooks(text);
    expect(hooks).toEqual({ second_key: "second_value" });
    expect(hooks).not.toHaveProperty("first_key");
  });

  it("stops at next ## header", () => {
    const text = `## PIV-Automator-Hooks
status: complete
confidence: high

## Next Section
this_should_not: be_parsed`;

    const hooks = parseHooks(text);
    expect(hooks).toEqual({
      status: "complete",
      confidence: "high",
    });
  });

  it("handles values with colons", () => {
    const text = `## PIV-Automator-Hooks
next_arg: .agents/plans/phase-1.md
details: error: something went wrong`;

    const hooks = parseHooks(text);
    expect(hooks.next_arg).toBe(".agents/plans/phase-1.md");
    expect(hooks.details).toBe("error: something went wrong");
  });
});
