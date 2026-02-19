import { describe, it, expect } from "vitest";
import {
  scoreContext,
  isContextSufficient,
  formatContextScore,
} from "../src/context-scorer.js";
import type { Manifest } from "../src/types.js";

function baseManifest(): Manifest {
  return {
    prd: { path: ".agents/PRD.md", status: "validated", generated_at: "2026-02-18", phases_defined: [1, 2] },
    phases: {
      1: { plan: "complete", execution: "not_started", validation: "not_run" },
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
        used_in_phases: [1],
      },
    },
    plans: [{ path: ".agents/plans/phase-1.md", phase: 1, status: "complete", generated_at: "2026-02-18" }],
    last_updated: "2026-02-18",
  };
}

describe("scoreContext", () => {
  it("gives maximum score for perfect prime output", () => {
    const output = [
      "Phase 1 context loaded successfully.",
      "Profile claude-agent-sdk is fresh.",
      "Plan at .agents/plans/phase-1.md loaded.",
      "Manifest status: all systems go.",
      "Everything looks good.",
    ].join("\n");
    const score = scoreContext(output, baseManifest(), 1);
    expect(score.total).toBe(10);
    expect(score.prdPhaseLoaded).toBe(true);
    expect(score.profilesFound).toContain("claude-agent-sdk");
    expect(score.planReferenced).toBe(true);
    expect(score.manifestAccurate).toBe(true);
  });

  it("gives 0 for completely empty output", () => {
    const score = scoreContext("", baseManifest(), 1);
    expect(score.total).toBeLessThanOrEqual(2); // Only "no errors" might score
  });

  it("scores PRD phase mention (+3)", () => {
    const score = scoreContext("Loading Phase 2 context...", baseManifest(), 2);
    expect(score.prdPhaseLoaded).toBe(true);
    expect(score.details).toEqual(expect.arrayContaining([expect.stringContaining("Phase 2")]));
  });

  it("does not score wrong phase number", () => {
    const score = scoreContext("Loading Phase 3 context...", baseManifest(), 1);
    expect(score.prdPhaseLoaded).toBe(false);
  });

  it("scores profile presence (+2)", () => {
    const output = "Found profile: claude-agent-sdk";
    const score = scoreContext(output, baseManifest());
    expect(score.profilesFound).toContain("claude-agent-sdk");
  });

  it("gives full profile score when no profiles expected", () => {
    const manifest = { ...baseManifest(), profiles: {} };
    const score = scoreContext("something", manifest);
    // No profiles expected → counts as OK (+2)
    expect(score.details).toEqual(expect.arrayContaining([expect.stringContaining("No profiles expected")]));
  });

  it("penalizes errors in output", () => {
    const clean = scoreContext("All good, manifest status ok", baseManifest());
    const withError = scoreContext("Error: file not found, manifest status ok", baseManifest());
    expect(clean.total).toBeGreaterThan(withError.total);
  });
});

describe("isContextSufficient", () => {
  it("returns true for score >= threshold", () => {
    const score = { total: 7, prdPhaseLoaded: true, profilesFound: [], planReferenced: true, manifestAccurate: true, details: [] };
    expect(isContextSufficient(score)).toBe(true);
  });

  it("returns false for score < threshold", () => {
    const score = { total: 3, prdPhaseLoaded: false, profilesFound: [], planReferenced: false, manifestAccurate: false, details: [] };
    expect(isContextSufficient(score)).toBe(false);
  });

  it("supports custom threshold", () => {
    const score = { total: 7, prdPhaseLoaded: true, profilesFound: [], planReferenced: true, manifestAccurate: true, details: [] };
    expect(isContextSufficient(score, 8)).toBe(false);
    expect(isContextSufficient(score, 7)).toBe(true);
  });
});

describe("formatContextScore", () => {
  it("formats score with details", () => {
    const score = {
      total: 8,
      prdPhaseLoaded: true,
      profilesFound: ["sdk"],
      planReferenced: true,
      manifestAccurate: true,
      details: ["PRD Phase 1 loaded (+3)", "Profiles found: sdk (+2)"],
    };
    const output = formatContextScore(score);
    expect(output).toContain("Context Score: 8/10");
    expect(output).toContain("PRD Phase 1 loaded (+3)");
  });
});
