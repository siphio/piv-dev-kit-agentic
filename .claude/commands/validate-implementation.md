---
description: "Scenario-based agent validation that tests all user flows, capabilities, and error paths"
argument-hint: [plan-file-path] [--full]
---

# Validate Implementation: Scenario-Based Agent Validation

## Overview

**Goes beyond code health checks.** Tests every user flow, tool capability, decision tree, and error recovery path defined in the PRD. Validates that the agent behaves correctly across all scenarios, not just that the code compiles.

**Three validation sources:**
1. **Plan file** → VALIDATION COMMANDS section (code-level checks)
2. **PRD Section 4.3** → Scenario definitions (agent behavior checks)
3. **Technology profiles** → Validation hooks from `.agents/reference/` (integration checks)

**Philosophy**: Static analysis tells you code *looks* right. Functional testing proves it *runs*. Scenario validation proves the agent *behaves correctly*.

## Live Testing Mandate

**Code review is NOT validation.** Reading source code to verify logic paths match the PRD is static analysis — it belongs in Phase 1 (max 5 minutes). It does NOT satisfy Phase 3 or Phase 4.

**Rules:**
1. Every technology profile with Section 9 tests MUST have those tests EXECUTED (not reviewed)
2. Every PRD scenario MUST be exercised by running actual commands, not by tracing code paths
3. If zero live tests are executed across all tiers, validation status = FAIL regardless of other results
4. "Verified via code review" is NEVER an acceptable result for Tier 1-4 or scenario validation
5. The validation report MUST include a `live_tests_executed` count — if this count is 0, the report is invalid

**What counts as a live test:**
- Running a command and checking its exit code
- Making an API call and checking the response
- Starting a process and sending it input
- Executing pytest tests that make real network calls (not mocked)

**What does NOT count:**
- Reading a source file and confirming it matches a pattern
- Tracing a code path manually through imports
- Confirming a function signature matches a type definition
- Reviewing test files without executing them

## Arguments

- `$ARGUMENTS`: Plan file path (optional, defaults to most recent in `.agents/plans/`)

**Always runs all levels**: Level 1 (syntax) + Level 2 (components) + Level 3 (scenarios + live integration) + Level 4 (full pipeline end-to-end).

## Reasoning Approach

**CoT Style:** Per-subtask (one per validation level/scenario category)

For each validation level:
1. Load the relevant source (plan commands, PRD scenarios, technology profiles)
2. Determine what to test and expected outcomes
3. Execute tests and capture results
4. Compare actual vs expected outcomes
5. Classify: PASS / FAIL / PARTIAL / SKIPPED

For scenario validation specifically:
1. Map scenario Given/When/Then to executable steps
2. Determine integration tier (live vs fixture vs mock)
3. Execute and verify each assertion
4. Document deviations with specific details

## Hooks

Hooks are always enabled. `## PIV-Automator-Hooks` is appended to the validation report file.

Strip `--full` from arguments if present (ignored — validation always runs full). Use remaining text as plan path.

---

## Architecture

```
Phase 0: Context Loading
    │
    ├── Read plan file → Extract VALIDATION COMMANDS
    ├── Read PRD → Extract Section 4.3 Scenario Definitions
    ├── Read PRD → Extract Section 4.4 Error Recovery Patterns
    └── Read technology profiles → Extract Validation Hooks (Section 9)

Phase 1: Static Analysis (Quick)
    │
    └── Brief code review for obvious issues

Phase 2: Code Validation
    │
    ├── Level 1: Syntax/lint/type checks
    └── Level 2: Unit + component tests

Phase 3: Scenario Validation ← THE KEY PHASE
    │
    ├── Test each PRD scenario (Section 4.3)
    ├── Test decision tree outcomes (Section 4.2)
    ├── Test error recovery paths (Section 4.4)
    └── Test technology integration hooks

Phase 4: Full Pipeline (--full only)
    │
    └── End-to-end agent run with real/mock inputs
```

---

## Phase 0: Context Loading

### Step 1: Locate Plan

```bash
# If $ARGUMENTS provided (excluding flags), use it
# Otherwise find most recent:
ls -t .agents/plans/*.md 2>/dev/null | head -1
```

### Step 2: Load Validation Sources

**From Plan File:**
- Read `## VALIDATION COMMANDS` section → Parse into Levels 1-5
- Read `## ACCEPTANCE CRITERIA` section → Extract criteria list

**From PRD (if exists):**
- Read `## 4. Agent Behavior Specification`
- Extract Section 4.3: Scenario Definitions (all scenarios with Given/When/Then/Error/Edge)
- Extract Section 4.2: Decision Trees (expected decision outcomes)
- Extract Section 4.4: Error Recovery Patterns (expected recovery behaviors)

**From Technology Profiles (REQUIRED if `.agents/reference/` exists):**
- Check `.agents/reference/` for `*-profile.md` files
- If profiles exist: read Section 9 from EVERY profile. Extract ALL Tier 1-4 test definitions. These are MANDATORY test executions, not optional reading material.
- If profiles exist but lack Section 9: log warning, continue without tier tests for that technology
- If `.agents/reference/` does not exist: log warning in validation matrix, proceed with plan commands and PRD scenarios only
- **CRITICAL**: Technology profile Section 9 tests are the PRIMARY source for live integration testing. Plan VALIDATION COMMANDS are secondary. When both exist, execute BOTH.

**From Slice Context (monorepo mode, if plan metadata contains module/slice):**
- Read `context/modules/{module}/slices/{slice}/context.md`
- Extract Validation Gates section — these are PRIMARY pass criteria:
  - Each gate has: metric, target value, measurement method
  - Example: "Species matching accuracy >= 90%"
- Extract Infrastructure Requirements — verify provisioned
- Extract Error Handling table — verify implemented
- Build validation matrix from: plan VALIDATION COMMANDS + context.md validation gates

**Map validation gates to test execution:**
For each validation gate in context.md:
- Determine measurement method (test command, API call, metric query)
- Execute measurement
- Compare result against target
- Report: PASS (met or exceeded) / FAIL (below target)

### Step 3: Build Validation Matrix

Combine all sources into a validation matrix:

```
## Validation Starting

**Feature**: [Name from plan]
**Plan**: [path]
**PRD Available**: [Yes/No]
**Technology Profiles**: [list or "none"]

### Validation Commands (from Plan)
- Level 1 (Syntax): [N] commands
- Level 2 (Components): [N] commands

### Scenario Validation (from PRD Section 4.3)
- Happy path scenarios: [N]
- Error recovery scenarios: [N]
- Edge case scenarios: [N]
- Integration failure scenarios: [N]

### Technology Validation (from Profiles)
- Health checks: [N]
- Smoke tests: [N]

### Live Test Execution Budget
- Technology profile Tier 1 tests: [N] (MUST execute)
- Technology profile Tier 2 tests: [N] (MUST execute)
- Technology profile Tier 3 tests: [N] (MUST execute)
- Technology profile Tier 4 tests: [N] (fixture-based, MUST execute)
- Plan Level 3+ commands: [N] (MUST execute)
- PRD scenarios to exercise live: [N] (MUST exercise, not code-review)
- **Total live tests required: [SUM]**
- **Minimum live tests for PASS: [SUM] (zero tolerance — all must run)**

### Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]

---
Proceeding to validation...
```

---

## Phase 1: Static Analysis (Brief)

**Quick code review - max 5 minutes, max 10 tool calls**

Read up to 3 key files mentioned in the plan and check for:
- Missing error handling (especially for error recovery paths in PRD 4.4)
- Obvious bugs or unimplemented functions (TODO/FIXME)
- Decision tree logic that doesn't match PRD Section 4.2

Output brief findings before running tests.

---

## Phase 2: Code Validation

### Level 1: Syntax Validation

**Always run.** Execute each command from plan's Level 1:

```
Running: `[command]`
✅ PASS: `[command]` (exit code 0)
```
or
```
❌ FAIL: `[command]` (exit code 1)
Error: [error details]
```

**Stop validation if Level 1 fails** - no point testing broken code.

**On Level 1 failure:** Classify as `syntax_error`. Write to manifest `failures` section. Output `## PIV-Error` block:
```
## PIV-Error
error_category: syntax_error
command: validate-implementation
phase: [N]
details: "[which command failed and error output]"
retry_eligible: true
retries_remaining: [2 minus existing retry_count]
checkpoint: [active checkpoint tag or "none"]
```

### Level 2: Component Validation

**Always run.** Execute each command from plan's Level 2.

**Handle interactive commands:** Mark as "VERIFY MANUALLY"
**Handle timeouts:** 60 second timeout, mark as ⚠️ TIMEOUT

**On Level 2 failure:** Classify as `test_failure`. Write to manifest `failures` section. Output `## PIV-Error` block:
```
## PIV-Error
error_category: test_failure
command: validate-implementation
phase: [N]
details: "[which tests failed and error summary]"
retry_eligible: true
retries_remaining: [2 minus existing retry_count]
checkpoint: [active checkpoint tag or "none"]
```

---

## Phase 3: Live Integration Testing & Scenario Validation (MANDATORY)

> **THE CORE PHASE — MUST execute real tests, not review code.**
> Uses the four-tier testing classification from technology profiles (Section 9).
> Every test in this phase MUST be EXECUTED — running commands, making API calls, starting processes.
> Code review, source tracing, and "verified by reading" are PROHIBITED in this phase.
> If you find yourself reading source files instead of running commands, STOP and run the actual test.

### Step 1: Tier 1 — Auto-Live Health Checks (No Approval)

Execute ALL Tier 1 tests from every relevant technology profile automatically.
These are read-only, zero-cost operations that verify connectivity and auth.

```
### Tier 1: Live Integration Health Checks

[Technology Name]:
  Endpoint: GET /[endpoint]
  Running: [health check command from profile Section 9.1]
  Response: [actual response summary]
  Schema: [fields match / fields missing]
  ✅ HEALTHY | ❌ UNREACHABLE | ⚠️ AUTH FAILED

[Next Technology]:
  ...
```

**If Tier 1 fails for a technology:**
- Mark ALL scenarios depending on that technology as ⚠️ DEGRADED
- Continue with other technologies
- Attempt mock fallback for dependent scenarios if fixtures exist

**On auth failure (⚠️ AUTH FAILED):** Classify as `integration_auth`. Write to manifest `failures` section (max_retries: 0, immediate escalation). Output `## PIV-Error` block:
```
## PIV-Error
error_category: integration_auth
command: validate-implementation
phase: [N]
details: "[technology] authentication failed — credentials are a human problem"
retry_eligible: false
retries_remaining: 0
checkpoint: [active checkpoint tag or "none"]
```

### Step 2: Tier 2 — Auto-Live with Test Data (No Approval)

Execute ALL Tier 2 tests automatically using pre-defined test data from profiles.
These have controlled side effects with automatic cleanup.

```
### Tier 2: Live Tests with Test Data

[Technology Name] - [Operation]:
  Endpoint: POST /[endpoint]
  Test data: [summary of test input - e.g., "PIV_TEST_ prefixed campaign"]
  Response: [actual response]
  Schema valid: ✅ / ❌

  Cleanup: [DELETE /endpoint/{id}]
  Cleanup result: ✅ CLEANED | ❌ CLEANUP FAILED (manual cleanup needed)
```

**Test data sourcing:**
- Read test configuration from profile Section 9.1 (Tier 2 table)
- Environment variables (PIV_TEST_EMAIL, etc.) must be set in .env
- If env vars missing: FAIL validation with `integration_auth` error category. Missing test environment variables means credentials were not provisioned. Output PIV-Error block and escalate — do NOT skip silently.

**Cleanup is mandatory:** Always run cleanup procedures after Tier 2 tests, even if the test itself failed. Cleanup must be idempotent.

**On rate limit (429 status):** Classify as `integration_rate_limit`. Include backoff guidance in details. Write to manifest `failures` section. Output `## PIV-Error` block:
```
## PIV-Error
error_category: integration_rate_limit
command: validate-implementation
phase: [N]
details: "[technology] rate limited on [endpoint] — wait [backoff duration] and retry"
retry_eligible: true
retries_remaining: [3 minus existing retry_count]
checkpoint: [active checkpoint tag or "none"]
```

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

### Step 4: Tier 4 — Mock-Only Tests (Automatic)

Load fixtures for Tier 4 endpoints and feed responses into agent logic.
Tests that the agent correctly processes responses, not that the API works.

```
### Tier 4: Mock-Based Validation

[Technology Name] - [Operation]:
  Fixture: .agents/fixtures/[tech]-[endpoint].json
  Agent behavior: [what agent did with the fixture data]
  Decision tree: [which PRD 4.2 decision was triggered]
  Expected outcome: [from PRD]
  Actual outcome: [what happened]
  ✅ PASS | ❌ FAIL
```

**If fixture doesn't exist:**
- Run the corresponding Tier 3 live test FIRST to generate the fixture
- If Tier 3 test passes: save fixture, then run Tier 4 with the new fixture
- If Tier 3 test cannot run (no credentials, service down): mark as ⚠️ NO FIXTURE with explicit reason
- NEVER skip Tier 4 silently — always document why a fixture is missing

### Step 5: PRD Scenario Validation

Now test full agent scenarios from PRD Section 4.3 using the integration results from Steps 1-4.

For each scenario, the integration tier determines how it's tested:

```
### Scenario: [Name] (PRD 4.3)

Given: [Initial state from PRD]
APIs involved: [Technology A (Tier 1), Technology B (Tier 3)]
Integration status: [All APIs healthy / degraded / mocked]

When: [Trigger action]
Execute: [Command to trigger the agent workflow]

Then: [Expected outcome from PRD]
Verify: [Check output, state changes, API calls made]

Result: ✅ PASS | ❌ FAIL | ⚠️ PARTIAL (some APIs mocked)
Details: [What happened, which tiers were live vs mocked]
```

**On scenario mismatch (FAIL):** Classify as `scenario_mismatch`. Include PRD scenario reference in details. Write to manifest `failures` section. Output `## PIV-Error` block:
```
## PIV-Error
error_category: scenario_mismatch
command: validate-implementation
phase: [N]
details: "Scenario [SC-XXX] failed: expected [PRD expectation], got [actual result]"
retry_eligible: true
retries_remaining: [1 minus existing retry_count]
checkpoint: [active checkpoint tag or "none"]
```

**Scenario categories:**

**Happy paths** — Test with maximum live integration (Tiers 1-3 where approved):
- Agent receives real API responses and processes them correctly
- Verify full decision tree execution with real data shapes

**Error recovery** — Simulate errors using mocks even for live APIs:
- Override Tier 1/2 responses with error fixtures to test recovery
- Verify agent handles timeouts, rate limits, auth failures per PRD Section 4.4

**Edge cases** — Test with unusual inputs and boundary conditions:
- Feed edge case data to agent logic
- Verify graceful handling per PRD scenarios

### Step 6: Decision Tree Verification

For each decision tree in PRD Section 4.2, verify with real data where possible:

```
### Decision Tree: [Name] (PRD 4.2)

Data source: [Live Tier 1-3 response / Fixture / Mock]

| Condition | Expected Action | Actual Action | Data Source | Status |
|-----------|----------------|---------------|-------------|--------|
| [Condition A] | [Action A] | [What happened] | [Live/Fixture] | ✅/❌ |
| [Condition B] | [Action B] | [What happened] | [Live/Fixture] | ✅/❌ |
| [Failure] | [Recovery] | [What happened] | [Mock error] | ✅/❌ |
```

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

---

## Phase 4: Full Pipeline (MANDATORY)

**MUST run the complete end-to-end pipeline before validation can report PASS.**

This phase:
- Makes real API calls (costs are pre-authorized by autonomous mode)
- Takes several minutes — this is expected
- Creates actual output files
- **Is NOT optional** — skipping Phase 4 means validation status = PARTIAL at best

**What to run:** Use the plan's Level 4 commands if defined. If plan Level 4 is absent or only has `pytest`, construct an end-to-end test: start the application, send it real input, verify it produces expected output. For bots: start the bot, send a test command via the API, verify the response. For APIs: hit the endpoint with test data, verify the response. For CLIs: run the command with test args, verify output.

```
### Full Pipeline

Running: `[end-to-end command]`
⏳ Running... (this may take several minutes)
✅ PASS: Agent completed successfully

Verifying outputs...
Running: `[output verification command]`
✅ FOUND: [output file] ([size])
✅ VALID: [format/quality details]
```

### Output Verification

After running commands, verify expected outputs:
- Check output files exist and are valid
- For media files: verify format with ffprobe or similar
- For data files: verify schema and content
- For API responses: verify response structure

---

## Phase 5: Report

### Write Report File

Location: `.agents/validation/{feature-name}-{YYYY-MM-DD}.md`

```markdown
# Validation Report: [Feature Name]

**Date**: [YYYY-MM-DD]
**Mode**: Standard | Full
**Duration**: [X] minutes
**PRD Scenarios Tested**: [N] of [Total]

---

## Code Validation Results

### Level 1: Syntax
| Command | Status | Details |
|---------|--------|---------|
| `[command]` | ✅ PASS | No errors |

### Level 2: Components
| Command | Status | Details |
|---------|--------|---------|
| `[command]` | ✅ PASS | [N] tests |

---

## Scenario Validation Results

### Happy Paths
| Scenario (PRD Ref) | Status | Details |
|---------------------|--------|---------|
| [Name] (SC-001) | ✅ PASS | [Brief] |

### Error Recovery
| Scenario (PRD Ref) | Status | Details |
|---------------------|--------|---------|
| [Name] (SC-005) | ✅ PASS | [Brief] |

### Edge Cases
| Scenario (PRD Ref) | Status | Details |
|---------------------|--------|---------|
| [Name] (SC-010) | ✅ PASS | [Brief] |

### Decision Trees
| Decision (PRD 4.2) | Branches Tested | Pass | Fail |
|---------------------|-----------------|------|------|
| [Name] | [N] | [N] | [N] |

---

## Technology Integration (Four-Tier Results)

### Tier 1: Auto-Live Health Checks
| Technology | Endpoint | Status | Details |
|-----------|----------|--------|---------|
| [Name] | GET /[endpoint] | ✅ HEALTHY | [Response summary] |

### Tier 2: Auto-Live with Test Data
| Technology | Operation | Status | Cleanup | Details |
|-----------|-----------|--------|---------|---------|
| [Name] | POST /[endpoint] | ✅ PASS | ✅ CLEANED | [Brief] |

### Tier 3: Live Tests (Auto-Approved)
| Technology | Operation | Status | Fixture Saved |
|-----------|-----------|--------|---------------|
| [Name] | POST /[endpoint] | ✅ PASS | `.agents/fixtures/[file]` |

### Tier 4: Mock-Only
| Technology | Operation | Fixture Used | Agent Behavior | Status |
|-----------|-----------|-------------|----------------|--------|
| [Name] | POST /[endpoint] | `.agents/fixtures/[file]` | [Decision triggered] | ✅ PASS |

---

## Acceptance Criteria

- [x] [Criterion] - **VERIFIED** (Level/Scenario)
- [ ] [Criterion] - **NOT VERIFIED**

---

## Completeness Audit (Traceability)

> **Verifies that every user story is fully implemented and validated.** This is the autonomous agent's quality gate — it must pass before reporting a phase as complete.

### Traceability Matrix

| User Story | Scenarios | Plan Tasks | Executed | Validation Result |
|-----------|-----------|------------|----------|-------------------|
| US-001 | SC-001, SC-003 | Task 2, 5 | ✅/❌ | Pass/Fail/Not tested |
| US-002 | SC-002, SC-004 | Task 3, 7, 8 | ✅/❌ | Pass/Fail/Not tested |

**Sources:**
- User stories + scenario references: PRD Section 5
- Plan tasks: `.agents/plans/` for this phase
- Execution status: `.agents/progress/` files
- Validation results: Phase 3 scenario validation results from this run

### Gaps Identified

- **Untested scenarios**: [list or "none"]
- **Unexecuted tasks**: [list or "none"]
- **Orphan scenarios**: [list or "none"] (tested but not linked to any user story — warning only)
- **Missing coverage**: [list of user stories with zero passing scenarios, or "none"]

### Completeness Verdict

**Verdict**: [COMPLETE | INCOMPLETE]
**Gaps**: [list of broken links, or "none"]

*If INCOMPLETE: Phase is NOT done — report as `partial` in manifest. Do NOT proceed to `/commit`.*
*If COMPLETE: Phase is verified done — report as `pass` in manifest. Proceed to `/commit`.*

---

## Summary

**Overall**: 🟢 READY | 🟡 ISSUES | 🔴 BROKEN

| Category | Pass | Fail | Skip |
|----------|------|------|------|
| Syntax | [N] | [N] | [N] |
| Components | [N] | [N] | [N] |
| Happy Paths | [N] | [N] | [N] |
| Error Recovery | [N] | [N] | [N] |
| Edge Cases | [N] | [N] | [N] |
| Decision Trees | [N] | [N] | [N] |
| Tier 1 (Auto-Live) | [N] | [N] | [N] |
| Tier 2 (Test Data) | [N] | [N] | [N] |
| Tier 3 (Live) | [N] | [N] | [N] |
| Tier 4 (Mock) | [N] | [N] | [N] |
| Pipeline | [N] | [N] | [N] |
| Completeness | [N] | [N] | [N] |

---

## Issues Found

[List any failures with details and suggested fixes]

## Next Steps

[Based on results - ready for /commit or needs fixes]
```

### Live Test Execution Verification

> **CRITICAL — DO THIS BEFORE WRITING HOOKS OR REPORT SUMMARY.**
>
> The orchestrator reads `live_tests_executed` from the hooks block to enforce the live test gate.
> If this key is **missing or 0** and technology profiles exist, the orchestrator will **automatically re-run this entire validation session**.
> You MUST count your live tests and write the number — **do not skip this step**.

Count actual live tests by tallying each category:

```
### Live Execution Summary
- Tier 1 health checks executed: [N] (commands run with exit codes)
- Tier 2 test data operations executed: [N]
- Tier 3 live integration tests executed: [N]
- Tier 4 fixture-based tests executed: [N]
- Plan validation commands executed: [N]
- PRD scenarios exercised live: [N]
- **Total live tests executed: [N]**
- **Total live tests required: [N]**
```

Write these two numbers down — they MUST appear as `live_tests_executed` and `live_tests_required` as the **first two keys** in the `## PIV-Automator-Hooks` block at the end of the report.

**FAIL-SAFE**: If `Total live tests executed` is 0 and technology profiles exist, validation status MUST be FAIL. Output:

```
## PIV-Error
error_category: scenario_mismatch
command: validate-implementation
phase: [N]
details: "Zero live tests executed despite technology profiles defining [N] Tier 1-4 tests. Validation was static-only — this is not valid."
retry_eligible: true
retries_remaining: 1
checkpoint: [active checkpoint or "none"]
```

### Manifest Update

After writing the report file, update `.agents/manifest.yaml` (create if needed):
```yaml
validations:
  - path: .agents/validation/[feature-name]-[YYYY-MM-DD].md
    phase: [N]
    status: [pass|partial|fail]
    completed_at: [current ISO 8601 timestamp]
    live_tests_executed: [N]
    live_tests_required: [N]
    scenarios_passed: [N]
    scenarios_failed: [N]
    scenarios_skipped: [N]
phases:
  [N]: { ..., validation: [pass|partial|fail] }  # update validation status, preserve plan/execution
```
Read manifest before writing — merge, don't overwrite. Append to `validations` list (don't replace previous entries). Update `last_updated` timestamp.

### Terminal Summary

```
## Validation Complete

**Report**: `.agents/validation/[file].md`

### Code Validation
| Level | Results |
|-------|---------|
| Syntax | ✅ [N]/[N] passed |
| Components | ✅ [N]/[N] passed |

### Scenario Validation
| Category | Results |
|----------|---------|
| Happy Paths | ✅ [N]/[N] |
| Error Recovery | ✅ [N]/[N] |
| Edge Cases | ✅ [N]/[N] |
| Decision Trees | ✅ [N]/[N] branches |

### Technology Integration (Four Tiers)
| Tier | Results |
|------|---------|
| Tier 1 (Auto-Live) | ✅ [N]/[N] healthy |
| Tier 2 (Test Data) | ✅ [N]/[N] passed, [N]/[N] cleaned |
| Tier 3 (Approval) | ✅ [N] approved, [N] skipped, [N] fixture |
| Tier 4 (Mock) | ✅ [N]/[N] passed |

### Acceptance Criteria
✅ [N]/[N] verified

### Next Steps
→ Ready for `/commit` | Fix [N] issues first
```

### Reasoning

Output 4-8 bullets summarizing validation:

```
### Reasoning
- Tested [N] code validation commands (Level 1-2)
- Validated [N] PRD scenarios ([N] happy, [N] error, [N] edge)
- Verified [N] decision tree branches
- Technology integration: [N] Tier 1, [N] Tier 2, [N] Tier 3, [N] Tier 4
- Key finding: [most important result]
```

### Reflection

Self-critique the validation (terminal only):
- Did we achieve full scenario coverage from PRD Section 4.3?
- Are any decision tree branches untested?
- Were failure categories correctly identified?
- Is the recommended next step accurate given results?

### PIV-Automator-Hooks

> **MANDATORY**: `live_tests_executed` and `live_tests_required` MUST be the first two keys in this block.
> The orchestrator parses these values to enforce the live test gate. If either key is absent, the orchestrator
> treats the validation as static-only and re-runs the entire session. Write the values you computed in the
> Live Test Execution Verification section above.

Append to the validation report file:

```
## PIV-Automator-Hooks
live_tests_executed: [N]
live_tests_required: [N]
validation_status: [pass|partial|fail]
scenarios_passed: [N]/[Total]
scenarios_failed: [N]
decision_branches_tested: [N]/[Total]
failure_categories: [comma-separated: e.g. edge-cases,rate-limits]
suggested_action: [commit|re-execute|fix-and-revalidate]
suggested_command: [commit|execute|validate-implementation]
suggested_arg: "[appropriate argument]"
retry_remaining: [N]
requires_clear: [true|false]
confidence: [high|medium|low]
module: {module-name}
slice: {slice-id}
validation_gates_total: N
validation_gates_passed: N
```

**Orchestrator enforcement contract:** The orchestrator parses `live_tests_executed` from hooks. If the key is **absent**, the orchestrator falls back to parsing the validation report file directly to count live tests. If the extracted count is 0 AND technology profiles exist, the orchestrator rejects the validation and re-invokes `/validate-implementation` regardless of `validation_status`. Writing `live_tests_executed: 0` when no tests ran is honest; omitting the key entirely is the silent failure mode — both will trigger a re-run when profiles are present.

---

## Handling Failures

### If Level 1 fails:
Stop validation. Syntax errors must be fixed first.

### If Level 2 fails:
Continue to scenario validation — component failures don't always block scenario testing.

### If scenarios fail:
Document which scenarios failed and what the agent actually did vs. expected.
Provide specific guidance: "PRD says agent should retry 3 times, but agent only retries once."

### If technology integration fails:
Check if service is reachable. If not, attempt mock mode.
Document whether failure is agent code issue or external service issue.

---

## Handling Different Project Types

### Agent Projects (Claude SDK / Custom)
```bash
# Level 1: Syntax
pnpm exec tsc --noEmit
# Level 2: Components
pnpm test
# Level 3: Scenarios
pnpm exec tsx -e "import('./src/agent').then(a => a.handleScenario(...))"
# Level 4: Full pipeline
pnpm dev agent -u "..." -a "..."
```

### Python Agent Projects
```bash
# Level 1: Syntax
uv run ruff check .
# Level 2: Components
uv run pytest
# Level 3: Scenarios
uv run python -m agent.test_scenarios
# Level 4: Full pipeline
uv run python -m agent.main --input "..."
```

---

## Usage

```bash
# Full validation (all levels, all tiers, completeness audit)
/validate-implementation

# With specific plan
/validate-implementation .agents/plans/phase-2.md
```

---

## Completion Criteria

- [ ] Plan read and validation commands extracted
- [ ] PRD scenarios extracted (if PRD exists)
- [ ] Technology profiles read (if they exist)
- [ ] Level 1 commands executed (all must pass to continue)
- [ ] Level 2 commands executed (failures noted)
- [ ] Tier 1 auto-live health checks executed
- [ ] Tier 2 auto-live tests with test data executed + cleanup run
- [ ] Tier 3 tests auto-executed with results recorded
- [ ] Tier 4 mock-only tests executed with fixtures
- [ ] PRD scenario validation complete (happy paths, error recovery, edge cases)
- [ ] Decision tree verification complete
- [ ] Level 4 pipeline tested end-to-end
- [ ] Completeness audit passed (all user stories have passing scenarios)
- [ ] Report written with actual pass/fail results per tier
- [ ] Acceptance criteria verified against scenarios
- [ ] All PRD scenarios accounted for (tested or documented as untestable)
