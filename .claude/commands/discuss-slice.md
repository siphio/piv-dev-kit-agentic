---
description: Guided conversation to produce a slice context document
argument-hint: [module-name/slice-id]
---

# Discuss Slice: Generate Slice Context Document

## Overview

Conduct a structured, multi-turn conversation to produce a `context.md` for a specific slice within a module. This is the PRIMARY artifact that agents consume when building a slice.

Read the parent module's `specification.md` to understand boundaries, then walk through technology choices, schema design, API design, infrastructure, error handling, and validation gates. The output is a complete, agent-ready context document that eliminates ambiguity before implementation begins.

**This command produces the build brief.** Every agent that touches this slice reads `context.md` first. Incomplete or vague context documents are the #1 cause of implementation failures.

## Reasoning Approach

**CoT Style:** Few-shot

Before each recommendation or question, reason from the module context to the specific slice need. Provide rationale with every suggestion — never ask bare questions.

**Examples of GOOD reasoning:**

- "Given Module 0 serves read-heavy map queries, I recommend denormalized GeoJSON storage because it avoids joins on every map tile request."
- "Since this slice handles user-facing search, we need sub-200ms P95 latency. That rules out cross-service joins — I recommend a materialized view or dedicated search index."
- "The specification says this slice produces events consumed by Module 2. That means we need a schema contract — let me define the event payload shape before we discuss the API."

**Examples of BAD reasoning (never do this):**

- "What format should the data be in?"
- "What database do you want?"
- "How should errors be handled?"

Always lead with a recommendation and its justification. The user corrects or approves — they should never face a blank canvas.

## Arguments

Parse `$ARGUMENTS` for the module name and slice identifier.

**Format:** `{module-name}/{slice-id}` or just `{slice-id}` if module can be inferred from current working context.

**Parsing rules:**
- Split on `/` — first segment is module name, second is slice ID
- If no `/` present, check if current directory or recent context implies a module; if ambiguous, ask
- Strip any leading/trailing whitespace
- Normalize to lowercase kebab-case for file path resolution

**Examples:**
- `core-data/ingest-pipeline` → module: `core-data`, slice: `ingest-pipeline`
- `ingest-pipeline` → module inferred from context, slice: `ingest-pipeline`

## Process

Execute these steps in order. Steps 1-5 are silent setup. Step 6 begins the conversation.

### Step 1: Parse Arguments

Extract `module-name` and `slice-id` from `$ARGUMENTS` using the rules above. If module cannot be determined, ask the user before proceeding.

### Step 2: Locate Parent Specification

Look for the parent module specification at:
```
context/modules/{module-name}/specification.md
```

**If the file does not exist:** Stop immediately. Output:
```
## Error: Module Specification Not Found

No specification found at `context/modules/{module-name}/specification.md`.

Run `/discuss-module {module-name}` first to create the module specification.
This slice cannot be defined without its parent module context.
```

Do NOT proceed without a parent specification.

### Step 3: Read Parent Specification

Read `context/modules/{module-name}/specification.md` in full. Extract:
- **Module purpose and bounded scope** — what this module owns
- **Slice boundaries** — which slices are defined and what each covers
- **Data contracts** — inputs consumed, outputs produced, event schemas
- **Cross-module dependencies** — what other modules this one talks to
- **Technology constraints** — any technology decisions already locked at module level
- **The specific slice entry** — find the slice matching `{slice-id}` and read its defined scope

If the slice ID does not appear in the specification, warn the user: "Slice `{slice-id}` is not listed in the module specification. Confirm this is a new slice or check the ID."

### Step 4: Read Broader Context

Read these files for project-wide context (skip any that do not exist):
- `context/vision.md` — product vision, goals, constraints
- `context/architecture.md` — system-level architecture, patterns, infrastructure decisions

These inform technology recommendations and validation gate targets.

### Step 5: Check for Existing Context

Check if `context/modules/{module-name}/slices/{slice-id}/context.md` already exists.

**If it exists and is complete** (has `context_status: complete` in hooks):
- Inform user: "A complete context document already exists. Do you want to revise it or start fresh?"
- Wait for response before proceeding.

**If it exists and is partial** (has `context_status: partial` or missing sections):
- Read the existing file and identify which sections are populated vs. empty/missing
- Resume the conversation from the first incomplete section
- Tell the user: "Found a partial context document. Sections [X, Y, Z] are complete. Resuming from [first gap]."

**If it does not exist:** Proceed to Step 6.

### Step 6: Conversation Phase

Walk through each section of the context template below. For each section:

1. **Present what you know** from the specification and broader context
2. **Make a concrete recommendation** with rationale tied to the module's purpose
3. **Ask targeted follow-up questions** to fill gaps or validate assumptions
4. **Wait for user response** before moving to the next section

**Section order:**

**6a. Technology Decisions**
- Recommend technologies based on module specification and architecture context
- For each technology, state WHY — not just what. Tie to the slice's specific workload
- Ask: "Does this stack align with your thinking, or are there constraints I'm missing?"

**6b. Schema / Data Model Design**
- Propose fields, types, relationships, and indices based on the slice's data needs
- Call out denormalization decisions and their trade-offs
- If migrations are needed, flag them: "This implies a migration from [X] — is that acceptable?"
- Ask about data volume expectations — they affect index and partitioning choices

**6c. API Design**
- Propose endpoints, methods, request/response shapes, and auth requirements
- Follow REST conventions unless the specification dictates otherwise
- For each endpoint, state: who calls it, when, and what happens on failure
- Ask: "Are there consumers of this API beyond what the specification lists?"

**6d. Infrastructure Requirements**
- List every service this slice needs (databases, queues, caches, external APIs)
- For each service, document how it is provisioned AND how it is torn down
- Agents clean up after themselves — teardown is mandatory, not optional
- Ask: "Are any of these services shared with other modules, or dedicated to this slice?"

**6e. Error Handling**
- Walk through each failure mode: network errors, invalid data, service outages, timeouts
- For each, define: how it is detected, what the recovery action is, when to escalate
- Probe actively:
  - "What happens when the geocoding API is down?"
  - "If the database write fails mid-batch, do we retry the whole batch or just the failed records?"
  - "This schema implies PostGIS — is that decided or still open?"

**6f. Validation Gates**
- **This is the CRITICAL section. Push hard here.**
- Every gate MUST be measurable. Not "works well" but "accuracy >= 90%" or "P95 latency < 200ms"
- For each gate, define: what is measured, what the target is, and HOW it is measured
- Challenge vague gates:
  - "What response time? Under what load? Which percentile?"
  - "When you say 'accurate,' what threshold? 80%? 95%? How do we measure it?"
  - "Is this gate blocking (must pass to ship) or advisory (nice to have)?"
- Require at least ONE measurable validation gate before proceeding

**6g. Test Data Requirements**
- Define what test fixtures are needed, their format, and where they are stored
- Specify whether test data is synthetic, sampled from production, or provided by the user
- Call out any test data that requires external service access to generate

**6h. Technology Profiles Needed**
- List technologies identified in 6a that need `/research-stack` profiling
- If profiles already exist in `.agents/reference/`, note them as available
- If new profiles are needed, flag them for generation

### Step 7: Active Probing

Throughout the conversation, do not accept vague or incomplete answers. Probe:
- "You mentioned [X] — does that mean [specific interpretation A] or [specific interpretation B]?"
- "This implies a dependency on [service]. Is that service already provisioned?"
- "The specification says this slice produces events for Module 2. What's the event schema?"
- "What's the expected data volume? That affects whether we need partitioning."

If the user says "I don't know" or defers a decision, document it as a gap and move on. Mark the section as partial.

### Step 8: Generate Context Document

When all sections have been discussed (or explicitly deferred), generate the `context.md` file using the template below. Write it to:
```
context/modules/{module-name}/slices/{slice-id}/context.md
```

Create the directory path if it does not exist.

### Step 9: Present for Review

Show the generated document to the user. Ask:
- "Does this accurately capture our discussion?"
- "Any sections that need revision?"

Revise until the user approves. Each revision updates the file in place.

### Step 10: Handle Incomplete Documents

If the user ends the conversation before all sections are covered:
- Save what exists as a partial document
- Mark incomplete sections with `[PENDING: brief description of what's needed]`
- Set `context_status: partial` in the hooks block
- Inform the user: "Saved partial context. Run `/discuss-slice {module-name}/{slice-id}` again to resume from where we left off."

---

## Context Document Template

Generate the `context.md` using this structure. Every section must be populated (or explicitly marked as pending).

```markdown
# Slice Context: {module-name}/{slice-id}

## Overview
[What this slice builds — its bounded scope within the module. 2-4 sentences.]

## Technology Decisions
| Technology | Purpose | Rationale |
|------------|---------|-----------|
| [Name] | [What it does in this slice] | [WHY this choice — tied to workload, constraints, or module requirements] |

## Schema Design
[Data model with fields, types, relationships. Include migration notes if applicable.]

### [Model/Table Name]
| Field | Type | Constraints | Notes |
|-------|------|------------|-------|
| [field_name] | [type] | [PK/FK/NOT NULL/INDEX] | [purpose or relationship] |

[Include indices, partitioning strategy, denormalization decisions with rationale.]

## API Design
| Endpoint | Method | Purpose | Auth | Request Shape | Response Shape |
|----------|--------|---------|------|---------------|----------------|
| [/path] | [GET/POST/etc.] | [what it does] | [auth type] | [key fields or reference] | [key fields or reference] |

## Infrastructure Requirements
| Service | Purpose | Provisioning | Teardown |
|---------|---------|-------------|----------|
| [service name] | [what this slice uses it for] | [how to set up] | [how to tear down — MANDATORY] |

## Error Handling
| Error Case | Detection | Recovery | Escalation |
|-----------|-----------|----------|------------|
| [failure mode] | [how detected — status code, timeout, exception] | [what the system does] | [when/how to alert humans] |

## Validation Gates
| Gate | Metric | Target | Measurement Method |
|------|--------|--------|--------------------|
| [gate name] | [what is measured] | [quantitative target] | [how to measure — tool, command, test] |

**CRITICAL: Every gate must be measurable. Not "works well" but "accuracy >= 90%".**
**Minimum: 1 measurable validation gate required.**

## Test Data Requirements
| Data Set | Format | Location | Purpose |
|----------|--------|----------|---------|
| [dataset name] | [JSON/CSV/SQL/etc.] | [file path or generation method] | [what tests use this for] |

## Technology Profiles Needed
[List technologies that need `/research-stack` profiling.]
- [technology]: [status — "profile exists at .agents/reference/X" or "needs profiling"]

## Cross-References
- **Parent module**: `context/modules/{module-name}/specification.md`
- **Architecture**: `context/architecture.md`
- **Related slices**: [list any slices this one depends on or feeds into]

## Status
- Context: [complete/partial]
- Validation gates defined: [N]
- Measurable gates: [N] (must equal validation gates defined)
- Infrastructure documented: [yes/no]
- Teardown documented: [yes/no]
- Pending sections: [list or "none"]
```

---

## Validation Rules

Before writing the final document, verify:

1. **Validation gates are measurable** — every gate has a numeric target and a measurement method. If any gate says "works well," "is fast," or "handles errors" without a number, push back or revise.
2. **Infrastructure teardown is documented** — every service in the Infrastructure table has a non-empty Teardown column. Agents must clean up after themselves.
3. **At least 1 validation gate exists** — a context document with zero validation gates is invalid. Do not save it as complete.
4. **All technology decisions have rationale** — the Rationale column in Technology Decisions must never be empty.
5. **Schema design is concrete** — field names, types, and constraints are specified, not "TBD."
6. **Error handling covers the obvious cases** — at minimum: network failure, invalid input, service unavailable, timeout.

If any of these fail, the document status is `partial`, not `complete`.

---

## Hooks

Append the following block to the end of the generated `context.md` file.

```
## PIV-Automator-Hooks
module_name: {module-name}
slice_id: {slice-id}
context_status: [complete|partial]
validation_gates_count: [N]
measurable_gates: [N]
technologies_identified: [comma-separated list of technologies]
infrastructure_services: [N]
teardown_documented: [true|false]
error_cases_documented: [N]
next_suggested_command: [discuss-slice|research-stack]
next_arg: "[next-slice-id if more slices in module, or technology name if profiles needed]"
confidence: [high|medium|low]
```

---

## Terminal Output

### Reasoning

Output 4-8 bullets summarizing the conversation and document generation:

```
### Reasoning
- Read parent specification for module [{module-name}] with [N] defined slices
- Identified [N] technology decisions for slice [{slice-id}]
- Proposed schema with [N] models/tables, [N] indices
- Defined [N] API endpoints across [N] HTTP methods
- Documented [N] infrastructure services with teardown procedures
- Established [N] measurable validation gates
- [N] error cases documented with recovery actions
- Technology profiles needed: [list or "none — all profiles exist"]
```

### Reflection

Self-critique the generated context document (terminal only, never in file):

```
### Reflection
- [check] All validation gates have quantitative targets
- [check] Infrastructure teardown documented for every service
- [check] Schema design is concrete — no TBD fields
- [check] Error handling covers network, input, service, and timeout failures
- [check] Technology rationale ties back to module purpose
- [warning or check] [Any gaps, assumptions, or deferred decisions]
- Context status: [complete/partial]
```

Use `[check]` for passed checks and `[warning]` for items that need attention.
