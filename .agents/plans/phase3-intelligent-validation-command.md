# Feature: Intelligent Validation Command

Validate documentation and codebase patterns before implementing. Mirror existing command patterns in `.claude/commands/`.

## Feature Description

Create `/validate-implementation` - an orchestrator command that coordinates subagents to validate implemented features from the user's perspective. Tests tools, workflows, integrations, and error paths, then produces actionable reports.

## User Story

As an AI agent developer who just finished implementing a phase
I want to automatically validate everything works correctly
So that I have confidence the phase is truly complete

## Problem Statement

Current validation (lint, tests) validates code but not behavior. AI agents have complex workflows and service integrations that require human-like testing.

## Solution Statement

An orchestrator command that reads context (PRD/plan), spawns specialized subagents (Tool Validator, Mock Generator, Workflow Validator, Integration Tester, Error Path Tester), and synthesizes findings into a report with fix suggestions.

## Feature Metadata

**Type**: New Capability | **Complexity**: High
**Affected**: `.claude/commands/`, `.agents/validation/`
**Dependencies**: Claude Task tool, optional Archon MCP

---

## CONTEXT REFERENCES

### Files to Read Before Implementing

| File | Lines | Why |
|------|-------|-----|
| `.claude/commands/orchestrate-analysis.md` | 1-250 | Subagent coordination pattern |
| `.claude/commands/plan-feature.md` | 1-100 | Two-phase terminal/file output |
| `.claude/commands/execute.md` | 1-152 | Archon integration patterns |
| `.agents/services.yaml.template` | 1-50 | Service config schema |
| `PRD-intelligent-validation.md` | 233-270 | Subagent architecture |
| `CLAUDE.md` | 1-100 | Output standards, emojis |

### Files to Create

- `.claude/commands/validate-implementation.md` - Main command with inline subagent prompts
- `.agents/validation/.gitkeep` - Report output directory

### Patterns

**Frontmatter**: `---\ndescription: "..."\nargument-hint: [...]\n---`
**Status Emojis**: ⚪ Not Started | 🟡 In Progress | 🟢 Pass | 🔴 Fail
**Phase Execution**: Announce → Execute → Confirm output → Proceed
**Archon**: Check availability first, graceful fallback if unavailable

---

## STEP-BY-STEP TASKS

### Task 1: CREATE Command Skeleton

**File**: `.claude/commands/validate-implementation.md`

```markdown
---
description: "Intelligent post-implementation validation with subagent coordination"
argument-hint: [plan-file-path]
---

# Validate Implementation

## Overview
Validates implemented features from user perspective. Coordinates subagents to test tools, workflows, integrations, and error handling.

## Arguments
**Plan file**: `$ARGUMENTS` (or most recent in `.agents/plans/`)

## Orchestration Phases
| Phase | Agent(s) | Purpose |
|-------|----------|---------|
| 0 | Orchestrator | Load context from PRD/plan |
| 1 | Tool Validator + Mock Generator | Test tools, create mocks (parallel) |
| 2 | Workflow Validator | Test user story paths |
| 3 | Integration Tester | Test real services |
| 4 | Error Path Tester | Test failure handling |
| 5 | Orchestrator | Synthesize report |
```

**VALIDATE**: `head -20 .claude/commands/validate-implementation.md`

---

### Task 2: ADD Phase 0 - Context Loading

**PATTERN**: MIRROR `plan-feature.md:41-102`

```markdown
## Phase 0: Context Loading

### Step 1: Read Plan
- Extract: Feature description, user story, acceptance criteria
- Extract: Tools implemented, workflows added
- Extract: Validation Strategy section (if present)

### Step 2: Read PRD Phase
- Identify phase from plan or `.agents/PRD.md`
- Extract user stories (US-XXX)
- Extract acceptance criteria

### Step 3: Output Context Summary
```
## Validation Context
**Feature**: [Name]
**PRD Phase**: [N - Name]
**User Stories**: US-XXX, US-XXX

### Tools to Test
- [Tool]: [Expected behavior]

### Workflows to Test
- [Workflow]: [User story path]

### Acceptance Criteria
- [ ] [Criterion]
```
```

---

### Task 3: ADD Service Auto-Detection

```markdown
## Service Auto-Detection

### Process
1. Check `.agents/services.yaml` override first
2. Scan `.env` for `*_API_KEY`, `*_URL`, `DATABASE_URL`, `OPENAI_*`, `SUPABASE_*`
3. Scan imports: `grep -r "import.*openai\|from supabase" --include="*.py" --include="*.ts"`

### Output
```
## Detected Services
| Service | Source | Auth Env Var | Status |
|---------|--------|--------------|--------|
| [Name] | [.env/import/yaml] | [VAR] | ⚪ Pending |

[No services found]: Skip integration tests
```
```

---

### Task 4: ADD Tool Validator Subagent

```markdown
## Subagent: Tool Validator

**Spawn with Task tool:**

```
You are a Tool Validator for: [Feature Name]

## Tools: [List from context]

## Process
For each tool:
1. Test valid inputs (happy path)
2. Test invalid inputs (type errors, missing required)
3. Test edge cases (empty, null, large)

## Output Format
### [Tool Name]
**Status**: 🟢/🟡/🔴
- ✅ Valid input: [result]
- ✅ Invalid input: [error handling]
- ⚠️ Edge case: [issue if any]

**Issues**: [Description]
**Fix**: [Code snippet]
```
```

---

### Task 5: ADD Mock Generator Subagent

```markdown
## Subagent: Mock Generator

**Spawn with Task tool:**

```
You are a Mock Generator for: [Feature Name]

## Services: [From detection]

## Process
For each service:
1. Analyze response schemas from integration code
2. Generate scenarios: success, empty, error_400/401/403/404/500, timeout, malformed
3. Save to `.agents/mocks/[service].json`

## Output Format
### Mock Summary
- [Service]: 6 scenarios → `.agents/mocks/[service].json`
```
```

---

### Task 6: ADD Workflow Validator Subagent

```markdown
## Subagent: Workflow Validator

**Spawn with Task tool:**

```
You are a Workflow Validator for: [Feature Name]

## User Stories: [From context with acceptance criteria]
## Mocks: [From Mock Generator]

## Process
For each story:
1. Map happy path + decision points + error paths
2. Test happy path end-to-end
3. Test error paths using mocks
4. Check state transitions

## Output Format
### [US-XXX]: [Title]
**Status**: 🟢/🟡/🔴
**Happy Path**: ✅/⚠️/❌ [Steps and results]
**Error Paths**: ✅ [case] handled | ❌ [case] unhandled
**Coverage**: X/Y criteria met
**Issues**: [With suggested fix]
```
```

---

### Task 7: ADD Integration Tester Subagent

```markdown
## Subagent: Integration Tester

**Spawn with Task tool:**

```
You are an Integration Tester for: [Feature Name]

## Services: [From detection with auth vars]

## Process
For each service:
1. Verify env var exists and non-empty
2. Test authentication (minimal API call)
3. Test read/write operations
4. Handle rate limits gracefully (warning, not failure)
5. Fallback to mock if unavailable

## Output Format
### [Service]
**Status**: 🟢 Connected | 🟡 Mock Only | 🔴 Failed
**Auth**: ✅/❌
**Read**: ✅/❌/⚪
**Write**: ✅/❌/⚪
**Issues**: [With fix]
```
```

---

### Task 8: ADD Error Path Tester Subagent

```markdown
## Subagent: Error Path Tester

**Spawn with Task tool:**

```
You are an Error Path Tester for: [Feature Name]

## Error Scenarios: [From PRD Agent Validation Profile]
## Mocks: [Use error/timeout/malformed scenarios]

## Process
Test each category:
1. Service unavailable (timeout mock) → graceful degradation?
2. Invalid input (malformed) → helpful error?
3. Auth failures (401 mock) → handled?
4. Rate limits (429 mock) → backoff?

## Output Format
### Error Handling Summary
**Overall**: 🟢 Robust | 🟡 Gaps | 🔴 Fragile
- Service Unavailable: ✅/❌
- Invalid Input: ✅/❌
- Auth Failures: ✅/❌
- Rate Limits: ✅/❌

**Unhandled**:
- [Error]: [What happens] → **Fix**: [Code]
```
```

---

### Task 9: ADD Orchestration Logic

```markdown
## Orchestration Execution

### Flow
```
Phase 0: Context Loading (sequential)
    ↓
Phase 1: Tool Validator + Mock Generator (parallel)
    ↓
Phase 2: Workflow Validator (needs mocks)
    ↓
Phase 3: Integration Tester
    ↓
Phase 4: Error Path Tester (needs mocks)
    ↓
Phase 5: Report Synthesis
```

### Progress Output
```
## Validation Progress
⚪ Phase 0: Context Loading
⚪ Phase 1: Tool + Mock (parallel)
⚪ Phase 2: Workflow Validation
⚪ Phase 3: Integration Testing
⚪ Phase 4: Error Path Testing
⚪ Phase 5: Report Synthesis
```
Update: 🟡 starting → 🟢 complete → 🔴 failed (continue anyway)

### Error Handling
If subagent fails: Log error, mark 🔴, continue to next phase, note in report.
```

---

### Task 10: ADD Report Synthesis

```markdown
## Phase 5: Report Synthesis

### Report File
`.agents/validation/{feature}-validation-{YYYY-MM-DD}.md`

### Report Structure
```markdown
# Validation Report: [Feature]
**Date**: [YYYY-MM-DD] | **Plan**: [path] | **Phase**: [N - Name]

## Summary
**Overall**: 🟢/🟡/🔴
| Category | Status | Issues |
|----------|--------|--------|
| Tools | 🟢/🟡/🔴 | X |
| Workflows | 🟢/🟡/🔴 | X |
| Integrations | 🟢/🟡/🔴 | X |
| Error Handling | 🟢/🟡/🔴 | X |

## Acceptance Criteria
- [x] [Criterion] - Verified
- [ ] [Criterion] - **FAILED**: [reason]

## [Section per subagent output]

## Issues & Fixes
### Critical
1. **[Issue]**: [What/Where/Why]
   ```[lang]
   [Fix code]
   ```

### Warnings
- [Issue]: [Fix]

## Next Steps
- [ ] Fix critical issues
- [ ] Re-run: `/validate-implementation [plan]`
```

### Terminal Summary
```
## Validation Complete
**Report**: `.agents/validation/[file].md`

| Category | Status |
|----------|--------|
| Tools | 🟢 5/5 |
| Workflows | 🟡 3/4 |
| Integrations | 🟢 2/2 |
| Errors | 🔴 2 unhandled |

**Critical**: [Brief issues]
**Action**: [Fix and re-run / Ready for commit]
```
```

---

### Task 11: ADD Archon Integration

```markdown
## Archon Integration (Optional)

### Check Availability
Call `mcp__archon__rag_get_available_sources()` - if error, skip Archon features.

### During Integration Testing
Query for service docs:
- `mcp__archon__rag_search_knowledge_base(query="[service] API auth")`
- `mcp__archon__rag_search_code_examples(query="[service] error handling")`

### After Validation
Log results:
```
mcp__archon__manage_task("create", title="Validation: [Feature]", ...)
mcp__archon__manage_task("update", status="done"/"review", notes="[Summary]")
```

### Fallback
If unavailable: Log "Archon not available", continue without RAG, note in report.
```

---

### Task 12: ADD Usage & Completion

```markdown
## Usage
```bash
/validate-implementation .agents/plans/my-feature.md  # Specific plan
/validate-implementation                               # Latest plan
```

### Workflow
```
/execute [plan] → /validate-implementation [plan] → fix issues → re-validate → /commit
```

## Completion Criteria
- [ ] Context loaded from plan/PRD
- [ ] Services detected (or noted as none)
- [ ] All phases executed (or failed gracefully)
- [ ] Report written to `.agents/validation/`
- [ ] Summary output to terminal

## Error Reference
| Error | Resolution |
|-------|------------|
| Plan not found | Check path or run `/plan-feature` |
| No PRD phase | Validate from plan only |
| Service auth failed | Check .env for API keys |
```

---

## VALIDATION STRATEGY

### Tools to Validate
| Tool | Input | Expected |
|------|-------|----------|
| validate-implementation | Plan path | Report generated |
| Service detection | .env file | Services listed |
| Subagent coordination | Plan with tools | All phases execute |

### Workflows to Test
| Workflow | Happy | Error |
|----------|-------|-------|
| Full validation | Report created | Partial report on subagent failure |
| Mock-only | Services down | Report notes "mock only" |
| No Archon | MCP unavailable | Continues without RAG |

### Edge Cases
- Plan not found → Clear error
- No PRD → Skip PRD context, validate from plan
- No services → Skip Phase 3, note in report
- Subagent timeout → Log, continue, note in report

---

## ACCEPTANCE CRITERIA

- [ ] Command file at `.claude/commands/validate-implementation.md`
- [ ] Frontmatter follows conventions
- [ ] Phase 0 loads context from plan + PRD
- [ ] Service detection finds services from .env and imports
- [ ] All 5 subagent prompts complete
- [ ] Orchestration executes phases in order
- [ ] Progress indicators display
- [ ] Report written to `.agents/validation/`
- [ ] Status emojis used consistently
- [ ] Fix suggestions include code
- [ ] Archon works when available, skips gracefully
- [ ] Handles missing plan/PRD/services gracefully

---

## COMPLETION CHECKLIST

- [ ] Task 1-12 complete
- [ ] Manual test against Phase 2 plan
- [ ] Report output verified
- [ ] Progress indicators working
- [ ] Error handling verified

---

## NOTES

### Validated Decisions
1. Progress indicators: Phase-based with ⚪🟡🟢🔴
2. Parallel: Tool Validator + Mock Generator; then sequential
3. Unavailable services: Try real first, fallback to mock with warning
4. Single file: Inline subagent prompts (portable)
5. Report format: Structured markdown with status emojis
6. Archon: Optional, graceful fallback
7. Auto-fix: MVP suggests only, no auto-apply

### Rationale
- **Inline prompts**: Self-contained, portable to other projects
- **Hybrid parallel**: Fast where safe, respects dependencies
- **Mock fallback**: Validation works offline, clear real vs mock distinction
- **Optional Archon**: Works standalone, Archon enhances only
