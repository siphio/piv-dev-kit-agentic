# Feature: Phase 5 — Project Bootstrap & Registry Foundation

The following plan should be complete, but it's important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

The `piv init` CLI command that bootstraps new PIV-powered agent projects and a central project registry (`~/.piv/registry.yaml`) that the supervisor monitor will poll. Every orchestrator instance writes a heartbeat to this registry every 2 minutes so the supervisor (Phase 6+) can detect stalls. This is the foundation all other supervisor phases depend on.

## User Story

As a developer starting a new agent project
I want a single command that sets up the PIV framework and registers the project
So that the supervisor immediately knows about and can manage the new project

## Problem Statement

Currently, setting up a new PIV project requires manually copying `.claude/commands/`, `.claude/orchestrator/`, and `.agents/` directories, then manually tracking which projects exist. There is no central registry the supervisor can poll, and orchestrators don't report their health to any shared location.

## Solution Statement

Create a `piv init` CLI command that automates project scaffolding (copy PIV commands, orchestrator, create `.agents/`), auto-registers the project in `~/.piv/registry.yaml`, and modify the existing orchestrator to write heartbeat data to the central registry every 2 minutes during execution.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium
**Primary Systems Affected**: `/supervisor/` (new), `.claude/orchestrator/` (heartbeat addition)
**Dependencies**: js-yaml, Node.js 20+
**Agent Behavior**: No — this phase is pure infrastructure, no AI decision trees

---

## TECHNOLOGY PROFILES CONSUMED

**Profiles read from `.agents/reference/`:**

- `anthropic-agent-sdk-profile.md` — Referenced for type alignment only. Phase 5 does not spawn Agent SDK sessions. The orchestrator heartbeat writer runs alongside the existing `query()` sessions.
  - Key constraint: One active `query()` per process — heartbeat must be pure fs I/O, never an SDK call
  - Import reference: `@anthropic-ai/claude-agent-sdk` already in `.claude/orchestrator/package.json`

**Impact on Implementation:**
Heartbeat writes must be synchronous or fire-and-forget async to avoid blocking the SDK session loop. Use `writeFileSync` (matching `instance-registry.ts` pattern) or non-awaited `writeFile`.

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `.claude/orchestrator/src/instance-registry.ts` (full file) — Why: Pattern for reading/writing a global registry. Mirror this for the central supervisor registry.
- `.claude/orchestrator/src/process-manager.ts` (lines 17-31, 67-99) — Why: PID file pattern and `isProcessAlive()` used by registry pruning
- `.claude/orchestrator/src/git-manager.ts` (lines 21-35) — Why: `ensureGitRepo()` to reuse in `piv init`
- `.claude/orchestrator/src/piv-runner.ts` (lines 514-523) — Why: Existing Telegram heartbeat interval pattern to mirror for registry heartbeat
- `.claude/orchestrator/src/types.ts` (lines 216-230) — Why: `RegistryInstance` and `InstanceRegistry` types — the central registry types follow this pattern
- `.claude/orchestrator/src/index.ts` (lines 26-41) — Why: CLI arg parsing pattern to mirror
- `.claude/orchestrator/src/config.ts` (full file) — Why: Environment variable loading pattern
- `.claude/orchestrator/tsconfig.json` — Why: TypeScript config to mirror for supervisor package
- `.claude/orchestrator/package.json` — Why: Package structure to mirror

### New Files to Create

**Supervisor package (`/supervisor/`):**
- `/supervisor/package.json` — Package config with `bin` entry for `piv` CLI
- `/supervisor/tsconfig.json` — TypeScript config mirroring orchestrator
- `/supervisor/src/types.ts` — Central registry types
- `/supervisor/src/registry.ts` — Read/write `~/.piv/registry.yaml`
- `/supervisor/src/version.ts` — Compute `piv_commands_version` from git hash
- `/supervisor/src/init.ts` — `piv init` implementation
- `/supervisor/src/index.ts` — CLI entry point

**Orchestrator heartbeat addition:**
- `.claude/orchestrator/src/heartbeat.ts` — Central registry heartbeat writer

**Tests:**
- `/supervisor/tests/registry.test.ts` — Registry CRUD
- `/supervisor/tests/init.test.ts` — Scaffold validation
- `/supervisor/tests/version.test.ts` — Version computation
- `.claude/orchestrator/tests/heartbeat.test.ts` — Heartbeat writes

### Patterns to Follow

**Naming Conventions:**
- Files: `kebab-case.ts` (e.g., `instance-registry.ts`, `process-manager.ts`)
- Types/Interfaces: `PascalCase` (e.g., `RegistryInstance`, `ProcessInfo`)
- Functions: `camelCase` (e.g., `readRegistry`, `writeRegistry`, `pruneStaleInstances`)
- Constants: `UPPER_SNAKE_CASE` (e.g., `REGISTRY_DIR`, `PID_RELATIVE`)

**Error Handling:**
- File reads: Return default/empty on missing file (see `readRegistry` in `instance-registry.ts:22-37`)
- File writes: Create parent dirs with `mkdirSync({ recursive: true })` before writing
- Process checks: Use `process.kill(pid, 0)` for liveness (see `isProcessAlive` in `process-manager.ts:68-81`)

**Module Pattern:**
- ES module imports with `.js` extension: `import { foo } from "./bar.js"`
- Synchronous I/O for lightweight registry operations (matching `instance-registry.ts`)
- Export individual functions, not classes

**Registry I/O Pattern (from `instance-registry.ts`):**
```typescript
// Read with fallback to empty
export function readRegistry(): Registry {
  if (!existsSync(filePath)) return { entries: [], lastUpdated: "..." };
  try { return parse(readFileSync(filePath, "utf-8")); }
  catch { return { entries: [], lastUpdated: "..." }; }
}
// Write with dir creation
export function writeRegistry(registry: Registry): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  registry.lastUpdated = new Date().toISOString();
  writeFileSync(filePath, serialize(registry), "utf-8");
}
```

---

## FOUNDATION (Evolution Mode)

**Generation:** 2 | **Active PRD:** PRD.md

### What Gen 1 Already Implemented

| Phase | Name | Delivered |
|-------|------|-----------|
| 1 | Core Orchestration Engine | State machine, Agent SDK sessions, manifest manager, PIV command runner, error taxonomy |
| 2 | Telegram Interface | grammy bot, TelegramNotifier, PRD relay, /status /go /pause /resume |
| 3 | VS Code Integration & Resilience | Abort/timeout handling, per-command timeouts, nesting guard |
| 4 | Multi-Instance & Polish | Instance registry, PID manager, signal handler, progress tracker, budget calc, drift/fidelity |

### Key Existing Files (Do Not Recreate)

- `.claude/orchestrator/src/instance-registry.ts` — Instance-level registry at `~/.piv-orchestrator/`. Tracks running processes. Do NOT merge with central registry.
- `.claude/orchestrator/src/process-manager.ts` — PID file management. Reuse `isProcessAlive()`.
- `.claude/orchestrator/src/git-manager.ts` — Git operations. Reuse `ensureGitRepo()` via import in init.ts.

### Architecture Established in Gen 1

- TypeScript ES modules with `.js` import extensions
- `js-yaml` for YAML, `JSON.parse/stringify` for JSON
- Synchronous I/O for lightweight global state (registries, PID files)
- All types in a central `types.ts` file per package
- vitest for unit tests with temp dirs for filesystem tests

### Gen 2 Adds (This Plan's Scope)

- `/supervisor/` package — new TypeScript project with CLI entry point
- `piv init` command — project scaffolding and auto-registration
- `~/.piv/registry.yaml` — central project registry with heartbeat, status, version
- Orchestrator heartbeat writes to central registry every 2 minutes

---

## IMPLEMENTATION PLAN

### Phase 1: Supervisor Package Foundation

Set up the `/supervisor/` package with types and build config.

**Tasks:** Create `package.json`, `tsconfig.json`, and `types.ts` with all registry data structures.

### Phase 2: Core Registry Implementation

Build read/write utilities for `~/.piv/registry.yaml` with CRUD operations and stale-entry pruning.

### Phase 3: Bootstrap CLI (`piv init`)

Implement the `piv init` command that scaffolds projects and registers them. Includes version computation and CLI entry point.

### Phase 4: Orchestrator Heartbeat Integration

Modify the existing orchestrator to write heartbeat data to the central registry during execution. Wire into graceful shutdown.

### Phase 5: Testing & Validation

Unit tests for all new modules. SC-009 scenario validation.

---

## VALIDATION STRATEGY

### PRD Scenario Validation

| Scenario | Test Plan | Pass Criteria |
|---|---|---|
| SC-009: New Project Bootstrap | Run `piv init /tmp/test-project --name test-agent`. Verify directories created, registry entry exists, orchestrator compiles. | `.claude/commands/`, `.claude/orchestrator/`, `.agents/` exist. Registry has entry. |

### Validation Acceptance Criteria

- [ ] `piv init` creates all required directories and files
- [ ] New project appears in `~/.piv/registry.yaml` after init
- [ ] Orchestrator heartbeat writes to registry every 2 minutes while running
- [ ] Registry entries have correct schema (path, status, heartbeat, version)
- [ ] `piv_commands_version` matches dev kit git hash
- [ ] Stale registry entries pruned correctly
- [ ] All unit tests pass (registry CRUD, init scaffold, version, heartbeat)

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### Task 1: CREATE `/supervisor/package.json`

- **IMPLEMENT**: Package config with:
  - `name`: `piv-supervisor`
  - `version`: `0.1.0`
  - `type`: `module`
  - `bin`: `{ "piv": "dist/index.js" }`
  - `scripts`: `start`, `build` (tsc), `test` (vitest run), `typecheck` (tsc --noEmit)
  - `dependencies`: `js-yaml` (^4.1.0)
  - `devDependencies`: `@types/js-yaml`, `@types/node` (^22), `tsx` (^4.19), `typescript` (^5.7), `vitest` (^3)
  - `engines`: `{ "node": ">=20.0.0" }`
- **PATTERN**: MIRROR `.claude/orchestrator/package.json`
- **GOTCHA**: Do NOT add `@anthropic-ai/claude-agent-sdk` — Phase 5 doesn't need it. Phase 6+ will add it.
- **VALIDATE**: `cd /supervisor && cat package.json | node -e "JSON.parse(require('fs').readFileSync(0,'utf8'))"`

### Task 2: CREATE `/supervisor/tsconfig.json`

- **IMPLEMENT**: Mirror orchestrator's tsconfig exactly:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext",
      "outDir": "dist", "rootDir": "src", "strict": true, "esModuleInterop": true,
      "skipLibCheck": true, "resolveJsonModule": true, "declaration": true,
      "declarationMap": true, "sourceMap": true
    },
    "include": ["src/**/*"]
  }
  ```
- **VALIDATE**: `cd /supervisor && npx tsc --noEmit` (after types.ts created)

### Task 3: CREATE `/supervisor/src/types.ts`

- **IMPLEMENT**: Central registry types:
  ```typescript
  export type ProjectStatus = "idle" | "running" | "stalled" | "complete" | "error";

  export interface RegistryProject {
    name: string;
    path: string;
    status: ProjectStatus;
    heartbeat: string;           // ISO 8601
    currentPhase: number | null;
    pivCommandsVersion: string;  // git short hash
    orchestratorPid: number | null;
    registeredAt: string;        // ISO 8601
    lastCompletedPhase: number | null;
  }

  export interface CentralRegistry {
    projects: Record<string, RegistryProject>;
    lastUpdated: string;
  }

  export interface InitOptions {
    targetDir: string;
    projectName: string;
    devKitDir: string;
  }

  export interface InitResult {
    success: boolean;
    projectName: string;
    targetDir: string;
    registryPath: string;
    pivCommandsVersion: string;
    errors: string[];
  }
  ```
- **PATTERN**: Follow `RegistryInstance` structure in `.claude/orchestrator/src/types.ts:218-225`
- **GOTCHA**: Use `Record<string, RegistryProject>` (keyed by name), not array — enables O(1) lookup by name for heartbeat updates
- **VALIDATE**: `cd /supervisor && npx tsc --noEmit`

### Task 4: CREATE `/supervisor/src/registry.ts`

- **IMPLEMENT**: Read/write `~/.piv/registry.yaml` with these functions:
  - `getRegistryPath(): string` — returns `join(homedir(), ".piv", "registry.yaml")`
  - `readCentralRegistry(path?): CentralRegistry` — read YAML with fallback to empty `{ projects: {}, lastUpdated: "" }`
  - `writeCentralRegistry(registry, path?): void` — write YAML, create `~/.piv/` if needed, update `lastUpdated`
  - `registerProject(project: RegistryProject, path?): CentralRegistry` — add/update entry keyed by `project.name`
  - `deregisterProject(name: string, path?): CentralRegistry` — remove entry
  - `updateHeartbeat(name, phase, pid, status, path?): CentralRegistry` — update heartbeat timestamp, currentPhase, orchestratorPid, status
  - `getProject(name, path?): RegistryProject | null` — single lookup
  - `listProjects(path?): RegistryProject[]` — all entries as array
  - `pruneDeadProjects(path?): CentralRegistry` — remove entries where `orchestratorPid` is set and `isProcessAlive()` returns false, set their status to `idle`
- **IMPORTS**: `js-yaml`, `node:fs` (sync), `node:path`, `node:os` (homedir)
- **PATTERN**: MIRROR `instance-registry.ts` — same read/fallback/write/prune pattern
- **GOTCHA**: Import `isProcessAlive` from `process-manager.ts` won't work (different package). Inline the `process.kill(pid, 0)` pattern directly.
- **VALIDATE**: `cd /supervisor && npx tsc --noEmit`

### Task 5: CREATE `/supervisor/src/version.ts`

- **IMPLEMENT**: Two functions:
  - `getDevKitVersion(devKitDir: string): string` — runs `git rev-parse --short HEAD` in devKitDir via `execFileSync`, returns 7-char hash. On failure returns `"unknown"`.
  - `getCommandsChecksum(devKitDir: string): string` — runs `git rev-parse --short HEAD -- .claude/commands/` for finer-grained version. Falls back to `getDevKitVersion`.
- **IMPORTS**: `node:child_process` (execFileSync)
- **PATTERN**: MIRROR `git-manager.ts` git helper pattern (lines 7-13)
- **VALIDATE**: `cd /supervisor && npx tsc --noEmit`

### Task 6: CREATE `/supervisor/src/init.ts`

- **IMPLEMENT**: `pivInit(options: InitOptions): InitResult` function:
  1. **Validate source**: Check `devKitDir/.claude/commands/` and `devKitDir/.claude/orchestrator/` exist. If not, return error.
  2. **Create target dir**: `mkdirSync(targetDir, { recursive: true })` if it doesn't exist
  3. **Copy `.claude/commands/`**: Recursive copy from dev kit to `targetDir/.claude/commands/`
  4. **Copy `.claude/orchestrator/`**: Recursive copy from dev kit to `targetDir/.claude/orchestrator/`
     - Skip `node_modules/` and `dist/` during copy
  5. **Create `.agents/`**: `mkdirSync(join(targetDir, ".agents"), { recursive: true })`
  6. **Initialize git**: If no `.git/` in targetDir, run `git init`, `git add -A`, `git commit -m "chore: initialize {name} project"`
  7. **Compute version**: Call `getDevKitVersion(devKitDir)`
  8. **Register in central registry**: Call `registerProject()` with:
     - `name`: projectName
     - `path`: absolute targetDir
     - `status`: `"idle"`
     - `heartbeat`: current ISO timestamp
     - `currentPhase`: null
     - `pivCommandsVersion`: computed version
     - `orchestratorPid`: null
     - `registeredAt`: current ISO timestamp
     - `lastCompletedPhase`: null
  9. **Return result** with success, paths, version
- **IMPORTS**: `node:fs` (`existsSync`, `mkdirSync`, `cpSync`, `readdirSync`, `statSync`), `node:path`
- **GOTCHA**: Use `cpSync(src, dest, { recursive: true, filter: (src) => !src.includes('node_modules') && !src.includes('/dist/') })` — available in Node 20+
- **GOTCHA**: Resolve `targetDir` to absolute path with `resolve()` before storing in registry
- **VALIDATE**: Run `node --eval "..."` to verify the function creates expected directory structure in a temp dir

### Task 7: CREATE `/supervisor/src/index.ts`

- **IMPLEMENT**: CLI entry point with subcommand parsing:
  ```
  piv init <path> [--name <name>]
  piv status
  piv list
  ```
  - `init`: Call `pivInit()` with parsed args. Print summary to stdout.
    - Default `--name` to `basename(path)` if not provided
    - Default `devKitDir` to `resolve(__dirname, "../..")` (relative to supervisor package)
  - `status`: Call `listProjects()`, format as table
  - `list`: Same as `status` (alias)
  - No args or `--help`: Print usage
- **PATTERN**: MIRROR `index.ts:26-41` arg parsing
- **IMPORTS**: `node:path`, `node:process`
- **GOTCHA**: Add `#!/usr/bin/env node` shebang at top for `bin` entry
- **VALIDATE**: `cd /supervisor && npm run typecheck`

### Task 8: CREATE `.claude/orchestrator/src/heartbeat.ts`

- **IMPLEMENT**: Heartbeat writer that updates the central registry:
  - `startHeartbeat(projectDir, projectName, intervalMs?): NodeJS.Timeout` — starts `setInterval` that:
    1. Reads `~/.piv/registry.yaml`
    2. Updates the project entry: `heartbeat` = now, `orchestratorPid` = `process.pid`, `status` = `"running"`, `currentPhase` = read from manifest
    3. Writes registry back
    4. Returns the interval timer
  - `stopHeartbeat(timer: NodeJS.Timeout, projectDir, projectName): void` — clears interval, writes final update with `status: "idle"`, `orchestratorPid: null`
  - `writeHeartbeat(projectDir, projectName, phase, status): void` — single heartbeat write (used by start/stop)
  - Default interval: `2 * 60 * 1000` (2 minutes, from PRD)
- **IMPORTS**: `node:fs` (sync — `readFileSync`, `writeFileSync`, `existsSync`, `mkdirSync`), `node:path`, `node:os`, `js-yaml`
- **GOTCHA**: Must be self-contained — cannot import from `/supervisor/` package. Inline the registry read/write logic (it's ~30 lines). Use the same `~/.piv/registry.yaml` path and YAML schema.
- **GOTCHA**: Wrap entire heartbeat write in try/catch — heartbeat failure must NEVER crash the orchestrator. Log warning on failure, continue.
- **GOTCHA**: Read manifest to get `currentPhase` — use `readManifest` from `manifest-manager.ts` but catch errors (return null if manifest unreadable)
- **PATTERN**: MIRROR Telegram heartbeat in `piv-runner.ts:515-523` — same `setInterval` + `try/catch` pattern
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 9: UPDATE `.claude/orchestrator/src/piv-runner.ts`

- **IMPLEMENT**: Wire heartbeat into `runAllPhases()`:
  1. Import `startHeartbeat`, `stopHeartbeat` from `./heartbeat.js`
  2. After the pre-loop checks pass (line ~512), start heartbeat:
     ```typescript
     const projectName = basename(projectDir);
     const heartbeatTimer = startHeartbeat(projectDir, projectName);
     console.log(`💓 Central registry heartbeat started (every 2 min)`);
     ```
  3. In the final summary section (after the phase loop ends, ~line 566), stop heartbeat:
     ```typescript
     stopHeartbeat(heartbeatTimer, projectDir, projectName);
     ```
  4. Also stop heartbeat if the loop breaks due to blocking failure (line ~554):
     ```typescript
     stopHeartbeat(heartbeatTimer, projectDir, projectName);
     ```
- **IMPORTS**: Add `import { startHeartbeat, stopHeartbeat } from "./heartbeat.js"` and `import { basename } from "node:path"`
- **GOTCHA**: `basename` may already be imported — check first. If `path` is imported, use `path.basename`.
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 10: UPDATE `.claude/orchestrator/src/index.ts`

- **IMPLEMENT**: Wire heartbeat into the `main()` function:
  1. Import `stopHeartbeat` and `writeHeartbeat` from `./heartbeat.js`
  2. In the `shutdown()` function (line ~237), add a final heartbeat write setting status to `"idle"`:
     ```typescript
     try { writeHeartbeat(projectDir, projectPrefix, null, "idle"); } catch { /* best effort */ }
     ```
  3. In the `uncaughtException` handler (line ~261), write status `"error"`:
     ```typescript
     try { writeHeartbeat(projectDir, projectPrefix, null, "error"); } catch { /* best effort */ }
     ```
- **GOTCHA**: These are fire-and-forget sync writes — they must not throw. Wrap in try/catch.
- **VALIDATE**: `cd .claude/orchestrator && npx tsc --noEmit`

### Task 11: CREATE `/supervisor/tests/registry.test.ts`

- **IMPLEMENT**: vitest tests:
  - `readCentralRegistry` returns empty registry when file missing
  - `writeCentralRegistry` creates `~/.piv/` dir and writes valid YAML
  - `registerProject` adds new project, `getProject` retrieves it
  - `registerProject` updates existing project (same name)
  - `deregisterProject` removes entry
  - `updateHeartbeat` changes heartbeat, phase, pid, status
  - `listProjects` returns all entries as array
  - `pruneDeadProjects` removes entries with dead PIDs
  - Use temp dir for registry path (pass as parameter) — NEVER write to actual `~/.piv/`
- **PATTERN**: MIRROR `.claude/orchestrator/tests/instance-registry.test.ts`
- **VALIDATE**: `cd /supervisor && npx vitest run tests/registry.test.ts`

### Task 12: CREATE `/supervisor/tests/init.test.ts`

- **IMPLEMENT**: vitest tests:
  - `pivInit` creates `.claude/commands/` in target
  - `pivInit` creates `.claude/orchestrator/` in target (without `node_modules/` or `dist/`)
  - `pivInit` creates `.agents/` directory
  - `pivInit` initializes git if not already a repo
  - `pivInit` registers project in central registry
  - `pivInit` returns correct version hash
  - `pivInit` fails gracefully if source dirs don't exist
  - `pivInit` handles existing target directory (no overwrite damage)
  - Use temp dirs for both devKit source mock and target — set up a minimal devKit structure in beforeEach
- **GOTCHA**: Create a mock dev kit structure in temp dir with `.claude/commands/` and `.claude/orchestrator/` containing dummy files, plus a `.git/` (run `git init` in temp)
- **VALIDATE**: `cd /supervisor && npx vitest run tests/init.test.ts`

### Task 13: CREATE `/supervisor/tests/version.test.ts`

- **IMPLEMENT**: vitest tests:
  - `getDevKitVersion` returns 7-char hash in a valid git repo
  - `getDevKitVersion` returns `"unknown"` in non-git directory
  - Hash changes after a commit (make a commit in temp repo, verify hash changes)
- **VALIDATE**: `cd /supervisor && npx vitest run tests/version.test.ts`

### Task 14: CREATE `.claude/orchestrator/tests/heartbeat.test.ts`

- **IMPLEMENT**: vitest tests:
  - `writeHeartbeat` creates registry file if missing
  - `writeHeartbeat` updates existing registry entry
  - `writeHeartbeat` sets correct fields (heartbeat, pid, status, phase)
  - `startHeartbeat` returns a timer (verify with instanceof check)
  - `stopHeartbeat` clears interval and writes idle status
  - Heartbeat write failure does not throw (silently continues)
  - Use temp dir for registry path
- **GOTCHA**: Mock `homedir()` or pass registry path parameter to avoid writing to real `~/.piv/`
- **VALIDATE**: `cd .claude/orchestrator && npx vitest run tests/heartbeat.test.ts`

### Task 15: INSTALL dependencies and verify build

- **IMPLEMENT**: Install and build both packages:
  1. `cd /supervisor && npm install`
  2. `cd /supervisor && npm run typecheck`
  3. `cd .claude/orchestrator && npm install` (if needed — verify existing deps cover heartbeat needs)
  4. `cd .claude/orchestrator && npm run typecheck`
- **VALIDATE**: Both packages compile with zero errors

---

## TESTING STRATEGY

### Unit Tests

- **Registry CRUD** (`/supervisor/tests/registry.test.ts`): All read/write/update/delete/prune operations on central registry using temp dirs
- **Init scaffold** (`/supervisor/tests/init.test.ts`): Directory creation, file copy, git init, registry registration using mock dev kit in temp dirs
- **Version computation** (`/supervisor/tests/version.test.ts`): Git hash extraction in real and non-git directories
- **Heartbeat** (`.claude/orchestrator/tests/heartbeat.test.ts`): Registry write operations, interval timer lifecycle, error resilience

All tests use temp directories — NEVER touch actual `~/.piv/` or real project directories.

### Integration Tests

- Run `piv init /tmp/test-project --name test-agent` end-to-end
- Verify the target project has all expected files
- Verify `~/.piv/registry.yaml` (or temp equivalent) contains the entry
- Verify the copied orchestrator compiles: `cd /tmp/test-project/.claude/orchestrator && npx tsc --noEmit`

### Edge Cases

- `piv init` on an existing project directory (should add files without destroying existing content)
- `piv init` when `~/.piv/` doesn't exist (should create it)
- `piv init` when dev kit commands directory is empty (should warn)
- Heartbeat write when `~/.piv/registry.yaml` is corrupted YAML (should overwrite gracefully)
- Heartbeat write when registry has entry for same project name from different path (should update)
- `pruneDeadProjects` with mix of alive and dead PIDs

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and 100% feature correctness.

### Level 1: Syntax & Style

```bash
cd supervisor && npx tsc --noEmit
cd .claude/orchestrator && npx tsc --noEmit
```

**Expected**: All commands pass with exit code 0

### Level 2: Unit Tests

```bash
cd supervisor && npx vitest run
cd .claude/orchestrator && npx vitest run
```

**Expected**: All tests pass. Existing 142 orchestrator tests must not regress.

### Level 3: Live Integration Tests

```bash
# SC-009: Full bootstrap test
TMPDIR=$(mktemp -d) && node supervisor/dist/index.js init "$TMPDIR/test-project" --name test-agent && echo "Init: OK" && ls -la "$TMPDIR/test-project/.claude/commands/" && ls -la "$TMPDIR/test-project/.claude/orchestrator/src/" && ls -la "$TMPDIR/test-project/.agents/" && cat ~/.piv/registry.yaml && rm -rf "$TMPDIR"
```

```bash
# Verify copied orchestrator compiles independently
TMPDIR=$(mktemp -d) && node supervisor/dist/index.js init "$TMPDIR/test-project" --name compile-test && cd "$TMPDIR/test-project/.claude/orchestrator" && npm install && npx tsc --noEmit && echo "Compile: OK" && rm -rf "$TMPDIR"
```

```bash
# Verify heartbeat writes (start orchestrator briefly, check registry)
# Note: This requires a real project with manifest — may be manual verification
cat ~/.piv/registry.yaml 2>/dev/null || echo "No registry yet"
```

### Level 4: Live Integration Validation

```bash
# End-to-end: init + verify registry + verify git
TMPDIR=$(mktemp -d) && node supervisor/dist/index.js init "$TMPDIR/e2e-test" --name e2e-agent && cd "$TMPDIR/e2e-test" && git log --oneline && ls .claude/commands/*.md | wc -l && ls .claude/orchestrator/src/*.ts | wc -l && rm -rf "$TMPDIR"
```

```bash
# Verify piv status/list command works
node supervisor/dist/index.js list
```

---

## ACCEPTANCE CRITERIA

- [x] `piv init` creates `.claude/commands/`, `.claude/orchestrator/`, `.agents/` in target directory
- [x] New project appears in `~/.piv/registry.yaml` immediately after init
- [x] `piv_commands_version` tracked from dev kit git hash
- [x] Orchestrator writes heartbeat to `~/.piv/registry.yaml` every 2 minutes while running
- [x] Supervisor detects new project on next monitoring cycle (registry entry exists)
- [x] All unit tests pass (registry, init, version, heartbeat)
- [x] Existing 142 orchestrator tests do not regress
- [x] Both packages compile with zero TypeScript errors
- [x] SC-009 scenario passes validation
- [x] `piv init` handles edge cases (existing dir, no git, missing source)
- [x] Heartbeat failure never crashes the orchestrator

---

## COMPLETION CHECKLIST

- [ ] All 15 tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Full test suite passes (unit + integration)
- [ ] No type checking errors in supervisor package
- [ ] No type checking errors in orchestrator package
- [ ] Existing 142 orchestrator tests still pass
- [ ] All acceptance criteria met
- [ ] Code follows existing naming and module patterns

---

## NOTES

### Decisions from Scope Analysis

1. **Git init in `piv init`**: Yes — reuse `ensureGitRepo()` pattern. PIV commands require git for checkpointing.
2. **Copy vs shared**: Copy files. PRD mandates "copies files rather than symlinks for portability." Each project gets its own orchestrator (confirmed existing practice).
3. **Two registries coexist**: `~/.piv-orchestrator/registry.json` (instance-level, running processes) and `~/.piv/registry.yaml` (project-level, all registered projects). Different concerns, different lifecycles.
4. **Heartbeat self-contained**: `heartbeat.ts` in the orchestrator inlines registry read/write rather than importing from `/supervisor/`. Avoids cross-package dependency.
5. **CLI framework**: Raw `process.argv` parsing. No commander/yargs. Only one subcommand in Phase 5.
6. **`piv_commands_version`**: Git short hash of dev kit repo. Computed at init time, stored in registry.

### PRD Gap: `piv-log.md`

PRD Phase 7 mentions `piv-log.md` emission from commands. This is NOT in Phase 5 scope. Phase 5 does not implement structured event logging. The monitor (Phase 6) will read manifest and registry, not logs.

### Architecture Note

The `/supervisor/` package is intentionally lightweight in Phase 5 — only registry utilities, init, and types. The monitor loop (`index.ts` as daemon), classifier, interventor, and propagator are Phase 6-7. This phase creates the foundation they depend on.

## PIV-Automator-Hooks
plan_status: ready_for_execution
phase_source: Phase 5 from PRD2
independent_tasks_count: 4
dependent_chains: 3
technologies_consumed: anthropic-agent-sdk
next_suggested_command: execute
next_arg: ".agents/plans/phase-5-project-bootstrap-registry.md"
estimated_complexity: medium
confidence: 8/10
