---
description: Generate dependency graph from module and slice specifications
---

# Map Dependencies: Generate Architecture Dependency Graph

## Overview

Read all `specification.md` and `context.md` files from the context monorepo, extract declared dependencies, and generate a dependency graph in `context/architecture.md`. Output is both human-readable (Mermaid diagram) and machine-readable (YAML adjacency list) so the Mission Controller can parse it directly.

This command serves two audiences:
1. **Humans** - Mermaid diagram and module map table for visual understanding
2. **Mission Controller (Phase 11)** - YAML adjacency list for automated execution ordering

## Reasoning Approach

**CoT Style:** Zero-shot

Before generating the graph, think step by step:
1. Discover all module specifications on disk
2. Extract dependency declarations from each specification and slice context
3. Build the complete adjacency list
4. Detect cycles and identify parallel work streams
5. Validate that the Mermaid diagram and YAML adjacency list represent the same graph

## Hooks

Hooks are always enabled. `## PIV-Automator-Hooks` is appended to `context/architecture.md` (the primary file artifact of this command).

---

## Process

### Step 1: Scan for Module Specifications

Scan `context/modules/` for all `specification.md` files:

```bash
find context/modules/ -name "specification.md" -type f 2>/dev/null
```

If no specification files are found, stop and report:

```
## PIV-Error
error_category: prd_gap
command: map-dependencies
phase: N/A
details: "No module specifications found in context/modules/. Run /discuss-module first to define at least one module."
retry_eligible: false
retries_remaining: 0
checkpoint: none
```

If specifications are found, list them and proceed.

### Step 2: Extract Module-Level Dependencies

FOR EACH `specification.md` file found in Step 1:

1. Read the full file
2. Extract the module name from the `# Module:` header
3. Extract the **Purpose** section content
4. Extract the **Dependencies** section - parse each listed dependency as a module-level edge
5. Extract any **Interfaces** section - identify what this module provides (data contracts, APIs, events)
6. Extract the **Slices** section or list of slices if present - record slice names/IDs

Store as a structured record per module:
- `name`: module identifier (directory name)
- `purpose`: brief purpose string
- `depends_on`: list of module names this module depends on
- `provides`: list of interfaces/contracts this module exposes
- `consumes`: list of interfaces/contracts this module requires
- `slices`: list of slice identifiers

### Step 3: Extract Slice-Level Dependencies

FOR EACH module discovered in Step 2, scan for slice context files:

```bash
find context/modules/{module-name}/slices/ -name "context.md" -type f 2>/dev/null
```

FOR EACH `context.md` found:

1. Read the full file
2. Extract the slice identifier from the directory name or header
3. Extract **technology dependencies** (frameworks, libraries, services)
4. Extract **infrastructure dependencies** (databases, queues, caches)
5. Extract **cross-slice dependencies** (other slices this one depends on)

Store as a structured record per slice:
- `id`: slice identifier (e.g., `module-0/01-data-model`)
- `module`: parent module name
- `depends_on`: list of slice IDs this slice depends on
- `tech_deps`: list of technology dependencies
- `infra_deps`: list of infrastructure dependencies

### Step 4: Build Adjacency List

Combine all module-level and slice-level dependency records into a single adjacency list:

1. **Module adjacency**: For each module, list all modules it depends on (from Step 2)
2. **Slice adjacency**: For each slice, list all slices it depends on (from Step 3)
3. Validate all referenced dependencies exist in the discovered modules/slices
4. Flag any dangling references (dependency points to a module/slice that was not found) as warnings in terminal output

### Step 5: Detect Circular Dependencies

Run cycle detection on the adjacency list (both module-level and slice-level graphs):

**If circular dependency detected:**
- Report the exact cycle path (e.g., `module-a -> module-b -> module-c -> module-a`)
- List all modules/slices involved in each cycle
- Suggest restructuring: identify the weakest dependency in the cycle (the one that could be inverted or extracted into a shared module)
- Continue generating the graph with cycles marked, but set `circular_deps` count in hooks

**If no cycles detected:**
- Confirm: "Dependency graph is acyclic - valid for execution ordering"

### Step 6: Identify Parallel Work Streams

Analyze the DAG to find independent subgraphs and parallel execution opportunities:

1. **Independent subgraphs**: Groups of modules/slices with no cross-group dependencies
2. **Execution batches**: Group slices by topological level - slices at the same level can execute in parallel
3. **Critical path**: Identify the longest dependency chain (determines minimum sequential steps)
4. **Max parallelism**: Maximum number of slices that can execute simultaneously in any batch

Record these for inclusion in the architecture document.

### Step 7: Generate context/architecture.md

Write `context/architecture.md` using the template below. If the file already exists, preserve the **Shared Conventions** section and any human-written content outside the generated sections. Replace only the generated sections (Module Map, Dependency Graph, Dependency DAG, Parallel Work Streams, Execution Order).

Determine the `{project-name}` from `context/vision.md` if it exists, or from the parent directory name.

#### Template

```markdown
# Architecture: {project-name}

## Module Map

| Module | Purpose | Depends On | Depended By |
|--------|---------|-----------|-------------|
| {module-name} | {purpose} | {comma-separated deps or "none"} | {comma-separated reverse deps or "none"} |

## Dependency Graph

```mermaid
graph TD
    {node-id}["{module-name}"] --> {dep-node-id}["{dep-module-name}"]
```

## Dependency DAG (Machine-Readable)

```yaml
modules:
  {module-name}:
    depends_on: [{list}]
    provides: [{list}]
    consumes: [{list}]
    slices: [{list}]

slices:
  {module-name}/{slice-id}:
    depends_on: [{list}]
    tech_deps: [{list}]
    infra_deps: [{list}]

parallel_streams:
  - [{list of slices in stream 1}]
  - [{list of slices in stream 2}]

execution_order:
  - batch_1: [{slices with no dependencies}]
  - batch_2: [{slices whose deps are all in batch_1}]
  - batch_N: [{slices whose deps are all in prior batches}]

critical_path:
  length: {N}
  path: [{ordered list of slices on the longest chain}]

max_parallelism: {N}
```

## Shared Conventions

[Cross-module patterns: naming, error handling, auth, logging]
[Preserved from existing file if present; otherwise stub for human editing]

## Last Updated

{current date in YYYY-MM-DD format}
```

**Validation gate**: After writing the file, verify that the Mermaid diagram and YAML adjacency list represent the same graph. Count edges in both representations. If they differ, fix the discrepancy before finalizing.

### Step 8: Merge with Existing Content

If `context/architecture.md` already exists before this command runs:

1. Read the existing file
2. Preserve the **Shared Conventions** section verbatim (do not overwrite human-written content)
3. Preserve any other sections not generated by this command (e.g., custom architecture notes)
4. Replace the generated sections: Module Map, Dependency Graph, Dependency DAG
5. Update the **Last Updated** date

If the file does not exist, write it fresh from the template.

---

## Edge Cases

**Single-module project:** Generate a trivial graph with one node and no edges. Still produce the full `architecture.md` for Mission Controller compatibility. The execution order will have a single batch.

**No specification files found:** Report a `prd_gap` error (see Step 1). Do not generate `architecture.md`. Output the error to terminal and write to manifest `failures` section.

**Circular dependency detected:** Report the cycle with affected modules/slices. Suggest which dependency to break. Still generate the graph with cycles marked (add `[CYCLE]` annotation to the Mermaid node labels involved). Set `circular_deps` count in hooks block.

**Slices with no context.md:** Include the slice in the graph based on module-level data only. Note in terminal output that slice-level dependency data is unavailable.

**Dangling references:** If a dependency references a module or slice that does not exist in the scanned files, flag it as a warning in terminal output. Include it in the graph with a dashed line in Mermaid (`-.->`) and a `[MISSING]` annotation.

---

## Output Confirmation

After generating `context/architecture.md`, report to terminal:

1. Total modules mapped
2. Total slices mapped
3. Circular dependencies found (count)
4. Parallel work streams identified (count)
5. Maximum parallelism (number of slices that can run simultaneously)
6. Execution batches (count)
7. Critical path length
8. File path written

### Reasoning

Output 4-8 bullets summarizing the dependency analysis:

```
### Reasoning
- Scanned [N] module specifications in context/modules/
- Extracted [N] module-level and [N] slice-level dependency edges
- Dependency graph is [acyclic | has N cycles]
- Identified [N] parallel work streams with max parallelism of [N]
- Critical path: [N] steps through [list key modules on path]
- Generated architecture.md with [N] Mermaid edges and [N] YAML entries
```

### Reflection

Self-critique the generated architecture (terminal only):

```
### Reflection
- [check] Mermaid diagram and YAML adjacency list edge counts match
- [check] All modules from specification files are represented in the graph
- [check] Execution order respects all declared dependencies
- [check] Parallel streams are truly independent (no cross-stream edges)
- [check] Shared Conventions section preserved from existing file (if applicable)
```

Use checkmarks and warnings: `- ✅ [Finding]` or `- ⚠️ [Finding]`

---

## PIV-Automator-Hooks

Append to `context/architecture.md`:

```
## PIV-Automator-Hooks
graph_status: complete
modules_mapped: {N}
slices_mapped: {N}
circular_deps: {N}
parallel_streams: {N}
max_parallelism: {N}
next_suggested_command: review-context
confidence: high
```
