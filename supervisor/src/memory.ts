// PIV Supervisor — SuperMemory.AI Client Wrapper
// Provides long-term pattern memory for fix records across interventions.
// All operations are wrapped in try/catch — never blocks the supervisor pipeline.

import Supermemory from "supermemory";
import type { MemoryConfig, FixRecord, MemorySearchResult } from "./types.js";

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
