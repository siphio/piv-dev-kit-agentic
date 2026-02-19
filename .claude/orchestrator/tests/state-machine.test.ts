import { describe, it, expect } from "vitest";
import {
  determineNextAction,
  findPendingFailure,
  findActiveCheckpoint,
  getNextUnfinishedPhase,
} from "../src/state-machine.js";
import type { Manifest } from "../src/types.js";

function baseManifest(): Manifest {
  return {
    prd: {
      path: ".agents/PRD.md",
      status: "validated",
      generated_at: "2026-02-18",
      phases_defined: [1, 2],
    },
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
    profiles: {
      "claude-agent-sdk": {
        path: ".agents/reference/claude-agent-sdk-profile.md",
        generated_at: "2026-02-18",
        status: "complete",
        freshness: "fresh",
        used_in_phases: [1, 2],
      },
    },
    plans: [{ path: ".agents/plans/phase-1.md", phase: 1, status: "complete", generated_at: "2026-02-18" }],
    last_updated: "2026-02-18",
  };
}

describe("findPendingFailure", () => {
  it("returns null when no failures exist", () => {
    expect(findPendingFailure(baseManifest())).toBeNull();
  });

  it("returns the first pending failure", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      failures: [
        {
          command: "execute",
          phase: 1,
          error_category: "syntax_error",
          timestamp: "2026-02-18",
          retry_count: 0,
          max_retries: 2,
          resolution: "pending",
          details: "Compilation failed",
        },
      ],
    };
    const failure = findPendingFailure(manifest);
    expect(failure).not.toBeNull();
    expect(failure!.error_category).toBe("syntax_error");
  });

  it("ignores resolved failures", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      failures: [
        {
          command: "execute",
          phase: 1,
          error_category: "syntax_error",
          timestamp: "2026-02-18",
          retry_count: 1,
          max_retries: 2,
          resolution: "auto_fixed",
          details: "fixed",
        },
      ],
    };
    expect(findPendingFailure(manifest)).toBeNull();
  });
});

describe("findActiveCheckpoint", () => {
  it("returns null when no checkpoints exist", () => {
    expect(findActiveCheckpoint(baseManifest())).toBeNull();
  });

  it("returns the first active checkpoint", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      checkpoints: [
        { tag: "piv-checkpoint/phase-1-abc", phase: 1, created_before: "execute", status: "active" },
      ],
    };
    const cp = findActiveCheckpoint(manifest);
    expect(cp).not.toBeNull();
    expect(cp!.tag).toBe("piv-checkpoint/phase-1-abc");
  });
});

describe("getNextUnfinishedPhase", () => {
  it("returns the first phase needing work", () => {
    expect(getNextUnfinishedPhase(baseManifest())).toBe(1);
  });

  it("returns null when all phases are complete", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      phases: {
        1: { plan: "complete", execution: "complete", validation: "pass" },
        2: { plan: "complete", execution: "complete", validation: "pass" },
      },
    };
    expect(getNextUnfinishedPhase(manifest)).toBeNull();
  });

  it("returns phase needing validation", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      phases: {
        1: { plan: "complete", execution: "complete", validation: "not_run" },
        2: { plan: "not_started", execution: "not_started", validation: "not_run" },
      },
    };
    expect(getNextUnfinishedPhase(manifest)).toBe(1);
  });
});

describe("determineNextAction", () => {
  it("recommends retry when pending failure has retries", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      failures: [{
        command: "execute",
        phase: 1,
        error_category: "syntax_error",
        timestamp: "2026-02-18",
        retry_count: 0,
        max_retries: 2,
        resolution: "pending",
        details: "Compilation failed",
      }],
    };
    const action = determineNextAction(manifest);
    expect(action.command).toBe("execute");
    expect(action.argument).toBe("retry");
  });

  it("recommends rollback when retries exhausted", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      failures: [{
        command: "execute",
        phase: 1,
        error_category: "syntax_error",
        timestamp: "2026-02-18",
        retry_count: 2,
        max_retries: 2,
        checkpoint: "piv-checkpoint/phase-1-abc",
        resolution: "pending",
        details: "Still failing",
      }],
    };
    const action = determineNextAction(manifest);
    expect(action.command).toBe("rollback");
    expect(action.argument).toBe("piv-checkpoint/phase-1-abc");
  });

  it("recommends execute when plan is complete but not executed", () => {
    const action = determineNextAction(baseManifest());
    expect(action.command).toBe("execute");
    expect(action.argument).toBe(".agents/plans/phase-1.md");
  });

  it("recommends plan-feature when phase needs plan", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      phases: {
        1: { plan: "complete", execution: "complete", validation: "pass" },
        2: { plan: "not_started", execution: "not_started", validation: "not_run" },
      },
    };
    const action = determineNextAction(manifest);
    expect(action.command).toBe("plan-feature");
    expect(action.argument).toBe("Phase 2");
  });

  it("recommends validate when executed but not validated", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      phases: {
        1: { plan: "complete", execution: "complete", validation: "not_run" },
        2: { plan: "not_started", execution: "not_started", validation: "not_run" },
      },
    };
    const action = determineNextAction(manifest);
    expect(action.command).toBe("validate-implementation");
    expect(action.argument).toBe("--full");
  });

  it("recommends commit when validated", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      phases: {
        1: { plan: "complete", execution: "complete", validation: "pass" },
        2: { plan: "not_started", execution: "not_started", validation: "not_run" },
      },
    };
    // Phase 1 is complete, phase 2 needs plan
    const action = determineNextAction(manifest);
    expect(action.command).toBe("plan-feature");
  });

  it("recommends done when all phases complete", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      phases: {
        1: { plan: "complete", execution: "complete", validation: "pass" },
        2: { plan: "complete", execution: "complete", validation: "pass" },
      },
    };
    const action = determineNextAction(manifest);
    expect(action.command).toBe("done");
  });

  it("recommends create-prd when no PRD exists", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      prd: undefined,
    };
    // No pending failure, no active checkpoint, no stale profiles
    // and no PRD → create-prd
    const action = determineNextAction(manifest);
    expect(action.command).toBe("create-prd");
  });

  it("recommends research-stack --refresh for stale profiles", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      profiles: {
        "claude-agent-sdk": {
          path: ".agents/reference/claude-agent-sdk-profile.md",
          generated_at: "2026-01-01",
          status: "complete",
          freshness: "stale",
          used_in_phases: [1],
        },
      },
    };
    const action = determineNextAction(manifest);
    expect(action.command).toBe("research-stack");
    expect(action.argument).toBe("--refresh");
  });

  it("recommends resume for active checkpoint with no failure", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      checkpoints: [{
        tag: "piv-checkpoint/phase-1-abc",
        phase: 1,
        created_before: "execute",
        status: "active",
      }],
    };
    const action = determineNextAction(manifest);
    expect(action.command).toBe("execute");
    expect(action.reason).toContain("interrupted");
  });

  it("recommends rollback immediately for orchestrator_crash (0 retries)", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      failures: [{
        command: "orchestrator",
        phase: 1,
        error_category: "orchestrator_crash",
        timestamp: "2026-02-19",
        retry_count: 0,
        max_retries: 0,
        resolution: "pending",
        details: "Uncaught exception: out of memory",
      }],
    };
    const action = determineNextAction(manifest);
    expect(action.command).toBe("rollback");
    expect(action.reason).toContain("orchestrator_crash");
  });

  it("recommends rollback immediately for manifest_corruption (0 retries)", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      failures: [{
        command: "prime",
        phase: 0,
        error_category: "manifest_corruption",
        timestamp: "2026-02-19",
        retry_count: 0,
        max_retries: 0,
        resolution: "pending",
        details: "YAML parse error in manifest",
      }],
    };
    const action = determineNextAction(manifest);
    expect(action.command).toBe("rollback");
    expect(action.reason).toContain("manifest_corruption");
  });

  it("resumes execution with plan path when active checkpoint has matching plan", () => {
    const manifest: Manifest = {
      ...baseManifest(),
      phases: {
        1: { plan: "complete", execution: "in_progress", validation: "not_run" },
        2: { plan: "not_started", execution: "not_started", validation: "not_run" },
      },
      checkpoints: [{
        tag: "piv-checkpoint/phase-1-abc",
        phase: 1,
        created_before: "execute",
        status: "active",
      }],
    };
    const action = determineNextAction(manifest);
    expect(action.command).toBe("execute");
    expect(action.argument).toBe(".agents/plans/phase-1.md");
    expect(action.confidence).toBe("high");
  });
});
