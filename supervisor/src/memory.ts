// PIV Supervisor — SuperMemory.AI Client Wrapper
// Provides long-term pattern memory for fix records across interventions.
// All operations are wrapped in try/catch — never blocks the supervisor pipeline.

import Supermemory from "supermemory";
import type { MemoryConfig, FixRecord, MemorySearchResult, CoalitionHealthMetrics, ConflictDetection } from "./types.js";

/**
 * Create a SuperMemory client if enabled (API key present).
 * Returns null if memory is not configured.
 */
export function createMemoryClient(config: MemoryConfig): Supermemory | null {
  if (!config.enabled || !config.apiKey) {
    return null;
  }

  try {
    return new Supermemory({ apiKey: config.apiKey });
  } catch {
    return null;
  }
}

/**
 * Store a fix record in SuperMemory.
 * Returns { id, status } on success, null on error. Never throws.
 */
export async function storeFixRecord(
  client: Supermemory,
  record: FixRecord,
): Promise<{ id: string; status: string } | null> {
  try {
    const result = await client.add({
      content: record.content,
      customId: record.customId,
      containerTag: record.containerTag,
      metadata: record.metadata,
      entityContext: record.entityContext,
    });
    return { id: result.id, status: result.status };
  } catch {
    return null;
  }
}

/**
 * Search SuperMemory for similar past fixes.
 * Uses search.memories() which supports searchMode, containerTag, threshold.
 * Returns matching results or empty array on error. Never throws.
 */
export async function recallSimilarFixes(
  client: Supermemory,
  queryText: string,
  containerTag: string | undefined,
  config: MemoryConfig,
): Promise<MemorySearchResult[]> {
  try {
    const searchParams: Parameters<typeof client.search.memories>[0] = {
      q: queryText,
      searchMode: "hybrid",
      limit: config.searchLimit,
      threshold: config.searchThreshold,
      rerank: true,
      rewriteQuery: true,
    };

    if (containerTag) {
      searchParams.containerTag = containerTag;
    }

    const searchResult = await client.search.memories(searchParams);

    if (!searchResult.results || searchResult.results.length === 0) {
      return [];
    }

    return searchResult.results.map((r) => ({
      id: r.id ?? "",
      // Gotcha G8: hybrid mode returns either `memory` or `chunk` field
      text: (r.memory ?? r.chunk ?? ""),
      similarity: r.similarity ?? 0,
      metadata: Object.fromEntries(
        Object.entries(r.metadata ?? {}).map(([k, v]) => [k, String(v)]),
      ),
    }));
  } catch {
    return [];
  }
}

/**
 * Check if SuperMemory is reachable and authenticated.
 * Returns true on success, false on error. Never throws.
 */
export async function checkMemoryHealth(client: Supermemory): Promise<boolean> {
  try {
    await client.documents.list({ limit: 1 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Store a coalition behavior pattern in SuperMemory.
 * Uses the "coalition_patterns" container for cross-project scope.
 * Returns { id, status } on success, null on error. Never throws.
 */
export async function storeCoalitionPattern(
  client: Supermemory,
  pattern: {
    type: string;
    description: string;
    metrics: CoalitionHealthMetrics;
    resolution: string;
    projectPath: string;
  },
): Promise<{ id: string; status: string } | null> {
  try {
    const content = [
      `## Coalition Pattern: ${pattern.type}`,
      "",
      `**Description:** ${pattern.description}`,
      `**Resolution:** ${pattern.resolution}`,
      `**Convergence Rate:** ${pattern.metrics.convergenceRate.toFixed(2)}`,
      `**Failure Rate:** ${pattern.metrics.failureRate.toFixed(2)}`,
      `**Cost Per Slice:** $${pattern.metrics.costPerSlice.toFixed(2)}`,
      `**Conflict Frequency:** ${pattern.metrics.conflictFrequency.toFixed(2)}`,
      `**Project:** ${pattern.projectPath}`,
    ].join("\n");

    const result = await client.add({
      content,
      customId: `pattern_${new Date().toISOString().replace(/[:.]/g, "-")}_${pattern.type}`,
      containerTag: "coalition_patterns",
      metadata: {
        pattern_type: pattern.type,
        coalition_size: "0",
        convergence_rate: String(pattern.metrics.convergenceRate),
        resolution_type: pattern.resolution,
      },
      entityContext: "This is a coalition behavior pattern. Extract the trigger condition, health metrics, and resolution approach.",
    });

    return { id: result.id, status: result.status };
  } catch {
    return null;
  }
}

/**
 * Recall similar coalition patterns from SuperMemory.
 * Searches the "coalition_patterns" container for cross-project scope.
 * Returns matching results or empty array on error. Never throws.
 */
export async function recallCoalitionPatterns(
  client: Supermemory,
  queryText: string,
  limit?: number,
): Promise<MemorySearchResult[]> {
  try {
    const searchResult = await client.search.memories({
      q: queryText,
      searchMode: "hybrid",
      limit: limit ?? 5,
      threshold: 0.4,
      containerTag: "coalition_patterns",
      rerank: true,
      rewriteQuery: true,
    });

    if (!searchResult.results || searchResult.results.length === 0) {
      return [];
    }

    return searchResult.results.map((r) => ({
      id: r.id ?? "",
      text: (r.memory ?? r.chunk ?? ""),
      similarity: r.similarity ?? 0,
      metadata: Object.fromEntries(
        Object.entries(r.metadata ?? {}).map(([k, v]) => [k, String(v)]),
      ),
    }));
  } catch {
    return [];
  }
}

/**
 * Store a conflict resolution pattern in SuperMemory.
 * Returns { id, status } on success, null on error. Never throws.
 */
export async function storeConflictPattern(
  client: Supermemory,
  conflict: ConflictDetection,
  resolution: string,
): Promise<{ id: string; status: string } | null> {
  try {
    const content = [
      `## Conflict Pattern: ${conflict.agentA} vs ${conflict.agentB}`,
      "",
      `**Files:** ${conflict.conflictingFiles.join(", ")}`,
      `**Architectural:** ${conflict.isArchitectural ? "Yes" : "No"}`,
      `**Upstream:** ${conflict.upstreamAgent ?? "undetermined"}`,
      `**Resolution Applied:** ${resolution}`,
      `**Resolution Strategy:** ${conflict.resolution}`,
    ].join("\n");

    const result = await client.add({
      content,
      customId: `conflict_${new Date().toISOString().replace(/[:.]/g, "-")}`,
      containerTag: "coalition_patterns",
      metadata: {
        conflict_type: conflict.isArchitectural ? "architectural" : "code",
        files_affected: String(conflict.conflictingFiles.length),
        resolution_applied: resolution,
      },
      entityContext: "This is a coalition behavior pattern. Extract the trigger condition, health metrics, and resolution approach.",
    });

    return { id: result.id, status: result.status };
  } catch {
    return null;
  }
}
