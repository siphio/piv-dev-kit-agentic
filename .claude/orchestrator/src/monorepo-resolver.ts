// PIV Orchestrator — Monorepo Resolver (dual-mode schema detection + work unit iteration)

import type { Manifest, WorkUnit, SliceStatus, ModuleEntry } from "./types.js";
import { isMonorepoManifest } from "./types.js";

const DEFAULT_SLICE_STATUS: SliceStatus = {
  plan: "not_started",
  execution: "not_started",
  validation: "not_run",
};

/**
 * Get all work units from a monorepo manifest.
 * Returns empty array for classic (non-monorepo) manifests.
 * Sorts modules alphabetically and slices by ID within each module.
 */
export function getWorkUnits(manifest: Manifest): WorkUnit[] {
  if (!isMonorepoManifest(manifest)) return [];

  const units: WorkUnit[] = [];
  const modules = manifest.modules!;

  const moduleNames = Object.keys(modules).sort();
  for (const moduleName of moduleNames) {
    const mod = modules[moduleName];
    const sliceIds = Object.keys(mod.slices).sort();

    for (const sliceId of sliceIds) {
      const sliceStatus = mod.slices[sliceId];
      units.push({
        module: moduleName,
        slice: sliceId,
        sliceStatus,
        contextPath: `context/modules/${moduleName}/slices/${sliceId}/context.md`,
        specPath: mod.specification,
      });
    }
  }

  return units;
}

/**
 * Get the next unfinished work unit from a monorepo manifest.
 * Returns the first WorkUnit where plan, execution, or validation is incomplete.
 * Returns null for classic manifests or when all slices are complete.
 */
export function getNextUnfinishedWorkUnit(manifest: Manifest): WorkUnit | null {
  const units = getWorkUnits(manifest);
  return units.find((wu) => !isSliceComplete(wu.sliceStatus)) ?? null;
}

/**
 * Check if a slice is fully complete (plan + execution + validation passed).
 */
export function isSliceComplete(status: SliceStatus): boolean {
  return (
    status.plan === "complete" &&
    status.execution === "complete" &&
    status.validation === "pass"
  );
}

/**
 * Update a specific slice's status within a module (merge semantics).
 * Creates module/slice entries if they don't exist (defensive).
 */
export function updateSliceStatus(
  manifest: Manifest,
  module: string,
  slice: string,
  updates: Partial<SliceStatus>
): Manifest {
  const existingModules = manifest.modules ?? {};
  const existingModule: ModuleEntry = existingModules[module] ?? {
    specification: `context/modules/${module}/specification.md`,
    status: "stub",
    slices: {},
  };
  const existingSlice: SliceStatus = existingModule.slices[slice] ?? { ...DEFAULT_SLICE_STATUS };

  return {
    ...manifest,
    modules: {
      ...existingModules,
      [module]: {
        ...existingModule,
        slices: {
          ...existingModule.slices,
          [slice]: { ...existingSlice, ...updates },
        },
      },
    },
  };
}

/**
 * Format a work unit as a human-readable label.
 */
export function workUnitToLabel(wu: WorkUnit): string {
  return `Module ${wu.module} / Slice ${wu.slice}`;
}
