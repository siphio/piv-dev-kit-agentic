import { describe, it, expect, vi } from "vitest";
import { MissionEventBus } from "../src/event-bus.js";
import type { EventPayload, LifecycleEvent } from "../src/types.js";

function makePayload(overrides?: Partial<EventPayload>): EventPayload {
  return {
    module: "test-module",
    slice: "01-slice",
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("MissionEventBus", () => {
  it("emits and receives events", () => {
    const bus = new MissionEventBus();
    const handler = vi.fn();
    bus.on("slice_ready", handler);

    const payload = makePayload();
    bus.emit("slice_ready", payload);

    expect(handler).toHaveBeenCalledWith(payload);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("supports multiple listeners on same event", () => {
    const bus = new MissionEventBus();
    const h1 = vi.fn();
    const h2 = vi.fn();
    bus.on("execution_complete", h1);
    bus.on("execution_complete", h2);

    bus.emit("execution_complete", makePayload());

    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });

  it("removes listeners with off()", () => {
    const bus = new MissionEventBus();
    const handler = vi.fn();
    bus.on("agent_crash", handler);
    bus.off("agent_crash", handler);

    bus.emit("agent_crash", makePayload());
    expect(handler).not.toHaveBeenCalled();
  });

  it("once() fires handler only once", () => {
    const bus = new MissionEventBus();
    const handler = vi.fn();
    bus.once("validation_failed", handler);

    bus.emit("validation_failed", makePayload());
    bus.emit("validation_failed", makePayload());

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("different events are independent", () => {
    const bus = new MissionEventBus();
    const readyHandler = vi.fn();
    const completeHandler = vi.fn();
    bus.on("slice_ready", readyHandler);
    bus.on("execution_complete", completeHandler);

    bus.emit("slice_ready", makePayload());

    expect(readyHandler).toHaveBeenCalledTimes(1);
    expect(completeHandler).not.toHaveBeenCalled();
  });

  it("listenerCount returns correct count", () => {
    const bus = new MissionEventBus();
    expect(bus.listenerCount("slice_ready")).toBe(0);

    bus.on("slice_ready", vi.fn());
    bus.on("slice_ready", vi.fn());
    expect(bus.listenerCount("slice_ready")).toBe(2);
  });

  it("removeAllListeners clears all for a specific event", () => {
    const bus = new MissionEventBus();
    bus.on("slice_ready", vi.fn());
    bus.on("slice_ready", vi.fn());
    bus.on("execution_complete", vi.fn());

    bus.removeAllListeners("slice_ready");

    expect(bus.listenerCount("slice_ready")).toBe(0);
    expect(bus.listenerCount("execution_complete")).toBe(1);
  });

  it("removeAllListeners without arg clears everything", () => {
    const bus = new MissionEventBus();
    bus.on("slice_ready", vi.fn());
    bus.on("execution_complete", vi.fn());

    bus.removeAllListeners();

    expect(bus.listenerCount("slice_ready")).toBe(0);
    expect(bus.listenerCount("execution_complete")).toBe(0);
  });

  it("passes payload with agent type and details", () => {
    const bus = new MissionEventBus();
    const handler = vi.fn();
    bus.on("agent_crash", handler);

    const payload = makePayload({ agentType: "executor", details: "timeout" });
    bus.emit("agent_crash", payload);

    expect(handler).toHaveBeenCalledWith(payload);
    expect(handler.mock.calls[0][0].agentType).toBe("executor");
    expect(handler.mock.calls[0][0].details).toBe("timeout");
  });
});
