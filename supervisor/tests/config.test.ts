import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadMonitorConfig } from "../src/config.js";

describe("loadMonitorConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.stubEnv("PIV_MONITOR_INTERVAL_MS", "");
    vi.stubEnv("PIV_HEARTBEAT_STALE_MS", "");
    vi.stubEnv("PIV_MAX_RESTART_ATTEMPTS", "");
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("TELEGRAM_CHAT_ID", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns default heartbeatStaleMs when env is not set", () => {
    const config = loadMonitorConfig();
    // Default is 15 min, which is above the 6 min minimum
    expect(config.heartbeatStaleMs).toBe(15 * 60 * 1000);
  });

  it("clamps heartbeatStaleMs to minimum 6 minutes when env is too low", () => {
    vi.stubEnv("PIV_HEARTBEAT_STALE_MS", "60000"); // 1 minute
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const config = loadMonitorConfig();

    expect(config.heartbeatStaleMs).toBe(6 * 60 * 1000);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("below minimum safe threshold")
    );
    errorSpy.mockRestore();
  });

  it("accepts heartbeatStaleMs at exactly the minimum", () => {
    vi.stubEnv("PIV_HEARTBEAT_STALE_MS", String(6 * 60 * 1000));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const config = loadMonitorConfig();

    expect(config.heartbeatStaleMs).toBe(6 * 60 * 1000);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("accepts heartbeatStaleMs above the minimum without warning", () => {
    vi.stubEnv("PIV_HEARTBEAT_STALE_MS", String(10 * 60 * 1000));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const config = loadMonitorConfig();

    expect(config.heartbeatStaleMs).toBe(10 * 60 * 1000);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
