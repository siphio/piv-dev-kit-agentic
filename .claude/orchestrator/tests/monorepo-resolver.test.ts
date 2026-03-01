import { describe, it, expect } from "vitest";
import {
  getWorkUnits,
  getNextUnfinishedWorkUnit,
  isSliceComplete,
  updateSliceStatus,
  workUnitToLabel,
} from "../src/monorepo-resolver.js";
import { isMonorepoManifest } from "../src/types.js";
import type { Manifest } from "../src/types.js";

function classicManifest(): Manifest {
  return {
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
    last_updated: "2026-03-01",
  };
}

function monorepoManifest(): Manifest {
  return {
    project: {
      name: "test-project",
      scaffolded_at: "2026-03-01",
      structure: "context-monorepo",
    },
    modules: {
      "0-foundation": {
        specification: "context/modules/0-foundation/specification.md",
        status: "complete",
        slices: {
          "01-data-model": { plan: "complete", execution: "complete", validation: "pass" },
          "02-api": { plan: "complete", execution: "not_started", validation: "not_run" },
        },
      },
      "1-processing": {
        specification: "context/modules/1-processing/specification.md",
        status: "complete",
        slices: {
          "01-pipeline": { plan: "not_started", execution: "not_started", validation: "not_run" },
        },
      },
    },
    phases: {},
    settings: {
      profile_freshness_window: "7d",
      checkpoint_before_execute: true,
      mode: "autonomous",
      reasoning_model: "opus-4-6",
      validation_mode: "full",
      agent_teams: "prefer_parallel",
    },
    last_updated: "2026-03-01",
  };
}

describe("isMonorepoManifest", () => {
  it("returns false for classic manifests (no project field)", () => {
    expect(isMonorepoManifest(classicManifest())).toBe(false);
  });

  it("returns true for manifests with project.structure: context-monorepo and modules", () => {
    expect(isMonorepoManifest(monorepoManifest())).toBe(true);
  });

  it("returns false when project exists but modules missing", () => {
    const m: Manifest = {
      ...classicManifest(),
      project: { name: "test", scaffolded_at: "2026-03-01", structure: "context-monorepo" },
    };
    expect(isMonorepoManifest(m)).toBe(false);
  });
});

describe("getWorkUnits", () => {
  it("returns empty array for classic manifest", () => {
    expect(getWorkUnits(classicManifest())).toEqual([]);
  });

  it("returns correct WorkUnit array for monorepo manifest", () => {
    const units = getWorkUnits(monorepoManifest());
    expect(units).toHaveLength(3);

    // Sorted by module name then slice ID
    expect(units[0].module).toBe("0-foundation");
    expect(units[0].slice).toBe("01-data-model");
    expect(units[0].contextPath).toBe("context/modules/0-foundation/slices/01-data-model/context.md");
    expect(units[0].specPath).toBe("context/modules/0-foundation/specification.md");

    expect(units[1].module).toBe("0-foundation");
    expect(units[1].slice).toBe("02-api");

    expect(units[2].module).toBe("1-processing");
    expect(units[2].slice).toBe("01-pipeline");
  });

  it("returns empty array for monorepo with empty modules", () => {
    const m: Manifest = {
      ...monorepoManifest(),
      modules: {},
    };
    expect(getWorkUnits(m)).toEqual([]);
  });
});

describe("getNextUnfinishedWorkUnit", () => {
  it("returns first incomplete slice", () => {
    const wu = getNextUnfinishedWorkUnit(monorepoManifest());
    expect(wu).not.toBeNull();
    expect(wu!.module).toBe("0-foundation");
    expect(wu!.slice).toBe("02-api");
  });

  it("returns null when all slices are complete", () => {
    const m: Manifest = {
      ...monorepoManifest(),
      modules: {
        "0-foundation": {
          specification: "context/modules/0-foundation/specification.md",
          status: "complete",
          slices: {
            "01-data-model": { plan: "complete", execution: "complete", validation: "pass" },
          },
        },
      },
    };
    expect(getNextUnfinishedWorkUnit(m)).toBeNull();
  });

  it("returns null for classic manifest", () => {
    expect(getNextUnfinishedWorkUnit(classicManifest())).toBeNull();
  });
});

describe("isSliceComplete", () => {
  it("returns true for fully complete slice", () => {
    expect(isSliceComplete({ plan: "complete", execution: "complete", validation: "pass" })).toBe(true);
  });

  it("returns false for incomplete plan", () => {
    expect(isSliceComplete({ plan: "not_started", execution: "complete", validation: "pass" })).toBe(false);
  });

  it("returns false for incomplete execution", () => {
    expect(isSliceComplete({ plan: "complete", execution: "not_started", validation: "pass" })).toBe(false);
  });

  it("returns false for failed validation", () => {
    expect(isSliceComplete({ plan: "complete", execution: "complete", validation: "fail" })).toBe(false);
  });
});

describe("updateSliceStatus", () => {
  it("merges status correctly", () => {
    const m = monorepoManifest();
    const result = updateSliceStatus(m, "0-foundation", "02-api", { execution: "complete" });
    expect(result.modules!["0-foundation"].slices["02-api"].plan).toBe("complete");
    expect(result.modules!["0-foundation"].slices["02-api"].execution).toBe("complete");
    expect(result.modules!["0-foundation"].slices["02-api"].validation).toBe("not_run");
  });

  it("creates missing module/slice entries defensively", () => {
    const m = classicManifest();
    const result = updateSliceStatus(m, "new-module", "01-slice", { plan: "in_progress" });
    expect(result.modules!["new-module"]).toBeDefined();
    expect(result.modules!["new-module"].slices["01-slice"].plan).toBe("in_progress");
    expect(result.modules!["new-module"].slices["01-slice"].execution).toBe("not_started");
    expect(result.modules!["new-module"].slices["01-slice"].validation).toBe("not_run");
  });

  it("preserves other modules and slices", () => {
    const m = monorepoManifest();
    const result = updateSliceStatus(m, "0-foundation", "02-api", { validation: "pass" });
    // Other slice untouched
    expect(result.modules!["0-foundation"].slices["01-data-model"].validation).toBe("pass");
    // Other module untouched
    expect(result.modules!["1-processing"].slices["01-pipeline"].plan).toBe("not_started");
  });
});

describe("workUnitToLabel", () => {
  it("formats correctly", () => {
    const wu = getWorkUnits(monorepoManifest())[0];
    expect(workUnitToLabel(wu)).toBe("Module 0-foundation / Slice 01-data-model");
  });
});
