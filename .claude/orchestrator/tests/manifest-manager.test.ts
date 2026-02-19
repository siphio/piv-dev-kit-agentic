import { describe, it, expect } from "vitest";
import {
  mergeManifest,
  appendFailure,
  appendNotification,
  resolveCheckpoint,
  updatePhaseStatus,
  setNextAction,
} from "../src/manifest-manager.js";
import type { Manifest, FailureEntry, NotificationEntry } from "../src/types.js";

function baseManifest(): Manifest {
  return {
    phases: {
      1: { plan: "complete", execution: "not_started", validation: "not_run" },
      2: { plan: "not_started", execution: "not_started", validation: "not_run" },
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
    last_updated: "2026-02-18T00:00:00Z",
  };
}

describe("mergeManifest", () => {
  it("deep-merges objects without overwriting existing keys", () => {
    const existing = baseManifest();
    const updates: Partial<Manifest> = {
      settings: {
        ...existing.settings,
        mode: "manual",
      },
    };

    const result = mergeManifest(existing, updates);
    expect(result.settings.mode).toBe("manual");
    expect(result.settings.profile_freshness_window).toBe("7d");
    expect(result.phases[1].plan).toBe("complete");
  });

  it("concatenates array fields", () => {
    const existing: Manifest = {
      ...baseManifest(),
      plans: [{ path: "plan-1.md", phase: 1, status: "complete", generated_at: "2026-02-18" }],
    };

    const result = mergeManifest(existing, {
      plans: [{ path: "plan-2.md", phase: 2, status: "complete", generated_at: "2026-02-19" }],
    });

    expect(result.plans).toHaveLength(2);
    expect(result.plans![0].path).toBe("plan-1.md");
    expect(result.plans![1].path).toBe("plan-2.md");
  });

  it("initializes arrays when existing field is undefined", () => {
    const existing = baseManifest();
    const result = mergeManifest(existing, {
      failures: [{
        command: "execute",
        phase: 1,
        error_category: "syntax_error",
        timestamp: "2026-02-18",
        retry_count: 0,
        max_retries: 2,
        resolution: "pending",
        details: "test",
      }],
    });

    expect(result.failures).toHaveLength(1);
  });
});

describe("appendFailure", () => {
  it("adds a failure to the failures array", () => {
    const manifest = baseManifest();
    const failure: FailureEntry = {
      command: "execute",
      phase: 1,
      error_category: "syntax_error",
      timestamp: "2026-02-18T10:00:00Z",
      retry_count: 0,
      max_retries: 2,
      resolution: "pending",
      details: "Compilation failed",
    };

    const result = appendFailure(manifest, failure);
    expect(result.failures).toHaveLength(1);
    expect(result.failures![0].error_category).toBe("syntax_error");
  });

  it("appends to existing failures", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      failures: [{
        command: "execute",
        phase: 1,
        error_category: "syntax_error",
        timestamp: "2026-02-18",
        retry_count: 0,
        max_retries: 2,
        resolution: "auto_fixed",
        details: "first",
      }],
    };

    const result = appendFailure(manifest, {
      command: "validate-implementation",
      phase: 1,
      error_category: "test_failure",
      timestamp: "2026-02-18",
      retry_count: 0,
      max_retries: 2,
      resolution: "pending",
      details: "second",
    });

    expect(result.failures).toHaveLength(2);
  });
});

describe("resolveCheckpoint", () => {
  it("sets checkpoint status to resolved", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      checkpoints: [
        { tag: "piv-checkpoint/phase-1-abc", phase: 1, created_before: "execute", status: "active" },
      ],
    };

    const result = resolveCheckpoint(manifest, "piv-checkpoint/phase-1-abc");
    expect(result.checkpoints![0].status).toBe("resolved");
  });

  it("does not modify other checkpoints", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      checkpoints: [
        { tag: "piv-checkpoint/phase-1-abc", phase: 1, created_before: "execute", status: "active" },
        { tag: "piv-checkpoint/phase-2-def", phase: 2, created_before: "execute", status: "active" },
      ],
    };

    const result = resolveCheckpoint(manifest, "piv-checkpoint/phase-1-abc");
    expect(result.checkpoints![0].status).toBe("resolved");
    expect(result.checkpoints![1].status).toBe("active");
  });

  it("handles missing checkpoints gracefully", () => {
    const manifest = baseManifest();
    const result = resolveCheckpoint(manifest, "nonexistent");
    expect(result.checkpoints).toBeUndefined();
  });
});

describe("updatePhaseStatus", () => {
  it("updates only specified fields", () => {
    const manifest = baseManifest();
    const result = updatePhaseStatus(manifest, 1, { execution: "complete" });

    expect(result.phases[1].plan).toBe("complete");
    expect(result.phases[1].execution).toBe("complete");
    expect(result.phases[1].validation).toBe("not_run");
  });

  it("creates phase entry if it does not exist", () => {
    const manifest = baseManifest();
    const result = updatePhaseStatus(manifest, 5, { plan: "in_progress" });

    expect(result.phases[5].plan).toBe("in_progress");
    expect(result.phases[5].execution).toBe("not_started");
    expect(result.phases[5].validation).toBe("not_run");
  });
});

describe("setNextAction", () => {
  it("sets the next_action field", () => {
    const manifest = baseManifest();
    const result = setNextAction(manifest, {
      command: "execute",
      argument: ".agents/plans/phase-1.md",
      reason: "Plan complete",
      confidence: "high",
    });

    expect(result.next_action?.command).toBe("execute");
    expect(result.next_action?.argument).toBe(".agents/plans/phase-1.md");
  });
});
