# Feature: Phase 2 - Enhanced Plan-Feature with Scoping & Recommendations

The following plan should be complete, but validate documentation and codebase patterns before implementing.

Pay special attention to existing section structures in commands. Mirror formatting exactly.

## Feature Description

Enhance the `/plan-feature` command with a built-in scoping and recommendations phase. Before generating the plan, the command analyzes the PRD phase and user stories, identifies all decision points, and outputs justified recommendations to the terminal. The user validates the approach conversationally, then the plan is generated with decisions baked in. This catches issues BEFORE planning starts, not after.

Additionally, update the project's global rules (CLAUDE.md) and the global rules generator (create_global_rules_prompt.md) to document this new workflow so it's consistently applied across all projects using the PIV framework.

## User Story

As a developer about to plan a feature implementation
I want to see scope analysis and decision recommendations with justifications before the plan is generated
So that I validate the approach early and the plan is generated with correct decisions baked in

## Problem Statement

The current plan-feature command jumps straight into planning. When it encounters ambiguity (multiple valid approaches, unclear requirements, missing context), it either:
1. Asks questions mid-planning (interrupting flow)
2. Makes assumptions that may be wrong (plan has flaws)
3. Includes "Discussion Points" that never get discussed (decisions deferred to executor)

This leads to plans that need rework or execution that goes off-track.

## Solution Statement

Add "Phase 0: Scope Analysis & Recommendations" to plan-feature that runs BEFORE plan generation:
1. Deeply analyzes PRD phase, user stories, and prerequisites
2. Identifies all decision points from "Discussion Points" sections
3. Outputs recommendations to terminal with justifications (WHY this choice)
4. User validates conversationally (confirms or adjusts)
5. Plan generated with validated decisions - no ambiguity for executor

Also codify this workflow in global rules so it's consistently applied.

## Feature Metadata

**Feature Type**: Enhancement
**Estimated Complexity**: Medium
**Primary Systems Affected**: plan-feature.md, CLAUDE.md, create_global_rules_prompt.md
**Dependencies**: None (markdown-only changes)

---

## CONTEXT REFERENCES

### Relevant Codebase Files - READ BEFORE IMPLEMENTING

- `.claude/commands/plan-feature.md` (full file, 568 lines) - Primary target, understand all existing phases
- `.claude/commands/create_global_rules_prompt.md` (full file, 138 lines) - Secondary target, understand section structure
- `CLAUDE.md` (full file, 164 lines) - Tertiary target, understand project rules format
- `PRD-intelligent-validation.md` (lines 358-403) - Phase 2 scope definition and acceptance criteria

### Files to Update

| File | Change Type | Description |
|------|-------------|-------------|
| `.claude/commands/plan-feature.md` | UPDATE | Add Phase 0 before existing Phase 1 |
| `CLAUDE.md` | UPDATE | Add section 11 documenting plan-feature workflow |
| `.claude/commands/create_global_rules_prompt.md` | UPDATE | Add section 13 for Planning Workflow guidance |

### Patterns to Follow

**Section Header Pattern** (from plan-feature.md):
```markdown
### Phase 1: Feature Understanding

**Deep Feature Analysis:**

- Bullet point instruction
- Another instruction
```

**Numbered Section Pattern** (from create_global_rules_prompt.md):
```markdown
12. **Service Configuration** (for AI Agent Projects)
    - Include this section only if...
    - Document which services...
```

**CLAUDE.md Section Pattern**:
```markdown
## 10. AI Assistant Instructions

When working on this project:

1. First instruction
2. Second instruction
```

---

## IMPLEMENTATION PLAN

### Implementation Phase 1: Update plan-feature.md

Add Phase 0 (Scope Analysis & Recommendations) that runs before the existing planning phases. This is the core change that enables pre-planning validation.

**Tasks:**
- Insert new "Phase 0: Scope Analysis & Recommendations" section
- Define the scope analysis process (PRD reading, user story mapping)
- Define recommendation output format with justifications
- Add conversational validation checkpoint
- Update the Planning Process flow to include Phase 0

### Implementation Phase 2: Update CLAUDE.md

Document the new plan-feature workflow in the project's global rules so contributors understand the process.

**Tasks:**
- Add new section 11 "Plan-Feature Workflow"
- Document the two-phase process (scope analysis → plan generation)
- Explain recommendation format with justifications
- Note the conversational validation checkpoint

### Implementation Phase 3: Update create_global_rules_prompt.md

Add guidance so that CLAUDE.md files generated for OTHER projects include instructions about the plan-feature workflow.

**Tasks:**
- Add section 13 "Planning Workflow"
- Include guidance for projects using PIV loop
- Specify that recommendations must include justifications

---

## VALIDATION STRATEGY

### Workflows to Test

| Workflow | Happy Path | Error Paths | State Changes |
|----------|------------|-------------|---------------|
| Plan-feature with PRD | Reads PRD → outputs recommendations → user validates → generates plan | No PRD found → skip scope analysis, proceed normally | None (terminal + file output) |
| Plan-feature without PRD | Skips scope analysis → proceeds to existing flow | N/A | None |

### Validation Acceptance Criteria

- [ ] plan-feature.md contains Phase 0 section
- [ ] Phase 0 instructions clearly define scope analysis process
- [ ] Recommendation format includes justification (WHY)
- [ ] CLAUDE.md contains section 11 documenting workflow
- [ ] create_global_rules_prompt.md contains section 13
- [ ] All section numbers are sequential
- [ ] Line counts within limits

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

---

### UPDATE `.claude/commands/plan-feature.md` - Add Phase 0

**Location**: Insert after line 33 (after "## Planning Process" header and before "### Phase 1: Feature Understanding")

**What this achieves:**
Adds a new "Phase 0: Scope Analysis & Recommendations" section that runs before any planning work begins. This phase analyzes the PRD, extracts decision points, and outputs justified recommendations to the terminal for user validation.

**Why this approach:**
Placing scope analysis as Phase 0 (before Phase 1) maintains the existing phase numbering while clearly indicating this is a pre-planning step. The terminal output format allows conversational validation without file artifacts.

**IMPLEMENT**: Insert the following section:

```markdown
### Phase 0: Scope Analysis & Recommendations (If PRD Exists)

> **When to run this phase:** If a PRD exists for the project (`.agents/PRD.md` or similar), run this phase FIRST. Output recommendations to terminal, wait for user validation, then proceed to Phase 1.

**If no PRD exists:** Skip Phase 0 and proceed directly to Phase 1.

**Scope Analysis Process:**

1. **Read the PRD Phase**
   - Identify which phase is being planned (from user input or PRD "Current Focus")
   - Extract: What this phase delivers, prerequisites, scope (included/excluded)
   - Extract: User stories addressed by this phase

2. **Map User Stories**
   - For each user story in scope, extract acceptance criteria
   - These become validation checkpoints for the plan

3. **Identify Decision Points**
   - Find "Discussion Points for Clarification" in the PRD phase
   - Find any ambiguous requirements or multiple valid approaches
   - List each decision that affects implementation

4. **Formulate Recommendations**
   - For each decision point, provide a recommendation with justification
   - Justification must reference PRD context, user stories, or codebase patterns
   - Format: Decision → Recommendation → Why (how it serves the goal)

**Terminal Output Format:**

```
## Scope Analysis: [Phase Name]

**PRD Phase:** [N] - [Name]
**User Stories:** US-XXX, US-XXX
**Prerequisites:** [Status of each - ✅ Complete / ⚪ Not Started / 🔴 Blocked]

### What This Phase Delivers
[2-3 sentence summary from PRD]

### Recommendations

1. **[Decision Point from PRD Discussion Points]**
   → [Your recommendation]
   Why: [Justification - how this serves the user story/goal, references to
   PRD requirements or codebase patterns that inform this choice]

2. **[Another Decision Point]**
   → [Your recommendation]
   Why: [Justification]

[Continue for all decision points...]

---

Ready to generate plan with these decisions, or would you like to discuss any recommendations?
```

**After User Validation:**
- If user confirms: Proceed to Phase 1 with decisions locked in
- If user adjusts: Update recommendations, confirm again
- Document final decisions in the plan's NOTES section
```

**PATTERN**: Mirror the structure of existing phases (Phase 1-5) with header, description, and bullet points
**GOTCHA**: This phase outputs to TERMINAL, not to the plan file. The plan file is generated in Phase 5.
**VALIDATE**: Read `.claude/commands/plan-feature.md` and verify Phase 0 appears before Phase 1

---

### UPDATE `.claude/commands/plan-feature.md` - Update Mission Section

**Location**: Lines 25-31, update the "Mission" section to reference Phase 0

**What this achieves:**
Updates the mission statement to reflect that scope analysis happens BEFORE plan generation, establishing the new workflow clearly at the top of the command.

**Why this approach:**
The mission section is the first thing read. Mentioning the scope analysis phase here ensures users understand the two-step process immediately.

**IMPLEMENT**: Update the Mission section to include scope analysis:

Find this text (approximately lines 25-31):
```markdown
## Mission

Transform a feature request into a **comprehensive implementation plan** through systematic codebase analysis, external research, and strategic planning.

**Core Principle**: We do NOT write code in this phase. Our goal is to create a context-rich implementation plan that enables one-pass implementation success.
```

Replace with:
```markdown
## Mission

Transform a feature request into a **comprehensive implementation plan** through systematic codebase analysis, external research, and strategic planning.

**Core Principle**: We do NOT write code in this phase. Our goal is to create a context-rich implementation plan that enables one-pass implementation success.

**Two-Phase Process** (when PRD exists):
1. **Scope Analysis** → Output recommendations with justifications to terminal → User validates
2. **Plan Generation** → Create implementation plan with validated decisions baked in
```

**VALIDATE**: Read the Mission section and verify it mentions the two-phase process

---

### UPDATE `.claude/commands/plan-feature.md` - Update Planning Process Header

**Location**: Line 33, update "## Planning Process" to note Phase 0

**What this achieves:**
Adds a note under the Planning Process header indicating that Phase 0 runs first when a PRD exists.

**IMPLEMENT**: Find line 33:
```markdown
## Planning Process
```

Add description after it:
```markdown
## Planning Process

> **Note:** If a PRD exists, start with Phase 0 (Scope Analysis) and output recommendations to terminal. Proceed to Phase 1 only after user validates the approach.
```

**VALIDATE**: Verify the note appears under Planning Process header

---

### UPDATE `CLAUDE.md` - Add Plan-Feature Workflow Section

**Location**: After section 10 (AI Assistant Instructions), add new section 11

**What this achieves:**
Documents the plan-feature workflow in the project's global rules so all contributors understand the two-phase process and recommendation format.

**Why this approach:**
CLAUDE.md is the source of truth for how to work on this project. Documenting the workflow here ensures consistency and serves as reference for both humans and AI assistants.

**IMPLEMENT**: Add new section 11 after line 163 (end of section 10):

```markdown

## 11. Plan-Feature Workflow

When running `/plan-feature` on a project with a PRD:

**Phase 0: Scope Analysis (Terminal Output)**
1. Read the PRD phase being planned
2. Extract user stories, prerequisites, scope boundaries
3. Identify decision points from "Discussion Points" sections
4. Output recommendations with justifications to terminal:
   ```
   ### Recommendations

   1. **[Decision Point]**
      → [Recommendation]
      Why: [Justification - how this serves the goal]
   ```
5. Wait for user validation (confirm or discuss changes)

**Plan Generation (File Output)**
- Only proceed after user validates approach
- Bake validated decisions into the plan
- Document decisions in NOTES section so executor understands constraints

**Key Principle:** Recommendations must include WHY - the justification based on PRD requirements, user stories, or codebase patterns. This enables informed validation.
```

**PATTERN**: Follow existing CLAUDE.md section format with `## N. Section Name` header
**GOTCHA**: Don't forget to add a blank line before the new section header
**VALIDATE**: Read CLAUDE.md and verify section 11 exists with correct content

---

### UPDATE `.claude/commands/create_global_rules_prompt.md` - Add Planning Workflow Section

**Location**: After section 12 (Service Configuration), add new section 13

**What this achieves:**
Adds guidance to the global rules generator so that CLAUDE.md files created for OTHER projects include instructions about the plan-feature workflow.

**Why this approach:**
create_global_rules_prompt.md is a template/guide for generating CLAUDE.md files. Including section 13 ensures all projects using the PIV framework have consistent documentation of the planning workflow.

**IMPLEMENT**: Add new section 13 after line 97 (end of section 12), before "## Process to Follow":

```markdown

13. **Planning Workflow** (for projects using PIV loop)
    - Document the plan-feature two-phase process if the project uses `/plan-feature`:
      1. **Scope Analysis**: Output recommendations with justifications to terminal
      2. **Plan Generation**: Create plan only after user validates approach
    - Explain that recommendations must include WHY:
      - Reference PRD requirements or user stories
      - Reference codebase patterns that inform the choice
      - Explain how the recommendation serves the implementation goal
    - Note the conversational validation checkpoint:
      - User reviews recommendations in terminal
      - Confirms or discusses changes
      - Plan generated with validated decisions baked in
    - This ensures plans are solid before execution begins
```

**PATTERN**: Follow existing numbered section format with indented bullet points
**GOTCHA**: Insert BEFORE the "## Process to Follow:" section (line 98), not after it
**VALIDATE**: Read create_global_rules_prompt.md and verify section 13 exists between section 12 and "## Process to Follow"

---

### VERIFY - Line Counts and Section Numbering

**What this achieves:**
Ensures all files remain within length constraints and section numbering is sequential.

**IMPLEMENT**: Run these verification checks:

1. **plan-feature.md line count**:
   - Original: 568 lines
   - Added: ~70 lines (Phase 0 section + Mission update + Planning Process note)
   - Expected: ~638 lines (within 750 limit)
   - Verify: `wc -l .claude/commands/plan-feature.md`

2. **CLAUDE.md line count**:
   - Original: 164 lines
   - Added: ~25 lines (section 11)
   - Expected: ~189 lines (within 500 limit)
   - Verify: `wc -l CLAUDE.md`

3. **create_global_rules_prompt.md line count**:
   - Original: 138 lines
   - Added: ~15 lines (section 13)
   - Expected: ~153 lines (well within limits)
   - Verify: `wc -l .claude/commands/create_global_rules_prompt.md`

4. **Section numbering verification**:
   - CLAUDE.md: Sections 1-11 sequential
   - create_global_rules_prompt.md: Sections 1-13 sequential

**VALIDATE**: All line counts within limits, all section numbers sequential

---

### VERIFY - Content Quality Check

**What this achieves:**
Final verification that all changes follow the PIV framework principles.

**IMPLEMENT**: Verify these quality criteria:

1. **Plain English over code snippets** ✓
   - Phase 0 uses natural language instructions
   - Recommendation format is readable, not code-heavy

2. **Context is King** ✓
   - Phase 0 maximizes context by reading PRD, user stories, decision points
   - Recommendations reference this context in justifications

3. **Human checkpoints** ✓
   - Explicit validation checkpoint after recommendations
   - User confirms before plan generation proceeds

4. **Self-contained phases** ✓
   - Phase 0 can run independently
   - Works after `/clear` + `/prime` + PRD read

**VALIDATE**: All quality criteria met

---

## TESTING STRATEGY

### Manual Validation

Since these are markdown command files, testing is manual workflow verification:

1. **plan-feature.md changes**:
   - Read the file and verify Phase 0 appears before Phase 1
   - Verify Mission section mentions two-phase process
   - Verify Planning Process note exists

2. **CLAUDE.md changes**:
   - Read the file and verify section 11 exists
   - Verify it documents the workflow correctly

3. **create_global_rules_prompt.md changes**:
   - Read the file and verify section 13 exists
   - Verify it appears between section 12 and "## Process to Follow"

### Integration Test

After all changes, mentally trace through the workflow:

1. User has a project with PRD
2. User runs `/plan-feature Phase 2`
3. Claude reads PRD Phase 2, extracts decision points
4. Claude outputs recommendations with justifications to terminal
5. User reviews: "Change recommendation #2 to X because Y"
6. Claude updates and confirms
7. User says "Generate the plan"
8. Claude creates plan file with decisions baked in

---

## VALIDATION COMMANDS

### Level 1: File Existence

```bash
# Verify all target files exist
ls -la .claude/commands/plan-feature.md
ls -la .claude/commands/create_global_rules_prompt.md
ls -la CLAUDE.md
```

**Expected**: All files exist

### Level 2: Content Verification

```bash
# Verify Phase 0 exists in plan-feature.md
grep -n "Phase 0" .claude/commands/plan-feature.md

# Verify section 11 exists in CLAUDE.md
grep -n "## 11\." CLAUDE.md

# Verify section 13 exists in create_global_rules_prompt.md
grep -n "13\." .claude/commands/create_global_rules_prompt.md

# Verify "Why:" appears in recommendation format
grep -n "Why:" .claude/commands/plan-feature.md
```

**Expected**: All patterns found

### Level 3: Line Count Check

```bash
# Verify files stay within limits
wc -l .claude/commands/plan-feature.md  # Should be < 750
wc -l CLAUDE.md                          # Should be < 500
wc -l .claude/commands/create_global_rules_prompt.md  # Should be < 500
```

**Expected**: All within limits

### Level 4: Section Numbering

```bash
# Check CLAUDE.md section headers are sequential
grep "^## [0-9]" CLAUDE.md

# Check create_global_rules_prompt sections are sequential
grep "^[0-9]*\." .claude/commands/create_global_rules_prompt.md
```

**Expected**: Sequential numbering with no gaps

---

## ACCEPTANCE CRITERIA

- [ ] plan-feature.md has new Phase 0 "Scope Analysis & Recommendations" section
- [ ] Phase 0 appears BEFORE Phase 1 in the Planning Process
- [ ] Phase 0 includes recommendation format with "Why:" justification
- [ ] Phase 0 includes terminal output format example
- [ ] Mission section mentions two-phase process
- [ ] Planning Process has note about starting with Phase 0 when PRD exists
- [ ] CLAUDE.md has new section 11 "Plan-Feature Workflow"
- [ ] Section 11 documents scope analysis, recommendations, and validation checkpoint
- [ ] create_global_rules_prompt.md has new section 13 "Planning Workflow"
- [ ] Section 13 includes guidance about justifications (WHY)
- [ ] All section numbers are sequential (no gaps)
- [ ] All files within line limits
- [ ] Changes follow plain English principle (scannable, not code-heavy)

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each file modification validated by reading
- [ ] Section numbering verified as sequential
- [ ] Line counts verified within limits
- [ ] PRD Phase 2 acceptance criteria addressed
- [ ] Ready for `/commit`

---

## NOTES

### Design Decisions Made

1. **Phase 0 vs separate command**: Scope analysis is Phase 0 of plan-feature, not a separate command. Rationale: keeps workflow simple (one command), natural checkpoint within existing process.

2. **Terminal output for recommendations**: Recommendations go to terminal, not a file. Rationale: recommendations are ephemeral conversation material; the plan captures the RESULT of decisions, not the deliberation.

3. **Justification format (Why:)**: Every recommendation includes "Why:" with justification. Rationale: enables informed validation; user understands the reasoning and can make better decisions.

4. **Skip Phase 0 if no PRD**: When no PRD exists, plan-feature proceeds directly to Phase 1. Rationale: backward compatibility; not all projects use PRDs.

5. **Document in three places**: Updated plan-feature.md (behavior), CLAUDE.md (project rules), create_global_rules_prompt.md (generator). Rationale: ensures consistency across this project and all projects using PIV framework.

### How This Serves the User Story (US-001)

| Acceptance Criteria | How Addressed |
|---------------------|---------------|
| Plan-feature outputs scope analysis to terminal | Phase 0 with terminal output format |
| Identifies decision points from PRD | Step 3 of Scope Analysis Process |
| Provides recommendations with justification | Step 4 + "Why:" format |
| Waits for user validation | Explicit checkpoint after recommendations |
| Plan generated with validated decisions | "After User Validation" section |

### Risks

1. **Phase 0 adds length to plan-feature.md**: Mitigated by keeping instructions concise. Final file ~638 lines, within 750 limit.

2. **Users may skip Phase 0**: Acceptable - it's conditional on PRD existence. Users without PRDs get existing behavior.

3. **Recommendation quality depends on PRD quality**: If PRD has vague "Discussion Points", recommendations will be vague. Mitigation: user can still discuss and refine.
