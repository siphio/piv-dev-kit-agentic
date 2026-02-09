---
description: "Create comprehensive feature plan with deep codebase analysis, technology profiles, and agent behavior specs"
---

# Plan a new task

## Feature: $ARGUMENTS

## CRITICAL: Length Constraint

**The plan MUST be between 500-750 lines. No exceptions.**

| Constraint | Action |
|------------|--------|
| Under 500 lines | Plan is INCOMPLETE - add missing context, edge cases, patterns |
| Over 750 lines | Plan has BLOAT - cut prose, use references, consolidate tasks |

**Why this matters:**
- Enables efficient reading and human validation before execution
- Avoids context bloat when loaded by execution agent
- Forces prioritization of actionable information over filler

---

## Mission

Transform a feature request into a **comprehensive implementation plan** through systematic codebase analysis, technology profile integration, and strategic agent behavior design.

**Core Principle**: We do NOT write code in this phase. Our goal is to create a context-rich implementation plan that enables one-pass implementation success.

**Key Philosophy**: Context is King. The plan must contain ALL information needed for implementation - patterns, mandatory reading, technology integration, agent behavior specs, validation commands - so the execution agent succeeds on the first attempt.

**Two-Phase Process** (when PRD exists):
1. **Scope Analysis** → Output recommendations with justifications to terminal → User validates
2. **Plan Generation** → Create implementation plan with validated decisions baked in

## Reasoning Approach

**CoT Style:** Tree-of-Thought (ToT) for decisions, zero-shot for analysis

During Phase 0 (Scope Analysis), explore 2-3 approaches for each decision point:
1. For each decision, generate 2-3 viable approaches
2. Evaluate each against PRD requirements, technology profiles, and codebase patterns
3. Select the approach with strongest justification
4. Present selection with rationale to user

During Phase 5 (Strategic Thinking), reason step by step:
1. How does this feature fit the existing architecture?
2. What are the critical dependencies and order of operations?
3. What could go wrong? (Edge cases, race conditions, errors)
4. Which technology profile constraints shape the implementation?
5. How do PRD decision trees map to concrete code?

## Hook Toggle

Check CLAUDE.md for `## PIV Configuration` → `hooks_enabled` setting.
If arguments contain `--with-hooks`, enable hooks. If `--no-hooks`, disable.
If arguments contain `--reflect`, perform an extended reflection pass before finalizing.
Strip all flags from arguments before using remaining text as the feature description.

## Planning Process

> **Note:** If a PRD exists, start with Phase 0 (Scope Analysis) and output recommendations to terminal. Proceed to Phase 1 only after user validates the approach.

### Phase 0: Scope Analysis & Recommendations (If PRD Exists)

> **When to run this phase:** If a PRD exists for the project (`.agents/PRD.md` or similar), run this phase FIRST. Check for research profiles in `.agents/reference/` before generating recommendations.

**If no PRD exists:** Skip Phase 0 and proceed directly to Phase 1.

**Scope Analysis Process:**

1. **Validate Technology Profiles Exist**
   - Check if `.agents/reference/` directory exists
   - List all `*-profile.md` files in that directory
   - If no profiles exist: **WARN**: "Technology profiles not found. Consider running `/research-stack` first for better context."
   - If profiles exist: Continue with analysis below

2. **Read the PRD Phase**
   - Identify which phase is being planned (from user input or PRD "Current Focus")
   - Extract: What this phase delivers, prerequisites, scope (included/excluded)
   - Extract: User stories addressed by this phase

3. **Map User Stories & Agent Behavior**
   - For each user story in scope, extract acceptance criteria
   - Review Section 4.2 (Decision Trees) for agent behaviors relevant to this phase
   - Review Section 4.3 (Scenarios) to understand workflows this phase enables
   - Review Section 4.4 (Error Recovery Patterns) for failure modes this phase must handle
   - These become validation checkpoints for the plan

4. **Identify Decision Points**
   - Find "Discussion Points for Clarification" in the PRD phase
   - Find any ambiguous requirements or multiple valid approaches
   - List each decision that affects implementation or agent behavior
   - Cross-reference technologies in `.agents/reference/` profiles

5. **Formulate Recommendations**
   - For each decision point, provide a recommendation with justification
   - Justification must reference PRD context, user stories, or codebase patterns
   - If recommendation involves external technology, reference the technology profile
   - Format: Decision → Recommendation → Why (how it serves the goal)

**Terminal Output Format:**

```
## Scope Analysis: [Phase Name]

**PRD Phase:** [N] - [Name]
**User Stories:** US-XXX, US-XXX
**Technology Profiles Available**: [list profiles or "none found"]
**Prerequisites:** [Status of each - ✅ Complete / ⚪ Not Started / 🔴 Blocked]

### What This Phase Delivers
[2-3 sentence summary from PRD]

### Recommendations

1. **[Decision Point from PRD Discussion Points]**
   → [Your recommendation]
   Why: [Justification - how this serves the user story/goal, references to PRD requirements, codebase patterns, or technology profiles that inform this choice]

2. **[Another Decision Point]**
   → [Your recommendation]
   Why: [Justification]

---

Ready to generate plan with these decisions, or would you like to discuss any recommendations?
```

**After User Validation:**
- If user confirms: Proceed to Phase 1 with decisions locked in
- If user adjusts: Update recommendations, confirm again
- Document final decisions in the plan's NOTES section

### Phase 1: Feature Understanding

**Deep Feature Analysis:**

- Extract the core problem being solved
- Identify user value and business impact
- Determine feature type: New Capability/Enhancement/Refactor/Bug Fix
- Assess complexity: Low/Medium/High
- Map affected systems and components

**Extract Agent Behavior Requirements:**

If this is an agent-based feature:
- Review PRD Section 4.2 (Decision Trees) - which decisions will this feature implement?
- Review PRD Section 4.3 (Scenarios) - which user workflows does this enable?
- Identify agent tools and APIs needed
- Map decision branching logic that agent must execute

**Create User Story Format Or Refine If Story Was Provided By The User:**

```
As a <type of user>
I want to <action/goal>
So that <benefit/value>
```

### Phase 2: Codebase Intelligence Gathering

**Use specialized agents and parallel analysis:**

**1. Project Structure Analysis**

- Detect primary language(s), frameworks, and runtime versions
- Map directory structure and architectural patterns
- Identify service/component boundaries and integration points
- Locate configuration files (pyproject.toml, package.json, etc.)
- Find environment setup and build processes

**2. Pattern Recognition**

- Search for similar implementations in codebase
- Identify coding conventions:
  - Naming patterns (CamelCase, snake_case, kebab-case)
  - File organization and module structure
  - Error handling approaches
  - Logging patterns and standards
- Extract common patterns for the feature's domain
- Document anti-patterns to avoid
- Check CLAUDE.md for project-specific rules and conventions

**3. Dependency Analysis**

- Catalog external libraries relevant to feature
- Understand how libraries are integrated (check imports, configs)
- Find relevant documentation in docs/, ai_docs/, .agents/reference/ or ai-wiki if available
- Note library versions and compatibility requirements

**If Planning a New Feature (not bug fix):**
- Read `.agents/reference/new-features.md` for platform-specific patterns
- Understand interface requirements (IPlatformAdapter, IAssistantClient)
- Review extension patterns for adapters, clients, commands, database operations

**4. Testing Patterns**

- Identify test framework and structure (pytest, jest, etc.)
- Find similar test examples for reference
- Understand test organization (unit vs integration)
- Note coverage requirements and testing standards

**5. Integration Points**

- Identify existing files that need updates
- Determine new files that need creation and their locations
- Map router/API registration patterns
- Understand database/model patterns if applicable
- Identify authentication/authorization patterns if relevant

**Clarify Ambiguities:**

- If requirements are unclear at this point, ask the user to clarify before you continue
- Get specific implementation preferences (libraries, approaches, patterns)
- Resolve architectural decisions before proceeding

### Phase 3: Technology Profile Integration

**NEW PHASE: Integrates research from `/research-stack` command**

1. **Locate Technology Profiles**
   - Check if `.agents/reference/` directory exists
   - List all available `*-profile.md` files
   - For this feature, identify which profiles are relevant (based on technologies mentioned in PRD or codebase)

2. **Read Relevant Technology Profiles**
   - For each technology that this feature depends on or integrates with:
   - Read the full profile from `.agents/reference/{technology-name}-profile.md`
   - Extract: Authentication approach, API endpoints, rate limits, error handling, SDKs
   - Extract: Known issues, gotchas, version constraints

3. **Map Profile Endpoints to Feature Tasks**
   - Identify which specific API endpoints will be called in implementation
   - Note authentication requirements and token management
   - Document rate limit implications if applicable
   - Extract code examples from profile that match feature needs

4. **Cross-reference with Decision Trees**
   - For agent-based features: Verify that technology capabilities support decision trees in PRD Section 4.2
   - Identify where agent must fallback or retry based on technology limitations
   - Document decision criteria that depend on technology responses

### Phase 4: External Research & Supplementary Documentation

**Use specialized subagents when beneficial for external research:**

**Documentation Gathering:**

- Research latest library versions and best practices
- Find official documentation with specific section anchors
- Locate implementation examples and tutorials
- Identify common gotchas and known issues
- Check for breaking changes and migration guides

**Technology Trends:**

- Research current best practices for the technology stack
- Find relevant blog posts, guides, or case studies
- Identify performance optimization patterns
- Document security considerations

**Focus on:** implementation patterns, best practices, and similar features from official docs and community sources.

### Phase 5: Deep Strategic Thinking & Agent Behavior Design

**Think Harder About:**

- How does this feature fit into the existing architecture?
- What are the critical dependencies and order of operations?
- What could go wrong? (Edge cases, race conditions, errors)
- How will this be tested comprehensively?
- What performance implications exist?
- Are there security considerations?

**Agent Behavior Design:**

- What decisions must the agent make in this feature?
- What are the decision criteria? (from PRD Section 4.2)
- How should the agent handle errors or unexpected API responses?
- What scenarios should be tested? (from PRD Section 4.3)
- How should the agent recover from failures?

**Design Decisions:**

- Choose between alternative approaches with clear rationale
- Design for extensibility and future modifications
- Plan for backward compatibility if needed
- Consider scalability implications

**PRD Validation (if PRD exists):**
- Read `.agents/PRD.md` if it exists in the project
- Verify plan preserves architectural patterns defined in PRD
- Ensure interface abstractions (IPlatformAdapter, IAssistantClient, etc.) are included in types section
- Confirm implementation uses interface types, not concrete classes in core logic
- Validate against any architectural principles or design constraints in PRD
- For agent features: Confirm implementation matches decision trees and scenario workflows from Section 4

### Phase 6: Plan Structure Generation

**Create comprehensive plan with the following structure:**

What's below here is a template for you to fill for the implementation agent:

```markdown
# Feature: <feature-name>

The following plan should be complete, but it's important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

<Detailed description of the feature, its purpose, and value to users>

## User Story

As a <type of user>
I want to <action/goal>
So that <benefit/value>

## Problem Statement

<Clearly define the specific problem or opportunity this feature addresses>

## Solution Statement

<Describe the proposed solution approach and how it solves the problem>

## Feature Metadata

**Feature Type**: [New Capability/Enhancement/Refactor/Bug Fix]
**Estimated Complexity**: [Low/Medium/High]
**Primary Systems Affected**: [List of main components/services]
**Dependencies**: [External libraries or services required]
**Agent Behavior**: [Yes/No - does this implement agent decision trees or scenarios?]

---

## TECHNOLOGY PROFILES CONSUMED

**Profiles read from `.agents/reference/`:**

- `{technology-name}-profile.md` - Used for: [What feature aspects depend on this tech]
  - Key endpoints: [endpoint1, endpoint2]
  - Auth method: [API key / OAuth / etc]
  - Critical constraints: [rate limits, timeout, etc]

- [Continue for each technology profile read]

**Impact on Implementation:**
[How the technology capabilities/constraints shape this feature's design]

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

<List files with line numbers and relevance>

- `path/to/file.py` (lines 15-45) - Why: Contains pattern for X that we'll mirror
- `path/to/model.py` (lines 100-120) - Why: Database model structure to follow
- `path/to/test.py` - Why: Test pattern example

### New Files to Create

- `path/to/new_service.py` - Service implementation for X functionality
- `path/to/new_model.py` - Data model for Y resource
- `tests/path/to/test_new_service.py` - Unit tests for new service

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [Documentation Link 1](https://example.com/doc1#section)
  - Specific section: Authentication setup
  - Why: Required for implementing secure endpoints
- [Documentation Link 2](https://example.com/doc2#integration)
  - Specific section: Database integration
  - Why: Shows proper async database patterns

### Patterns to Follow

<Specific patterns extracted from codebase - include actual code examples from the project>

**Naming Conventions:** (for example)

**Error Handling:** (for example)

**Logging Pattern:** (for example)

**Other Relevant Patterns:** (for example)

---

## AGENT BEHAVIOR IMPLEMENTATION

**If this feature includes agent decision trees or scenario handling:**

### Decision Trees to Implement

[Reference PRD Section 4.2 - Decision Trees]

- **Decision Tree Name** (PRD Section 4.2.X):
  - Criteria: [What condition triggers each branch]
  - Outcomes: [What action agent takes per branch]
  - Error recovery: [How to handle unexpected responses]
  - Technology integration: [Which profile endpoints this uses]

### Scenario Mappings

[Reference PRD Section 4.3 - Scenarios]

| Scenario (PRD 4.3.X) | Agent Workflow | Decision Tree Invoked | Success Criteria |
|---|---|---|---|
| [Scenario name] | [Steps agent executes] | [Which decision tree] | [PRD acceptance criterion] |

### Error Recovery Patterns

- [Recovery pattern 1 with technology fallback]
- [Recovery pattern 2]

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation

<Describe foundational work needed before main implementation>

**Tasks:**

- Set up base structures (schemas, types, interfaces)
- Configure necessary dependencies
- Create foundational utilities or helpers

### Phase 2: Core Implementation

<Describe the main implementation work>

**Tasks:**

- Implement core business logic
- Create service layer components
- Add API endpoints or interfaces
- Implement data models
- **[If agent feature]** Implement decision trees and scenario handlers

### Phase 3: Integration

<Describe how feature integrates with existing functionality and external technologies>

**Tasks:**

- Connect to existing routers/handlers
- Register new components
- Update configuration files
- Add middleware or interceptors if needed
- **[If using technology profile]** Integrate external API calls per profile specification

### Phase 4: Testing & Validation

<Describe testing approach>

**Tasks:**

- Implement unit tests for each component
- Create integration tests for feature workflow
- Add edge case tests
- **[If agent feature]** Test decision tree logic against PRD scenarios
- Validate against acceptance criteria

---

## VALIDATION STRATEGY

### Tools to Validate

| Tool | Test Inputs | Expected Behavior | Mock Needed |
|------|-------------|-------------------|-------------|
| [Tool name] | [Sample inputs] | [Expected output/behavior] | [Yes/No + why] |

### Workflows to Test

| Workflow | Happy Path | Error Paths | State Changes |
|----------|------------|-------------|---------------|
| [Name] | [Steps to verify] | [Error cases] | [State to check] |

### PRD Scenario Validation

[If PRD exists] Map implementation to each scenario in PRD Section 4.3:

| Scenario | Test Plan | Pass Criteria |
|---|---|---|
| [Scenario from PRD 4.3] | [How to test this scenario] | [PRD acceptance criterion] |

### Validation Acceptance Criteria

- [ ] All tools execute without error with valid inputs
- [ ] All tools handle invalid inputs gracefully
- [ ] All workflow happy paths complete successfully
- [ ] All documented error paths are handled
- [ ] Integration points are reachable (or gracefully fail)
- [ ] **[If agent feature]** All decision trees return expected outcomes per PRD
- [ ] **[If using technology]** Technology integration matches profile specification

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### Task Format Guidelines

Use information-dense keywords for clarity:

- **CREATE**: New files or components
- **UPDATE**: Modify existing files
- **ADD**: Insert new functionality into existing code
- **REMOVE**: Delete deprecated code
- **REFACTOR**: Restructure without changing behavior
- **MIRROR**: Copy pattern from elsewhere in codebase

### {ACTION} {target_file}

- **IMPLEMENT**: {Specific implementation detail}
- **PATTERN**: {Reference to existing pattern - file:line}
- **PROFILE**: {Reference to technology profile endpoint/pattern if applicable}
- **IMPORTS**: {Required imports and dependencies}
- **GOTCHA**: {Known issues or constraints to avoid}
- **VALIDATE**: `{executable validation command}`

<Continue with all tasks in dependency order...>

---

## TESTING STRATEGY

<Define testing approach based on project's test framework and patterns discovered in during research>

### Unit Tests

<Scope and requirements based on project standards>

Design unit tests with fixtures and assertions following existing testing approaches

### Integration Tests

<Scope and requirements based on project standards>

**[If agent feature]** Include tests that verify decision tree outcomes match PRD Section 4.2

### Edge Cases

<List specific edge cases that must be tested for this feature>

**[If using technology]** Include edge cases mentioned in technology profile (rate limit handling, auth failures, etc)

---

## VALIDATION COMMANDS

<Define validation commands based on project's tools discovered in Phase 2>

Execute every command to ensure zero regressions and 100% feature correctness.

### Level 1: Syntax & Style

```bash
# TypeScript type checking
npm run type-check

# ESLint (must pass with 0 errors)
npm run lint

# Prettier formatting check
npm run format:check
```

**Expected**: All commands pass with exit code 0

### Level 2: Unit Tests

<Project-specific unit test commands>

### Level 3: Integration Tests

<Project-specific integration test commands>

### Level 4: Manual Validation

<Feature-specific manual testing steps - API calls, UI testing, PRD scenario verification, etc.>

### Level 5: Additional Validation (Optional)

<MCP servers or additional CLI tools if available>

---

## ACCEPTANCE CRITERIA

<List specific, measurable criteria that must be met for completion>

- [ ] Feature implements all specified functionality
- [ ] All validation commands pass with zero errors
- [ ] Unit test coverage meets requirements (80%+)
- [ ] Integration tests verify end-to-end workflows
- [ ] Code follows project conventions and patterns
- [ ] No regressions in existing functionality
- [ ] Documentation is updated (if applicable)
- [ ] Performance meets requirements (if applicable)
- [ ] Security considerations addressed (if applicable)
- [ ] **[If agent feature]** All PRD Section 4.3 scenarios pass as acceptance criteria
- [ ] **[If using technology]** External API integration works per technology profile

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Full test suite passes (unit + integration)
- [ ] No linting errors (npm run lint)
- [ ] No formatting errors (npm run format:check)
- [ ] No type checking errors (npm run type-check)
- [ ] Build succeeds (npm run build)
- [ ] All acceptance criteria met
- [ ] Code reviewed for quality and maintainability

---

## NOTES

<Additional context, design decisions, trade-offs, decisions from Phase 0 scope analysis>

## PIV-Automator-Hooks

> **Only include this section when hooks are enabled (CLAUDE.md `hooks_enabled: true` or `--with-hooks` flag).**

plan_status: ready_for_execution
phase_source: [Phase N from PRD]
independent_tasks_count: [N]
dependent_chains: [N]
technologies_consumed: [comma-separated profile names]
next_suggested_command: execute
next_arg: ".agents/plans/[this-file].md"
estimated_complexity: [low|medium|high]
confidence: [N]/10
```

## Output Format

**Filename**: `.agents/plans/{kebab-case-descriptive-name}.md`

- Replace `{kebab-case-descriptive-name}` with short, descriptive feature name
- Examples: `add-user-authentication.md`, `implement-search-api.md`, `refactor-database-layer.md`

**Directory**: Create `.agents/plans/` if it doesn't exist

### Plan Length Guidelines

**STRICT LENGTH REQUIREMENT**: 500-750 lines
**HARD MINIMUM**: 500 lines - NEVER go below this limit under any circumstances
**HARD MAXIMUM**: 750 lines - NEVER exceed this limit under any circumstances

This is a non-negotiable constraint. The plan MUST fall within the 500-750 line range. Count your lines before finalizing.

The plan must contain ONLY valuable, actionable information. Every line must earn its place. No filler, no redundancy, no obvious details.

**Core Principles:**

- **Value Density**: If a line doesn't directly enable implementation, delete it
- **No Repetition**: Never repeat project-wide conventions already in CLAUDE.md
- **Precision Over Prose**: Bullet points and code > paragraphs
- **Reference, Don't Explain**: Use `MIRROR: path/file.py:15-30` instead of lengthy explanations
- **Essential Only**: Include only checks that catch real issues

**If approaching 750 lines:**
- STOP and ruthlessly cut low-value content
- Consolidate similar tasks into grouped sections
- Replace explanations with pattern references
- Remove any validation commands beyond essential checks
- Delete anything the execution agent could infer from context

**If under 500 lines:**
- The plan is INCOMPLETE - you must add more detail
- Ensure all context references include specific line numbers
- Verify edge cases and error handling are documented
- Add testing strategy details specific to the feature
- Include integration points that might be overlooked
- Check that all gotchas and anti-patterns are captured
- Add code examples for complex implementations
- Expand validation commands with expected outputs
- Include more pattern references from codebase

**Before Submitting - MANDATORY CHECK:**
1. Count the total lines in your plan
2. If < 500 lines: Add missing detail until you reach 500+
3. If > 750 lines: Cut low-value content until you reach 750 or below
4. Only submit when line count is between 500-750 inclusive

## Quality Criteria

### Context Completeness ✓

- [ ] All necessary patterns identified and documented
- [ ] External library usage documented with links
- [ ] Integration points clearly mapped
- [ ] Gotchas and anti-patterns captured
- [ ] Every task has executable validation command
- [ ] Technology profiles integrated and referenced in tasks

### Implementation Ready ✓

- [ ] Another developer could execute without additional context
- [ ] Tasks ordered by dependency (can execute top-to-bottom)
- [ ] Each task is atomic and independently testable
- [ ] Pattern references include specific file:line numbers
- [ ] Technology profile endpoints referenced where applicable

### Pattern Consistency ✓

- [ ] Tasks follow existing codebase conventions
- [ ] New patterns justified with clear rationale
- [ ] No reinvention of existing patterns or utils
- [ ] Testing approach matches project standards
- [ ] Agent behavior matches PRD decision trees and scenarios

### Information Density ✓

- [ ] No generic references (all specific and actionable)
- [ ] URLs include section anchors when applicable
- [ ] Task descriptions use codebase keywords
- [ ] Validation commands are non interactive executable
- [ ] Technology constraints documented from profiles

## Success Metrics

**One-Pass Implementation**: Execution agent can complete feature without additional research or clarification

**Validation Complete**: Every task has at least one working validation command

**Context Rich**: The Plan passes "No Prior Knowledge Test" - someone unfamiliar with codebase can implement using only Plan content

**Technology Integration**: External API/platform integration clearly specified from technology profiles

**Confidence Score**: #/10 that execution will succeed on first attempt

## Report

After creating the Plan, provide:

- **Line count**: [Must be 500-750] - If outside range, fix before reporting
- **File path**: Full path to created Plan file
- **Summary**: Brief description of feature and approach
- **Complexity**: Low/Medium/High
- **Risks**: Key implementation considerations
- **Technology Integration**: [List of `.agents/reference/` profiles consumed, if any]
- **Agent Behavior**: [Yes/No - does this implement agent decision trees?]
- **Confidence**: X/10 for one-pass success
- **Next Step**: → Run `/execute .agents/plans/{plan-file}.md` to begin implementation

### Reasoning

Output 4-8 bullets summarizing the planning process:

```
### Reasoning
- Analyzed PRD Phase [N] with [N] user stories
- Consumed [N] technology profiles
- Explored [N] approaches for [key decision], selected [choice]
- Identified [N] independent tasks, [N] sequential chains
- Mapped [N] PRD scenarios to validation strategy
```

### Reflection

Self-critique the generated plan (terminal only):
- Does the plan enable one-pass implementation success?
- Are technology profile constraints reflected in task descriptions?
- Do validation commands cover all relevant PRD scenarios?
- Is every decision from Phase 0 baked into the plan?
- Is line count within 500-750?
