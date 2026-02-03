# Feature: Phase 1 - Validation Framework Foundation

The following plan should be complete, but validate documentation and codebase patterns before implementing.

Pay special attention to existing section structures in commands. Mirror formatting exactly.

## Feature Description

Add intelligent validation support to the PIV loop framework by updating three existing commands (create-prd.md, plan-feature.md, create_global_rules_prompt.md) with new optional sections that capture validation requirements. Also create a services.yaml template for service configuration override.

This foundation enables future validation commands (Phase 2, 3) to know WHAT to test without manual configuration. The key insight: capture validation requirements at the moment developers are already thinking about features - during PRD and planning.

## User Story

As a developer building AI agents with the PIV loop
I want my PRDs and plans to capture validation requirements
So that the validation system knows what to test without manual configuration

## Problem Statement

The PIV loop creates excellent context for implementation, but validation is an afterthought. When `/validate-implementation` runs (Phase 3), it has no structured information about:
- What services the agent uses
- What workflows exist
- What edge cases matter
- How to test specific features

This forces validation to "discover" everything, which is slow and incomplete.

## Solution Statement

Embed validation requirements into existing workflow touchpoints:
1. **PRD** captures agent profile (services, workflows, tools) once per project
2. **Plan** captures what to test THIS phase specifically
3. **Global rules** guide service configuration

Auto-detection remains primary (Phase 3), but these sections provide hints and overrides.

## Feature Metadata

**Feature Type**: Enhancement
**Estimated Complexity**: Medium
**Primary Systems Affected**: create-prd.md, plan-feature.md, create_global_rules_prompt.md
**Dependencies**: None (markdown-only changes)

---

## CONTEXT REFERENCES

### Relevant Codebase Files - READ BEFORE IMPLEMENTING

- `.claude/commands/create-prd.md` (full file) - Why: Primary target, understand all existing sections
- `.claude/commands/plan-feature.md` (full file) - Why: Primary target, understand template structure
- `.claude/commands/create_global_rules_prompt.md` (full file) - Why: Primary target, simpler structure
- `CLAUDE.md` (lines 1-50) - Why: Understand output standards (plain English, no code walls)
- `PRD-intelligent-validation.md` (lines 311-350) - Why: Phase 1 scope definition

### New Files to Create

- `.agents/services.yaml.template` - Template showing service configuration schema

### Files to Update

- `.claude/commands/create-prd.md` - Add Agent Validation Profile section
- `.claude/commands/plan-feature.md` - Add Validation Strategy section
- `.claude/commands/create_global_rules_prompt.md` - Add Service Configuration section

### Patterns to Follow

**Section Header Pattern** (from create-prd.md):
```markdown
---

### **N. Section Name** (line-count estimate)

Section description and instructions...

---
```

**Conditional Section Pattern** (design decision):
```markdown
### **N. Agent Validation Profile** (OPTIONAL - Agent Projects Only)

> Include this section only if project is an AI agent with tools, services, or workflows.
> Skip entirely for standard applications (web apps, APIs, CLIs without agent behavior).
```

**Line Count Guidance Pattern** (from create-prd.md):
```markdown
### **5. User Stories** (80-120 lines)
```

**Frontmatter Pattern** (from all commands):
```yaml
---
description: Brief description
argument-hint: [optional-argument]
---
```

**Checklist Pattern** (from create-prd.md:259-264):
```markdown
### 5. Quality Checks
- [ ] All sections present
- [ ] User stories have acceptance criteria
```

---

## IMPLEMENTATION PLAN

### Phase 1: Update create-prd.md

Add conditional Agent Validation Profile section that captures:
- Services used (APIs, databases, external integrations)
- Tools inventory (MCP tools, agent capabilities)
- Workflow paths (conversation flows, decision trees)
- Error scenarios to test

Must be optional - only for agent projects.

### Phase 2: Update plan-feature.md

Add Validation Strategy section to plan template that captures:
- Tools implemented THIS phase with test inputs
- Workflows added/modified with test scenarios
- Integration points needing validation
- Mock data needs

Must integrate with existing task structure.

### Phase 3: Update create_global_rules_prompt.md

Add Service Configuration guidance that explains:
- How to create .agents/services.yaml
- When auto-detection vs manual config
- Schema overview

Keep brief - this is guidance, not the schema itself.

### Phase 4: Create services.yaml template

Create minimal template showing:
- Service entry format
- Required vs optional fields
- Example entries

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order. Each task is atomic and independently testable.

---

### UPDATE `.claude/commands/create-prd.md`

**Location**: Insert new section between Section 6 (Architecture) and Section 7 (Technology Stack)

**IMPLEMENT**: Add new section 7 "Agent Validation Profile" with the following structure:

```markdown
---

### **7. Agent Validation Profile** (OPTIONAL - 40-60 lines)

> **Include this section ONLY for AI agent projects** - applications with tools, external service integrations, or autonomous workflows. Skip entirely for standard web apps, APIs, or CLIs.

**When to include:**
- Project uses MCP tools or agent frameworks
- Project calls external APIs autonomously
- Project has multi-step workflows or conversation flows
- Project makes decisions based on external data

**Services Inventory:**

| Service | Purpose | Auth Type | Env Var |
|---------|---------|-----------|---------|
| [Service Name] | [What it does] | [api_key/oauth/none] | [ENV_VAR_NAME] |

**Tools Inventory:**

| Tool Name | Type | External Dependencies |
|-----------|------|----------------------|
| [Tool] | [MCP/internal/API] | [Services it calls] |

**Workflow Paths:**

Document key user-facing workflows:
- **[Workflow Name]**: [Brief description of steps and decision points]
- Note branching paths and error recovery flows

**Error Scenarios:**

List critical error cases that must be tested:
- Service unavailable handling
- Invalid input handling
- Rate limit handling
- Authentication failure handling

**Mock Requirements:**

Identify scenarios requiring mock data:
- [Scenario]: Why mocking needed, what shape of data

---
```

**RENUMBER**: After insertion, update all subsequent section numbers:
- Section 7 (Technology Stack) → Section 8
- Section 8 (Current Focus) → Section 9
- Section 9 (Implementation Phases) → Section 10
- Section 10 (Success Criteria) → Section 11
- Section 11 (Risks & Mitigations) → Section 12
- Section 12 (Document History) → Section 13

**UPDATE LINE COUNTS**: Adjust PRD Structure section to account for new section:
- Update total line guidance if needed
- Note the 40-60 line estimate for this section

**UPDATE QUALITY CHECKS**: Add validation profile check:
```markdown
- [ ] Agent Validation Profile included (if agent project)
```

**GOTCHA**: This section is OPTIONAL. Instructions must clearly state when to skip it.

**VALIDATE**: Read the modified file, verify section numbering is sequential, verify conditional language is clear.

---

### UPDATE `.claude/commands/plan-feature.md`

**Location**: Insert Validation Strategy section into the plan TEMPLATE (the markdown block starting around line 180)

**IMPLEMENT**: Add Validation Strategy section after "## IMPLEMENTATION PLAN" phases and before "## STEP-BY-STEP TASKS":

```markdown
---

## VALIDATION STRATEGY

> Define what the validation system should test for THIS phase specifically.

### Tools to Validate

| Tool | Test Inputs | Expected Behavior | Mock Needed |
|------|-------------|-------------------|-------------|
| [Tool name] | [Sample inputs] | [Expected output/behavior] | [Yes/No + why] |

### Workflows to Test

| Workflow | Happy Path | Error Paths | State Changes |
|----------|------------|-------------|---------------|
| [Name] | [Steps to verify] | [Error cases] | [State to check] |

### Integration Points

List external services touched by this phase:
- **[Service]**: What operations, how to verify connectivity
- Note any rate limits or test account requirements

### Mock Data Needs

| Scenario | Data Shape | Edge Cases |
|----------|------------|------------|
| [Scenario] | [Fields needed] | [Empty/error/timeout/malformed] |

### Validation Acceptance Criteria

- [ ] All tools execute without error with valid inputs
- [ ] All tools handle invalid inputs gracefully
- [ ] All workflow happy paths complete successfully
- [ ] All documented error paths are handled
- [ ] Integration points are reachable (or gracefully fail)

---
```

**LOCATION DETAIL**: Find the line containing `## STEP-BY-STEP TASKS` in the template. Insert the Validation Strategy section immediately BEFORE it.

**UPDATE TEMPLATE GUIDANCE**: In the "Plan Length Guidelines" section, note that Validation Strategy adds ~30-50 lines but is valuable context.

**GOTCHA**: This goes INSIDE the template markdown block (the one that starts with triple backticks), not outside it.

**VALIDATE**: Read the modified file, verify the section appears within the plan template structure.

---

### UPDATE `.claude/commands/create_global_rules_prompt.md`

**Location**: Add new section 12 "Service Configuration" before the Process section

**IMPLEMENT**: Add guidance for service configuration:

```markdown
12. **Service Configuration** (for AI Agent Projects)
    - When the project is an AI agent, include guidance for `.agents/services.yaml`
    - Document which services the agent uses
    - Specify environment variables for API keys
    - Note any test accounts or sandbox endpoints
    - Example structure:
      ```yaml
      services:
        openai:
          auth_env: OPENAI_API_KEY
          health: /models
        postgres:
          auth_env: DATABASE_URL
          skip: false  # include in validation
      ```
    - This enables the validation system to test integrations automatically
```

**INTEGRATION**: This section only applies to agent projects. Add conditional note similar to other optional sections.

**GOTCHA**: Keep this brief - it's guidance for CLAUDE.md authors, not the full schema spec.

**VALIDATE**: Read the modified file, verify the new section integrates with existing numbered list.

---

### CREATE `.agents/services.yaml.template`

**IMPLEMENT**: Create new template file with minimal schema:

```yaml
# PIV Loop - Service Configuration Template
#
# This file tells the validation system about external services your agent uses.
# Auto-detection handles most cases - use this for overrides or edge cases.
#
# Usage:
#   1. Copy to .agents/services.yaml
#   2. Fill in services your agent uses
#   3. Validation will test connectivity and auth
#
# When to use this file:
#   - Auto-detection misses a service
#   - You need to exclude a service from testing (skip: true)
#   - You have custom health check endpoints
#   - Service uses non-standard auth patterns

services:
  # Example: OpenAI API
  openai:
    auth_env: OPENAI_API_KEY        # Required: env var containing credentials
    health: /models                  # Optional: endpoint to test connectivity
    # skip: false                    # Optional: exclude from validation

  # Example: PostgreSQL Database
  postgres:
    auth_env: DATABASE_URL
    # health: SELECT 1              # Optional: health check query

  # Example: Custom API
  # my-api:
  #   auth_env: MY_API_KEY
  #   base_url_env: MY_API_URL      # Optional: if URL is also in env
  #   health: /health
  #   skip: false

# Schema Reference:
#
# services:
#   <service-name>:                 # Identifier (lowercase, hyphens ok)
#     auth_env: STRING              # REQUIRED: env var name for auth
#     health: STRING                # OPTIONAL: endpoint or query for health check
#     base_url_env: STRING          # OPTIONAL: env var for base URL
#     skip: BOOLEAN                 # OPTIONAL: true to exclude from validation
#
# The validation system will:
#   1. Check that auth_env exists and is non-empty
#   2. If health specified, attempt to reach it
#   3. Report any connectivity or auth issues
#   4. Skip services marked with skip: true
```

**LOCATION**: `.agents/services.yaml.template` (not `.yaml` - this is a template)

**GOTCHA**: Use `.template` extension so users copy and rename, don't accidentally commit credentials.

**VALIDATE**: `cat .agents/services.yaml.template` - verify YAML is valid and comments are helpful.

---

### UPDATE `PRD-intelligent-validation.md`

**IMPLEMENT**: Update Phase 1 status and add session context:

Find the "## 8. Current Focus" section and update:

```markdown
## 8. Current Focus

**Active Phase:** Phase 1 - Framework Foundation
**Active Stories:** US-007, US-008
**Status:** 🟡 In Progress

**Blockers:** None

**Session Context:**
- Phase 1 implementation plan created
- Key decisions made: separate section in PRD (not integrated), minimal service schema, skip for non-agents

**Last Updated:** [Current Date]
```

Find "## Phase 1: Framework Foundation" and update status:

```markdown
## Phase 1: Framework Foundation

**Status:** 🟡 In Progress
```

**VALIDATE**: Read PRD, verify status indicators updated.

---

## TESTING STRATEGY

### Manual Validation

Since these are markdown command files, testing is manual workflow verification:

1. **create-prd.md changes**:
   - Read the file and verify section numbering is sequential (1-13)
   - Verify Agent Validation Profile section has clear "optional" language
   - Verify quality checks include the new section

2. **plan-feature.md changes**:
   - Read the file and verify Validation Strategy is INSIDE the template block
   - Verify it appears after IMPLEMENTATION PLAN and before STEP-BY-STEP TASKS

3. **create_global_rules_prompt.md changes**:
   - Read the file and verify section 12 exists
   - Verify it's brief and focused on guidance (not full schema)

4. **services.yaml.template**:
   - Verify YAML parses correctly
   - Verify comments explain usage
   - Verify schema reference is accurate

### Integration Test

After all changes, mentally trace through the workflow:

1. User runs `/create-prd` for an agent project → Gets validation profile section
2. User runs `/create-prd` for a web app → Skips validation profile section
3. User runs `/plan-feature` → Plan template includes validation strategy
4. User runs `/create_global_rules_prompt` → Guidance includes service config

---

## VALIDATION COMMANDS

### Level 1: File Existence

```bash
# Verify all target files exist
ls -la .claude/commands/create-prd.md
ls -la .claude/commands/plan-feature.md
ls -la .claude/commands/create_global_rules_prompt.md
ls -la .agents/services.yaml.template
```

**Expected**: All files exist

### Level 2: Content Verification

```bash
# Verify section numbers in create-prd.md
grep -n "### \*\*[0-9]" .claude/commands/create-prd.md

# Verify Validation Strategy exists in plan-feature.md
grep -n "VALIDATION STRATEGY" .claude/commands/plan-feature.md

# Verify section 12 in create_global_rules_prompt.md
grep -n "12\." .claude/commands/create_global_rules_prompt.md

# Verify template has services key
grep "^services:" .agents/services.yaml.template
```

**Expected**: All patterns found

### Level 3: YAML Validation

```bash
# If yq or python available, validate YAML syntax
python3 -c "import yaml; yaml.safe_load(open('.agents/services.yaml.template'))" 2>&1 || echo "YAML parse check"
```

**Expected**: No parse errors (or graceful skip if python unavailable)

### Level 4: Line Count Check

```bash
# Verify files stay within reasonable limits
wc -l .claude/commands/create-prd.md
wc -l .claude/commands/plan-feature.md
```

**Expected**: create-prd.md ~350 lines, plan-feature.md ~600 lines (both well under limits)

---

## ACCEPTANCE CRITERIA

- [ ] create-prd.md has new section 7 "Agent Validation Profile" marked as OPTIONAL
- [ ] create-prd.md sections are numbered 1-13 sequentially
- [ ] create-prd.md quality checks include validation profile check
- [ ] plan-feature.md template includes "VALIDATION STRATEGY" section
- [ ] plan-feature.md validation section is between IMPLEMENTATION PLAN and STEP-BY-STEP TASKS
- [ ] create_global_rules_prompt.md has section 12 for Service Configuration
- [ ] .agents/services.yaml.template exists with valid YAML
- [ ] .agents/services.yaml.template has clear usage instructions
- [ ] PRD-intelligent-validation.md Phase 1 status is 🟡 In Progress
- [ ] All changes follow plain English over code snippets principle
- [ ] No existing functionality is broken

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each file modification validated by reading
- [ ] Section numbering verified as sequential
- [ ] Template YAML validated
- [ ] PRD status updated
- [ ] All acceptance criteria met
- [ ] Ready for `/commit`

---

## NOTES

### Design Decisions Made

1. **Separate section vs integrated**: Agent Validation Profile is a top-level PRD section, not scattered across user stories. Rationale: easier to find, easier for validation commands to parse, consolidated.

2. **Minimal service schema**: Only auth_env required, everything else optional. Rationale: auto-detection is primary, this is override. Start minimal, extend based on real needs.

3. **Skip for non-agents**: Validation sections are optional/conditional. Rationale: PIV loop serves all projects, don't force agent concepts onto standard apps.

4. **Template not schema**: services.yaml.template with .template extension. Rationale: users copy and rename, prevents accidental credential commits, self-documenting.

### Why These Changes Enable Phase 2/3

- **PRD profile** tells validation WHAT services/tools exist (inventory)
- **Plan strategy** tells validation WHAT to test THIS phase (scope)
- **Services.yaml** provides OVERRIDES when auto-detection insufficient
- **Global rules guidance** ensures new projects capture this from start

### Risks

1. **Section numbering errors**: Manually renumbering is error-prone. Mitigation: explicit verification step.

2. **Template inside template**: plan-feature.md has a markdown template inside markdown. Mitigation: clear location instructions.

3. **YAML in markdown**: services.yaml examples in markdown could have formatting issues. Mitigation: use proper code blocks.
