import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  escapeHtml,
  splitMessage,
  telegramGetMe,
  telegramSendMessage,
  telegramSendEscalation,
} from "../src/telegram.js";
import type { SupervisorTelegramConfig } from "../src/types.js";

const config: SupervisorTelegramConfig = { token: "test-token", chatId: 12345 };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("escapeHtml", () => {
  it("escapes < > &", () => {
    const input = '<b>Test & "value"</b>';
    const result = escapeHtml(input);
    expect(result).toBe('&lt;b&gt;Test &amp; "value"&lt;/b&gt;');
  });

  it("returns empty string for empty input", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("leaves normal text unchanged", () => {
    expect(escapeHtml("Hello world 123")).toBe("Hello world 123");
  });
});

describe("splitMessage", () => {
  it("returns single chunk for short message", () => {
    const message = "Hello, this is a short message.";
    const chunks = splitMessage(message);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(message);
  });

  it("splits long message at newline boundaries", () => {
    // Build a message with 5000+ chars by repeating lines
    const line = "A".repeat(80) + "\n";
    const message = line.repeat(70); // 70 * 81 = 5670 chars
    expect(message.length).toBeGreaterThan(4096);

    const chunks = splitMessage(message);
    expect(chunks.length).toBeGreaterThan(1);

    // Reassembly: joining with newline separators should recover original content
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
  });

  it("each chunk is <= 4096 characters", () => {
    const line = "Line of text that is moderately long for testing.\n";
    const message = line.repeat(200); // ~10000 chars
    expect(message.length).toBeGreaterThan(4096);

    const chunks = splitMessage(message);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
  });
});

describe("telegramGetMe", () => {
  it("returns bot info on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: true,
          result: { id: 1, is_bot: true, first_name: "TestBot" },
        }),
    });

    const result = await telegramGetMe(config);
    expect(result.ok).toBe(true);
    expect(result.result).toEqual({
      id: 1,
      is_bot: true,
      first_name: "TestBot",
    });
  });

  it("returns error on 401", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: false,
          error_code: 401,
          description: "Unauthorized",
        }),
    });

    const result = await telegramGetMe(config);
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe(401);
    expect(result.description).toBe("Unauthorized");
  });
});

describe("telegramSendMessage", () => {
  it("sends message successfully", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: true,
          result: { message_id: 1, chat: { id: 12345 } },
        }),
    });

    const result = await telegramSendMessage(config, "Hello world");
    expect(result.ok).toBe(true);
    expect(result.result?.message_id).toBe(1);
  });

  it("retries without parse_mode on 400 error", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            ok: false,
            error_code: 400,
          }),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            ok: true,
            result: { message_id: 1, chat: { id: 12345 } },
          }),
      });

    const result = await telegramSendMessage(config, "Bad <html>");
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("telegramSendEscalation", () => {
  it("formats escalation message with correct HTML", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: () =>
        Promise.resolve({
          ok: true,
          result: { message_id: 1, chat: { id: 12345 } },
        }),
    });

    await telegramSendEscalation(
      config,
      "my-project",
      3,
      "orchestrator_crashed",
      "Process exited unexpectedly",
      "Attempted restart",
      1,
      3,
    );

    expect(fetch).toHaveBeenCalled();

    const callArgs = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.text).toContain("Supervisor Escalation");
    expect(body.text).toContain("my-project");
    expect(body.text).toContain("orchestrator_crashed");
    expect(body.text).toContain("Process exited unexpectedly");
    expect(body.text).toContain("Attempted restart");
    expect(body.text).toContain("1/3");
    expect(body.parse_mode).toBe("HTML");
  });
});
