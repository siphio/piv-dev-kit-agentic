---
description: Create a Product Requirements Document from conversation
argument-hint: [output-filename]
---

# Create PRD: Generate Product Requirements Document

## Overview

Generate a comprehensive Product Requirements Document (PRD) based on the current conversation context. The PRD serves two purposes:
1. **Product truth** - Single source of requirements for stakeholders
2. **AI context** - Reference document for `/plan-feature` after context resets

## Output File

Write the PRD to: `$ARGUMENTS` (default: `PRD.md`)

## CRITICAL: Length Constraint

**The PRD MUST be between 500-750 lines.**

This constraint exists because:
- Enables efficient human reading and validation
- Avoids context bloat when loaded by AI assistants
- Forces prioritization of essential information
- Each phase must be self-contained for `/plan-feature` workflow

**If exceeding 750 lines:** Trim API specifications, reduce examples, move detailed schemas to appendix references.
**If under 500 lines:** Add more context to phases, expand discussion points, include more acceptance criteria.

---

## PRD Structure

### Status Legend (Use Throughout)

```
⚪ Not Started | 🟡 In Progress | 🟢 Complete | 🔴 Blocked
```

---

### **1. Executive Summary** (50-75 lines)

- Product overview (2-3 paragraphs, plain English)
- Core value proposition
- MVP goal statement (single sentence)

---

### **2. Mission & Principles** (25-40 lines)

- Mission statement
- 3-5 core principles with brief explanations

---

### **3. Target Users** (30-50 lines)

**Primary Persona:**
- Who they are
- Technical comfort level
- Goals (3 bullets)
- Pain points (3 bullets)

---

### **4. MVP Scope** (40-60 lines)

**In Scope:**
- ✅ Core functionality items
- ✅ Group by category (Core, Technical, Integration)

**Out of Scope:**
- ❌ Deferred features with brief reason

---

### **5. User Stories** (80-120 lines)

5-8 user stories, each with status tracking and acceptance criteria.

**Format for each story:**

```markdown
### US-001: [Story Title]

**As a** [user type]
**I want to** [action]
**So that** [benefit]

**Acceptance Criteria:**
- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

**Phase:** [Which implementation phase addresses this]
**Status:** ⚪ Not Started
```

**IMPORTANT:** User stories are referenced by implementation phases. Each phase should list which US-XXX stories it fulfills.

---

### **6. Architecture & Patterns** (40-60 lines)

- High-level architecture (plain English description, not diagrams)
- Directory structure (brief)
- Key patterns to follow (2-4 patterns with one-line explanations)
- Technology-specific conventions

**Keep this section scannable - no code snippets. Reference docs if detail needed.**

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

### **8. Technology Stack** (30-40 lines)

| Component | Technology | Version |
|-----------|------------|---------|
| Backend | [Name] | [Version] |
| Frontend | [Name] | [Version] |
| Database | [Name] | [Version] |
| Testing | [Name] | [Version] |

**Key Dependencies:** List critical libraries with purpose.

---

### **9. Current Focus** (20-30 lines)

> **Update this section at the start of each development session.**

```markdown
## Current Focus

**Active Phase:** Phase [N] - [Name]
**Active Stories:** US-XXX, US-XXX
**Status:** 🟡 In Progress

**Blockers:**
- [Any blockers, or "None"]

**Session Context:**
- [Brief notes for next session - what was decided, what's next]

**Last Updated:** [Date]
```

---

### **10. Implementation Phases** (150-200 lines)

> **WORKFLOW CONTEXT:** Each phase is a **self-contained brief** for the `/plan-feature` command. After `/clear` and `/prime`, the user reads a phase, discusses clarifications, then runs `/plan-feature`. Write phases to enable this workflow.

Break MVP into 3-4 phases. Each phase: 40-60 lines.

**Phase Format:**

```markdown
---

## Phase [N]: [Descriptive Name]

**Status:** ⚪ Not Started | 🟡 In Progress | 🟢 Complete

**User Stories Addressed:** US-XXX, US-XXX

**What This Phase Delivers:**
2-3 sentences in plain English. What gets built, why it matters, how it fits the product.

**Prerequisites:**
- Previous phases that must be complete
- External dependencies (API keys, services, accounts)
- Codebase elements this depends on

**Scope - Included:**
- ✅ Deliverable 1: Brief description
- ✅ Deliverable 2: Brief description
- ✅ Deliverable 3: Brief description

**Scope - NOT Included:**
- ❌ What's deferred (prevents scope creep)
- ❌ Explicit boundaries

**Key Technical Decisions:**
- Decision 1: Rationale in plain English
- Decision 2: Rationale in plain English

**Discussion Points (Clarify Before Planning):**
- Question 1 that affects implementation approach?
- Question 2 about user preference or technical choice?

**Done When:**
- Observable outcome 1
- Observable outcome 2
- Validation command or check to run

---
```

---

### **11. Success Criteria** (30-40 lines)

**MVP is successful when:**
1. [User can do X]
2. [System handles Y]
3. [Quality bar Z is met]

**Validation Commands:**
```bash
# Commands to verify MVP success
[test command]
[lint command]
```

---

### **12. Risks & Mitigations** (20-30 lines)

| Risk | Impact | Mitigation |
|------|--------|------------|
| [Risk 1] | High/Med/Low | [Strategy] |
| [Risk 2] | High/Med/Low | [Strategy] |

---

### **13. Document History** (10-15 lines)

| Date | Version | Changes |
|------|---------|---------|
| [Date] | 1.0 | Initial PRD |

---

## Instructions

### 1. Extract Requirements
- Review conversation history
- Identify explicit and implicit needs
- Note constraints and preferences

### 2. Synthesize
- Organize into sections above
- Fill reasonable assumptions (flag them)
- Ensure technical feasibility

### 3. Write the PRD
- Plain English over code snippets
- Concrete examples over abstractions
- Scannable formatting (bullets, tables, headers)

### 4. Verify Length
- Count lines before finalizing
- **Must be 500-750 lines**
- Trim or expand as needed

### 5. Quality Checks
- [ ] All sections present
- [ ] User stories have acceptance criteria
- [ ] Phases reference user stories
- [ ] Current Focus section included
- [ ] Status indicators on stories and phases
- [ ] Agent Validation Profile included (if agent project)
- [ ] Within 500-750 line limit

---

## Output Confirmation

After creating the PRD:
1. Confirm file path
2. Report line count (must be 500-750)
3. List any assumptions made
4. Suggest which phase to start with

---

## Anti-Patterns to Avoid

- ❌ Code snippets in PRD (save for plan-feature)
- ❌ Detailed API specs (brief overview only, details in planning)
- ❌ Generic descriptions (be specific and actionable)
- ❌ Missing status indicators
- ❌ Phases without user story references
- ❌ Over 750 lines (forces better prioritization)
