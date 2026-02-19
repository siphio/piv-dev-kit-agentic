import { describe, it, expect, vi, beforeEach } from "vitest";
import { TelegramNotifier } from "../src/telegram-notifier.js";
import type { Manifest, ApprovalRequest } from "../src/types.js";

// Mock bot that captures sendMessage calls
function createMockBot(): {
  bot: any;
  sent: Array<{ chatId: number; text: string; options?: any }>;
} {
  const sent: Array<{ chatId: number; text: string; options?: any }> = [];

  const bot = {
    api: {
      sendMessage: vi.fn(async (chatId: number, text: string, options?: any) => {
        sent.push({ chatId, text, options });
        return { message_id: sent.length };
      }),
    },
  };

  return { bot, sent };
}

function createTestManifest(): Manifest {
  return {
    phases: {
      1: { plan: "complete", execution: "complete", validation: "pass" },
      2: { plan: "complete", execution: "not_started", validation: "not_run" },
    },
    settings: {
      profile_freshness_window: "7d",
      checkpoint_before_execute: true,
      mode: "autonomous",
      reasoning_model: "opus-4-6",
      validation_mode: "full",
      agent_teams: "prefer_parallel",
    },
    profiles: {},
    last_updated: "2026-02-19T10:00:00Z",
  };
}

describe("TelegramNotifier", () => {
  let mockBot: ReturnType<typeof createMockBot>;
  let notifier: TelegramNotifier;

  beforeEach(() => {
    mockBot = createMockBot();
    notifier = new TelegramNotifier(mockBot.bot as any, 12345, "test-project");
  });

  describe("sendText", () => {
    it("sends a single message for short text", async () => {
      await notifier.sendText("Hello world");

      expect(mockBot.sent).toHaveLength(1);
      expect(mockBot.sent[0].chatId).toBe(12345);
      expect(mockBot.sent[0].text).toContain("[test-project]");
      expect(mockBot.sent[0].text).toContain("Hello world");
      expect(mockBot.sent[0].options?.parse_mode).toBe("HTML");
    });

    it("splits long messages into chunks", async () => {
      const longText = "A".repeat(5000);
      await notifier.sendText(longText);

      expect(mockBot.sent.length).toBeGreaterThan(1);
      // Each chunk should be sent to the correct chat
      for (const msg of mockBot.sent) {
        expect(msg.chatId).toBe(12345);
      }
    });

    it("tags messages with project prefix", async () => {
      await notifier.sendText("Status update");
      expect(mockBot.sent[0].text).toMatch(/^\[test-project\]/);
    });

    it("handles send failure gracefully", async () => {
      mockBot.bot.api.sendMessage.mockRejectedValueOnce(new Error("Network error"));
      // Should not throw
      await notifier.sendText("This will fail");
      // Only one call attempt
      expect(mockBot.bot.api.sendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe("sendPhaseStart", () => {
    it("sends formatted phase start message", async () => {
      await notifier.sendPhaseStart(2, "Telegram Interface");
      expect(mockBot.sent).toHaveLength(1);
      expect(mockBot.sent[0].text).toContain("Phase 2");
      expect(mockBot.sent[0].text).toContain("Telegram Interface");
    });
  });

  describe("sendPhaseComplete", () => {
    it("sends formatted phase complete message with cost", async () => {
      await notifier.sendPhaseComplete(1, 3.45);
      expect(mockBot.sent).toHaveLength(1);
      expect(mockBot.sent[0].text).toContain("Phase 1");
      expect(mockBot.sent[0].text).toContain("$3.45");
    });
  });

  describe("sendEscalation", () => {
    it("sends formatted escalation with full context", async () => {
      await notifier.sendEscalation(
        2, "integration_auth", "401 Unauthorized", "Escalated immediately"
      );
      expect(mockBot.sent).toHaveLength(1);
      expect(mockBot.sent[0].text).toContain("integration_auth");
      expect(mockBot.sent[0].text).toContain("401 Unauthorized");
      expect(mockBot.sent[0].text).toContain("Escalated immediately");
    });
  });

  describe("sendStatus", () => {
    it("sends manifest status report", async () => {
      const manifest = createTestManifest();
      await notifier.sendStatus(manifest);
      expect(mockBot.sent).toHaveLength(1);
      expect(mockBot.sent[0].text).toContain("PIV Orchestrator Status");
      expect(mockBot.sent[0].text).toContain("Phase 1");
    });
  });

  describe("requestTier3Approval", () => {
    it("sends message with inline keyboard", async () => {
      const request: ApprovalRequest = {
        techName: "Stripe",
        endpoint: "POST /v1/charges",
        cost: "$0.50",
        effect: "Creates test charge",
        cleanup: "Refund within 24h",
      };

      // Start the approval request (won't resolve until callback)
      const approvalPromise = notifier.requestTier3Approval(request);

      // Yield to event loop so the async sendMessage completes
      // and pendingApprovals.set() is called
      await new Promise((r) => setTimeout(r, 10));

      // Verify message was sent with keyboard
      expect(mockBot.sent).toHaveLength(1);
      expect(mockBot.sent[0].text).toContain("Stripe");
      expect(mockBot.sent[0].options?.reply_markup).toBeDefined();

      // Simulate callback by resolving the approval
      const resolved = notifier.resolveApproval("Stripe", "approve");
      expect(resolved).toBe(true);

      const result = await approvalPromise;
      expect(result.action).toBe("approve");
      expect(result.techName).toBe("Stripe");
    });

    it("returns skip when Telegram send fails", async () => {
      mockBot.bot.api.sendMessage.mockRejectedValueOnce(new Error("Network error"));

      const request: ApprovalRequest = {
        techName: "FailTech",
        endpoint: "GET /fail",
        cost: "free",
        effect: "nothing",
        cleanup: "none",
      };

      const result = await notifier.requestTier3Approval(request);
      expect(result.action).toBe("skip");
      expect(result.techName).toBe("FailTech");
    });
  });

  describe("resolveApproval", () => {
    it("returns false for unknown tech name", () => {
      const resolved = notifier.resolveApproval("unknown", "approve");
      expect(resolved).toBe(false);
    });
  });

  describe("sendApprovalResult", () => {
    it("sends approval result message", async () => {
      await notifier.sendApprovalResult("Stripe", "approve");
      expect(mockBot.sent).toHaveLength(1);
      expect(mockBot.sent[0].text).toContain("Stripe");
    });
  });
});
