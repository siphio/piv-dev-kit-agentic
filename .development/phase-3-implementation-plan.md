# Phase 3: Autonomous Operation — Implementation Plan

## Context

Phase 1 (State Awareness) added `.agents/manifest.yaml` with deterministic state tracking. Phase 2 (Failure Intelligence) added structured error taxonomy, git checkpointing, and retry budgets. Phase 3 removes all human checkpoints from commands (except `/create-prd`), adds credential pre-flight verification, cross-phase traceability, and the orchestrator interface specification — making every command capable of running without a human present.

**This framework is for autonomous/agentic use only.** A separate `piv-dev-kit` exists for human-in-the-loop development. No `--autonomous` flags or mode toggles — every command assumes an agent is driving.

**Spec document**: `.development/framework-autonomy-upgrade-spec.md` (Phase 3 section — to be written after implementation)

---

## Implementation Order (12 steps)

### Step 0: Hook Cleanup — Remove all conditional hook logic across all commands

**Files**: All command files in `.claude/commands/`

**This is a mechanical sweep. Every command file has the same two changes:**

1. **Remove Hook Toggle section** — Delete the `--with-hooks`/`--no-hooks` parsing logic and `Check CLAUDE.md for hooks_enabled setting` instruction. Replace with:
   ```markdown
   ## Hooks

   Hooks are always enabled. `## PIV-Automator-Hooks` is appended to the primary file artifact (or terminal output for commands that don't produce files).
   ```

2. **Remove "If Enabled" conditional from PIV-Automator-Hooks section** — Keep the hooks content, just remove the conditional wrapper. Change "If hooks are enabled, output/append..." to always output/append.

**Files requiring both changes:**

| File | Hook Toggle Location | Hooks Conditional Location |
|------|---------------------|---------------------------|
| `prime.md` | Lines 36-38 | Lines 298-300 |
| `execute.md` | Lines 28-30 | Lines 283-285 |
| `commit.md` | Lines 30-32 | Lines 145-147 |
| `create_global_rules_prompt.md` | Lines 21-22 | Lines 405-407 |
| `orchestrate-analysis.md` | Lines 30-31 | Lines 285-287 |
| `plan-feature.md` | Lines 56-59 (also addressed in Step 2) | Line 652 |
| `validate-implementation.md` | Lines 46-48 (also addressed in Step 3) | Lines 658-660 |
| `research-stack.md` | Lines 71-74 (also addressed in Step 6) | Lines 530-532 |
| `create-prd.md` | Lines 65-67 (also addressed in Step 10) | Lines 452-465 |

**Note:** Steps 2, 3, 6, and 10 have additional changes to these files beyond hook cleanup. Step 0 handles ONLY the hook cleanup portion. If a file appears in both Step 0 and a later step, do the hook cleanup first, then the other changes.

---

### Step 1: CLAUDE.md — Autonomous configuration, updated taxonomy, internal consistency

**File**: `CLAUDE.md` (315 lines → ~380 lines)

**Changes:**

1. **Update PIV Configuration table** (~line 194-198) — Remove `hooks_enabled` row (no longer configurable — hooks are always on). Add new autonomous settings:
   ```
   | mode | autonomous | Framework operates without human checkpoints (except PRD creation) |
   | reasoning_model | opus-4-6 | Model used for all autonomous reasoning and self-validation |
   | validation_mode | full | Always run full live validation including Tier 3 |
   | agent_teams | prefer_parallel | Use Agent Teams for parallel execution whenever available |
   ```

2. **Update Current Settings** (~line 200-203):
   - Remove `hooks_enabled: false` — replace with prose: "Hooks are always enabled — all commands append `## PIV-Automator-Hooks` to their primary file artifact."
   - Add `mode: autonomous`
   - Add `reasoning_model: opus-4-6`
   - Add `validation_mode: full`
   - Add `agent_teams: prefer_parallel`

3. **Add context pairings** — New subsection `### Context Window Pairings` after the manifest paragraph (~line 205). Document which commands share a session:
   ```markdown
   ### Context Window Pairings

   Commands that share a single context window before clearing:

   | Session | Commands | Notes |
   |---------|----------|-------|
   | PRD Creation | /create-prd, /create_global_rules_prompt | Human-in-the-loop via Telegram |
   | Research | /research-stack | One session per technology if sequential |
   | First Commit + Plan | /commit, /prime, /plan-feature | Plan follows immediately after priming |
   | Execution | /prime, /execute | Execute follows immediately after priming |
   | Validation | /prime, /validate-implementation --full | Validate follows immediately after priming |
   | Commit | /commit | Lightweight, own session |
   | Pre-flight | /preflight | Runs once before autonomous loop begins |
   ```

4. **Update error taxonomy** (~line 220) — Change `partial_execution` max retries from `0` to `1` and update description:
   ```
   | `partial_execution` | `/execute` | Auto-rollback to checkpoint, retry once | 1 | Yes — only after auto-retry fails |
   ```

5. **Update `prd_gap` description** (~line 219) — Change to reflect autonomous behavior:
   ```
   | `prd_gap` | `/plan-feature` Phase 0 | Make best-effort assumption, document reasoning, continue | 0 | No — agent resolves with documented assumption |
   ```

6. **Add `notifications` manifest section** — New paragraph after the PIV-Error block (~line 234):
   ```markdown
   ### Notifications

   Commands write structured notifications to manifest for the orchestrator to forward to Telegram:
   ```yaml
   notifications:
     - timestamp: [ISO 8601]
       type: escalation | info | completion
       severity: warning | critical | info
       category: [error taxonomy category or "phase_complete"]
       phase: [N]
       details: "[human-readable description]"
       blocking: [true|false]
       action_taken: "[what the agent did or is waiting for]"
   ```
   The orchestrator reads `blocking: true` to know when to pause and wait for human response (only `integration_auth` after `/preflight`, and `partial_execution` after auto-retry fails).

   **Notification Lifecycle:**
   - Commands APPEND notifications — they never delete or modify existing entries
   - The orchestrator reads notifications after each session, forwards to Telegram, and sets `acknowledged: true`
   - `/prime` only reports notifications where `acknowledged` is absent or `false`
   - Acknowledged notifications are retained for history but excluded from active reporting
   - The framework writes; the orchestrator manages lifecycle. This is documented in the orchestrator interface spec (Step 9, section 20).
   ```

7. **Rewrite "How commands check this" paragraph** (~line 236-238) — Remove the "Override per command: Add `--with-hooks` or `--no-hooks`" paragraph and the "How commands check this" paragraph. Replace with: "Hooks are always enabled. All commands append `## PIV-Automator-Hooks` to their primary file artifact. For commands that output only to terminal (e.g., `/prime`, `/commit`), the hooks block appears in terminal output."

8. **Update Core Principle #5** (~line 17) — Change from:
   `"Human checkpoints - The framework enables discussion before implementation"`
   To:
   `"Self-validation - The framework validates decisions against PRD criteria before implementation"`

9. **Rewrite Section 11 "Plan-Feature Workflow"** (~lines 165-188) — Replace the human validation description with the autonomous self-validation flow. Remove "Wait for user validation" and "Only proceed after user validates approach." Replace with two-pass self-validation description matching Step 2's changes to `/plan-feature`.

10. **Update Section 13 "Argument Parsing"** (~lines 303-311) — Remove `--with-hooks` and `--no-hooks` from the flag strip list. Keep `--reflect`, `--no-manifest`, `--refresh`.

11. **Delete Section 13 "Manual Mode Preservation"** (~lines 313-315) — This entire subsection is obsolete. It says "When hooks are disabled (the default)..." — hooks are never disabled in this framework.

12. **Add manifest settings merge note** — When writing new settings to manifest (`mode`, `reasoning_model`, `validation_mode`, `agent_teams`), MERGE with existing `settings` section. The `profile_freshness_window: 7d` field already exists from Phase 1 and must be preserved. Add keys alongside it, never replace the section.

---

### Step 2: /plan-feature — Self-reasoning replaces human validation

**File**: `.claude/commands/plan-feature.md` (821 lines → ~865 lines)
**This is a significant change — the core autonomous reasoning step.**

**Changes:**

1. **Update the Planning Process note** (~line 63) — Remove "output recommendations to terminal. Proceed to Phase 1 only after user validates the approach." Replace with:
   ```
   > **Note:** If a PRD exists, start with Phase 0 (Scope Analysis). The agent generates recommendations, self-validates them against PRD criteria, and proceeds to Phase 1 autonomously.
   ```

2. **Rewrite Phase 0 section header** (~line 65):
   ```
   ### Phase 0: Scope Analysis & Autonomous Self-Validation (If PRD Exists)
   ```

3. **Remove Terminal Output Format "Ready to generate plan" prompt** (~line 126-128) — Delete the "Ready to generate plan with these decisions, or would you like to discuss any recommendations?" line.

4. **Rewrite `prd_gap` handling** (~line 131-142) — Change from "Halt plan generation, recommend PRD revision" to non-blocking with assumption:
   ```markdown
   **On PRD Gap Detected (missing info needed for planning):**
   When information is missing from the PRD that affects a decision:
   1. Make best-effort decision based on available context (PRD, technology profiles, codebase patterns)
   2. Document the assumption explicitly in the plan's NOTES section:
      "PRD does not specify [X]. Assumed [Y] because [reasoning]. If incorrect, this affects tasks [list]."
   3. Write to manifest `failures` section with `resolution: auto_resolved_with_assumption`
   4. Write to manifest `notifications` section (type: escalation, severity: warning, blocking: false)
   5. Output `## PIV-Error` block but continue planning — do NOT halt:
   ```
   ```
   ## PIV-Error
   error_category: prd_gap
   command: plan-feature
   phase: [N]
   details: "[what information is missing — and what was assumed instead]"
   retry_eligible: false
   retries_remaining: 0
   checkpoint: none
   ```
   ```

5. **Rewrite "After User Validation" section** (~line 144-147) — Replace with new **Pass 2: Self-Validation** section:
   ```markdown
   ### Pass 2: Self-Validation Against PRD Criteria

   After generating recommendations in Pass 1 (steps 1-5 above), systematically verify each recommendation before proceeding to plan generation:

   **For each recommendation, verify:**

   1. **PRD Alignment** — Does this serve the user stories for this phase?
      - Re-read the specific user story acceptance criteria from PRD Section 5
      - Verify the recommendation directly enables at least one acceptance criterion
      - If not aligned: revise recommendation

   2. **Technology Fit** — Does this respect constraints in the technology profiles?
      - Check rate limits, auth requirements, SDK capabilities from `.agents/reference/`
      - Verify the recommended approach is actually possible with the available APIs
      - If profile contradicts recommendation: revise to fit technology constraints

   3. **Codebase Consistency** — Does this match existing patterns?
      - Check if similar decisions were made in completed phases
      - Verify no contradiction with established architecture
      - If inconsistent: either align with existing pattern or document WHY this deviates

   4. **Simplicity Check** — Is there a simpler approach that achieves the same goal?
      - If a simpler path exists and satisfies criteria equally, prefer it

   5. **Risk Assessment** — What could go wrong with this choice?
      - Identify the primary failure mode
      - Verify error recovery exists in PRD Section 4.4
      - If no recovery path: flag in plan NOTES section

   **Complex Decision Escalation:**
   For decisions involving multiple technologies interacting or contradicting patterns from previous phases, spawn a sub-agent (Task tool) as an adversarial critic:
   - Sub-agent receives: PRD phase, the recommendations, relevant technology profiles
   - Sub-agent task: find flaws, contradictions, or missed alternatives
   - Main agent incorporates feedback or overrides with documented reasoning

   **After self-validation passes:**
   - Lock in validated recommendations
   - Document final reasoning in the plan's NOTES section (traceability for why decisions were made)
   - Proceed directly to Phase 1 (Feature Understanding)
   ```

6. **Update Hook Toggle section** (~line 56-59) — Remove `--with-hooks`/`--no-hooks` stripping since hooks are always on. Keep `--reflect` handling.

---

### Step 3: /validate-implementation — Always full, auto-approve Tier 3, traceability audit

**File**: `.claude/commands/validate-implementation.md` (759 lines → ~830 lines)

**Changes:**

1. **Update Arguments section** (~line 20-25) — Remove the distinction between standard and full modes:
   ```markdown
   ## Arguments

   - `$ARGUMENTS`: Plan file path (optional, defaults to most recent in `.agents/plans/`)

   **Always runs all levels**: Level 1 (syntax) + Level 2 (components) + Level 3 (scenarios + live integration) + Level 4 (full pipeline end-to-end).
   ```

2. **Rewrite Tier 3 section** (~line 290-334) — Replace human approval with auto-approve:
   ```markdown
   ### Step 3: Tier 3 — Auto-Approved Live Tests

   Execute ALL Tier 3 tests automatically. Credentials have been verified by `/preflight` before the autonomous loop began.

   ```
   ### Tier 3: Live Tests (Auto-Approved)

   [Technology Name] - [Operation]:
     Endpoint: [METHOD /endpoint]
     Validates: [which PRD scenario]
     Cost: [estimated from profile]
     Response: [actual response]
     Schema valid: ✅ / ❌
     Fixture saved: .agents/fixtures/[tech]-[endpoint].json
     ✅ PASS | ❌ FAIL
   ```

   **Response recording:**
   After every Tier 3 call:
   1. Execute the API call
   2. Save full response to `.agents/fixtures/{technology}-{endpoint-name}.json`
   3. Include timestamp, request, and response
   4. Fixture serves as historical record and fallback for future runs
   ```

3. **Update Agent Teams Mode** (~line 422-435) — Remove "Lead handles Tier 3 approvals" and redistribute:
   ```markdown
   ### Agent Teams Mode (Preferred)

   > Parallel validation across all tiers and scenario categories.

   ```
   Team Lead coordinates validation:
   ├── Teammate 1: Tier 1-2 integration tests (Steps 1-2)
   ├── Teammate 2: Tier 3-4 integration tests (Steps 3-4)
   ├── Teammate 3: Happy path scenarios (Step 5)
   ├── Teammate 4: Error recovery + edge cases (Step 5)
   └── Lead: Decision tree verification + completeness audit + report (Steps 6-7)
   ```

   All tiers run in parallel — no human interaction required.
   ```

4. **Remove Phase 4 `--full` flag gating** (~line 439) — Change from "Only run if `--full` flag provided" to always run:
   ```markdown
   ## Phase 4: Full Pipeline

   Run the complete end-to-end agent pipeline. This may:
   - Make real API calls (costs are pre-authorized by autonomous mode)
   - Take several minutes
   - Create actual output files
   ```

5. **Add new Phase between current Phase 4 and Phase 5 — Completeness Audit (traceability)** — Insert after Phase 4 (~line 467), before the Report phase. This becomes the new Phase 5, and the current Report phase becomes Phase 6:

   ```markdown
   ## Phase 5: Completeness Audit (Traceability)

   > **Verifies that every user story is fully implemented and validated.** This is the autonomous agent's quality gate — it must pass before reporting a phase as complete.

   ### Step 1: Build Traceability Matrix

   Read the PRD and construct a mapping:

   | User Story | Scenarios | Plan Tasks | Executed | Validation Result |
   |-----------|-----------|------------|----------|-------------------|
   | US-001 | SC-001, SC-003 | Task 2, 5 | ✅/❌ | Pass/Fail/Not tested |
   | US-002 | SC-002, SC-004 | Task 3, 7, 8 | ✅/❌ | Pass/Fail/Not tested |

   **Sources:**
   - User stories + scenario references: PRD Section 5
   - Plan tasks: `.agents/plans/` for this phase
   - Execution status: `.agents/progress/` files
   - Validation results: Phase 3 scenario validation results from this run

   ### Step 2: Identify Gaps

   Flag any broken links in the traceability chain:
   - **Untested scenarios**: Scenario referenced by user story but not validated (not in Phase 3 results)
   - **Unexecuted tasks**: Plan task not marked as "done" in progress file
   - **Orphan scenarios**: Scenario tested but not linked to any user story (warning, not failure)
   - **Missing coverage**: User story with zero passing scenarios

   ### Step 3: Completeness Verdict

   ```
   ### Completeness Audit

   | User Story | Scenarios | Coverage | Status |
   |-----------|-----------|----------|--------|
   | US-001 | SC-001 ✅, SC-003 ✅ | 2/2 | ✅ Complete |
   | US-002 | SC-002 ✅, SC-004 ❌ | 1/2 | ❌ Incomplete |

   **Verdict**: [COMPLETE | INCOMPLETE]
   **Gaps**: [list of broken links, or "none"]
   ```

   **If INCOMPLETE:**
   - The phase is NOT done — report as `partial` in manifest
   - Document which scenarios/stories failed
   - Recommend re-execution or re-validation for specific gaps
   - Do NOT proceed to `/commit` for this phase

   **If COMPLETE:**
   - Phase is verified done — report as `pass` in manifest
   - Proceed to `/commit`
   ```

6. **Update Report phase** — Renumber to Phase 6. Add traceability matrix to the report template. In the Summary table (~line 559-571), add:
   ```
   | Completeness | [N] | [N] | [N] |
   ```

7. **Update Completion Criteria** (~line 743-759) — Replace "Tier 3 approval-required tests presented to user" with:
   ```
   - [ ] Tier 3 tests auto-executed with results recorded
   - [ ] Completeness audit passed (all user stories have passing scenarios)
   ```

8. **Update Hook Toggle** (~line 46-48) — Remove `--full` flag stripping since validation always runs full. Hook cleanup is handled by Step 0.

9. **Update Usage section** (~lines 725-739) — Remove all `--full` references from example commands since validation always runs full. Update descriptions. New examples:
   ```
   /validate-implementation
   /validate-implementation .agents/plans/phase-2.md
   ```

---

### Step 4: /prime — Read notifications, preflight status, updated reporting

**File**: `.claude/commands/prime.md` (313 lines → ~330 lines)

**Changes:**

1. **Extend Step 0d (Failure Assessment)** (~line 98-109) — Add notification and preflight reading:
   ```markdown
   5. **Read `notifications` section:** Identify any unacknowledged notifications
      - `blocking: true` with `acknowledged` absent or `false` → report as active blocker
      - `blocking: false` with `acknowledged` absent or `false` → include in status report as informational
      - `acknowledged: true` → skip (already forwarded by orchestrator)

   6. **Read `preflight` section:** Check credential verification status
      - If `preflight.status: passed` → credentials are verified, autonomous execution is cleared
      - If `preflight.status: blocked` → credentials are missing, report as active blocker
      - If no `preflight` entry → preflight has not been run yet
   ```

2. **Update Manifest Status output section** (~line 228-238) — Add notifications and preflight lines:
   ```
   - Pending notifications: [list with type, severity, details — or "none"]
   - Pre-flight status: [passed | blocked | not run]
   ```

3. **Update Recommended Next Step priority** (~line 242-251) — Add `/preflight` recommendation:
   ```markdown
   0. **PRD validated but `/preflight` not run?** → "Run `/preflight` to verify credentials and environment before autonomous execution"
   ```
   Insert as priority 0 (before failure checks). Triggers when: PRD is complete + profiles exist + `preflight` section is absent from manifest OR `preflight.status != passed`. Once `preflight.status: passed`, this priority is skipped and normal failure/phase logic takes over.

---

### Step 5: /execute — Update partial_execution retry behavior

**File**: `.claude/commands/execute.md` (334 lines → ~345 lines)

**Changes:**

1. **Update Step 7 error handling** (~line 164-183) — For `partial_execution` specifically, add auto-rollback-and-retry logic:
   ```markdown
   - If `partial_execution` (multiple tasks blocked):
     1. Check manifest for existing `partial_execution` failure for this phase
     2. If this is the FIRST `partial_execution` for this phase (retry_count: 0):
        - Auto-rollback to checkpoint: `git reset --hard {tag} && git clean -fd`
        - Update manifest failure entry: `retry_count: 1`, `resolution: auto_rollback_retry`
        - Write notification to manifest (type: info, severity: warning, blocking: false, details: "Auto-rolled back Phase [N], retrying execution")
        - The orchestrator will re-run `/execute` on next cycle (via `/prime` recommendation)
     3. If this is the SECOND `partial_execution` (retry_count: 1, max reached):
        - Keep checkpoint active, do NOT rollback
        - Update manifest failure entry: `resolution: escalated_blocking`
        - Write notification to manifest (type: escalation, severity: critical, blocking: true, details: "Phase [N] execution failed twice — requires human intervention")
        - Output `## PIV-Error` block
   ```

2. **Update Agent Teams section** (~line 89) — Add "Preferred" to heading:
   ```
   ## Step 6: Implementation - Agent Teams Mode (Preferred)
   ```

---

### Step 6: /research-stack — Agent Teams as preferred mode

**File**: `.claude/commands/research-stack.md` (642 lines → ~650 lines)

**Changes:**

1. **Update Agent Teams Mode section** (~line 39-48) — Change "When Agent Teams is available" to preferred default:
   ```markdown
   ## Agent Teams Mode (Preferred)

   > This command naturally parallelizes. Each technology gets its own research teammate working simultaneously. Agent Teams is the preferred execution mode.

   **With Agent Teams (default):**
   ```
   Team Lead reads PRD → identifies N technologies → spawns N research teammates
      ├── Teammate 1: Research Technology A → writes profile A
      ├── Teammate 2: Research Technology B → writes profile B
      └── Teammate 3: Research Technology C → writes profile C
   All teammates work simultaneously, each producing their profile.
   ```

   **Sequential fallback (if Agent Teams unavailable):**
   Research technologies sequentially, producing each profile before moving to the next.
   ```

2. **Update Hook Toggle** (~line 71-74) — Remove `--with-hooks`/`--no-hooks` since hooks are always on.

---

### Step 7: /commit — Write completion notification to manifest

**File**: `.claude/commands/commit.md` (156 lines → ~170 lines)

**Changes:**

1. **Extend Step 5 (Resolve Checkpoints and Failures)** (~line 77-88) — Add notification write after successful commit:
   ```markdown
   6. Write completion notification to manifest `notifications` section:
      ```yaml
      notifications:
        - timestamp: [ISO 8601]
          type: completion
          severity: info
          category: phase_complete
          phase: [N]
          details: "Phase [N] committed successfully. [N] files, [commit hash]"
          blocking: false
          action_taken: "Committed and pushed to remote"
      ```
   7. Output notification to terminal:
      ```
      📬 Notification: Phase [N] committed — orchestrator will forward to Telegram
      ```
   ```

---

### Step 8: NEW — /preflight command

**File**: `.claude/commands/preflight.md` (NEW — ~120 lines)

**Create this file with the following structure:**

```markdown
---
description: Pre-flight verification of credentials, environment, and prerequisites before autonomous execution
---

# Preflight: Autonomous Execution Readiness Check

## Objective

Verify that all credentials, environment variables, and prerequisites are in place before the autonomous agent begins the PIV loop. This command runs ONCE after PRD validation and research, before the first `/plan-feature`.

## Reasoning Approach

**CoT Style:** Zero-shot

Before reporting readiness:
1. Extract all technologies from PRD
2. Cross-reference with profile env var requirements
3. Verify each credential exists and is functional
4. Report readiness or request missing credentials

## Process

### 1. Extract Required Credentials

Read PRD Section 3 (Technology Decisions) and Section 7 (Technology Stack) to identify all external technologies.

For each technology, read its profile from `.agents/reference/`:
- Section 1 (Authentication & Setup) → Environment Variables table
- Section 9.2 (Test Environment Configuration) → Testing env vars

Compile a complete list of required environment variables.

### 2. Check .env File

Read `.env` file (or equivalent environment configuration):
- For each required variable: check if present and non-empty
- Categorize: ✅ Present | ❌ Missing | ⚠️ Present but empty

### 3. Verify Credentials (Tier 1 Health Checks)

For each technology with present credentials:
- Execute the Tier 1 health check from the profile's Section 9.1
- Verify: auth works, service is reachable, response matches expected schema

### 4. Report Readiness

```
## Pre-Flight Check

### Credential Status

| Technology | Env Variable | Status | Health Check |
|-----------|-------------|--------|-------------|
| [Name] | [VAR_NAME] | ✅ Present | ✅ Healthy |
| [Name] | [VAR_NAME] | ❌ Missing | ⏭️ Skipped |
| [Name] | [VAR_NAME] | ✅ Present | ❌ Auth Failed |

### Environment

- Runtime: [detected] ✅
- Package manager: [detected] ✅
- Git: clean working tree ✅/❌

### Verdict: [READY | BLOCKED]

[If BLOCKED]:
Missing or failing credentials:
- [VAR_NAME] — needed for [Technology] in Phases [N, N]
- [VAR_NAME] — needed for [Technology] in Phases [N]

Please provide the missing credentials. Build cannot start without them.

[If READY]:
All credentials verified. Ready for autonomous execution.
→ Next: /prime → /plan-feature "Phase 1"
```

### 5. Request Missing Credentials

If any credentials are missing or failing:
- Write to manifest `notifications` section:
  ```yaml
  notifications:
    - timestamp: [ISO 8601]
      type: escalation
      severity: critical
      category: integration_auth
      phase: 0
      details: "Pre-flight: [N] credentials missing — [list of VAR_NAMEs]"
      blocking: true
      action_taken: "Waiting for credentials before starting autonomous execution"
  ```
- Wait for credentials to be provided (via Telegram/environment)
- Re-run verification after credentials are provided
- Only report READY when ALL credentials pass health checks

### 6. Update Manifest

After successful pre-flight:
- Write `preflight` entry to manifest:
  ```yaml
  preflight:
    status: passed
    completed_at: [ISO 8601]
    credentials_verified: [N]
    technologies_checked: [list]
  ```
- Update `last_updated` timestamp

### Reasoning

Output 3-5 bullets:
```
### Reasoning
- Extracted [N] required credentials from [N] technology profiles
- Verified [N] credentials via Tier 1 health checks
- [N] missing, [N] failed, [N] passed
- Verdict: [READY|BLOCKED]
```

### Reflection

Self-critique (terminal only):
- Are all technologies from the PRD accounted for?
- Did health checks verify actual auth, not just variable presence?
- Are there any phase-specific credentials that aren't needed until later phases?

### PIV-Automator-Hooks

```
## PIV-Automator-Hooks
preflight_status: [passed|blocked]
credentials_total: [N]
credentials_verified: [N]
credentials_missing: [N]
next_suggested_command: [prime|preflight]
next_arg: ""
confidence: [high|low]
```
```

---

### Step 9: /create_global_rules_prompt — Document all Phase 3 additions

**File**: `.claude/commands/create_global_rules_prompt.md` (418 lines → ~490 lines)

**Changes:**

1. **Update section 15 (PIV Configuration)** (~line 222-233) — Replace the config block with autonomous settings:
   ```markdown
   - Add the configuration block:
     ```markdown
     ## PIV Configuration
     - hooks_enabled: true
     - profile_freshness_window: 7d
     - checkpoint_before_execute: true
     - mode: autonomous
     - reasoning_model: opus-4-6
     - validation_mode: full
     - agent_teams: prefer_parallel
     ```
   - `mode: autonomous` means no human checkpoints during execution — agent self-validates all decisions
   - `reasoning_model` specifies the model for all autonomous reasoning and self-validation
   - `validation_mode: full` means always run full live validation including Tier 3 API calls
   - `agent_teams: prefer_parallel` means use Agent Teams for parallel execution whenever available
   ```

2. **Add context pairings documentation** — After the PIV Configuration section (~line 233), add:
   ```markdown
   - Add context window pairings: Document which commands share a session before clearing. This enables the orchestrator to manage Claude Code sessions correctly.
   ```

3. **Update section 17 (Manifest Reference)** (~line 242-281) — Add `notifications` and `preflight` to "What it tracks":
   ```
   - **Notifications**: structured events for the orchestrator to forward to Telegram (escalations, completions)
   - **Pre-flight**: credential verification status and timestamp
   ```
   Add to "Which commands write what" table:
   ```
   | `/preflight` | Writes `preflight` entry, writes `notifications` for missing credentials |
   | `/commit` | Also writes `notifications` (phase_complete) |
   ```

4. **Update section 18 (Failure Intelligence Reference)** (~line 283-341) — Update `partial_execution` max retries from 0 to 1. Update `prd_gap` to reflect autonomous assumption behavior. Add the notifications manifest section documentation.

5. **Add new section 19: Pre-Flight & Credential Management** — Insert after section 18, before `## Process to Follow:`:
   ```markdown
   19. **Pre-Flight & Credential Management** (for projects using PIV loop)
       - Document the `/preflight` command and its role in the autonomous workflow
       - Explain that all credentials are verified BEFORE autonomous execution begins
       - Document the notification mechanism for mid-execution credential failures
       - Include the pre-flight manifest entry format
   ```

6. **Add new section 20: Orchestrator Interface** — Insert after section 19:
   ```markdown
   20. **Orchestrator Interface** (for projects using PIV loop with autonomous orchestration)
       - Document the command execution sequence the orchestrator follows
       - Document context window pairings (which commands share a session)
       - Document the manifest as the sole decision interface:
         - `next_action` → what to run next
         - `failures` → error state and retry eligibility
         - `notifications` → events to forward to Telegram
         - `preflight` → whether credentials are verified
       - Document the orchestrator's core loop:
         1. Read manifest `next_action`
         2. Start Claude Code session (CLAUDE.md loads automatically)
         3. Run `/prime` + recommended command
         4. Session ends, read manifest
         5. If `notifications` has `blocking: true` → pause, notify human, wait
         6. If all phases complete → notify human, stop
         7. Otherwise → repeat from step 1
   ```

---

### Step 10: /create-prd — Remove hook toggle, hooks always on

**File**: `.claude/commands/create-prd.md` (477 lines → ~475 lines)

**Changes:**

1. **Update Hook Toggle section** (~line 65-67) — Replace conditional hooks logic:
   ```markdown
   ## Hooks

   Hooks are always enabled. `## PIV-Automator-Hooks` is appended to the PRD file after generation.
   Strip `--no-hooks` and `--with-hooks` from arguments if present (ignored — hooks are always on).
   ```

2. **Update PIV-Automator-Hooks section** (~line 452-465) — Remove the "If hooks are enabled" conditional. Always append hooks.

---

### Step 11: Update spec document — Write Phase 3 design

**File**: `.development/framework-autonomy-upgrade-spec.md` (441 lines → ~560 lines)

**Changes:**

1. **Update Phase Overview table** (~line 12-17) — Change Phase 3 status:
   ```
   | **Phase 3** | Autonomous Operation | 🟢 Complete | The orchestrator's hands — self-reasoning, credential pre-flight, traceability, orchestrator interface |
   ```

2. **Replace Phase 3 placeholder section** (~line 411-426) — Write full Phase 3 design documentation covering:
   - Problem statement: Commands have human checkpoints incompatible with autonomous operation
   - Design decisions made (numbered, same format as Phase 1 + 2):
     1. No mode toggles — this framework is autonomous-only
     2. Self-reasoning replaces human validation in `/plan-feature` (two-pass + sub-agent critic)
     3. Tier 3 tests always auto-approved — credentials verified by `/preflight` upfront
     4. `partial_execution` gets 1 auto-retry (auto-rollback + re-execute)
     5. `prd_gap` becomes non-blocking — agent assumes with documented reasoning
     6. `integration_auth` is always blocking — agent cannot fix credentials
     7. Hooks enabled by default — orchestrator's data feed
     8. Agent Teams is preferred mode for all parallelizable commands
     9. Manifest `notifications` section enables orchestrator → Telegram communication
     10. `/preflight` command verifies all credentials before autonomous loop begins
     11. Traceability audit in `/validate-implementation` verifies completeness before commit
     12. Context window pairings documented in CLAUDE.md PIV Configuration
     13. Orchestrator interface specification defined as documentation
     14. Notification lifecycle managed by orchestrator, not framework
   - **Scope change rationale**: The original Phase 3 concept ("Completeness & Input") included agent brief format and cost estimation. These were dropped during design:
     - Agent brief format was dropped because PRD creation stays conversational (via Telegram). The user explicitly wants human-in-the-loop PRD creation — a structured YAML brief doesn't serve that.
     - Cost estimation was deferred as non-essential for the autonomous loop. The orchestrator pre-authorizes all API costs when the user validates the PRD.
     - Cross-phase traceability was retained and built into `/validate-implementation` as the completeness audit.
   - Commands changed (summary table)
   - New `/preflight` command specification
   - Orchestrator interface contract
   - End-to-end autonomous scenario walkthrough

3. **Update Implementation Order diagram** (~line 430-441):
   ```
   Phase 1: State Awareness      ← 🟢 COMPLETE
       ↓
   Phase 2: Failure Intelligence  ← 🟢 COMPLETE
       ↓
   Phase 3: Autonomous Operation  ← 🟢 COMPLETE
       ↓
   Autonomous Orchestrator        ← Build AFTER all 3 phases are in the framework
   ```

---

## Manifest Schema Additions

```yaml
preflight:
  status: passed | blocked
  completed_at: [ISO 8601]
  credentials_verified: [N]
  technologies_checked: [list]

notifications:
  - timestamp: [ISO 8601]
    type: escalation | info | completion
    severity: warning | critical | info
    category: [error taxonomy category or "phase_complete"]
    phase: [N]
    details: "[human-readable description]"
    blocking: [true|false]
    action_taken: "[what the agent did or is waiting for]"
    acknowledged: [true|false]  # set by orchestrator after forwarding to Telegram

settings:
  profile_freshness_window: 7d
  mode: autonomous
  reasoning_model: opus-4-6
  validation_mode: full
  agent_teams: prefer_parallel
```

---

## Shared Conventions (all commands)

1. Hooks are always enabled — remove all conditional checks and `--with-hooks`/`--no-hooks` flag handling (Step 0)
2. Agent Teams is the preferred execution mode — sequential is the fallback
3. No human checkpoints except during `/create-prd` (which is used via Telegram before the autonomous loop)
4. All Tier 3 API tests are auto-approved — costs are pre-authorized
5. Write notifications to manifest for any event the orchestrator should forward to Telegram
6. Credential failures (`integration_auth`) are always blocking — the agent cannot fix credentials
7. PRD gaps are non-blocking — the agent makes assumptions with documented reasoning
8. `partial_execution` gets one auto-retry before escalating
9. Context window management follows the documented pairings in CLAUDE.md
10. Notification lifecycle: framework appends, orchestrator manages. Commands never delete or acknowledge notifications — only the orchestrator sets `acknowledged: true` after forwarding to Telegram
11. Manifest writes: always read before writing, merge keys, never replace sections. Existing Phase 1/2 data must be preserved

---

## Files Modified (summary)

| File | Lines Added | Complexity | Step |
|------|------------|------------|------|
| `CLAUDE.md` | ~65 | Medium | 0, 1 |
| `.claude/commands/plan-feature.md` | ~45 | High | 0, 2 |
| `.claude/commands/validate-implementation.md` | ~70 | High | 0, 3 |
| `.claude/commands/prime.md` | ~20 | Low-Medium | 0, 4 |
| `.claude/commands/execute.md` | ~11 | Medium | 0, 5 |
| `.claude/commands/research-stack.md` | ~8 | Low | 0, 6 |
| `.claude/commands/commit.md` | ~14 | Low | 0, 7 |
| `.claude/commands/preflight.md` | ~120 (NEW) | Medium | 8 |
| `.claude/commands/create_global_rules_prompt.md` | ~72 | Medium | 0, 9 |
| `.claude/commands/create-prd.md` | ~-2 | Low | 0, 10 |
| `.claude/commands/orchestrate-analysis.md` | ~-3 | Trivial | 0 |
| `.development/framework-autonomy-upgrade-spec.md` | ~120 | Medium | 11 |

---

## Verification

After implementation, test the full workflow mentally:

1. **Hook cleanup**: Every command file in `.claude/commands/` → no `--with-hooks`/`--no-hooks` parsing, no "If Enabled" conditionals on hooks output
2. **CLAUDE.md consistency**: Read CLAUDE.md end-to-end → no references to human checkpoints, hook toggles, manual mode, or `--full` flag. Principles, Section 11, Section 12, and Section 13 all reflect autonomous operation
3. **Self-reasoning**: `/plan-feature` on a PRD phase → should generate recommendations, self-validate against PRD criteria, proceed without waiting for human input
4. **Sub-agent critic**: Complex multi-technology decision → should spawn Task tool sub-agent for adversarial review
5. **PRD gap handling**: Missing detail in PRD → should assume with reasoning, document in NOTES, continue (not halt)
6. **Tier 3 auto-approve**: `/validate-implementation` → should execute all Tier 3 tests automatically, save fixtures, no approval prompt
7. **Traceability audit**: After scenario validation → should build US → SC → task → validation matrix, flag broken links
8. **Completeness gate**: If audit finds untested scenario → should report phase as `partial`, NOT proceed to commit
9. **Pre-flight**: `/preflight` with missing API key → should report BLOCKED, write blocking notification, wait
10. **Pre-flight pass**: `/preflight` with all credentials → should report READY, write manifest entry
11. **Prime reads preflight**: `/prime` after successful preflight → should NOT recommend `/preflight` again. `/prime` before preflight → should recommend `/preflight` as priority 0
12. **Partial execution retry**: `/execute` fails partway → should auto-rollback to checkpoint, manifest recommends retry. Second failure → blocking escalation
13. **Notifications lifecycle**: `/commit` writes `phase_complete` notification → orchestrator reads, forwards to Telegram, sets `acknowledged: true` → next `/prime` skips it
14. **Hooks always on**: Every command → should append PIV-Automator-Hooks without conditional checks
15. **Context pairings**: CLAUDE.md PIV Configuration → should document which commands share a session
16. **Orchestrator interface**: Generated CLAUDE.md (via `/create_global_rules_prompt`) → should include full orchestrator interface specification
17. **Settings merge**: Manifest `settings` section → should contain both `profile_freshness_window: 7d` (Phase 1) and new autonomous settings (Phase 3) without overwriting
