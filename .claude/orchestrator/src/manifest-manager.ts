// PIV Orchestrator — Manifest YAML Manager (merge-only semantics)

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import yaml from "js-yaml";
import type {
  Manifest,
  FailureEntry,
  NotificationEntry,
  CheckpointEntry,
  PhaseStatus,
  NextAction,
} from "./types.js";

const MANIFEST_RELATIVE = ".agents/manifest.yaml";

function manifestPath(projectDir: string): string {
  return join(projectDir, MANIFEST_RELATIVE);
}

/**
 * Read and parse .agents/manifest.yaml from the project directory.
 */
export async function readManifest(projectDir: string): Promise<Manifest> {
  const filePath = manifestPath(projectDir);
  const content = await readFile(filePath, "utf-8");
  return yaml.load(content) as Manifest;
}

/**
 * Write manifest to .agents/manifest.yaml, updating last_updated timestamp.
 * Creates .agents/ directory if it doesn't exist.
 */
export async function writeManifest(projectDir: string, manifest: Manifest): Promise<void> {
  const filePath = manifestPath(projectDir);
  await mkdir(dirname(filePath), { recursive: true });

  manifest.last_updated = new Date().toISOString();
  const content = yaml.dump(manifest, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });

  // Atomic write: write to temp file, then rename (POSIX atomic on same filesystem)
  const tmpPath = filePath + ".tmp";
  try {
    await writeFile(tmpPath, content, "utf-8");
    await rename(tmpPath, filePath);
  } catch {
    // Fallback to direct write if rename fails
    await writeFile(filePath, content, "utf-8");
  }
}

/**
 * Deep merge manifest updates into existing manifest.
 * Objects are merged recursively. Arrays (plans, executions, validations,
 * failures, notifications) are concatenated.
 */
export function mergeManifest(existing: Manifest, updates: Partial<Manifest>): Manifest {
  const result = { ...existing };
  const arrayKeys = ["plans", "executions", "validations", "failures", "notifications"] as const;

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;

    if (arrayKeys.includes(key as (typeof arrayKeys)[number])) {
      const existingArr = (result as Record<string, unknown>)[key] as unknown[] | undefined;
      const updateArr = value as unknown[];
      (result as Record<string, unknown>)[key] = [...(existingArr ?? []), ...updateArr];
    } else if (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      typeof (result as Record<string, unknown>)[key] === "object" &&
      (result as Record<string, unknown>)[key] !== null
    ) {
      (result as Record<string, unknown>)[key] = {
        ...((result as Record<string, unknown>)[key] as object),
        ...(value as object),
      };
    } else {
      (result as Record<string, unknown>)[key] = value;
    }
  }

  return result;
}

/**
 * Append a failure entry to the manifest.
 */
export function appendFailure(manifest: Manifest, failure: FailureEntry): Manifest {
  return {
    ...manifest,
    failures: [...(manifest.failures ?? []), failure],
  };
}

/**
 * Append a notification entry to the manifest.
 */
export function appendNotification(manifest: Manifest, notification: NotificationEntry): Manifest {
  return {
    ...manifest,
    notifications: [...(manifest.notifications ?? []), notification],
  };
}

/**
 * Resolve a checkpoint by setting its status to "resolved".
 */
export function resolveCheckpoint(manifest: Manifest, tag: string): Manifest {
  if (!manifest.checkpoints) return manifest;

  return {
    ...manifest,
    checkpoints: manifest.checkpoints.map((cp) =>
      cp.tag === tag ? { ...cp, status: "resolved" as const } : cp
    ),
  };
}

/**
 * Update a specific phase's status fields (merges, doesn't replace).
 */
export function updatePhaseStatus(
  manifest: Manifest,
  phase: number,
  updates: Partial<PhaseStatus>
): Manifest {
  const existing = manifest.phases[phase] ?? {
    plan: "not_started",
    execution: "not_started",
    validation: "not_run",
  };

  return {
    ...manifest,
    phases: {
      ...manifest.phases,
      [phase]: { ...existing, ...updates },
    },
  };
}

/**
 * Set the manifest's next_action recommendation.
 */
export function setNextAction(manifest: Manifest, action: NextAction): Manifest {
  return { ...manifest, next_action: action };
}
