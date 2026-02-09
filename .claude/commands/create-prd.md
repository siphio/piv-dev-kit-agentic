---
description: Create an agent-native Product Requirements Document from conversation
argument-hint: [output-filename]
---

# Create PRD: Agent-Native Product Requirements Document

## Overview

Generate a comprehensive Product Requirements Document (PRD) optimized for AI agent development. This PRD captures not just what the agent does, but how it thinks, decides, and recovers.

The PRD serves three purposes:
1. **Product truth** - Single source of requirements for stakeholders
2. **AI context** - Reference document for `/plan-feature` after context resets
3. **Validation contract** - Scenario definitions that `/validate-implementation` tests against

## Output File

Write the PRD to: `$ARGUMENTS` (default: `PRD.md`)

## CRITICAL: Length Constraint

**The PRD MUST be between 500-750 lines.**

- Enables efficient human reading and validation
- Avoids context bloat when loaded by AI assistants
- Forces prioritization of essential information
- Each phase must be self-contained for `/plan-feature` workflow

**If exceeding 750 lines:** Trim generic sections, reduce examples, compress non-agent sections.
**If under 500 lines:** Expand agent behavior scenarios, add more decision paths, detail error recovery.

## Reasoning Approach

**CoT Style:** Few-shot

Before writing each PRD section, reason through:
1. Extract agent identity, autonomy level, and personality from conversation
2. Rationalize technology decisions — capture the *why* from discussion, not just the *what*
3. Define agent behaviors with explicit decision trees covering happy paths AND failures
4. Create 8-15 testable scenarios (Given/When/Then/Error/Edge) from conversation examples
5. Link every user story to at least one scenario bidirectionally
6. Phase the implementation so each phase is self-contained after `/clear` + `/prime`

**Few-shot example for scenario quality:**

Good scenario:
```
Given: User provides a company URL
When: Agent researches the company
Then: Agent returns 3-5 key facts
Error: If URL unreachable, agent reports failure and suggests manual input
Edge: URL redirects to a different domain
```

Bad scenario:
```
Given: Input
When: Agent runs
Then: Output
```

## Hook Toggle

Check CLAUDE.md for `## PIV Configuration` → `hooks_enabled` setting.
If arguments contain `--with-hooks`, enable hooks. If `--no-hooks`, disable.
Strip hook flags from arguments before using remaining text as output filename.

---

## PRD Structure

### Status Legend (Use Throughout)

```
⚪ Not Started | 🟡 In Progress | 🟢 Complete | 🔴 Blocked
```

---

### **1. Executive Summary** (40-60 lines)

- Product overview (2-3 paragraphs, plain English)
- Core value proposition - what does this agent automate?
- MVP goal statement (single sentence)
- Agent type classification: Autonomous / Semi-autonomous / Assistive

---

### **2. Agent Identity** (30-50 lines)

> **This section defines WHO the agent is, not just what it does.**

- **Purpose**: One-sentence agent mission
- **Personality & Tone**: How the agent communicates (formal/casual, verbose/concise)
- **Decision Philosophy**: How the agent prioritizes competing objectives
  - Example: "Prefer accuracy over speed. When uncertain, ask the user rather than guess."
- **Autonomy Level**: What the agent does independently vs. what requires human approval
- **Core Competencies**: 3-5 things this agent must excel at

---

### **3. Technology Decisions** (40-60 lines)

> **Captures the rationale from your conversation. Feeds directly into `/research-stack`.**

For EACH external technology, API, or platform the agent will use:

```markdown
#### [Technology Name]

**What**: [Brief description - e.g., "Email outreach automation platform"]
**Why chosen**: [Rationale from conversation - why this over alternatives]
**Agent needs from it**: [Specific capabilities the agent requires]
  - [Capability 1]: [Brief description]
  - [Capability 2]: [Brief description]
**Integration approach**: [REST API / SDK / MCP tool / etc.]
**Known constraints**: [Rate limits, pricing tiers, auth requirements mentioned in discussion]
```

**IMPORTANT**: This section captures INTENT and RATIONALE. Deep API documentation is produced by `/research-stack` after the PRD.

---

### **4. Agent Behavior Specification** (80-120 lines)

> **MANDATORY for all agent projects. This is the most important section of the PRD. It defines how the agent thinks and acts, and directly feeds into validation.**

#### 4.1 Tool Orchestration

| Tool/Capability | Purpose | When Used | Fallback If Unavailable |
|----------------|---------|-----------|------------------------|
| [Tool Name] | [What it does] | [Trigger condition] | [What happens instead] |

#### 4.2 Decision Trees

Document key decision points the agent faces:

```markdown
**Decision: [Decision Name]**
- IF [condition A] → [action A]
- ELSE IF [condition B] → [action B]
- ELSE → [default action]
- ON FAILURE → [recovery action]
```

Include 3-5 critical decision trees that define the agent's core logic.

#### 4.3 Scenario Definitions

> **These scenarios become test cases in `/validate-implementation`.**

For each major workflow the agent performs:

```markdown
**Scenario: [Descriptive Name]**
- Given: [Initial state/input]
- When: [Trigger/action]
- Then: [Expected outcome]
- Error path: [What happens if it fails]
- Edge case: [Unusual input/state variation]
```

Define 8-15 scenarios covering:
- Happy paths (3-5 scenarios)
- Error recovery (2-4 scenarios)
- Edge cases (2-4 scenarios)
- Integration failures (1-3 scenarios)

#### 4.4 Error Recovery Patterns

| Error Type | Detection | Recovery Action | User Communication |
|-----------|-----------|-----------------|-------------------|
| [API timeout] | [How detected] | [What agent does] | [What user sees] |
| [Invalid input] | [How detected] | [What agent does] | [What user sees] |
| [Service down] | [How detected] | [What agent does] | [What user sees] |

---

### **5. User Stories** (60-80 lines)

5-8 user stories, each with status tracking and acceptance criteria.

```markdown
### US-001: [Story Title]

**As a** [user type]
**I want to** [action]
**So that** [benefit]

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

**Scenarios**: SC-001, SC-003 (references to Section 4.3)
**Phase:** [Which implementation phase]
**Status:** ⚪ Not Started
```

**IMPORTANT:** User stories reference scenarios from Section 4.3. Each scenario maps to at least one user story.

---

### **6. Architecture & Patterns** (40-50 lines)

- High-level architecture (plain English description)
- Agent pipeline flow (step-by-step what happens from input to output)
- Directory structure (brief)
- Key patterns to follow (2-4 patterns with one-line explanations)

**Keep this section scannable - no code snippets. Reference docs if detail needed.**

---

### **7. Technology Stack** (25-35 lines)

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Runtime | [Name] | [Version] | [Why] |
| Agent Framework | [Name] | [Version] | [Why] |
| Database | [Name] | [Version] | [Why] |
| Testing | [Name] | [Version] | [Why] |

**External Services:**

| Service | API Type | Auth | Purpose |
|---------|----------|------|---------|
| [Name] | [REST/GraphQL/SDK] | [API key/OAuth] | [What agent uses it for] |

---

### **8. MVP Scope** (30-40 lines)

**In Scope:**
- ✅ Core functionality items
- ✅ Group by category (Agent Core, Tools, Integrations, Pipeline)

**Out of Scope:**
- ❌ Deferred features with brief reason

---

### **9. Implementation Phases** (120-160 lines)

> **WORKFLOW CONTEXT:** Each phase is a self-contained brief for `/plan-feature`. After `/clear` and `/prime`, the user reads a phase, discusses, then runs `/plan-feature`.

Break MVP into 3-4 phases. Each phase: 40-55 lines.

```markdown
---

## Phase [N]: [Descriptive Name]

**Status:** ⚪ Not Started | 🟡 In Progress | 🟢 Complete

**User Stories Addressed:** US-XXX, US-XXX
**Scenarios Validated:** SC-XXX, SC-XXX (from Section 4.3)

**What This Phase Delivers:**
2-3 sentences in plain English.

**Prerequisites:**
- Previous phases that must be complete
- External dependencies (API keys, services, accounts)

**Scope - Included:**
- ✅ Deliverable 1: Brief description
- ✅ Deliverable 2: Brief description

**Scope - NOT Included:**
- ❌ What's deferred (prevents scope creep)

**Technologies Used This Phase:**
- [Technology]: [Specific features/endpoints needed]
  (Reference: `.agents/reference/{technology}-profile.md`)

**Key Technical Decisions:**
- Decision 1: Rationale in plain English
- Decision 2: Rationale in plain English

**Discussion Points (Clarify Before Planning):**
- Question 1 that affects implementation approach?
- Question 2 about user preference or technical choice?

**Done When:**
- Observable outcome 1
- Observable outcome 2
- Scenarios SC-XXX pass validation

---
```

---

### **10. Current Focus** (15-25 lines)

> **Update this section at the start of each development session.**

```markdown
## Current Focus

**Active Phase:** Phase [N] - [Name]
**Active Stories:** US-XXX, US-XXX
**Status:** 🟡 In Progress
**Research Status:** [Complete / Pending] (has /research-stack been run?)

**Blockers:**
- [Any blockers, or "None"]

**Session Context:**
- [Brief notes for next session]

**Last Updated:** [Date]
```

---

### **11. Success Criteria** (20-30 lines)

**MVP is successful when:**
1. [Agent can complete X workflow end-to-end]
2. [All scenarios from Section 4.3 pass validation]
3. [Quality/performance bar]

**Validation Commands:**
```bash
# Commands to verify MVP success
[test command]
[lint command]
```

---

### **12. Risks & Mitigations** (15-25 lines)

| Risk | Impact | Mitigation |
|------|--------|------------|
| [API rate limits] | High/Med/Low | [Strategy] |
| [Service outage] | High/Med/Low | [Strategy] |

---

### **13. Document History** (5-10 lines)

| Date | Version | Changes |
|------|---------|---------|
| [Date] | 1.0 | Initial PRD |

---

## Instructions

### 1. Extract Requirements from Conversation
- Review full conversation history
- Identify explicit and implicit needs
- Capture technology decisions WITH rationale
- Note agent personality and decision-making preferences discussed
- Extract scenario descriptions from examples given

### 2. Prioritize Agent Behavior
- Agent Behavior Specification (Section 4) should be the most detailed section
- Every workflow the agent performs needs scenario definitions
- Decision trees must cover the critical paths discussed in conversation
- Error recovery must be explicit, not assumed

### 3. Map Technologies to Capabilities
- For each technology mentioned in conversation, document:
  - Why it was chosen (the conversation context)
  - What the agent specifically needs from it
  - How it fits the agent's workflow
- This mapping feeds `/research-stack` which runs after PRD creation

### 4. Write the PRD
- Plain English over code snippets
- Concrete examples over abstractions
- Scannable formatting (bullets, tables, headers)

### 5. Verify Length
- Count lines before finalizing
- **Must be 500-750 lines**
- If trimming needed: compress non-agent sections first, NEVER trim Section 4

### 6. Quality Checks
- [ ] All sections present
- [ ] Agent Behavior Specification is comprehensive (Section 4)
- [ ] Technology Decisions capture conversation rationale (Section 3)
- [ ] Scenario definitions are testable (Section 4.3)
- [ ] User stories reference scenarios
- [ ] Phases reference technologies and scenarios
- [ ] Current Focus section included
- [ ] Within 500-750 line limit

---

## Output Confirmation

After creating the PRD:
1. Confirm file path
2. Report line count (must be 500-750)
3. List any assumptions made
4. Suggest which phase to start with
5. **Remind user**: Run `/research-stack` before `/plan-feature` to generate technology profiles

### Reasoning

Output 4-8 bullets summarizing your generation process:

```
### Reasoning
- Extracted [N] technology decisions from conversation
- Defined [N] scenarios ([N] happy, [N] error, [N] edge)
- [N] user stories mapped to scenarios
- Phased into [N] implementation phases
- Key assumption: [if any]
```

### Reflection

Self-critique the generated PRD (terminal only):
- Does the Agent Behavior Specification fully reflect the conversation?
- Are all technology decisions captured with rationale?
- Are scenarios testable and specific (not generic)?
- Do all phases reference scenarios and technologies?
- Is the line count within 500-750?

### PIV-Automator-Hooks (If Enabled)

If hooks are enabled, append to the PRD file:

```
## PIV-Automator-Hooks
prd_status: complete
technologies_to_research: [comma-separated list]
scenarios_count: [N]
phases_count: [N]
next_suggested_command: research-stack
next_arg: "[PRD filename]"
confidence: [high|medium|low]
```

---

## Anti-Patterns to Avoid

- ❌ Code snippets in PRD (save for plan-feature)
- ❌ Generic user stories without scenario references
- ❌ Optional Agent Behavior section (it's MANDATORY for agent projects)
- ❌ Technology decisions without rationale
- ❌ Scenarios without error paths
- ❌ Phases without technology references
- ❌ Over 750 lines (forces better prioritization)
