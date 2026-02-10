# PIV Framework Autonomy Upgrade Specification

## Purpose

This document captures the full discussion and implementation plan for upgrading the PIV Dev Kit framework to support autonomous agent orchestration. The upgrade is broken into 3 phases (layers), each building on the previous.

**Goal**: Build the foundational capabilities into the framework BEFORE developing the autonomous orchestrator wrapper that will use the framework to generate agents autonomously.

---

## Phase Overview

| Phase | Name | Status | Purpose |
|-------|------|--------|---------|
| **Phase 1** | State Awareness | 🟢 Complete | The orchestrator's eyes — knows where the project is and whether artifacts are fresh |
| **Phase 2** | Failure Intelligence | 🟢 Complete | The orchestrator's immune system — structured error handling and rollback |
| **Phase 3** | Autonomous Operation | 🟢 Complete | The orchestrator's hands — self-reasoning, credential pre-flight, traceability, orchestrator interface |

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

## Phase 2: Failure Intelligence (COMPLETE)

### Problem Statement

When commands fail during the PIV loop, the only signal is unstructured terminal text. A human can read and interpret it, but an autonomous orchestrator cannot. The framework needs machine-readable error classifications, a safe rollback mechanism, and a retry/escalation budget — all persisted in the manifest so failure context survives `/clear` + `/prime` cycles.

### Two Problems Solved

**Problem A: "What went wrong and what should I do about it?"**
- Commands fail in predictable categories (syntax errors, auth failures, stale artifacts, etc.)
- Each category has a specific recovery action (retry, refresh, escalate to human)
- Currently: unstructured terminal output, no machine-readable error signal
- Solution: Structured error taxonomy with per-category recovery mapping, written to manifest and terminal

**Problem B: "How do I safely recover from a failed execution?"**
- `/execute` modifies source code across multiple files over multiple tasks
- If task 7 of 12 fails, the working tree is partially modified — hard to manually revert
- Currently: no rollback mechanism, manual cleanup required
- Solution: Git tag checkpoint before `/execute`, enabling clean rollback to pre-execution state

### Design Decisions Made

1. **Error taxonomy**: 9 categories covering all PIV command failure modes, each mapped to a specific recovery action
2. **Retry budget**: Per-category limits (0-3 retries depending on error type), tracked in manifest
3. **Git checkpointing**: Automatic git tag before every `/execute` run — tags are lightweight, never committed unvalidated code
4. **Checkpoint scope**: `/execute` only — other commands produce regenerable artifacts (profiles, plans), not source code
5. **Checkpoint cleanup**: Keep all tags — a typical project creates 5-10 over its lifecycle, zero storage concern
6. **Retry vs rollback distinction**: Retry = resume from failure point (tasks 1-6 are fine, fix task 7). Rollback = retries exhausted, revert ALL execution changes to clean state.
7. **Recommendations, not automation**: Commands write structured failure data + recovery recommendations. The human (or future orchestrator) decides what to do. The framework doesn't auto-execute recovery.
8. **PIV-Error terminal block**: Always-on structured error output on failure (not gated by hooks). Error reporting is a safety mechanism, not an automation feature.
9. **Failure state in manifest**: Single `failures` section in manifest, read by `/prime` on next run. No separate error file.

### Error Taxonomy

| Category | Where It Happens | Recovery Action | Max Retries | Human Needed? |
|----------|-----------------|-----------------|-------------|---------------|
| `syntax_error` | `/execute`, `/validate` L1 | Auto-fix and retry | 2 | No (unless retries exhausted) |
| `test_failure` | `/execute` validation, `/validate` L2 | Auto-fix and retry | 2 | No (unless retries exhausted) |
| `scenario_mismatch` | `/validate` Phase 3 | Re-read PRD, adjust implementation | 1 | Maybe (after retry) |
| `integration_auth` | `/validate` Tier 1, `/research-stack` | Escalate immediately | 0 | Yes — credentials are a human problem |
| `integration_rate_limit` | `/validate` Tier 2-3 | Wait with backoff, retry | 3 | No |
| `stale_artifact` | `/prime` reconciliation | Auto-refresh via `/research-stack --refresh` | 1 | No |
| `prd_gap` | `/plan-feature` Phase 0 | Escalate — PRD needs human revision | 0 | Yes |
| `partial_execution` | `/execute` | Rollback to checkpoint, escalate | 0 | Yes — decide whether to retry or redesign |
| `line_budget_exceeded` | `/create-prd`, `/plan-feature` | Auto-trim and retry | 1 | No |

### Git Checkpointing

**What it is:** A git tag on the current HEAD (last committed, validated, clean state) created automatically before `/execute` starts. It's a bookmark, not a commit of new code.

**Tag naming convention:** `piv-checkpoint/{phase}-{ISO-8601-timestamp}`
Example: `piv-checkpoint/phase-2-2026-02-10T16:30:00Z`

**Checkpoint lifecycle:**
```
1. /plan-feature completes → plan exists, phase ready for execution
2. /execute starts → CREATE git tag → record in manifest (status: active)
3. /execute runs tasks...
   ├── ALL SUCCEED → continue to /validate
   └── FAILURE → write failure to manifest, checkpoint remains active
4. /validate runs...
   ├── PASS → continue to /commit
   └── FAIL → write failure to manifest, checkpoint remains active
5. /commit succeeds → update checkpoint status to "resolved" in manifest
```

**Rollback mechanics:**
```bash
git reset --hard piv-checkpoint/phase-2-2026-02-10T16:30:00Z
git clean -fd
```

This discards everything `/execute` did and returns to the clean state. The tag stays as a reference.

**Why only `/execute`:**
- `/execute` is the only command that modifies source code — the irreplaceable, hard-to-reconstruct part
- `/research-stack` only modifies profiles (regenerable from scratch)
- `/validate-implementation` is mostly read-only (fixture files are test artifacts)
- Applying checkpoints only to the high-risk command keeps the system simple

**Why not a separate branch:**
- Git tags are lighter — just a 40-byte SHA pointer, no branch clutter
- A naming convention keeps them organised
- They don't affect `git branch` listings or workflow

### Retry vs Rollback

These are different actions, not synonyms:

**Retry** = don't rollback. Tasks 1-6 succeeded and their code is fine. Fix the error in task 7 and continue from there. The `.agents/progress/` file tracks what's done — `/execute` can resume from the failure point.

**Rollback** = retries exhausted or `partial_execution` error. Reset to checkpoint, wipe ALL execution changes, give the human a clean slate. The manifest retains the full failure history so the human understands what happened.

### PIV-Error Terminal Block

Always-on (not gated by hooks). Appears in terminal output whenever a command fails:

```
## PIV-Error
error_category: syntax_error
command: execute
phase: 2
details: "TypeScript compilation failed in src/agent/tools.ts:45"
retry_eligible: true
retries_remaining: 1
checkpoint: piv-checkpoint/phase-2-2026-02-10T16:30:00Z
```

This block is ALSO written to the manifest `failures` section for persistence across `/clear`.

### Manifest Extensions (Phase 2)

Phase 2 adds two new sections to `.agents/manifest.yaml`:

```yaml
checkpoints:
  - tag: piv-checkpoint/phase-2-2026-02-10T16:30:00Z
    phase: 2
    created_before: execute
    status: active          # active = rollback available, resolved = /commit succeeded

failures:
  - command: execute
    phase: 2
    error_category: syntax_error
    timestamp: 2026-02-10T17:00:00Z
    retry_count: 1
    max_retries: 2
    checkpoint: piv-checkpoint/phase-2-2026-02-10T16:30:00Z
    resolution: pending     # pending, auto_fixed, rolled_back, escalated
    details: "TypeScript compilation failed in src/agent/tools.ts:45"
```

`/prime` reads these on every run and factors them into `next_action`:
- Active checkpoint + pending failure with retries remaining → recommend retry
- Active checkpoint + pending failure with no retries → recommend rollback + escalate
- Active checkpoint + no failure → execution was interrupted, recommend resuming
- Resolved checkpoint → historical, no action needed

### How This Works With `/clear` + `/prime`

The framework is designed around context window management. After a failed `/execute`, the context is full of execution noise. The user does `/clear` + `/prime`:

1. `/prime` reads manifest → sees active checkpoint, pending failure
2. Reports: "Previous execution of Phase 2 failed (syntax_error, retry 1/2). Checkpoint available."
3. Recommends: "Retry /execute — fix the syntax error in tools.ts:45"
4. User decides to retry (or rollback, or inspect)
5. If retry succeeds → `/validate` → `/commit` → checkpoint resolved
6. If retry fails → `/prime` sees retry 2/2 exhausted → recommends rollback + escalate

The manifest carries failure context across every `/clear`. The checkpoint protects the codebase. The human stays in control.

### Commands Changed

**`CLAUDE.md`**
- Add error taxonomy table to PIV Configuration
- Add retry budget table
- Add `checkpoint_before_execute: true` setting

**`/prime`** (moderate changes)
- Read `failures` and `checkpoints` from manifest
- Factor failure state into `next_action` recommendations:
  - Pending failure + retries remaining → recommend retry with fix guidance
  - Pending failure + no retries → recommend rollback + escalate
  - Active checkpoint + no failure → recommend resuming interrupted execution
- Report checkpoint status and failure history in terminal output

**`/execute`** (significant changes)
- New Step 0: Create git tag checkpoint before execution begins
- Record checkpoint in manifest (`checkpoints` section, `status: active`)
- On task failure: classify error, write to manifest `failures` section, output `## PIV-Error` block
- On partial completion: mark remaining tasks as blocked, write `partial_execution` failure
- Resume support: if retrying, read progress file to skip completed tasks

**`/validate-implementation`** (moderate changes)
- On Level 1/2 failure: classify error, write to manifest, output `## PIV-Error` block
- On scenario mismatch: classify as `scenario_mismatch`, include PRD reference in details
- On integration auth failure: classify as `integration_auth`, immediate escalation recommendation
- On rate limit: classify as `integration_rate_limit`, include backoff guidance

**`/plan-feature`** (small changes)
- On line budget exceeded: classify error, output `## PIV-Error` block, attempt auto-trim retry
- On PRD gap detected: classify as `prd_gap`, escalate

**`/research-stack`** (small changes)
- On WebSearch/WebFetch failure: classify as `integration_auth` or transient, output `## PIV-Error` block
- On profile generation failure: write to manifest

**`/create-prd`** (small changes)
- On line budget exceeded: classify error, output `## PIV-Error` block, attempt auto-trim

**`/create_global_rules_prompt`** (moderate changes)
- Document error taxonomy, retry budgets, checkpointing in generated CLAUDE.md
- Add Failure Intelligence Reference section

### Commands NOT Changed
- `/commit` — Runs after successful validation; resolves checkpoint status in manifest (already has manifest access from Phase 1)
- `/orchestrate-analysis` — Separate workflow

### End-to-End Failure Scenario

```
Session 1: /prime → /plan-feature "Phase 2" → plan approved → /clear

Session 2: /prime → sees plan ready for Phase 2
         → /execute .agents/plans/phase-2.md
         → CHECKPOINT CREATED: piv-checkpoint/phase-2-2026-02-10T16:30:00Z
         → Tasks 1-6 succeed
         → Task 7 fails: syntax_error in tools.ts:45
         → PIV-Error block output to terminal
         → FAILURE WRITTEN TO MANIFEST (retry 0/2)
         → /clear (context full of execution noise)

Session 3: /prime → reads manifest, sees:
           - Active checkpoint for Phase 2
           - Failure: syntax_error, retry 0/2, tools.ts:45
         → Recommends: "Retry /execute — syntax error in tools.ts needs fixing"
         → User retries
         → /execute .agents/plans/phase-2.md (resumes from task 7)
         → All tasks pass
         → FAILURE RESOLVED in manifest (resolution: auto_fixed)
         → /clear

Session 4: /prime → sees Phase 2 execution complete, no active failures
         → Recommends: /validate-implementation
         → /validate-implementation --full → passes
         → /commit → checkpoint status → resolved
```

---

## Phase 3: Autonomous Operation

### Problem Statement

Commands have human checkpoints incompatible with autonomous operation. `/plan-feature` waits for user validation, `/validate-implementation` requires human approval for Tier 3 tests, and hooks are conditionally enabled. For the orchestrator to drive the full PIV loop without a human, every command must be capable of running autonomously.

### Design Decisions

1. **No mode toggles** — This framework (`piv-dev-kit-agentic`) is autonomous-only. A separate `piv-dev-kit` exists for human-in-the-loop development. No `--autonomous` flags or conditional logic.

2. **Self-reasoning replaces human validation** in `/plan-feature` — Two-pass system: Pass 1 generates recommendations, Pass 2 verifies each against PRD criteria (alignment, technology fit, codebase consistency, simplicity, risk). For complex multi-technology decisions, a sub-agent (Task tool) acts as adversarial critic.

3. **Tier 3 tests always auto-approved** — Credentials are verified upfront by `/preflight`. All Tier 3 live API tests execute automatically. Response fixtures saved to `.agents/fixtures/` for historical record.

4. **`partial_execution` gets 1 auto-retry** — First failure: auto-rollback to checkpoint, manifest records retry, orchestrator re-runs `/execute`. Second failure: escalate as blocking notification.

5. **`prd_gap` becomes non-blocking** — Agent makes best-effort assumption with documented reasoning in plan NOTES section. Writes warning notification (non-blocking). PRD gaps don't halt the loop.

6. **`integration_auth` is always blocking** — Agent cannot fix credentials. Writes blocking notification; orchestrator pauses and forwards to Telegram.

7. **Hooks always enabled** — Removed all `--with-hooks`/`--no-hooks` conditionals and `hooks_enabled` setting. Every command appends `## PIV-Automator-Hooks` unconditionally. This is the orchestrator's data feed.

8. **Agent Teams is preferred mode** — All parallelizable commands (`/execute`, `/research-stack`, `/validate-implementation`) default to Agent Teams. Sequential is the fallback.

9. **Manifest `notifications` section** — Commands write structured notifications (escalation, info, completion) to manifest. Orchestrator reads after each session, forwards to Telegram, sets `acknowledged: true`. Framework writes; orchestrator manages lifecycle.

10. **`/preflight` command** — New command verifies all credentials before autonomous loop begins. Reads PRD technology decisions + profile env var requirements. Executes Tier 1 health checks. Reports READY or BLOCKED. Writes manifest entry and blocking notification if credentials are missing.

11. **Traceability audit** in `/validate-implementation` — New "Completeness Audit" phase builds traceability matrix: US → SC → plan tasks → execution → validation. Flags untested scenarios, unexecuted tasks, orphan scenarios, missing coverage. Must pass before commit.

12. **Context window pairings** — Documented in CLAUDE.md PIV Configuration: which commands share a session (e.g., `/prime` + `/execute`, `/prime` + `/plan-feature`). Enables orchestrator to manage Claude Code sessions correctly.

13. **Orchestrator interface specification** — Defined in `/create_global_rules_prompt` section 20. Documents the core loop, manifest-driven decisions, context pairings, and notification lifecycle.

14. **Notification lifecycle managed by orchestrator, not framework** — Commands only append. The orchestrator reads, forwards, and acknowledges. `/prime` filters to unacknowledged only.

### Scope Change Rationale

The original Phase 3 concept ("Completeness & Input") included agent brief format and cost estimation. These were dropped during design:

- **Agent brief format dropped** — PRD creation stays conversational (via Telegram). The user explicitly wants human-in-the-loop PRD creation — a structured YAML brief doesn't serve that workflow.
- **Cost estimation deferred** — Non-essential for the autonomous loop. The orchestrator pre-authorizes all API costs when the user validates the PRD. Can be added as a future enhancement.
- **Cross-phase traceability retained** — Built into `/validate-implementation` as the completeness audit rather than a separate command.

### Commands Changed

| Command | Changes |
|---------|---------|
| All 9 commands | Hook cleanup — removed conditional hook logic |
| `CLAUDE.md` | Autonomous settings, self-validation workflow, notifications, context pairings |
| `/plan-feature` | Self-reasoning replaces human validation (Phase 0 rewrite) |
| `/validate-implementation` | Always full, auto-approve Tier 3, completeness audit |
| `/prime` | Reads notifications + preflight status, priority 0 for preflight |
| `/execute` | `partial_execution` auto-retry, Agent Teams preferred |
| `/research-stack` | Agent Teams preferred |
| `/commit` | Writes completion notification |
| `/create_global_rules_prompt` | Sections 19-20 (preflight, orchestrator interface) |
| `/preflight` | **New command** — credential verification |

### New `/preflight` Command

Runs once before the autonomous loop begins. Process:
1. Extract required credentials from PRD + technology profiles
2. Check `.env` file for presence
3. Execute Tier 1 health checks for each technology
4. Report READY (all pass) or BLOCKED (any missing/failing)
5. Write manifest entry (`preflight.status: passed/blocked`)
6. If blocked: write blocking notification, wait for credentials

### Orchestrator Interface Contract

The orchestrator interacts with the framework exclusively through the manifest:

```
Orchestrator Loop:
1. Read manifest → next_action
2. Start Claude Code session → CLAUDE.md loads automatically
3. Run /prime + recommended command
4. Session ends → read manifest
5. If notifications.blocking: true → pause, notify human via Telegram, wait
6. If all phases complete → notify human, stop
7. Otherwise → repeat from step 1
```

Manifest is the single source of truth. No direct API calls between orchestrator and framework.

---

## Implementation Order

```
Phase 1: State Awareness      ← 🟢 COMPLETE
    ↓
Phase 2: Failure Intelligence  ← 🟢 COMPLETE
    ↓
Phase 3: Autonomous Operation  ← 🟢 COMPLETE
    ↓
Autonomous Orchestrator        ← Build AFTER all 3 phases are in the framework
```

Each phase was implemented, tested in a real project workflow, and validated before moving to the next. All three phases are now complete — the framework is ready for the orchestrator.
