import { describe, it, expect } from "vitest";
import {
  extractPlannedFiles,
  calculateFidelityScore,
  formatFidelityReport,
} from "../src/fidelity-checker.js";
import type { FidelityReport } from "../src/types.js";

describe("extractPlannedFiles", () => {
  it("extracts 'Create src/foo.ts' patterns", () => {
    const plan = "## Task 1\nCreate src/models/user.ts\nCreate src/routes/api.ts";
    const files = extractPlannedFiles(plan);
    expect(files).toContain("src/models/user.ts");
    expect(files).toContain("src/routes/api.ts");
  });

  it("extracts backtick-quoted paths", () => {
    const plan = "Modify `src/config/database.ts` and add `src/utils/helper.ts`";
    const files = extractPlannedFiles(plan);
    expect(files).toContain("src/config/database.ts");
    expect(files).toContain("src/utils/helper.ts");
  });

  it("extracts paths from table cells", () => {
    const plan = "| File | Purpose |\n| `src/api/routes.ts` | API routes |\n| `src/db/schema.ts` | Schema |";
    const files = extractPlannedFiles(plan);
    expect(files).toContain("src/api/routes.ts");
    expect(files).toContain("src/db/schema.ts");
  });

  it("deduplicates files", () => {
    const plan = "Create src/index.ts\nModify `src/index.ts`\n| `src/index.ts` |";
    const files = extractPlannedFiles(plan);
    const indexCount = files.filter((f) => f === "src/index.ts").length;
    expect(indexCount).toBe(1);
  });

  it("returns sorted array", () => {
    const plan = "Create src/z.ts\nCreate src/a.ts\nCreate src/m.ts";
    const files = extractPlannedFiles(plan);
    const sorted = [...files].sort();
    expect(files).toEqual(sorted);
  });

  it("returns empty array for plan with no file paths", () => {
    const plan = "## Overview\nThis plan describes the approach.\n## Steps\n1. Research\n2. Implement";
    const files = extractPlannedFiles(plan);
    expect(files).toHaveLength(0);
  });

  it("handles various action verbs", () => {
    const plan = [
      "Add lib/auth.ts",
      "Write tests/unit.ts",
      "Modify src/app.ts",
      "Update src/config.ts",
      "Implement src/service.ts",
    ].join("\n");
    const files = extractPlannedFiles(plan);
    expect(files).toContain("lib/auth.ts");
    expect(files).toContain("tests/unit.ts");
    expect(files).toContain("src/app.ts");
    expect(files).toContain("src/config.ts");
    expect(files).toContain("src/service.ts");
  });
});

describe("calculateFidelityScore", () => {
  it("returns 100% for perfect match", () => {
    const planned = ["src/a.ts", "src/b.ts"];
    const actual = ["src/a.ts", "src/b.ts"];
    const result = calculateFidelityScore(planned, actual);
    expect(result.score).toBe(100);
    expect(result.matched).toEqual(["src/a.ts", "src/b.ts"]);
    expect(result.missing).toHaveLength(0);
    expect(result.unplanned).toHaveLength(0);
  });

  it("reports missing files", () => {
    const planned = ["src/a.ts", "src/b.ts", "src/c.ts"];
    const actual = ["src/a.ts"];
    const result = calculateFidelityScore(planned, actual);
    expect(result.missing).toEqual(["src/b.ts", "src/c.ts"]);
    expect(result.matched).toEqual(["src/a.ts"]);
  });

  it("reports unplanned files", () => {
    const planned = ["src/a.ts"];
    const actual = ["src/a.ts", "src/extra.ts", "config.json"];
    const result = calculateFidelityScore(planned, actual);
    expect(result.unplanned).toEqual(["src/extra.ts", "config.json"]);
  });

  it("calculates score as matched / max(planned, actual) * 100", () => {
    const planned = ["src/a.ts", "src/b.ts"];
    const actual = ["src/a.ts", "src/c.ts", "src/d.ts"];
    const result = calculateFidelityScore(planned, actual);
    // matched: 1 (src/a.ts), max(2, 3) = 3 → 1/3 * 100 = 33
    expect(result.score).toBe(33);
  });

  it("returns 100% for both empty", () => {
    const result = calculateFidelityScore([], []);
    expect(result.score).toBe(100);
  });
});

describe("formatFidelityReport", () => {
  it("formats a complete report", () => {
    const report: FidelityReport = {
      phase: 1,
      plannedFiles: ["src/a.ts", "src/b.ts", "src/c.ts"],
      actualFiles: ["src/a.ts", "src/b.ts", "src/extra.ts"],
      matchedFiles: ["src/a.ts", "src/b.ts"],
      missingFiles: ["src/c.ts"],
      unplannedFiles: ["src/extra.ts"],
      fidelityScore: 67,
      details: [],
    };
    const output = formatFidelityReport(report);
    expect(output).toContain("2/3 planned");
    expect(output).toContain("1 missing");
    expect(output).toContain("1 extra");
    expect(output).toContain("67%");
  });

  it("shows missing file names (up to 3)", () => {
    const report: FidelityReport = {
      phase: 1,
      plannedFiles: ["a.ts", "b.ts", "c.ts", "d.ts"],
      actualFiles: [],
      matchedFiles: [],
      missingFiles: ["a.ts", "b.ts", "c.ts", "d.ts"],
      unplannedFiles: [],
      fidelityScore: 0,
      details: [],
    };
    const output = formatFidelityReport(report);
    expect(output).toContain("a.ts");
    expect(output).toContain("...");
  });
});
