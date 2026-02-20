import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MemoryConfig, FixRecord } from "../src/types.js";

const mockClient = {
  add: vi.fn(),
  search: { memories: vi.fn(), execute: vi.fn() },
  documents: { get: vi.fn(), list: vi.fn() },
};

vi.mock("supermemory", () => ({
  default: vi.fn().mockImplementation(() => mockClient),
}));

import Supermemory from "supermemory";
import {
  createMemoryClient,
  storeFixRecord,
  recallSimilarFixes,
  checkMemoryHealth,
} from "../src/memory.js";

function makeConfig(overrides: Partial<MemoryConfig> = {}): MemoryConfig {
  return {
    apiKey: "sm_test_key",
    enabled: true,
    containerTagPrefix: "project_",
    searchThreshold: 0.4,
    searchLimit: 5,
    entityContext: "Test entity context.",
    ...overrides,
  };
}

function makeFixRecord(overrides: Partial<FixRecord> = {}): FixRecord {
  return {
    content: "## Fix Record\nError: test_failure at Phase 2.\nFix: Added null check.",
    customId: "fix_2026-02-20_test_failure",
    containerTag: "project_test",
    metadata: {
      error_category: "test_failure",
      phase: "2",
      project: "test",
      fix_type: "code_change",
      severity: "warning",
      command: "/execute",
      resolved: "true",
    },
    entityContext: "Test entity context.",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createMemoryClient", () => {
  it("returns null when enabled is false", () => {
    const client = createMemoryClient(makeConfig({ enabled: false }));
    expect(client).toBeNull();
  });

  it("returns null when apiKey is undefined", () => {
    const client = createMemoryClient(makeConfig({ apiKey: undefined, enabled: false }));
    expect(client).toBeNull();
  });

  it("returns Supermemory instance when enabled with API key", () => {
    const client = createMemoryClient(makeConfig());
    expect(client).not.toBeNull();
    expect(Supermemory).toHaveBeenCalledWith({ apiKey: "sm_test_key" });
  });
});

describe("storeFixRecord", () => {
  it("calls client.add with correct params", async () => {
    const client = createMemoryClient(makeConfig())!;
    mockClient.add.mockResolvedValue({ id: "doc_123", status: "queued" });

    const record = makeFixRecord();
    const result = await storeFixRecord(client, record);

    expect(mockClient.add).toHaveBeenCalledWith({
      content: record.content,
      customId: record.customId,
      containerTag: record.containerTag,
      metadata: record.metadata,
      entityContext: record.entityContext,
    });
    expect(result).toEqual({ id: "doc_123", status: "queued" });
  });

  it("returns null on SDK error (never throws)", async () => {
    const client = createMemoryClient(makeConfig())!;
    mockClient.add.mockRejectedValue(new Error("API error"));

    const result = await storeFixRecord(client, makeFixRecord());

    expect(result).toBeNull();
  });
});

describe("recallSimilarFixes", () => {
  it("calls client.search.memories with correct params", async () => {
    const client = createMemoryClient(makeConfig())!;
    mockClient.search.memories.mockResolvedValue({
      results: [
        { id: "mem_1", memory: "Past fix text", similarity: 0.85, metadata: { phase: "2" } },
      ],
    });

    const config = makeConfig();
    const results = await recallSimilarFixes(client, "test error", "project_test", config);

    expect(mockClient.search.memories).toHaveBeenCalledWith({
      q: "test error",
      searchMode: "hybrid",
      limit: 5,
      threshold: 0.4,
      rerank: true,
      rewriteQuery: true,
      containerTag: "project_test",
    });
    expect(results).toHaveLength(1);
    expect(results[0].text).toBe("Past fix text");
    expect(results[0].similarity).toBe(0.85);
  });

  it("returns empty array on SDK error (never throws)", async () => {
    const client = createMemoryClient(makeConfig())!;
    mockClient.search.memories.mockRejectedValue(new Error("API error"));

    const results = await recallSimilarFixes(client, "test error", undefined, makeConfig());

    expect(results).toEqual([]);
  });

  it("parses hybrid results — memory field", async () => {
    const client = createMemoryClient(makeConfig())!;
    mockClient.search.memories.mockResolvedValue({
      results: [
        { id: "mem_1", memory: "Memory fact text", similarity: 0.9, metadata: {} },
      ],
    });

    const results = await recallSimilarFixes(client, "query", undefined, makeConfig());
    expect(results[0].text).toBe("Memory fact text");
  });

  it("parses hybrid results — chunk field", async () => {
    const client = createMemoryClient(makeConfig())!;
    mockClient.search.memories.mockResolvedValue({
      results: [
        { id: "chunk_1", chunk: "Document chunk text", similarity: 0.7, metadata: {} },
      ],
    });

    const results = await recallSimilarFixes(client, "query", undefined, makeConfig());
    expect(results[0].text).toBe("Document chunk text");
  });

  it("includes containerTag when provided", async () => {
    const client = createMemoryClient(makeConfig())!;
    mockClient.search.memories.mockResolvedValue({ results: [] });

    await recallSimilarFixes(client, "query", "project_foo", makeConfig());

    expect(mockClient.search.memories).toHaveBeenCalledWith(
      expect.objectContaining({ containerTag: "project_foo" }),
    );
  });

  it("omits containerTag when undefined", async () => {
    const client = createMemoryClient(makeConfig())!;
    mockClient.search.memories.mockResolvedValue({ results: [] });

    await recallSimilarFixes(client, "query", undefined, makeConfig());

    const callArgs = mockClient.search.memories.mock.calls[0][0];
    expect(callArgs).not.toHaveProperty("containerTag");
  });
});

describe("checkMemoryHealth", () => {
  it("returns true on successful list call", async () => {
    const client = createMemoryClient(makeConfig())!;
    mockClient.documents.list.mockResolvedValue({ memories: [], pagination: {} });

    const healthy = await checkMemoryHealth(client);
    expect(healthy).toBe(true);
    expect(mockClient.documents.list).toHaveBeenCalledWith({ limit: 1 });
  });

  it("returns false on error (never throws)", async () => {
    const client = createMemoryClient(makeConfig())!;
    mockClient.documents.list.mockRejectedValue(new Error("Auth failed"));

    const healthy = await checkMemoryHealth(client);
    expect(healthy).toBe(false);
  });
});
