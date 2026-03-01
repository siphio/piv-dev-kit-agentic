---
description: Validate context monorepo completeness for agent handover
---

# Review Context: Completeness Audit for Agent Handover

## Overview

Scan the entire context monorepo against a handover checklist. Report every gap with the specific command to fix it. This is a terminal-only command — no file artifact is produced. The output is a structured audit report showing module status, slice completeness, technology profile coverage, and a verdict on handover readiness.

## Reasoning Approach

**CoT Style:** Zero-shot

Before producing the audit report, think step by step:
1. Verify monorepo structure exists
2. Check vision document
3. Enumerate all modules and their specification completeness
4. Enumerate all slices and their context completeness
5. Cross-reference technologies against available profiles
6. Check architecture and domain knowledge documents
7. Tally gaps and determine verdict

## Hooks

Hooks are always enabled. `## PIV-Automator-Hooks` is appended to terminal output (this command does not produce a file artifact).

## Process

### Step 1: Verify Monorepo Structure

Check that the `context/` directory exists at the project root.

If `context/` does not exist:
- Output: "No context monorepo found. Run `/scaffold` first."
- Output the `## PIV-Automator-Hooks` block with `review_status: no_monorepo` and `gaps_count: 1`
- Stop processing. Do not continue to subsequent steps.

### Step 2: Read Vision Document

Read `context/vision.md`. Verify:
- The file exists
- The file has substantive content (more than just a title or empty headers)

If missing or empty, add to gaps list:
- `"Module: vision.md missing or empty -> Run /discuss-vision"`

### Step 3: Scan Modules

List all directories inside `context/modules/`. Each directory represents a module. Store the full list of module names for iteration.

If `context/modules/` does not exist or is empty, add to gaps list:
- `"No modules defined in context/modules/ -> Run /discuss-module for each planned module"`

### Step 4: Audit Each Module

FOR EACH module directory found in `context/modules/`:

**4a. Check specification exists:**
- Read `context/modules/{module}/specification.md`
- If file does not exist -> add gap: `Module "{module}" missing specification`
- If file exists but is a stub (contains only headers with no substantive content beneath them) -> add gap: `Module "{module}" specification is a stub`

**4b. Check template sections populated:**
Verify the specification contains all required sections with content:
- Purpose
- Slice Breakdown
- Data Contracts
- Technology Requirements
- Infrastructure
- Testing Seeds
- Status

For each missing or empty section, add a gap noting which section is incomplete.

**4c. Extract slice names:**
From the Slice Breakdown section, extract the list of defined slices for this module. Store for use in Step 5.

**4d. Extract technologies:**
From the Technology Requirements section, extract all referenced technology names. Store for use in Step 6.

### Step 5: Audit Each Slice

FOR EACH slice extracted from module specifications in Step 4c:

**5a. Check context file exists:**
- Read `context/modules/{module}/slices/{slice}/context.md`
- If file does not exist -> add gap: `Slice "{module}/{slice}" missing context`

**5b. Check template sections populated:**
Verify the context file contains all required sections with content:
- Overview
- Technology Decisions
- Schema Design
- API Design
- Infrastructure Requirements
- Error Handling
- Validation Gates
- Test Data Requirements
- Status

For each missing or empty section, add a gap noting which section is incomplete.

**5c. Check validation gates are measurable:**
Read the Validation Gates section. For each gate listed, check whether it contains a numeric threshold or specific measurable criterion. Flag any gate that uses vague language without measurable criteria.

Examples of measurable gates:
- "Response time under 200ms for 95th percentile"
- "Error rate below 0.1% over 1000 requests"
- "All 12 unit tests pass"

Examples of unmeasurable gates (FLAG these):
- "Works correctly"
- "Performs well"
- "Handles errors properly"
- "Is reliable"

Add each unmeasurable gate as a gap: `Slice "{module}/{slice}" gate "{gate text}" not measurable`

**5d. Check infrastructure requirements:**
Verify the Infrastructure Requirements section has substantive content. If empty or missing, add a gap.

**5e. Check test data requirements:**
Verify the Test Data Requirements section has substantive content. If empty or missing, add a gap.

### Step 6: Audit Technology Profiles

Collect ALL technology names referenced across all module specifications (from Step 4d).

FOR EACH technology referenced:
- Check if a profile exists in `.agents/reference/` (pattern: `{tech}-profile.md` or similar)
- Also check `context/profiles/` for profile files
- If no profile found for a technology -> add gap: `Technology "{tech}" not profiled`

### Step 7: Check Architecture Graph

Check if `context/architecture.md` exists and contains a dependency graph (look for graph-related content such as dependency listings, mermaid diagrams, or module relationship descriptions).

- If file missing -> add gap: `Architecture graph missing`
- If file exists but has no dependency graph content -> add gap: `Architecture graph has no dependency information`

### Step 8: Check Domain Knowledge

Check if `context/domain-knowledge.md` exists. This file is optional, so:
- If present -> note as available in the summary
- If missing -> note as "not present (optional)" in the summary, do NOT add as a gap

### Step 9: Generate Terminal Report

Compile all findings into the terminal report format below.

## Terminal Output Format

```
## Context Review: {project-name}

### Summary
- Modules: {N} defined, {N} fully specified
- Slices: {N} defined, {N} with complete context
- Technology profiles: {N} referenced, {N} available, {N} missing
- Validation gates: {N} total, {N} measurable, {N} need revision
- Architecture graph: [present/missing]
- Domain knowledge: [present/not present (optional)]

### Module Status
| Module | Spec | Slices | Contexts | Gates | Status |
|--------|------|--------|----------|-------|--------|
| {name} | [checkmark]/[cross] | {N} | {N}/{total} | {N} measurable | [Ready emoji] Ready / [Warning emoji] Gaps |

### Gaps Found
1. [cross] Module `{name}` missing specification -> Run `/discuss-module "{name}"`
2. [cross] Slice `{module}/{slice}` missing context -> Run `/discuss-slice "{module}/{slice}"`
3. [warning] Slice `{module}/{slice}` gate "works correctly" not measurable -> Revise validation gate
4. [cross] Technology `{tech}` not profiled -> Run `/research-stack {tech}`
5. [cross] Architecture graph missing -> Run `/map-dependencies`

### Verdict
**[Ready for agent handover]** or **[{N} gaps remaining -- fix before handover]**
```

Use status indicators consistently:
- `[cross]` for missing or broken items (blockers)
- `[warning]` for items that need revision but are not completely absent
- `[checkmark]` for items that pass

If zero gaps are found, the Gaps Found section reads: "No gaps found. All modules, slices, and profiles are complete."

## Reasoning Section

Output 4-8 bullets summarizing what was found during the audit. Place this BEFORE the Context Review section in terminal output. Example:

```
### Reasoning
- Scanned context/ monorepo, found {N} modules with {N} total slices
- {N} module specifications fully populated, {N} stubs or missing
- {N} slice contexts complete, {N} missing or incomplete
- {N} technologies referenced, {N} profiles available in .agents/reference/
- {N} validation gates checked, {N} unmeasurable gates flagged
- Architecture graph: [present with dependency info / missing]
- Domain knowledge: [present / not present]
```

## Reflection Section

After generating the full report, output a brief self-critique to terminal:
- Did I check every module directory and every slice listed in specifications?
- Did I correctly identify all technologies referenced across specs?
- Are the suggested fix commands accurate for each gap type?
- Is the verdict consistent with the gap count?

Format:

```
### Reflection
- [checkmark]/[warning] [Finding about completeness of the scan]
- [checkmark]/[warning] [Finding about technology profile coverage]
- [checkmark]/[warning] [Finding about validation gate measurability audit]
- [checkmark]/[warning] [Finding about verdict accuracy]
```

## PIV-Automator-Hooks

Append to terminal output after the Reflection section:

```
## PIV-Automator-Hooks
review_status: ready | gaps_remaining
modules_checked: {N}
slices_checked: {N}
gaps_count: {N}
unmeasurable_gates: {N}
profiles_missing: {N}
next_suggested_command: {discuss-module|discuss-slice|research-stack|map-dependencies|go}
next_arg: "{relevant argument for the suggested command}"
confidence: high
```

Rules for hook values:
- `review_status`: Set to `ready` if zero gaps found, `gaps_remaining` otherwise
- `next_suggested_command`: Choose the command that addresses the most critical gap. Priority order: missing module specs -> missing slice contexts -> unmeasurable gates -> missing profiles -> missing architecture graph. If no gaps, set to `go`.
- `next_arg`: The argument for the suggested command (e.g., the module name, slice path, or technology name). Empty string if `go`.
- `confidence`: Always `high` — this is a deterministic audit.
