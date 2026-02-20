---
description: Transition a completed project to a new generation by registering PRD2 and preparing the manifest for continued autonomous development
argument-hint: [path-to-PRD2.md]
---

# Evolve: Register a Second-Generation PRD

## Arguments: $ARGUMENTS

## Objective

Bridge a completed (fully-validated) project to a new generation of features. Takes a PRD2 file, validates that gen 1 is complete, appends new phases to the manifest, identifies technologies that need re-research, and prepares the autonomous loop to continue from where it left off.

**When to use:** You have a fully built and validated agent. You've created a new PRD (PRD2) that adds features, refines behavior, or refactors on top of the existing foundation. Run `/evolve PRD2.md` then `/go` (or `/prime` + `/plan-feature`) to continue.

## Reasoning Approach

**CoT Style:** Zero-shot

Before writing anything, think step by step:
1. Is gen 1 actually complete? (Verify from manifest and disk evidence)
2. What phases does PRD2 describe? (Count, names, phase numbers to assign)
3. Which technologies does PRD2 reference that don't already have profiles?
4. What is the correct sequential phase numbering for gen 2?
5. What is the right `next_action` — research first, or plan immediately?

## Hooks

Hooks are always enabled. `## PIV-Automator-Hooks` is appended to terminal output (this command produces no file artifact).

---

## Process

### Step 1: Parse Arguments

Extract the PRD2 file path from `$ARGUMENTS`.

- If no argument given: look for any file matching `*PRD2*.md`, `*strategic*.md`, `*gen2*.md`, or `*v2*.md` in the project root and `.agents/`
- If still not found: output error and stop

```
## PIV-Error
error_category: prd_gap
command: evolve
phase: none
details: "No PRD2 file path provided and no candidate file found. Usage: /evolve path/to/PRD2.md"
retry_eligible: false
retries_remaining: 0
checkpoint: none
```

### Step 2: Read Current Manifest

Read `.agents/manifest.yaml`. If it doesn't exist, halt with error — `/evolve` requires an existing manifest (use `/prime` first if manifest is missing).

**Load into memory:**
- `phases` section — all current phases and their statuses
- `profiles` section — all existing technology profiles
- `artifacts.prd` — gen 1 PRD path
- `evolution` section — check if already present (re-evolution case)
- `settings` section

### Step 3: Validate Gen 1 Completion

**Check 1 — Manifest phase statuses:**
For every phase currently in the manifest, verify:
- `plan: complete`
- `execution: complete`
- `validation: pass`

**Check 2 — Disk evidence:**
Check that validation files exist on disk for each phase:
- `.agents/validation/phase-{N}-validation.md` or `*phase-{N}*validate*.md`

**If gen 1 is NOT complete** (any phase is not fully validated):
```
⚠️ Gen 1 is not complete. The following phases are not fully validated:
  - Phase N: plan=[status], execution=[status], validation=[status]

Run the PIV loop to completion before evolving to gen 2.
Recommended: [next action based on incomplete phase status]
```
Halt — do not proceed.

**If re-evolving** (an `evolution` section already exists):
Acknowledge the existing evolution, report the current generation number, and continue (this is a gen 3, gen 4, etc. scenario). The existing phases are already numbered correctly.

### Step 4: Read PRD2

Read the file at the path from Step 1.

**Extract from PRD2:**

1. **Phase names and count** — scan for phase sections (e.g., `## Phase 1`, `### Phase 1:`, `## Phase N:` — use the actual phase headers)

2. **Technologies to research** — check for:
   - A `## PIV-Automator-Hooks` block at the end of the file → read `technologies_to_research:` key
   - If no hooks block: scan `## Technology Stack`, `## Section 3`, `## Section 7` sections for external services/APIs

3. **PRD2 title** — first `# ` heading in the file

4. **Project description** — first paragraph or overview sentence

### Step 5: Determine New Phase Numbering

**Find the highest existing phase number** in the current manifest `phases` section.

```
existing_max_phase = max(phase numbers in manifest.phases)
gen2_start = existing_max_phase + 1
gen2_phases = [gen2_start, gen2_start+1, ..., gen2_start + phases_count - 1]
```

Example: Gen 1 had phases 1, 2, 3. PRD2 has 3 phases → gen 2 gets phases 4, 5, 6.

### Step 6: Diff Technologies → `research.pending`

**For each technology in the PRD2 `technologies_to_research` list:**

1. Check if a profile already exists in the manifest `profiles` section with matching name
2. Check if a file exists: `.agents/reference/{tech}-profile.md` (case-insensitive, hyphens vs underscores normalized)
3. Also check profile freshness — if profile exists but `freshness: stale`, add to pending with reason `stale`

**Build `research.pending` list:**
```yaml
research:
  pending:
    - tech: gemini-api
      reason: new  # not in existing profiles
    - tech: openai-api
      reason: stale  # exists but freshness: stale
  satisfied:
    - github-api  # profile exists and is fresh
```

**If all technologies are already profiled and fresh:** `research.pending` is empty.

### Step 7: Build New Phase Entries

For each gen 2 phase, create a manifest phase entry:
```yaml
phases:
  4:
    plan: not_started
    execution: not_started
    validation: not_run
    generation: 2
    name: "[Phase name from PRD2 if extractable, else 'Gen 2 Phase N']"
  5:
    plan: not_started
    execution: not_started
    validation: not_run
    generation: 2
    name: "[Phase name from PRD2]"
```

### Step 8: Write Updated Manifest

**Merge the following into `.agents/manifest.yaml`** (never replace — always merge):

1. **Append new phase entries** to `phases` section

2. **Add `evolution` section:**
```yaml
evolution:
  generation: 2
  prd2_path: "[path from arguments]"
  prd2_title: "[title extracted from PRD2]"
  gen1_phases: [1, 2, 3]
  gen2_phases: [4, 5, 6]
  gen2_start_phase: 4
  evolved_at: "[ISO 8601 timestamp]"
  gen1_archived: true
```

If an `evolution` section already exists (re-evolution), increment `generation` and update `gen2_phases` to `gen3_phases` (or use the new generation number).

3. **Add `research` section** (from Step 6):
```yaml
research:
  pending:
    - tech: gemini-api
      reason: new
  satisfied:
    - github-api
```

4. **Update `artifacts.prd`** — keep gen 1 PRD but add:
```yaml
artifacts:
  prd:
    path: "[gen1 PRD path]"
    status: complete
  prd2:
    path: "[PRD2 path]"
    status: active
    generation: 2
```

5. **Set `next_action`:**
   - If `research.pending` is non-empty:
     ```yaml
     next_action:
       command: research-stack
       argument: "[PRD2 path]"
       reason: "PRD2 references new technologies: [list]. Run /research-stack to profile them before planning."
       confidence: high
     ```
   - If `research.pending` is empty:
     ```yaml
     next_action:
       command: plan-feature
       argument: "Phase [gen2_start_phase]"
       reason: "All technologies are profiled. Ready to plan Phase [gen2_start_phase]: [phase name]."
       confidence: high
     ```

6. **Update `last_updated`** to current ISO 8601 timestamp.

### Step 9: Output Summary to Terminal

```
## Evolution Complete ✅

**Project:** [project name]
**Gen 1 PRD:** [gen1 prd path] (Phases 1–N, all validated)
**Gen 2 PRD:** [prd2 path] ([phases_count] new phases)

### What Was Done
- Gen 1 archived: Phases [1, 2, 3] — all complete ✅
- Gen 2 registered: Phases [4, 5, 6] — all not_started ⚪
- Technologies diff:
  - 🔬 Needs research: [list, or "none — all profiles current"]
  - ✅ Already profiled: [list]

### Next Step
[if research.pending non-empty]
  Run: /research-stack [PRD2 path]
  Reason: Profile [N] new technologies before planning.

[if research.pending empty]
  Run: /plan-feature "Phase [gen2_start_phase]"
  Reason: All profiles current — ready to plan.

Or run /go to activate the autonomous loop.

### Manifest Updated
.agents/manifest.yaml → evolution section added, [N] new phases registered
```

### Step 10: Write `### Reasoning` to Terminal

```
### Reasoning
- Gen 1 status: [N] phases all validated ✅ / [N] phases validated, [M] incomplete ⚠️
- PRD2 found at [path], [N] phases extracted
- Gen 2 phase range: [start]–[end]
- Technologies in PRD2: [list]
- New (needs research): [list or "none"]
- Already profiled: [list or "none"]
- next_action set to: [command]
```

### Step 11: Write `### Reflection` to Terminal

```
### Reflection
- ✅/⚠️ Gen 1 validation confirmed via [manifest|disk evidence|both]
- ✅/⚠️ [N] phase names extracted from PRD2 [successfully|using fallback names]
- ✅/⚠️ Technology diff [complete|partial — some techs could not be matched to profiles]
- ✅/⚠️ Manifest merge [successful|warning: [issue]]
```

### Step 12: PIV-Automator-Hooks

Append to terminal output:

```
## PIV-Automator-Hooks
current_phase: evolving
completed_phases: [comma-separated gen1 phase numbers]
pending_items: [research N technologies | plan Phase N]
recommended_next_command: [research-stack|plan-feature]
recommended_arg: "[PRD2 path | Phase N]"
requires_clear_before_next: false
confidence: high
generation: 2
gen2_phases: [start-end]
research_pending: [true|false]
```

---

## Error Handling

### Gen 1 Incomplete

Output the incomplete phase list and the recommended next PIV step. Do not write any manifest changes. Halt.

### PRD2 Parse Failure

If no phases or technologies can be extracted from PRD2:
- Try best-effort extraction (at minimum, count `## Phase` headings)
- If truly unparseable, output a warning: "Could not extract phase structure from PRD2. Registering [N] placeholder phases with fallback names."
- Continue with placeholder names — do not halt

### Profile Freshness Check Failure

If manifest `profiles` section is missing or malformed, skip the diff and add all PRD2 technologies to `research.pending` with `reason: unknown_existing_state`.

---

## Notes

- `/evolve` never deletes gen 1 phases — they remain in the manifest as archived history
- Gen 2 phases are additive: if gen 1 had phases 1-3 and gen 2 has 3 phases, gen 2 = phases 4-6
- `/prime` reads the `evolution` section and loads both PRDs when present
- `/plan-feature` uses the `evolution` section to inject the FOUNDATION block (what gen 1 built)
- `/research-stack` already accepts a PRD file argument — run it against PRD2 to profile only new techs
- After `/evolve`, the autonomous loop (`/go`) will: run `/research-stack` if pending → then enter planning for Phase [gen2_start]
