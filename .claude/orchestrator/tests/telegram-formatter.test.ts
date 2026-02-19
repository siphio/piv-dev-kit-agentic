import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  tagMessage,
  splitMessage,
  formatStatusMessage,
  formatPhaseStartMessage,
  formatPhaseCompleteMessage,
  formatEscalationMessage,
  formatApprovalMessage,
  formatApprovalResultMessage,
} from "../src/telegram-formatter.js";
import type { Manifest, ApprovalRequest } from "../src/types.js";

describe("escapeHtml", () => {
  it("escapes < > & characters", () => {
    expect(escapeHtml("<script>alert('xss')</script>")).toBe(
      "&lt;script&gt;alert('xss')&lt;/script&gt;"
    );
  });

  it("escapes ampersands", () => {
    expect(escapeHtml("foo & bar")).toBe("foo &amp; bar");
  });

  it("passes through safe strings unchanged", () => {
    expect(escapeHtml("Hello world")).toBe("Hello world");
  });

  it("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  it("handles already-escaped-looking strings", () => {
    expect(escapeHtml("&amp;")).toBe("&amp;amp;");
  });
});

describe("tagMessage", () => {
  it("prepends project prefix in brackets", () => {
    expect(tagMessage("my-project", "Hello")).toBe("[my-project] Hello");
  });

  it("handles empty message", () => {
    expect(tagMessage("proj", "")).toBe("[proj] ");
  });
});

describe("splitMessage", () => {
  it("returns empty array for empty string", () => {
    expect(splitMessage("")).toEqual([]);
  });

  it("returns single chunk for short messages", () => {
    expect(splitMessage("Hello world")).toEqual(["Hello world"]);
  });

  it("returns single chunk for message exactly at limit", () => {
    const text = "A".repeat(4000);
    expect(splitMessage(text)).toEqual([text]);
  });

  it("splits on paragraph boundary for long messages", () => {
    const para1 = "A".repeat(3000);
    const para2 = "B".repeat(2000);
    const text = `${para1}\n\n${para2}`;
    const chunks = splitMessage(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(para1);
    expect(chunks[1]).toBe(para2);
  });

  it("falls back to single newline when no paragraph boundary", () => {
    const line1 = "A".repeat(3000);
    const line2 = "B".repeat(2000);
    const text = `${line1}\n${line2}`;
    const chunks = splitMessage(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toBe(line1);
    expect(chunks[1]).toBe(line2);
  });

  it("hard splits when no newlines available", () => {
    const text = "A".repeat(5000);
    const chunks = splitMessage(text);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(4000);
    expect(chunks[1]).toHaveLength(1000);
  });

  it("respects custom maxLength", () => {
    const text = "A".repeat(200);
    const chunks = splitMessage(text, 100);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(100);
  });
});

function createTestManifest(overrides: Partial<Manifest> = {}): Manifest {
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
    ...overrides,
  };
}

describe("formatStatusMessage", () => {
  it("produces HTML with phase table", () => {
    const manifest = createTestManifest();
    const result = formatStatusMessage(manifest);
    expect(result).toContain("<b>PIV Orchestrator Status</b>");
    expect(result).toContain("Phase 1:");
    expect(result).toContain("Phase 2:");
    expect(result).toContain("✅");
    expect(result).toContain("⚪");
  });

  it("includes next action when present", () => {
    const manifest = createTestManifest({
      next_action: {
        command: "execute",
        argument: "plan.md",
        reason: "Ready to go",
        confidence: "high",
      },
    });
    const result = formatStatusMessage(manifest);
    expect(result).toContain("execute");
    expect(result).toContain("Ready to go");
  });

  it("includes active failures when present", () => {
    const manifest = createTestManifest({
      failures: [{
        command: "execute",
        phase: 2,
        error_category: "syntax_error",
        timestamp: "2026-02-19T10:00:00Z",
        retry_count: 0,
        max_retries: 2,
        resolution: "pending",
        details: "Type error in module.ts",
      }],
    });
    const result = formatStatusMessage(manifest);
    expect(result).toContain("Active Failures");
    expect(result).toContain("syntax_error");
  });

  it("handles empty manifest gracefully", () => {
    const manifest = createTestManifest({ phases: {} });
    const result = formatStatusMessage(manifest);
    expect(result).toContain("<b>PIV Orchestrator Status</b>");
  });
});

describe("formatPhaseStartMessage", () => {
  it("includes phase number and name", () => {
    const result = formatPhaseStartMessage(2, "Telegram Interface");
    expect(result).toContain("Phase 2");
    expect(result).toContain("Telegram Interface");
    expect(result).toContain("🚀");
  });
});

describe("formatPhaseCompleteMessage", () => {
  it("includes phase number and cost", () => {
    const result = formatPhaseCompleteMessage(1, 3.45);
    expect(result).toContain("Phase 1");
    expect(result).toContain("$3.45");
    expect(result).toContain("✅");
  });
});

describe("formatEscalationMessage", () => {
  it("includes category, details, and action taken", () => {
    const result = formatEscalationMessage(
      2, "integration_auth", "401 Unauthorized", "Escalated immediately"
    );
    expect(result).toContain("Phase 2");
    expect(result).toContain("integration_auth");
    expect(result).toContain("401 Unauthorized");
    expect(result).toContain("Escalated immediately");
    expect(result).toContain("🔴");
  });
});

describe("formatApprovalMessage", () => {
  it("includes all ApprovalRequest fields", () => {
    const request: ApprovalRequest = {
      techName: "Stripe",
      endpoint: "POST /v1/charges",
      cost: "$0.50 per call",
      effect: "Creates test charge",
      cleanup: "Refund within 24h",
    };
    const result = formatApprovalMessage(request);
    expect(result).toContain("Stripe");
    expect(result).toContain("POST /v1/charges");
    expect(result).toContain("$0.50 per call");
    expect(result).toContain("Creates test charge");
    expect(result).toContain("Refund within 24h");
  });
});

describe("formatApprovalResultMessage", () => {
  it("shows approved action", () => {
    const result = formatApprovalResultMessage("Stripe", "approve");
    expect(result).toContain("Approved");
    expect(result).toContain("Stripe");
  });

  it("shows fixture action", () => {
    const result = formatApprovalResultMessage("Stripe", "fixture");
    expect(result).toContain("Using recorded fixture");
  });

  it("shows skip action", () => {
    const result = formatApprovalResultMessage("Stripe", "skip");
    expect(result).toContain("Skipped");
  });
});
