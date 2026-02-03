---
description: "Intelligent post-implementation validation with subagent coordination"
argument-hint: [plan-file-path]
---

# Validate Implementation

## Overview

Validates implemented features from the user's perspective. Coordinates specialized subagents to test tools, workflows, integrations, and error handling. Produces actionable reports with fix suggestions.

**Philosophy**: Code tests (lint, pytest) validate code runs. This command validates the feature *works* - from a user's perspective.

## Arguments

**Plan file**: `$ARGUMENTS`
- If provided: Use specified plan file
- If empty: Use most recent `.md` file in `.agents/plans/`

---

## Orchestration Phases

| Phase | Agent(s) | Purpose |
|-------|----------|---------|
| 0 | Orchestrator | Load context from PRD/plan |
| 1 | Tool Validator + Mock Generator | Test tools, create mocks (parallel) |
| 2 | Workflow Validator | Test user story paths |
| 3 | Integration Tester | Test real services |
| 4 | Error Path Tester | Test failure handling |
| 5 | Orchestrator | Synthesize report |

---

## Phase 0: Context Loading

### Step 1: Locate Plan File

```bash
# If $ARGUMENTS provided, use it
# Otherwise, find most recent plan:
ls -t .agents/plans/*.md | head -1
```

### Step 2: Read Plan

Extract from the plan file:
- **Feature description**: What was built
- **User story**: Who benefits and how
- **Acceptance criteria**: What must be verified
- **Tools implemented**: List of tools/functions added
- **Workflows added**: User-facing paths through the feature
- **Validation Strategy section**: If present, use as primary test guide

### Step 3: Read PRD Phase (If Available)

Check for PRD at `.agents/PRD.md` or `PRD*.md` in project root:
- Identify phase from plan or PRD "Current Focus"
- Extract user stories (US-XXX) for this phase
- Extract acceptance criteria per story
- Extract Agent Validation Profile if present (services, workflows, error scenarios)

### Step 4: Output Context Summary

```
## Validation Context

**Feature**: [Name from plan]
**Plan**: [Path to plan file]
**PRD Phase**: [N - Name] (or "No PRD found")
**User Stories**: US-XXX, US-XXX (or "From plan only")

### Tools to Test
| Tool | Expected Behavior |
|------|-------------------|
| [Tool name] | [What it should do] |

### Workflows to Test
| Workflow | User Story | Path |
|----------|------------|------|
| [Name] | US-XXX | [Steps] |

### Acceptance Criteria
- [ ] [Criterion from plan/PRD]
- [ ] [Criterion from plan/PRD]

### Detected Services
[Output from Service Auto-Detection]

---
Context loaded. Proceeding to validation phases...
```

---

## Service Auto-Detection

### Detection Process

**Priority Order:**

1. **Check `.agents/services.yaml`** (manual override)
   ```bash
   cat .agents/services.yaml 2>/dev/null
   ```

2. **Scan `.env` file** for service patterns
   ```bash
   grep -E "^[A-Z_]*(API_KEY|URL|TOKEN|SECRET|DATABASE)" .env 2>/dev/null
   ```
   Patterns: `*_API_KEY`, `*_URL`, `*_TOKEN`, `DATABASE_URL`, `OPENAI_*`, `ANTHROPIC_*`, `SUPABASE_*`

3. **Scan imports** for service SDKs
   ```bash
   grep -rh "import.*openai\|from openai\|import.*supabase\|from supabase\|import.*anthropic" --include="*.py" --include="*.ts" --include="*.js" 2>/dev/null | head -10
   ```

### Detection Output

```
## Detected Services

| Service | Source | Auth Env Var | Status |
|---------|--------|--------------|--------|
| OpenAI | .env | OPENAI_API_KEY | ⚪ Pending |
| Supabase | import | SUPABASE_URL | ⚪ Pending |
| Custom API | services.yaml | MY_API_KEY | ⚪ Pending |

[If no services found]: "No external services detected. Skipping Phase 3 (Integration Testing)."
```

---

## Subagent: Tool Validator

**Spawn using Task tool with this prompt:**

```
You are a Tool Validator for: [Feature Name]

## Context
[Insert relevant context from Phase 0]

## Tools to Test
[List from context with expected behavior]

## Your Process

For EACH tool:

1. **Test Valid Inputs (Happy Path)**
   - Construct realistic valid inputs based on expected usage
   - Execute the tool
   - Verify output matches expected behavior

2. **Test Invalid Inputs**
   - Missing required parameters
   - Wrong types (string where number expected)
   - Out-of-range values

3. **Test Edge Cases**
   - Empty strings, null values
   - Very large inputs
   - Unicode/special characters
   - Boundary conditions

## Output Format

For each tool, report:

### [Tool Name]
**Status**: 🟢 Pass | 🟡 Partial | 🔴 Fail

**Valid Input Tests:**
- ✅ [Test case]: [Result]
- ✅ [Test case]: [Result]

**Invalid Input Tests:**
- ✅ Handles missing param: Returns helpful error
- ❌ Type error not caught: Crashes instead of error message

**Edge Cases:**
- ⚠️ Empty string: [Unexpected behavior]
- ✅ Large input: Handled correctly

**Issues Found:**
1. [Issue description]
   **Where**: [File:line if identifiable]
   **Fix**:
   ```[lang]
   [Suggested code fix]
   ```

---
Return your complete tool validation report.
```

---

## Subagent: Mock Generator

**Spawn using Task tool with this prompt:**

```
You are a Mock Generator for: [Feature Name]

## Services Detected
[List from Service Auto-Detection]

## Your Process

For EACH detected service:

1. **Analyze Integration Code**
   - Find where service is called in codebase
   - Identify response schemas from type hints or actual usage
   - Note error handling patterns

2. **Generate Mock Scenarios**
   Create these scenarios for each service:
   - `success`: Typical successful response
   - `empty`: Valid but empty response (empty array, null data)
   - `error_400`: Bad request response
   - `error_401`: Unauthorized response
   - `error_403`: Forbidden response
   - `error_404`: Not found response
   - `error_500`: Server error response
   - `timeout`: Simulated timeout
   - `malformed`: Invalid JSON or unexpected structure

3. **Save Mocks**
   Write to `.agents/mocks/[service-name].json`:
   ```json
   {
     "service": "[name]",
     "scenarios": {
       "success": { ... },
       "empty": { ... },
       "error_400": { "status": 400, "body": { "error": "..." } },
       ...
     }
   }
   ```

## Output Format

### Mock Summary

| Service | Scenarios Generated | File |
|---------|--------------------:|------|
| OpenAI | 9 | `.agents/mocks/openai.json` |
| Supabase | 9 | `.agents/mocks/supabase.json` |

**Notes:**
- [Any observations about response schemas]
- [Any missing type information]

---
Create the mock files and return your summary.
```

---

## Subagent: Workflow Validator

**Spawn using Task tool with this prompt:**

```
You are a Workflow Validator for: [Feature Name]

## User Stories to Test
[List with acceptance criteria from Phase 0]

## Available Mocks
[List from Mock Generator output]

## Your Process

For EACH user story:

1. **Map Workflow Paths**
   - Identify the happy path (main success flow)
   - Identify decision points where flow can branch
   - Identify error paths (what happens when things fail)

2. **Test Happy Path**
   - Walk through each step
   - Verify state changes correctly
   - Check final outcome matches acceptance criteria

3. **Test Error Paths**
   - Use mocks to simulate failures
   - Verify graceful degradation
   - Check error messages are helpful

4. **Verify Acceptance Criteria**
   - Check each criterion explicitly
   - Mark as verified or failed

## Output Format

### US-XXX: [Story Title]

**Status**: 🟢 Pass | 🟡 Partial | 🔴 Fail

**Happy Path:**
```
Step 1: [Action] → ✅ [Result]
Step 2: [Action] → ✅ [Result]
Step 3: [Action] → ⚠️ [Unexpected but not failure]
Final: [Outcome]
```

**Error Paths:**
- ✅ Service unavailable: Shows retry message
- ❌ Invalid input: Crashes (should show validation error)
- ✅ Auth failure: Redirects to login

**Acceptance Criteria:**
- [x] User can [action] - Verified
- [ ] System handles [case] - **FAILED**: [What actually happens]

**Issues Found:**
1. [Issue]: [Description]
   **Fix**: [Suggested approach]

---
Return your complete workflow validation report.
```

---

## Subagent: Integration Tester

**Spawn using Task tool with this prompt:**

```
You are an Integration Tester for: [Feature Name]

## Services to Test
[List from detection with auth env vars]

## Your Process

For EACH service:

1. **Verify Credentials**
   - Check env var exists: `echo $VAR_NAME | head -c 5`
   - Verify non-empty (first 5 chars only for security)

2. **Test Authentication**
   - Make minimal API call that verifies auth works
   - Examples: OpenAI `/models`, Supabase health check

3. **Test Operations**
   - **Read**: Fetch data that should exist
   - **Write**: Create test data (if safe), then clean up
   - Skip destructive operations

4. **Handle Issues Gracefully**
   - Rate limits: Log warning, don't fail
   - Unavailable: Note as "Mock Only", continue
   - Auth failure: Log as critical issue

## Output Format

### [Service Name]

**Status**: 🟢 Connected | 🟡 Mock Only | 🔴 Failed

**Credential Check:**
- Env var `[VAR]`: ✅ Present | ❌ Missing

**Authentication:**
- ✅ Auth successful | ❌ Auth failed: [Error]

**Operations:**
| Operation | Status | Notes |
|-----------|--------|-------|
| Read | ✅/❌/⚪ | [Details] |
| Write | ✅/❌/⚪ | [Details or "Skipped"] |

**Issues:**
- [Issue]: [Description and fix]

---
Return your complete integration test report.
```

---

## Subagent: Error Path Tester

**Spawn using Task tool with this prompt:**

```
You are an Error Path Tester for: [Feature Name]

## Error Scenarios to Test
[From PRD Agent Validation Profile or inferred from feature]

## Available Mocks
[Error scenario mocks from Mock Generator]

## Your Process

Test these error categories:

1. **Service Unavailable**
   - Simulate timeout/connection failure
   - Does the system degrade gracefully?
   - Is the user informed appropriately?

2. **Invalid Input**
   - Malformed data, wrong types
   - Are errors caught before hitting services?
   - Are error messages helpful?

3. **Authentication Failures**
   - Expired tokens, invalid credentials
   - Is the user directed to re-authenticate?
   - Are failures logged appropriately?

4. **Rate Limiting**
   - 429 responses
   - Is there backoff logic?
   - Does the system eventually succeed?

5. **Unexpected Responses**
   - Malformed JSON
   - Missing expected fields
   - Does the system handle gracefully?

## Output Format

### Error Handling Summary

**Overall**: 🟢 Robust | 🟡 Gaps | 🔴 Fragile

| Category | Status | Details |
|----------|--------|---------|
| Service Unavailable | ✅/❌ | [How it handles] |
| Invalid Input | ✅/❌ | [How it handles] |
| Auth Failures | ✅/❌ | [How it handles] |
| Rate Limits | ✅/❌ | [How it handles] |
| Malformed Response | ✅/❌ | [How it handles] |

### Unhandled Errors

1. **[Error Type]**
   - **What Happens**: [Current behavior]
   - **Expected**: [What should happen]
   - **Fix**:
   ```[lang]
   [Suggested code]
   ```

---
Return your complete error path test report.
```

---

## Orchestration Execution

### Execution Flow

```
Phase 0: Context Loading
    │
    ├── Read plan file
    ├── Read PRD (if exists)
    ├── Detect services
    └── Output context summary
    ↓
Phase 1: Tool Validator + Mock Generator (PARALLEL)
    │
    ├── Spawn Tool Validator → tool-report
    └── Spawn Mock Generator → mocks created
    ↓
Phase 2: Workflow Validator (needs mocks)
    │
    └── Spawn with mocks → workflow-report
    ↓
Phase 3: Integration Tester (skip if no services)
    │
    └── Spawn with services → integration-report
    ↓
Phase 4: Error Path Tester (needs mocks)
    │
    └── Spawn with mocks → error-report
    ↓
Phase 5: Report Synthesis
    │
    ├── Combine all reports
    ├── Write to file
    └── Output terminal summary
```

### Progress Output

Display and update throughout execution:

```
## Validation Progress

⚪ Phase 0: Context Loading
⚪ Phase 1: Tool + Mock Validation
⚪ Phase 2: Workflow Validation
⚪ Phase 3: Integration Testing
⚪ Phase 4: Error Path Testing
⚪ Phase 5: Report Synthesis
```

Update status as each phase executes:
- 🟡 In progress
- 🟢 Complete
- 🔴 Failed (but continue to next phase)

### Error Handling

If a subagent fails or times out:
1. Log the error in progress output
2. Mark phase as 🔴 Failed
3. Continue to next phase
4. Note partial results in final report

---

## Phase 5: Report Synthesis

### Report File Location

`.agents/validation/{feature-name}-validation-{YYYY-MM-DD}.md`

Example: `.agents/validation/intelligent-validation-validation-2026-02-03.md`

### Report Structure

```markdown
# Validation Report: [Feature Name]

**Date**: [YYYY-MM-DD]
**Plan**: [path/to/plan.md]
**PRD Phase**: [N - Name] (or "No PRD")

---

## Executive Summary

**Overall Status**: 🟢 Ready | 🟡 Issues Found | 🔴 Critical Failures

| Category | Status | Issues |
|----------|--------|--------|
| Tools | 🟢/🟡/🔴 | X issues |
| Workflows | 🟢/🟡/🔴 | X issues |
| Integrations | 🟢/🟡/🔴 | X issues |
| Error Handling | 🟢/🟡/🔴 | X issues |

---

## Acceptance Criteria Verification

- [x] [Criterion] - Verified by [which test]
- [ ] [Criterion] - **FAILED**: [reason]

---

## Tool Validation Results

[Insert Tool Validator output]

---

## Workflow Validation Results

[Insert Workflow Validator output]

---

## Integration Test Results

[Insert Integration Tester output]

---

## Error Handling Results

[Insert Error Path Tester output]

---

## Issues & Recommended Fixes

### Critical (Must Fix)

1. **[Issue Title]**
   - **Category**: [Tool/Workflow/Integration/Error Handling]
   - **Description**: [What's wrong]
   - **Impact**: [Why it matters]
   - **Fix**:
   ```[lang]
   [Code suggestion]
   ```

### Warnings (Should Fix)

1. **[Issue]**: [Brief description and fix]

### Notes (Consider)

- [Observation or suggestion]

---

## Next Steps

- [ ] Fix critical issues listed above
- [ ] Re-run validation: `/validate-implementation [plan-path]`
- [ ] Once all 🟢: Ready for `/commit`

---

## Validation Metadata

- **Duration**: [X minutes]
- **Subagents Used**: Tool Validator, Mock Generator, Workflow Validator, Integration Tester, Error Path Tester
- **Mocks Generated**: [List files]
- **Archon Available**: Yes/No
```

### Terminal Summary

After writing the report, output:

```
## Validation Complete

**Report**: `.agents/validation/[filename].md`

### Results Summary

| Category | Status | Details |
|----------|--------|---------|
| Tools | 🟢 5/5 passed | All tools working |
| Workflows | 🟡 3/4 passed | US-002 error path missing |
| Integrations | 🟢 2/2 connected | OpenAI, Supabase OK |
| Error Handling | 🔴 2 unhandled | Timeout, malformed |

### Critical Issues

1. [Brief issue] - Fix in [file]
2. [Brief issue] - Fix in [file]

### Action Required

[If critical issues]: Fix issues above, then re-run `/validate-implementation`
[If only warnings]: Review warnings, then proceed to `/commit`
[If all green]: Ready for `/commit`
```

---

## Archon Integration (Optional)

### Check Availability

At start of validation, check if Archon MCP is available:

```
mcp__archon__rag_get_available_sources()
```

If error: Log "Archon MCP not available - continuing without RAG support" and skip Archon features.

### During Integration Testing

If Archon available, query for service documentation:

```
mcp__archon__rag_search_knowledge_base(query="[service] API authentication")
mcp__archon__rag_search_code_examples(query="[service] error handling patterns")
```

Use results to inform testing approach.

### After Validation

If Archon available, log validation results:

```
mcp__archon__manage_task("create",
  title="Validation: [Feature Name]",
  description="[Summary of results]",
  status="done" if all_green else "review"
)
```

### Fallback Behavior

If Archon unavailable at any point:
- Continue without RAG queries
- Skip result logging
- Note in report: "Archon integration: Not available"

---

## Usage

```bash
# Validate specific plan
/validate-implementation .agents/plans/my-feature.md

# Validate most recent plan
/validate-implementation
```

### Typical Workflow

```
/execute [plan]                    # Implement the feature
    ↓
/validate-implementation [plan]    # Validate it works
    ↓
[Fix any issues found]
    ↓
/validate-implementation [plan]    # Re-validate
    ↓
/commit                            # Ship it
```

---

## Completion Criteria

Validation is complete when:
- [ ] Context loaded from plan (and PRD if available)
- [ ] Services detected (or noted as none)
- [ ] All subagent phases executed (or failed gracefully)
- [ ] Report written to `.agents/validation/`
- [ ] Summary output to terminal
- [ ] Next steps clearly stated

---

## Error Reference

| Error | Cause | Resolution |
|-------|-------|------------|
| "Plan not found" | Path incorrect or no plans exist | Check path, or run `/plan-feature` first |
| "No PRD phase found" | PRD missing or phase not identified | Validates from plan only (acceptable) |
| "Service auth failed" | Missing or invalid credentials | Check `.env` for required API keys |
| "Subagent timeout" | Complex validation taking too long | Check report for partial results |
| "Mock generation failed" | Can't analyze service responses | Check service integration code for types |

---

## Notes

### Design Decisions

1. **Single file with inline prompts**: Self-contained and portable to other projects
2. **Parallel Phase 1**: Tool Validator and Mock Generator have no dependencies
3. **Sequential Phases 2-4**: Each needs results from previous phases
4. **Graceful degradation**: Failures don't stop validation, just note in report
5. **Fix suggestions**: MVP suggests code, doesn't auto-apply
6. **Optional Archon**: Enhances validation if available, works without it

### When to Use This Command

- After `/execute` completes a feature
- Before `/commit` to verify quality
- When debugging unexpected behavior
- To document what works (and what doesn't)

### What This Validates vs. What It Doesn't

**Validates:**
- Tools work with various inputs
- Workflows complete successfully
- Services are reachable
- Errors are handled

**Does NOT validate:**
- Performance/load characteristics
- Security vulnerabilities
- UI/UX quality
- Code style (use lint for that)
