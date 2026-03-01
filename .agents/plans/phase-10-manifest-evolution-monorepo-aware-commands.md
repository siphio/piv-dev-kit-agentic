# Feature: Manifest Evolution & Monorepo-Aware Commands

The following plan should be complete, but validate documentation and codebase patterns before implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

Evolve the manifest schema from flat phase-based tracking to module/slice hierarchy. Evolve all core PIV commands (`/prime`, `/plan-feature`, `/execute`, `/validate-implementation`, `/preflight`) to detect whether they're operating in a monorepo project or classic PRD project and behave accordingly. Full backwards compatibility with Gen 1/2 projects preserved — classic mode code paths unchanged.

## User Story

As a developer with existing Gen 1 PIV projects
I want all my current projects to keep working without changes
So that I can adopt Gen 2 progressively without migrating everything at once

## Problem Statement

Phase 9 created a context monorepo structure with `/scaffold`, `/discuss-module`, `/discuss-slice`, `/review-context`, and `/map-dependencies`. But the existing PIV commands (`/prime`, `/plan-feature`, `/execute`, `/validate-implementation`, `/preflight`) only understand flat phase-based manifests and PRD-driven context. They cannot read from the monorepo's `context/modules/`, `context/architecture.md`, or slice-level `context.md` files. The orchestrator's TypeScript modules (`types.ts`, `manifest-manager.ts`, `state-machine.ts`, `piv-runner.ts`) are hardcoded to flat `phase: number` iteration.

## Solution Statement

Add dual-mode detection across all commands and orchestrator modules. When `project.structure: context-monorepo` exists in the manifest (set by `/scaffold`), commands read from the monorepo context hierarchy. Otherwise, they use the existing classic PRD flow unchanged. The orchestrator gains module/slice types, a `getNextUnfinishedSlice()` function, and module-aware pairing functions. All existing tests must continue to pass (classic mode unbroken).

## Feature Metadata

**Feature Type**: Enhancement
**Estimated Complexity**: High
**Primary Systems Affected**: PIV commands (5 markdown files), orchestrator (6 TypeScript modules), orchestrator tests (6 test files)
**Dependencies**: Phase 9 complete (monorepo structure exists to read from)
**Agent Behavior**: No — no new agent decision trees. Existing PIV pipeline extended.

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ BEFORE IMPLEMENTING

- `.claude/orchestrator/src/types.ts` (lines 70-235) — Manifest type definitions, PhaseStatus, all entry types
- `.claude/orchestrator/src/manifest-manager.ts` (lines 1-154) — YAML read/write, mergeManifest, updatePhaseStatus
- `.claude/orchestrator/src/state-machine.ts` (lines 52-73) — getNextUnfinishedPhase flat iteration
- `.claude/orchestrator/src/state-machine.ts` (lines 109-241) — determineNextAction priority logic
- `.claude/orchestrator/src/piv-runner.ts` (lines 37-77) — Command pairing functions (planPairing, executePairing)
- `.claude/orchestrator/src/piv-runner.ts` (lines 491-596) — runAllPhases flat phase loop
- `.claude/orchestrator/src/context-scorer.ts` (lines 25-43) — Phase regex scoring
- `.claude/orchestrator/src/fidelity-checker.ts` (lines 99-169) — Checkpoint naming, fidelity report
- `.claude/commands/prime.md` (lines 41-116) — Manifest loading, evolution context, coverage gaps
- `.claude/commands/plan-feature.md` (lines 65-229) — Phase 0 scope analysis, PRD loading
- `.claude/commands/execute.md` (lines 30-105) — Checkpoint, plan parsing, progress tracking
- `.claude/commands/validate-implementation.md` (lines 106-177) — Context loading, validation matrix
- `.claude/commands/preflight.md` (lines 26-53) — Credential extraction from PRD + profiles
- `.claude/commands/scaffold.md` — Monorepo structure definition, manifest initialization
- `.claude/commands/discuss-slice.md` — context.md template (validation gates, infrastructure, tech decisions)
- `.claude/commands/review-context.md` — Handover readiness criteria, gap detection

### New Files to Create

- `.claude/orchestrator/src/monorepo-resolver.ts` — Module/slice resolution, work unit iteration, schema detection
- `.claude/orchestrator/tests/monorepo-resolver.test.ts` — Tests for dual-mode resolution

### Patterns to Follow

**Manifest merge semantics:** Always use `mergeManifest()` — never overwrite. Arrays concatenate, objects deep-merge. MIRROR: `manifest-manager.ts:61-89`

**Atomic manifest writes:** Write to `.tmp` then rename. MIRROR: `manifest-manager.ts:46-53`

**Detection pattern from PRD Section 4.2:**
```
IF project.structure === "context-monorepo" → monorepo mode
ELSE IF phases key exists → classic mode
ELSE → error
```

**Command flag parsing:** Strip flags before processing argument text. MIRROR: `prime.md` lines 38-39

**Hooks format:** Simple key-value, regex-parseable `^([a-z_]+): (.+)$`, 5-15 lines max

---

## FOUNDATION

**Generation:** 3 | **Active PRD:** PRD-gen2.md

### What Previous Generations Implemented

| Phase | Name | Delivered |
|-------|------|-----------|
| 1 | Core Orchestration Engine | Agent SDK sessions, manifest state machine, hooks parsing, error taxonomy |
| 2 | Telegram Interface | Grammy bot, PRD relay, /go /pause /resume /status commands |
| 3 | VS Code & Resilience | Context scoring, fidelity checking, drift detection, session recovery |
| 4 | Multi-Instance Polish | Instance registry, multi-instance Telegram, signal handling |
| 5 | Bootstrap & Registry | `piv init`, central registry at `~/.piv/registry.yaml`, version tracking |
| 6 | Monitor & Stall Detection | 15-min polling, heartbeat classification, recovery actions |
| 7 | Diagnosis & Hot Fix | Agent SDK diagnosis, single-file fixes, propagator, improvement log |
| 8 | SuperMemory Integration | Long-term pattern memory, hybrid search, graceful degradation |
| 9 | Context Plugin & Monorepo | `/scaffold`, `/discuss-module`, `/discuss-slice`, `/review-context`, `/map-dependencies` |

### Key Existing Files (Do Not Recreate)

- `.claude/orchestrator/src/types.ts` — All shared types. Extend, don't duplicate.
- `.claude/orchestrator/src/manifest-manager.ts` — Manifest CRUD. Add functions, don't restructure.
- `.claude/orchestrator/src/state-machine.ts` — Phase decision logic. Extend with module awareness.
- `.claude/orchestrator/src/piv-runner.ts` — Orchestration loop. Add dual-mode branching.

### Architecture Established

- Manifest YAML as single source of truth — merge-only semantics
- Command pairing: `/prime` + `/plan-feature` share context window, then `/clear`
- Error taxonomy with 11 categories, retry budgets, checkpoint rollback
- Hooks blocks parsed by orchestrator for machine-readable metadata
- Profile freshness with 7-day window, coverage gap detection

### Gen 3 Phase 10 Adds

- Manifest `modules.{name}.slices.{name}.{plan|execution|validation}` hierarchy
- Dual-mode detection in all 5 core commands (monorepo vs classic)
- `monorepo-resolver.ts` for work unit iteration and schema detection
- Orchestrator support for sequential slice-based execution

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation — Types & Monorepo Resolver

Add monorepo types and a new resolver module that abstracts schema detection and work unit iteration.

**Tasks:**
- Extend `types.ts` with monorepo manifest types
- Create `monorepo-resolver.ts` for dual-mode schema detection and work unit mapping
- Update `manifest-manager.ts` with slice-aware operations

### Phase 2: Command Evolution

Update all 5 core PIV commands with monorepo detection gates. Classic code paths untouched.

**Tasks:**
- Evolve `/prime` with monorepo context loading
- Evolve `/plan-feature` with slice context reading
- Evolve `/execute` with monorepo source structure
- Evolve `/validate-implementation` with validation gates from slice context
- Evolve `/preflight` with infrastructure from slice contexts

### Phase 3: Orchestrator Evolution

Update orchestrator TypeScript modules for dual-mode operation.

**Tasks:**
- Evolve `state-machine.ts` with module-aware work unit iteration
- Evolve `piv-runner.ts` with module-aware pairing and execution loop
- Evolve `context-scorer.ts` and `fidelity-checker.ts` with module/slice awareness

### Phase 4: Testing & Validation

Verify backward compatibility and monorepo mode functionality.

---

## VALIDATION STRATEGY

### Workflows to Test

| Workflow | Happy Path | Error Paths | State Changes |
|----------|------------|-------------|---------------|
| Classic PRD project | All commands work unchanged | N/A | No manifest changes |
| Monorepo `/prime` | Loads architecture.md, module specs, slice contexts | Missing architecture.md → classic fallback | Manifest reads monorepo context |
| Monorepo `/plan-feature` | Reads slice context.md, generates plan | Missing slice context → error with guidance | Plan references slice paths |
| Monorepo `/execute` | Writes to `src/{module}/{slice}/` | Slice context missing → error | Progress tracked per slice |
| Monorepo `/validate` | Tests against slice validation gates | No measurable gates → warning | Validation per slice |

### PRD Scenario Validation

| Scenario | Test Plan | Pass Criteria |
|----------|-----------|---------------|
| SC-010: Classic PRD Backwards Compatibility | Run full test suite, verify all 14 existing test files pass | Zero test regressions, commands behave identically for classic projects |

### Acceptance Criteria

- [ ] All 14 existing orchestrator test files pass without modification (backward compatibility)
- [ ] Evolved `/prime` detects classic PRD mode automatically — output identical to current behavior
- [ ] Evolved `/prime` detects monorepo mode — loads architecture.md + module specs + slice contexts
- [ ] Evolved `/plan-feature` reads slice `context.md` for technology decisions and schema
- [ ] Evolved `/execute` writes to `src/` following monorepo structure
- [ ] Evolved `/validate-implementation` reads validation gates from slice context
- [ ] Evolved `/preflight` reads infrastructure requirements from slice contexts
- [ ] Manifest schema supports both `phases` (classic) and `modules` (monorepo) tracking
- [ ] `monorepo-resolver.ts` correctly identifies classic vs monorepo mode
- [ ] `getNextUnfinishedSlice()` iterates slices in dependency order within modules
- [ ] SC-010 passes validation

---

## STEP-BY-STEP TASKS

### Task 1: UPDATE `.claude/orchestrator/src/types.ts`

- **IMPLEMENT**: Add monorepo manifest types after existing types (line ~235):
  ```typescript
  // --- Monorepo Types ---
  export interface SliceStatus {
    plan: PlanStatus;
    execution: ExecutionStatus;
    validation: ValidationStatus;
  }
  export interface ModuleEntry {
    specification: string;       // path to specification.md
    status: "stub" | "complete";
    slices: Record<string, SliceStatus>;
  }
  export interface ProjectInfo {
    name: string;
    scaffolded_at: string;
    structure: "context-monorepo" | "classic";
  }
  export interface WorkUnit {
    module: string;
    slice: string;
    sliceStatus: SliceStatus;
    contextPath: string;         // path to slice context.md
    specPath: string;            // path to module specification.md
  }
  ```
- **IMPLEMENT**: Extend `Manifest` interface with optional monorepo fields:
  ```typescript
  export interface Manifest {
    project?: ProjectInfo;        // NEW — set by /scaffold
    modules?: Record<string, ModuleEntry>;  // NEW — monorepo mode
    // ... all existing fields preserved ...
  }
  ```
- **IMPLEMENT**: Add `isMonorepoManifest(manifest: Manifest): boolean` helper:
  ```typescript
  export function isMonorepoManifest(m: Manifest): boolean {
    return m.project?.structure === "context-monorepo" && !!m.modules;
  }
  ```
- **PATTERN**: Follow `resolveProfiles()` pattern at line 197 for format detection
- **GOTCHA**: Do NOT change existing type signatures — only add new optional fields and new types
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 2: CREATE `.claude/orchestrator/src/monorepo-resolver.ts`

- **IMPLEMENT**: Module that provides dual-mode resolution:
  ```typescript
  import type { Manifest, WorkUnit, SliceStatus, ModuleEntry } from "./types.js";
  import { isMonorepoManifest } from "./types.js";
  ```
- **IMPLEMENT**: `getWorkUnits(manifest: Manifest): WorkUnit[]`
  - If monorepo: iterate `manifest.modules`, for each module iterate `slices`, build WorkUnit array
  - Sort by: modules in dependency order (read from architecture.md YAML DAG if available), slices in ID order within each module
  - If classic: return empty array (caller uses existing flat phase logic)
- **IMPLEMENT**: `getNextUnfinishedWorkUnit(manifest: Manifest): WorkUnit | null`
  - Returns first WorkUnit where `plan !== "complete"` OR `execution !== "complete"` OR `validation !== "pass"`
  - Returns null if all complete or if not monorepo mode
- **IMPLEMENT**: `updateSliceStatus(manifest: Manifest, module: string, slice: string, updates: Partial<SliceStatus>): Manifest`
  - Merges status updates for a specific slice within a module
  - Creates module/slice entries if they don't exist (defensive)
- **IMPLEMENT**: `workUnitToLabel(wu: WorkUnit): string`
  - Returns human-readable label: `"Module {module} / Slice {slice}"`
  - Used in command pairing and progress output
- **PATTERN**: Follow `updatePhaseStatus()` merge pattern from `manifest-manager.ts:128-146`
- **GOTCHA**: Must handle missing modules/slices gracefully — return defaults, don't throw
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 3: CREATE `.claude/orchestrator/tests/monorepo-resolver.test.ts`

- **IMPLEMENT**: Test suite for monorepo-resolver.ts:
  - `isMonorepoManifest()` returns false for classic manifests (no `project` field)
  - `isMonorepoManifest()` returns true for manifests with `project.structure: "context-monorepo"` and `modules`
  - `getWorkUnits()` returns empty array for classic manifest
  - `getWorkUnits()` returns correct WorkUnit array for monorepo manifest with 2 modules, 3 slices
  - `getNextUnfinishedWorkUnit()` returns first incomplete slice
  - `getNextUnfinishedWorkUnit()` returns null when all slices complete
  - `updateSliceStatus()` merges status correctly
  - `updateSliceStatus()` creates missing entries defensively
  - `workUnitToLabel()` formats correctly
- **PATTERN**: Follow existing test patterns. MIRROR: `tests/state-machine.test.ts`
- **VALIDATE**: `cd .claude/orchestrator && npx vitest run tests/monorepo-resolver.test.ts`

### Task 4: UPDATE `.claude/orchestrator/src/manifest-manager.ts`

- **IMPLEMENT**: Add `updateSliceStatus` re-export from monorepo-resolver (convenience)
- **IMPLEMENT**: Ensure `mergeManifest()` handles `modules` field correctly — deep merge module objects, deep merge slice objects within modules. The existing object merge at line 78-82 should handle this but verify with test.
- **IMPLEMENT**: Ensure `writeManifest()` preserves `project` and `modules` fields (already should via spread, but verify)
- **GOTCHA**: Do NOT change signatures of existing functions — only add new ones
- **VALIDATE**: `cd .claude/orchestrator && npx vitest run tests/manifest-manager.test.ts`

### Task 5: UPDATE `.claude/orchestrator/tests/manifest-manager.test.ts`

- **IMPLEMENT**: Add test case: `mergeManifest()` correctly merges monorepo modules
  - Input: existing manifest with `modules.auth.slices["01"].plan = "not_started"`, update with `modules.auth.slices["01"].plan = "complete"`
  - Expected: merged result has `modules.auth.slices["01"].plan = "complete"`, other fields preserved
- **IMPLEMENT**: Add test case: `mergeManifest()` preserves `project` field across merges
- **IMPLEMENT**: Add test case: classic manifest without `modules` merges correctly (existing behavior preserved)
- **VALIDATE**: `cd .claude/orchestrator && npx vitest run tests/manifest-manager.test.ts`

### Task 6: UPDATE `.claude/orchestrator/src/state-machine.ts`

- **IMPLEMENT**: Import `isMonorepoManifest` from types, `getNextUnfinishedWorkUnit` from monorepo-resolver
- **IMPLEMENT**: Modify `determineNextAction()` to handle monorepo mode:
  - After existing priority checks (failures, checkpoints, profiles, preflight, PRD), add monorepo branch:
  ```typescript
  // After line 194 (No PRD check):
  if (isMonorepoManifest(manifest)) {
    const nextWU = getNextUnfinishedWorkUnit(manifest);
    if (!nextWU) return { command: "done", reason: "All slices complete", confidence: "high" };
    // Route to plan/execute/validate based on slice status (same logic as flat phases)
    if (nextWU.sliceStatus.plan !== "complete") {
      return { command: "plan-feature", argument: `--module ${nextWU.module} --slice ${nextWU.slice}`, ... };
    }
    // ... execution, validation, commit routing
  }
  // Existing flat phase logic continues below (untouched)
  ```
- **GOTCHA**: The monorepo branch must come AFTER failure/checkpoint/profile/preflight checks (those apply to both modes) but BEFORE the existing flat phase logic (lines 196-241). The existing flat phase code remains as the else branch.
- **PATTERN**: Match existing NextAction shape exactly — same fields, same confidence values
- **VALIDATE**: `cd .claude/orchestrator && npx vitest run tests/state-machine.test.ts`

### Task 7: UPDATE `.claude/orchestrator/tests/state-machine.test.ts`

- **IMPLEMENT**: Add test suite section "Monorepo mode" with tests:
  - `determineNextAction()` routes to plan-feature for unplanned slice
  - `determineNextAction()` routes to execute for planned but unexecuted slice
  - `determineNextAction()` routes to validate for executed but unvalidated slice
  - `determineNextAction()` routes to commit for validated slice
  - `determineNextAction()` returns "done" when all slices complete
  - `determineNextAction()` still handles failures/checkpoints in monorepo mode (priority)
- **IMPLEMENT**: Add test: classic manifest behavior unchanged (regression guard)
- **VALIDATE**: `cd .claude/orchestrator && npx vitest run tests/state-machine.test.ts`

### Task 8: UPDATE `.claude/orchestrator/src/context-scorer.ts`

- **IMPLEMENT**: Accept optional `moduleSlice?: { module: string; slice: string }` parameter in `scoreContext()`
- **IMPLEMENT**: When `moduleSlice` provided, look for module/slice mentions in prime output instead of "Phase N":
  ```typescript
  if (moduleSlice) {
    const moduleRegex = new RegExp(moduleSlice.module, "i");
    const sliceRegex = new RegExp(moduleSlice.slice, "i");
    // Score based on module + slice mentions
  }
  ```
- **GOTCHA**: Keep existing `expectedPhase?: number` parameter working — both paths coexist
- **VALIDATE**: `cd .claude/orchestrator && npx vitest run tests/context-scorer.test.ts`

### Task 9: UPDATE `.claude/orchestrator/src/fidelity-checker.ts`

- **IMPLEMENT**: Accept optional `moduleSlice?: { module: string; slice: string }` in `checkFidelity()`
- **IMPLEMENT**: When module provided, scope planned file extraction to `src/{module}/` paths
- **IMPLEMENT**: Update checkpoint tag lookup: if module provided, look for `piv-checkpoint/{module}-{slice}-{timestamp}` format alongside existing `piv-checkpoint/phase-{N}` format
- **GOTCHA**: Keep existing flat checkpoint naming working for classic mode
- **VALIDATE**: `cd .claude/orchestrator && npx vitest run tests/fidelity-checker.test.ts`

### Task 10: UPDATE `.claude/orchestrator/src/piv-runner.ts`

- **IMPLEMENT**: Import monorepo-resolver functions and `isMonorepoManifest`
- **IMPLEMENT**: Add `runSlice()` function parallel to existing `runPhase()`:
  ```typescript
  export async function runSlice(
    workUnit: WorkUnit, projectDir: string, notifier?, pauseCheck?
  ): Promise<void> {
    // Same pipeline as runPhase: plan → checkpoint → execute → fidelity → drift → validate → commit
    // But uses workUnit.module + workUnit.slice instead of flat phase number
    // Pairing functions emit --module and --slice flags
  }
  ```
- **IMPLEMENT**: Add module-aware command pairing functions:
  ```typescript
  function slicePlanPairing(wu: WorkUnit): string[] {
    return ["/prime", `/plan-feature --module ${wu.module} --slice ${wu.slice}`];
  }
  function sliceExecutePairing(planPath: string): string[] {
    return ["/prime", `/execute ${planPath}`];
  }
  ```
- **IMPLEMENT**: Modify `runAllPhases()` to detect monorepo mode:
  ```typescript
  if (isMonorepoManifest(manifest)) {
    const workUnits = getWorkUnits(manifest);
    for (const wu of workUnits) {
      if (isSliceComplete(wu.sliceStatus)) continue;
      await runSlice(wu, projectDir, notifier, pauseCheck);
    }
  } else {
    // Existing flat phase loop (lines 491-596 unchanged)
  }
  ```
- **IMPLEMENT**: Module-aware checkpoint naming: `piv-checkpoint/${module}-${slice}-${timestamp}`
- **GOTCHA**: `runSlice()` must update manifest via `updateSliceStatus()` not `updatePhaseStatus()`
- **GOTCHA**: Drift detection in monorepo mode: only run tests for same module's prior slices
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 11: UPDATE `.claude/commands/prime.md`

- **IMPLEMENT**: After Step 0b (Reconcile Manifest), add Step 0b-mono (Monorepo Context Loading):
  ```
  ### 0b-mono. Monorepo Context Loading
  > Run this step after Step 0b if manifest has `project.structure: context-monorepo`.
  1. Read `context/architecture.md` — extract module map and dependency DAG
  2. For each module in manifest `modules` section:
     - Read `context/modules/{name}/specification.md` — first 20 lines (summary)
     - Count slices, note statuses (stub/complete)
  3. Identify next unfinished slice (first with plan !== complete or execution !== complete)
  4. For the next slice, read `context/modules/{module}/slices/{slice}/context.md` — extract:
     - Technology decisions, validation gates, infrastructure requirements
  5. Store context for output report
  ```
- **IMPLEMENT**: Add "Monorepo Status" section to output report (after Evolution Status):
  ```
  ### Monorepo Status (If `project.structure: context-monorepo`)
  - **Structure:** context-monorepo
  - **Modules:** [N] total, [N] complete, [N] in progress
  - **Slices:** [N] total, [N] planned, [N] executed, [N] validated
  - **Next work unit:** Module [name] / Slice [id] — [status]
  - **Architecture:** [loaded / missing]
  ```
- **IMPLEMENT**: Update recommended next step logic to use monorepo routing when applicable:
  - If monorepo mode + next unfinished slice exists → recommend `/plan-feature --module X --slice Y`
- **GOTCHA**: Classic mode sections remain UNCHANGED — monorepo sections are additive only
- **VALIDATE**: Manual review — command is markdown, no automated test

### Task 12: UPDATE `.claude/commands/plan-feature.md`

- **IMPLEMENT**: Add `--module` and `--slice` flag parsing to argument handling:
  ```
  Strip `--module <value>` and `--slice <value>` from arguments.
  If both present → monorepo mode. If neither → classic mode.
  If only one present → error: "Both --module and --slice are required for monorepo planning."
  ```
- **IMPLEMENT**: Add monorepo branch to Phase 0 (Scope Analysis):
  ```
  ### Monorepo Mode Scope Analysis
  1. Read `context/modules/{module}/specification.md` — module purpose, slice breakdown, data contracts
  2. Read `context/modules/{module}/slices/{slice}/context.md` — PRIMARY context source:
     - Technology decisions with rationale
     - Schema design
     - API design
     - Infrastructure requirements
     - Validation gates (measurable targets)
     - Error handling patterns
     - Test data requirements
  3. Read `context/architecture.md` — dependency DAG, shared conventions
  4. Read `context/vision.md` — project purpose (first 20 lines)
  5. Cross-reference technology profiles in `.agents/reference/` for technologies listed in context.md
  ```
- **IMPLEMENT**: In plan template, replace PRD references with context.md references when in monorepo mode:
  - "PRD Phase" → "Module / Slice"
  - Scenarios → validation gates from context.md
  - Decision trees → technology decisions from context.md
- **GOTCHA**: Classic mode Phase 0 remains UNCHANGED. Monorepo branch is a separate code path gated by flag detection.
- **VALIDATE**: Manual review

### Task 13: UPDATE `.claude/commands/execute.md`

- **IMPLEMENT**: Add monorepo-aware source structure guidance:
  ```
  ### Monorepo Source Structure
  If plan was generated from monorepo context (plan metadata contains module/slice):
  - Write source code to `src/{module-name}/{slice-id}/`
  - Follow slice context.md schema design for data models
  - Follow slice context.md API design for endpoints
  - Progress file: `.agents/progress/{module}-{slice}-progress.md`
  ```
- **IMPLEMENT**: Add monorepo checkpoint naming:
  ```
  Checkpoint tag: `piv-checkpoint/{module}-{slice}-{ISO-timestamp}`
  ```
- **IMPLEMENT**: Update manifest write to use `updateSliceStatus()` when module/slice metadata found in plan
- **GOTCHA**: Classic mode checkpoint naming (`piv-checkpoint/phase-N-{timestamp}`) unchanged
- **VALIDATE**: Manual review

### Task 14: UPDATE `.claude/commands/validate-implementation.md`

- **IMPLEMENT**: Add monorepo context loading to Phase 0:
  ```
  ### Monorepo Validation Context
  If plan metadata contains module/slice:
  1. Read `context/modules/{module}/slices/{slice}/context.md`
  2. Extract Validation Gates section — these are PRIMARY pass criteria:
     - Each gate has: metric, target value, measurement method
     - Example: "Species matching accuracy >= 90%"
  3. Extract Infrastructure Requirements — verify provisioned
  4. Extract Error Handling table — verify implemented
  5. Build validation matrix from: plan VALIDATION COMMANDS + context.md validation gates
  ```
- **IMPLEMENT**: Map validation gates to test execution:
  ```
  For each validation gate in context.md:
  - Determine measurement method (test command, API call, metric query)
  - Execute measurement
  - Compare result against target
  - Report: PASS (met or exceeded) / FAIL (below target)
  ```
- **IMPLEMENT**: Update hooks to include module/slice context:
  ```
  module: {module-name}
  slice: {slice-id}
  validation_gates_total: N
  validation_gates_passed: N
  ```
- **GOTCHA**: Classic scenario-based validation remains unchanged. Gates are additive.
- **VALIDATE**: Manual review

### Task 15: UPDATE `.claude/commands/preflight.md`

- **IMPLEMENT**: Add monorepo infrastructure scanning:
  ```
  ### Monorepo Infrastructure Requirements
  If `project.structure: context-monorepo`:
  1. Scan ALL `context/modules/*/slices/*/context.md` files
  2. Extract Infrastructure Requirements tables from each
  3. Deduplicate services (e.g., PostGIS required by 3 slices = 1 instance)
  4. Extract technology profiles needed
  5. Compile unified credential/infrastructure checklist
  ```
- **GOTCHA**: Auth exclusion rule still applies — never require ANTHROPIC_API_KEY
- **VALIDATE**: Manual review

### Task 16: Full Test Suite Verification

- **IMPLEMENT**: Run complete orchestrator test suite to verify backward compatibility:
  ```bash
  cd .claude/orchestrator && npx vitest run
  ```
- **IMPLEMENT**: Run TypeScript type checking:
  ```bash
  cd .claude/orchestrator && npx tsc --noEmit
  ```
- **GOTCHA**: All 14 existing test files MUST pass without modification. If any fail, the change broke backward compatibility — fix before proceeding.
- **VALIDATE**: `cd .claude/orchestrator && npx vitest run && npx tsc --noEmit`

---

## TESTING STRATEGY

### Unit Tests

- `monorepo-resolver.test.ts`: 9 test cases covering dual-mode detection, work unit iteration, status updates
- `manifest-manager.test.ts`: 3 new test cases for modules merge behavior
- `state-machine.test.ts`: 7 new test cases for monorepo routing + classic regression guard
- `context-scorer.test.ts`: 2 new test cases for module/slice scoring (add to existing file)
- `fidelity-checker.test.ts`: 2 new test cases for module-scoped fidelity (add to existing file)

### Integration Tests

- Run full `vitest run` — all 14 existing test files must pass (zero regressions)
- `tsc --noEmit` — type checking across all modules

### Edge Cases

- Classic manifest without `project` or `modules` fields → all functions fall back to existing behavior
- Monorepo manifest with empty `modules` → `getNextUnfinishedWorkUnit()` returns null
- Monorepo manifest with all slices complete → `determineNextAction()` returns "done"
- Module with no slices defined → skip module, log warning
- Slice context.md missing → error with guidance to run `/discuss-slice`

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
cd .claude/orchestrator && npx tsc --noEmit
```

**Expected**: Exit code 0, no type errors

### Level 2: Unit Tests

```bash
cd .claude/orchestrator && npx vitest run
```

**Expected**: All tests pass (existing 14 files + 1 new file), zero regressions

### Level 3: Integration Tests

```bash
cd .claude/orchestrator && npx vitest run tests/monorepo-resolver.test.ts
cd .claude/orchestrator && npx vitest run tests/manifest-manager.test.ts
cd .claude/orchestrator && npx vitest run tests/state-machine.test.ts
```

**Expected**: All monorepo-specific tests pass alongside existing tests

### Level 4: Backward Compatibility Validation

```bash
cd .claude/orchestrator && npx vitest run tests/manifest-manager.test.ts tests/state-machine.test.ts tests/context-scorer.test.ts tests/fidelity-checker.test.ts tests/hooks-parser.test.ts tests/progress-tracker.test.ts tests/signal-handler.test.ts tests/heartbeat.test.ts tests/instance-registry.test.ts tests/process-manager.test.ts tests/error-classifier.test.ts tests/telegram-notifier.test.ts tests/telegram-formatter.test.ts tests/budget-calculator.test.ts tests/drift-detector.test.ts
```

**Expected**: Every existing test passes unchanged — SC-010 backward compatibility confirmed

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Full test suite passes (existing + new)
- [ ] No type checking errors (`tsc --noEmit`)
- [ ] Build succeeds (`npm run build`)
- [ ] All acceptance criteria met
- [ ] Classic manifest projects work identically (SC-010)
- [ ] Monorepo manifest detection works correctly

---

## NOTES

### Decisions from Phase 0 Scope Analysis

1. **No mixed mode.** A project is either classic or monorepo. Detection via `project.structure` field in manifest.

2. **Extend, don't replace** the state machine. Monorepo branch added before existing flat phase logic. Classic code paths untouched.

3. **Schema version not needed.** Detection via `project.structure` field (set by `/scaffold`) is sufficient. No explicit `schema_version` field required — the presence of `modules` key combined with `project.structure` is unambiguous.

4. **Sequential slice execution only.** No parallel agent spawning (deferred to Phase 11). The orchestrator iterates slices one by one within each module, modules ordered by dependency.

5. **Command flags for monorepo routing.** `/plan-feature --module X --slice Y` is the entry point. The orchestrator generates these flags when calling commands in monorepo mode. Classic commands without flags work unchanged.

6. **PRD gap assumption.** The PRD discussion point "Should manifest support mixed mode?" was resolved as NO — simpler, no complexity overhead. If incorrect, this affects Tasks 6, 10, 11, 12.

7. **Drift detection scoping.** In monorepo mode, regression tests only run for the same module's prior slices, not cross-module. Cross-module testing deferred to Phase 11 Integration Agent.

## PIV-Automator-Hooks
plan_status: ready_for_execution
phase_source: Phase 10 from PRD-gen2 (Gen 3 Phase 2)
independent_tasks_count: 3
dependent_chains: 4
technologies_consumed: none
next_suggested_command: execute
next_arg: ".agents/plans/phase-10-manifest-evolution-monorepo-aware-commands.md"
estimated_complexity: high
confidence: 7/10
