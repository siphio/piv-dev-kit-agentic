import { describe, it, expect } from "vitest";
import {
  classifyError,
  getTaxonomy,
  canRetry,
  needsEscalation,
} from "../src/error-classifier.js";
import type { FailureEntry } from "../src/types.js";

describe("classifyError", () => {
  it("classifies compilation errors as syntax_error", () => {
    expect(classifyError("TypeScript compilation failed in src/index.ts", "execute")).toBe("syntax_error");
    expect(classifyError("SyntaxError: unexpected token", "execute")).toBe("syntax_error");
    expect(classifyError("type error: string is not assignable to number", "execute")).toBe("syntax_error");
  });

  it("classifies test failures as test_failure", () => {
    expect(classifyError("test failed: expected true, received false", "validate-implementation")).toBe("test_failure");
    expect(classifyError("AssertionError: values not equal", "validate-implementation")).toBe("test_failure");
  });

  it("classifies auth errors as integration_auth", () => {
    expect(classifyError("401 Unauthorized", "execute")).toBe("integration_auth");
    expect(classifyError("Missing credential for API", "execute")).toBe("integration_auth");
    expect(classifyError("Authentication failed", "execute")).toBe("integration_auth");
  });

  it("classifies rate limit errors as integration_rate_limit", () => {
    expect(classifyError("429 Too Many Requests", "execute")).toBe("integration_rate_limit");
    expect(classifyError("Rate limit exceeded", "validate-implementation")).toBe("integration_rate_limit");
  });

  it("classifies scenario mismatches", () => {
    expect(classifyError("Scenario SC-001 mismatch: expected behavior differs", "validate-implementation")).toBe("scenario_mismatch");
  });

  it("classifies stale artifacts", () => {
    expect(classifyError("Profile is stale and outdated", "prime")).toBe("stale_artifact");
  });

  it("falls back to partial_execution for unknown errors", () => {
    expect(classifyError("Something completely unexpected happened", "execute")).toBe("partial_execution");
  });
});

describe("getTaxonomy", () => {
  it("returns correct taxonomy for each category", () => {
    expect(getTaxonomy("syntax_error").maxRetries).toBe(2);
    expect(getTaxonomy("syntax_error").needsHuman).toBe(false);

    expect(getTaxonomy("integration_auth").maxRetries).toBe(0);
    expect(getTaxonomy("integration_auth").needsHuman).toBe(true);

    expect(getTaxonomy("integration_rate_limit").maxRetries).toBe(3);

    expect(getTaxonomy("partial_execution").maxRetries).toBe(1);
  });
});

describe("canRetry", () => {
  it("returns true when retry_count < maxRetries", () => {
    const failure: FailureEntry = {
      command: "execute",
      phase: 1,
      error_category: "syntax_error",
      timestamp: "2026-02-18",
      retry_count: 0,
      max_retries: 2,
      resolution: "pending",
      details: "test",
    };
    expect(canRetry(failure)).toBe(true);
  });

  it("returns false when retry_count >= maxRetries", () => {
    const failure: FailureEntry = {
      command: "execute",
      phase: 1,
      error_category: "syntax_error",
      timestamp: "2026-02-18",
      retry_count: 2,
      max_retries: 2,
      resolution: "pending",
      details: "test",
    };
    expect(canRetry(failure)).toBe(false);
  });

  it("returns false for zero-retry categories", () => {
    const failure: FailureEntry = {
      command: "execute",
      phase: 1,
      error_category: "integration_auth",
      timestamp: "2026-02-18",
      retry_count: 0,
      max_retries: 0,
      resolution: "pending",
      details: "test",
    };
    expect(canRetry(failure)).toBe(false);
  });
});

describe("needsEscalation", () => {
  it("returns true when needsHuman is true", () => {
    const failure: FailureEntry = {
      command: "execute",
      phase: 1,
      error_category: "integration_auth",
      timestamp: "2026-02-18",
      retry_count: 0,
      max_retries: 0,
      resolution: "pending",
      details: "test",
    };
    expect(needsEscalation(failure)).toBe(true);
  });

  it("returns true when retries exhausted", () => {
    const failure: FailureEntry = {
      command: "execute",
      phase: 1,
      error_category: "syntax_error",
      timestamp: "2026-02-18",
      retry_count: 2,
      max_retries: 2,
      resolution: "pending",
      details: "test",
    };
    expect(needsEscalation(failure)).toBe(true);
  });

  it("returns false when retries remaining and no human needed", () => {
    const failure: FailureEntry = {
      command: "execute",
      phase: 1,
      error_category: "syntax_error",
      timestamp: "2026-02-18",
      retry_count: 0,
      max_retries: 2,
      resolution: "pending",
      details: "test",
    };
    expect(needsEscalation(failure)).toBe(false);
  });
});
