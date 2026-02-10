# PIV Framework Autonomy Upgrade Specification

## Purpose

This document captures the full discussion and implementation plan for upgrading the PIV Dev Kit framework to support autonomous agent orchestration. The upgrade is broken into 3 phases (layers), each building on the previous.

**Goal**: Build the foundational capabilities into the framework BEFORE developing the autonomous orchestrator wrapper that will use the framework to generate agents autonomously.

---

## Phase Overview

| Phase | Name | Status | Purpose |
|-------|------|--------|---------|
| **Phase 1** | State Awareness | 🟡 Ready to implement | The orchestrator's eyes — knows where the project is and whether artifacts are fresh |
| **Phase 2** | Failure Intelligence | ⚪ Not yet discussed in detail | The orchestrator's immune system — structured error handling and rollback |
| **Phase 3** | Completeness & Input | ⚪ Not yet discussed in detail | The orchestrator's hands — traceability, agent brief format, cost estimation |

---

## Phase 1: State Awareness (CURRENT)

### Problem Statement

The framework currently has no persistent state tracking. `/prime` infers project status by scanning file names and making guesses. This leads to incorrect recommendations (e.g., suggesting Phase 2 planning when Phase 2 is already implemented). For an autonomous orchestrator, inference-based status is too fragile — it needs deterministic, machine-readable state.

### Two Problems Solved

**Problem A: "Where am I in the sequence?"**
- Which phases are done, which are in progress, what's next
- Currently inferred from file existence — unreliable
- Solution: Phase status map in manifest

**Problem B: "Are my technology profiles still current?"**
- Profiles age over time — APIs update, SDKs release new versions
- No mechanism to detect stale profiles
- Solution: 7-day freshness window with automatic detection

### Design Decisions Made

1. **Freshness window**: 7 days — profiles older than this are flagged as stale
2. **Refresh behavior**: `/prime` reports and recommends refresh. The orchestrator (when built) reads the recommendation and executes. `/prime` itself does NOT auto-trigger research.
3. **Refresh mode**: `/research-stack --refresh` is a lightweight update (re-checks auth, rate limits, SDK versions, breaking changes) vs full regeneration
4. **Manifest format**: YAML — human-readable, machine-parseable
5. **Manifest location**: `.agents/manifest.yaml`
6. **Reconciliation**: `/prime` validates manifest against actual files on every run, catching manual edits or deletions

### User Workflow Context

The framework owner's workflow is sequential and forward-moving:
- Phases are implemented in order (1 → 2 → 3 → 4)
- Completed phases are never revisited or altered
- New phases may be added to the PRD after all existing phases are done
- When new phases are added, new technologies may need profiling
- Existing profiles may need refreshing if time has passed

This means **hash-based dependency staleness (PRD changed → cascade invalidation)** is NOT needed. The staleness model is:
- **Temporal**: Is this profile older than 7 days?
- **Coverage**: Does the next phase use a technology without a profile?

### Manifest Structure

```yaml
# .agents/manifest.yaml

last_updated: 2026-02-10T16:30:00Z

phases:
  1: { plan: complete, execution: complete, validation: pass }
  2: { plan: complete, execution: complete, validation: pass }
  3: { plan: not_started, execution: not_started, validation: not_started }

prd:
  path: PRD.md
  status: complete
  generated_at: 2026-02-08T10:00:00Z
  phases_defined: [1, 2, 3, 4]

profiles:
  instantly-api:
    path: .agents/reference/instantly-api-profile.md
    generated_at: 2026-02-07T12:00:00Z
    status: complete
    freshness: fresh          # or "stale" if > 7 days
    used_in_phases: [1, 2]

  google-sheets:
    path: .agents/reference/gcs-profile.md
    generated_at: 2026-01-15T10:00:00Z
    status: complete
    freshness: stale
    used_in_phases: [1, 2, 3]

  stripe-api:
    status: missing           # referenced in Phase 3, no profile exists
    used_in_phases: [3]

plans:
  - path: .agents/plans/phase-1-foundation.md
    phase: 1
    status: complete
    generated_at: 2026-02-09T10:00:00Z

  - path: .agents/plans/phase-2-strategist.md
    phase: 2
    status: complete
    generated_at: 2026-02-09T14:00:00Z

executions:
  - phase: 1
    status: complete
    completed_at: 2026-02-09T16:00:00Z
    tasks_total: 12
    tasks_done: 12
    tasks_blocked: 0

validations:
  - path: .agents/validation/phase-1-2026-02-09.md
    phase: 1
    status: pass
    completed_at: 2026-02-09T18:00:00Z
    scenarios_passed: 8
    scenarios_failed: 0
    scenarios_skipped: 1

next_action:
  command: research-stack
  argument: "--refresh google-sheets"
  reason: "google-sheets profile is 26 days old (past 7-day window); stripe-api has no profile"
  confidence: high

settings:
  profile_freshness_window: 7d
```

### Commands Changed

**`/prime`** (significant changes)
- Read manifest if it exists; build one from scanning artifacts if it doesn't
- Reconcile manifest against actual files (detect manual edits, deleted files, new files)
- Check profile ages against 7-day freshness window
- Cross-reference next phase's technology needs against existing profiles (coverage gaps)
- Report phase status from manifest instead of inferring from file names
- Output staleness/coverage warnings with specific recovery actions
- Write `next_action` recommendation to manifest
- Report all of the above to terminal for the orchestrator/user

**`/research-stack`** (moderate changes)
- Add `--refresh` flag for lightweight profile updates
- `--refresh` with no argument: reads manifest, refreshes all stale profiles
- `--refresh instantly-api`: refreshes a specific profile by technology name
- Refresh mode: re-checks auth, rate limits, SDK versions, breaking changes since last profile date
- Preserves testing tier classifications unless endpoints changed
- After generating/refreshing: write profile entries to manifest (path, technology, generated_at, status)

**`/create-prd`** (small addition)
- After generating PRD: write entry to manifest (path, status, generated_at, phases_defined list)

**`/plan-feature`** (small addition)
- After generating plan: write entry to manifest (path, phase number, status, generated_at)

**`/execute`** (small addition)
- After execution completes: write entry to manifest (phase, status, completed_at, tasks_total, tasks_done, tasks_blocked)

**`/validate-implementation`** (small addition)
- After validation completes: write entry to manifest (phase, status pass/partial/fail, scenarios_passed/failed/skipped)

**`/create_global_rules_prompt`** (moderate addition)
- Include manifest documentation in generated CLAUDE.md (what it is, where it lives, how it works)
- Include `--refresh` flag usage, rationale, and examples
- Include `profile_freshness_window: 7d` in PIV Configuration section
- Include command-manifest interaction reference (which commands read/write what)

### Commands NOT Changed
- `/commit` — No manifest interaction needed
- `/orchestrate-analysis` — Separate workflow, doesn't participate in PIV phase cycle

---

## Phase 2: Failure Intelligence (NOT YET DISCUSSED IN DETAIL)

### High-Level Concept

When things fail during autonomous execution, the orchestrator needs:

1. **Structured error taxonomy** — Machine-readable error categories (syntax_error, missing_implementation, scenario_behavior_mismatch, integration_auth_failure, stale_artifact, prd_gap) that map to specific recovery actions
2. **Git checkpointing / rollback** — Create a known-good checkpoint before execution so the orchestrator can recover from partial failures

### Key Questions to Discuss
- What error categories exist across all commands?
- What recovery action maps to each category?
- Should checkpointing be automatic (before every /execute) or manual?
- How many retries before escalating to human?
- Should the manifest track failure history?

---

## Phase 3: Completeness & Input (NOT YET DISCUSSED IN DETAIL)

### High-Level Concept

Three capabilities that ensure the orchestrator can start work without human input and verify nothing was missed:

1. **Cross-phase traceability** — Trace user stories from PRD scenario IDs → plan tasks → implemented code → validation results. Verify: "Is US-003 fully implemented and validated?"
2. **Agent brief format** — Structured input (YAML) that replaces the conversational PRD creation process. The orchestrator produces a brief, feeds it to `/create-prd`, and gets a PRD without human Q&A.
3. **Cost estimation** — Before committing to a phase, estimate API calls, token usage, Tier 3 test costs. Enables smart batching and budget management.

### Key Questions to Discuss
- What fields does the agent brief need?
- How does traceability work with the current scenario ID system (SC-001 etc.)?
- Where do cost estimates come from — profiles? Historical data?
- Should traceability be a new command (/audit) or built into /validate-implementation?

---

## Implementation Order

```
Phase 1: State Awareness     ← IMPLEMENT NOW
    ↓
Phase 2: Failure Intelligence ← Discuss after Phase 1 is built and tested
    ↓
Phase 3: Completeness & Input ← Discuss after Phase 2 is built and tested
    ↓
Autonomous Orchestrator       ← Build AFTER all 3 phases are in the framework
```

Each phase should be implemented, tested in a real project workflow, and validated before moving to the next. This ensures each layer is solid before building on top of it.
