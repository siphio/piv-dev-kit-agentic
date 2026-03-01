---
description: Guided conversation to produce a module specification
argument-hint: [module-name]
---

# Discuss Module: Guided Specification Conversation

## Overview

Guide the developer through defining a module's specification via structured, probing dialogue. This is NOT a form — it is a conversation. Ask targeted questions, probe for completeness, recommend with reasoning tied to the project's vision and architecture.

The output is a `specification.md` file in `context/modules/{module-name}/` that captures the module's bounded responsibility, slice breakdown, data contracts, technology requirements, infrastructure needs, and testing seeds.

**Run this command for each module in the system. The specification feeds into `/plan-feature` for slice-level planning.**

## Reasoning Approach

**CoT Style:** Few-shot

Before each conversational turn, reason through what information is still missing and what question will extract the most useful context. Ask questions that demonstrate understanding of the project — not generic forms.

**Few-shot examples for question quality:**

Good:
- "Module 0 serves map queries — does it need PostGIS for spatial indexing, or is GeoJSON in MongoDB sufficient given your read-heavy pattern?"
- "You mentioned Module 2 consumes location data from Module 0. What format — GeoJSON features or just lat/lng pairs? This affects the contract shape and whether Module 0 needs a transformation layer."
- "The vision says 'real-time updates' for this module. Does that mean WebSocket push, SSE, or polling on an interval? Each has different infrastructure implications."

Bad:
- "What database do you want?"
- "What are the requirements?"
- "Tell me about the module."

**Principle:** Every question must reference something concrete — the vision, the architecture, another module's contract, or a technology constraint. Generic questions waste conversational turns.

## Arguments

Parse the module name from `$ARGUMENTS`.

- If `$ARGUMENTS` is empty, ask the developer which module they want to discuss
- Strip whitespace and normalize to kebab-case for folder naming
- The module name becomes the folder name under `context/modules/`

## Hooks

Hooks are always enabled. `## PIV-Automator-Hooks` is appended to the specification file after generation.

---

## Process

### Step 1: Parse Module Name

Extract the module name from `$ARGUMENTS`. Normalize to kebab-case for the folder path.

If no argument provided, ask: "Which module do you want to specify? List the modules from your architecture if you have them."

### Step 2: Locate or Create Module Folder

Check if `context/modules/{module-name}/` exists.

- If it exists, continue to Step 3
- If it does not exist, create it:
  ```
  context/modules/{module-name}/
  ```

### Step 3: Read Project Context

Read these files for background context. They inform every question you ask.

1. **`context/vision.md`** — The project's goals, constraints, and non-negotiables. Reference this when probing for alignment.
2. **`context/architecture.md`** — System topology, module boundaries, communication patterns. Reference this when probing for contracts and infrastructure.

If either file is missing, warn the developer:
"I couldn't find `context/vision.md` (or `architecture.md`). I can still have this conversation, but my recommendations will be less grounded. Consider creating these files first."

Continue regardless — the conversation is still valuable.

### Step 4: Check for Existing Specification

Read `context/modules/{module-name}/specification.md` if it exists.

- **If complete:** Inform the developer: "This module already has a complete specification. Do you want to revise it, or start fresh?"
- **If partial (has `Specification: partial` in Status section):** Identify which sections are incomplete. Resume the conversation from the first gap. Tell the developer: "I found a partial specification. Sections [X, Y, Z] are incomplete. Let's pick up from [first incomplete section]."
- **If not found:** Start fresh from Step 5.

### Step 5: Conversation Phase

Walk through each specification section in order. For EACH section:

1. Explain briefly what this section captures and why it matters
2. Ask 1-3 targeted questions that reference vision.md and architecture.md
3. Listen to answers, probe for completeness and measurability
4. Recommend with reasoning when you see an obvious choice
5. Confirm understanding before moving to the next section

**CRITICAL behavioral rules during conversation:**

- **Probe for MEASURABLE gates.** Not "works correctly" but "accuracy >= 90%" or "responds within 200ms" or "handles 100 concurrent connections." If the developer says something vague, push back: "What's the measurable threshold for success here?"
- **Data contracts must be bidirectional.** When discussing what this module provides, also ask what it consumes. When discussing what it consumes, confirm the provider module knows about this dependency. Remind the developer: "Every data contract has two sides — let's make sure both modules agree on the format."
- **Track all technologies mentioned.** Keep a running list. At the end, present it for `/research-stack` follow-up.
- **Reference vision.md and architecture.md constantly.** Tie every recommendation back to the project's stated goals.

#### Section A: Module Purpose and Responsibility Boundary

Ask what this module does — its bounded context. Push for clarity on what is IN scope and what is NOT. Reference architecture.md for where this module sits in the system.

Questions to consider:
- "Based on the architecture, this module sits between [X] and [Y]. What is its single responsibility?"
- "What should this module explicitly NOT do? Drawing the boundary prevents scope creep."
- "The vision mentions [goal]. How does this module contribute to that?"

#### Section B: Slice Breakdown

Slices are implementation units — the building blocks that get planned and executed individually. Each slice should be independently deliverable.

Questions to consider:
- "What are the natural implementation units? Think about what you could build, test, and ship independently."
- "Which slices depend on others? Let's map the dependency graph."
- "Is any slice large enough to split further? A good slice takes 1-2 focused sessions."

Assign slice IDs in format `01-{short-id}`, `02-{short-id}`, etc.

#### Section C: Data Contracts

This section defines the module's API surface — what it provides to other modules and what it consumes from them.

**Bidirectional requirement:** For every "provides" entry, ask who consumes it and in what format. For every "consumes" entry, confirm the provider module and format.

Questions to consider:
- "What data does this module expose to other modules? Not just endpoints — events, shared state, file outputs?"
- "What data does this module need from other modules? What happens if that data is unavailable or stale?"
- "What's the frequency — real-time, batch, on-demand? This affects infrastructure choices."
- "What format — JSON over HTTP, protobuf, shared database table, message queue?"

#### Section D: Technology Requirements and Recommendations

Identify technologies this module needs. For each, provide a recommendation WITH reasoning tied to the vision or architecture.

Questions to consider:
- "The architecture specifies [pattern]. Does this module need anything beyond what's already in the stack?"
- "I notice [technology X] could handle [requirement]. It fits because [reason from vision/architecture]. Does that align with your thinking?"
- "Are there constraints — licensing, performance, team familiarity — that should steer the technology choice?"

Mark whether a technology profile already exists in `.agents/reference/`. If not, flag it for `/research-stack`.

#### Section E: Infrastructure Needs

What services, databases, queues, caches, or external resources does this module require?

Questions to consider:
- "Does this module need its own database, or does it share with another module?"
- "Any background workers, scheduled jobs, or queue consumers?"
- "What about caching? The vision mentions [performance requirement] — does this module need a cache layer?"

#### Section F: Testing Scenario Seeds

Define at least 3 testing scenarios per module. These seed the test strategy for each slice.

**Push for measurable success criteria in every scenario.**

Questions to consider:
- "What's the happy path? Walk me through the ideal flow from input to output."
- "What breaks it? What's the most likely failure mode?"
- "What's the edge case that would surprise you in production?"
- "For each scenario, what's the measurable gate — not 'it works' but 'response time < 500ms' or 'accuracy >= 95%'?"

### Step 6: Track Technologies

Maintain a running list of every technology mentioned during the conversation. At the end, present the list:

```
### Technologies Identified

| Technology | Mentioned In | Profile Exists? |
|------------|-------------|----------------|
| [tech] | [section] | [Yes/No] |

**Profiles needed for `/research-stack`:** [comma-list or "none"]
```

### Step 7: Generate Specification

When ALL sections have been covered in conversation, generate the specification file from the template below. Write to:

```
context/modules/{module-name}/specification.md
```

Present the full specification to the developer for review. Ask: "Here's the complete specification. Review it and let me know what needs revision. I'll update until you approve."

### Step 8: Revise Until Approved

Iterate on the specification based on developer feedback. Make targeted edits — do not regenerate the entire file for small changes.

### Step 9: Handle Incomplete Conversations

If the developer exits before all sections are covered:

1. Generate the specification with completed sections filled in
2. Mark incomplete sections with `[INCOMPLETE — resume with /discuss-module {module-name}]`
3. Set `Specification: partial` in the Status section
4. Write the file so progress is not lost
5. Inform the developer: "Saved partial specification. Run `/discuss-module {module-name}` to resume from where we left off."

---

## Specification Template

Write the specification using this exact structure:

```markdown
# Module: {module-name}

## Purpose
[What this module does — its bounded responsibility]

## Slice Breakdown
| Slice ID | Name | Description | Dependencies |
|----------|------|-------------|--------------|
| 01-{id} | {name} | {what it builds} | {other slices or "none"} |

## Data Contracts

### Provides (to other modules)
| Data | Format | Consumer Module | Frequency |
|------|--------|----------------|-----------|

### Consumes (from other modules)
| Data | Format | Provider Module | Frequency |
|------|--------|----------------|-----------|

## Technology Requirements
| Technology | Purpose | Profile Exists? |
|------------|---------|----------------|

## Infrastructure
| Service | Purpose | Provisioning |
|---------|---------|-------------|

## Testing Seeds
| Scenario | Type | What to Test |
|----------|------|-------------|

## Status
- Specification: [complete/partial]
- Slices defined: [N]
- Technologies needing profiles: [list or "none"]
```

---

## Output Confirmation

After the developer approves the specification:

1. Confirm file path
2. Report number of slices defined
3. List technologies needing profiles
4. Suggest next step: "Run `/discuss-slice {first-slice-id}` to begin detailed slice planning, or `/research-stack` if new technology profiles are needed."

### Reasoning

Output 4-8 bullets summarizing the conversation:

```
### Reasoning
- Identified module boundary: [what this module owns]
- Defined [N] slices with [N] dependency chains
- Mapped [N] data contracts ([N] provides, [N] consumes)
- Identified [N] technologies, [N] needing new profiles
- Key design decision: [most significant choice made]
- Measurable gates established for [N] testing scenarios
```

### Reflection

Self-critique the specification (terminal only):

- Does the module boundary align with architecture.md?
- Are all data contracts bidirectional — both sides documented?
- Are testing scenarios measurable, not vague?
- Are all mentioned technologies tracked for profiling?
- Does the slice breakdown enable independent delivery?

---

## PIV-Automator-Hooks

Append to the specification file:

```
## PIV-Automator-Hooks
module_name: {name}
spec_status: complete
slices_defined: {N}
technologies_identified: {comma-list}
profiles_needed: {comma-list or "none"}
next_suggested_command: discuss-slice
next_arg: "{first-slice-id}"
confidence: high
```

---

## Anti-Patterns to Avoid

- Do NOT ask generic questions that ignore project context
- Do NOT accept vague success criteria — push for measurable gates
- Do NOT skip the bidirectional check on data contracts
- Do NOT generate the specification before covering all sections (unless saving partial)
- Do NOT forget to track technologies for `/research-stack` follow-up
- Do NOT write code snippets in the specification — save for slice planning
