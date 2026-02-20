# PIV Dev Kit (Agentic)

**Autonomous AI Development Framework**

A three-layer system for building AI agents with Claude Code. The PIV (Prime-Implement-Validate) loop structures every feature through planning, implementation, and validation. The orchestrator runs it end-to-end without human intervention. The supervisor keeps it running across multiple projects.

> Build AI agents overnight. Ship validated code by morning.

---

## Architecture Overview

```
Layer 3: Supervisor (supervisor/)
┌──────────────────────────────────────────────────────────────┐
│  piv monitor                                                 │
│  Watches all orchestrators (15-min polling, zero token cost) │
│  Detects stalls -> Diagnoses -> Hot fixes -> Propagates      │
│  SuperMemory.AI for long-term pattern learning               │
└───────────────┬──────────────────┬───────────────────────────┘
                │                  │
Layer 2: Orchestrator (.claude/orchestrator/)
┌───────────────▼──────────────────▼───────────────────────────┐
│  Per-project autonomous agent (TypeScript/Node.js)           │
│  Anthropic Agent SDK -> spawns Claude Code sessions          │
│  Manifest-driven state machine with adaptive budgets         │
│  Telegram remote control: /go /pause /resume /status         │
└───────────────┬──────────────────────────────────────────────┘
                │
Layer 1: PIV Commands (.claude/commands/)
┌───────────────▼──────────────────────────────────────────────┐
│  12 Claude Code slash commands                               │
│  /prime -> /create-prd -> /research-stack -> /plan-feature   │
│  -> /execute -> /validate-implementation -> /commit          │
│  + /evolve, /preflight, /go, /create_global_rules_prompt,    │
│    /create_reference, /orchestrate-analysis                  │
└──────────────────────────────────────────────────────────────┘
```

**Layer 1 — PIV Commands**: 12 markdown command files. The foundation. Usable standalone via Claude Code's `/command` interface. Each command reads and writes to `.agents/manifest.yaml` for deterministic state tracking.

**Layer 2 — PIV Orchestrator**: TypeScript process using the Anthropic Agent SDK (`@anthropic-ai/claude-agent-sdk`). Runs the full PIV loop per-project without human intervention. Spawns Claude Code sessions, parses hooks from output, manages failures with git checkpointing, integrates with Telegram for remote control and notifications.

**Layer 3 — PIV Supervisor**: Monitors multiple orchestrators across distributed projects. Zero-token stall detection every 15 minutes. When a stall is found, spawns Agent SDK sessions to diagnose root causes, applies single-file hot fixes, validates with `tsc + vitest`, propagates framework fixes to all projects, and stores fix patterns in SuperMemory.AI for cross-project learning.

---

## Quick Start

### Option A: Manual (Commands Only)

Use the PIV commands interactively in Claude Code.

```bash
# Copy commands to your project
mkdir -p .claude/commands
cp -r /path/to/piv-dev-kit/.claude/commands/* .claude/commands/

# Generate project rules
/create_global_rules_prompt

# Run the PIV loop manually
/prime                                          # Load context
/create-prd                                     # Define requirements
/research-stack                                 # Research technologies (run once)
/plan-feature "Phase 1: Foundation"             # Plan first phase
/execute .agents/plans/phase-1-foundation.md    # Execute the plan
/validate-implementation --full                 # Validate against PRD scenarios
/commit                                         # Ship it
```

### Option B: Autonomous (Orchestrator)

Let the orchestrator run the entire PIV loop unattended.

```bash
# Copy commands AND orchestrator to your project
mkdir -p .claude/commands
cp -r /path/to/piv-dev-kit/.claude/commands/* .claude/commands/
cp -r /path/to/piv-dev-kit/.claude/orchestrator .claude/orchestrator
cd .claude/orchestrator && npm install && npm run build && cd ../..

# Configure credentials
cp .claude/orchestrator/.env.example .claude/orchestrator/.env
# Edit .env: set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (optional)

# Manual steps (PRD requires human input)
/prime
/create-prd
/research-stack

# Launch autonomous execution
/go
```

The orchestrator reads the manifest, plans each phase, executes, validates, commits, and pushes — then moves to the next phase. Monitor via Telegram or `tail -f .agents/orchestrator.log`.

### Option C: Full Stack (Supervisor + Multiple Projects)

Bootstrap projects with the supervisor CLI and monitor them all.

```bash
# Build the supervisor
cd /path/to/piv-dev-kit/supervisor && npm install && npm run build

# Bootstrap a new project (copies commands + orchestrator, registers in global registry)
npx tsx src/index.ts init /path/to/my-agent --name "My Agent"

# Check all registered projects
npx tsx src/index.ts status

# Start the supervisor monitor (persistent, every 15 min)
npx tsx src/index.ts monitor
```

---

## The PIV Loop

```
┌───────────────────────────────────────────────────────────────────────────┐
│                               PIV LOOP                                    │
│                                                                           │
│  PRIME ──► DEFINE ──► RESEARCH ──► PREFLIGHT ──► PLAN ──► BUILD ──► VERIFY│
│    │          │          │            │            │         │         │   │
│  /prime  /create-prd /research   /preflight   /plan     /execute /validate│
│                      -stack                   -feature            -impl   │
│                                                                           │
│    ◄─────────────────── /evolve (new generation) ◄────────────────────    │
└───────────────────────────────────────────────────────────────────────────┘
```

| Phase | Purpose | Commands |
|-------|---------|----------|
| **Prime** | Load context, reconcile manifest state | `/prime` |
| **Define** | Create agent-native requirements | `/create-prd`, `/create_global_rules_prompt` |
| **Research** | Deep-dive technology stack (run once) | `/research-stack` |
| **Pre-flight** | Verify credentials and environment | `/preflight` |
| **Plan** | Create implementation plan per phase | `/plan-feature` |
| **Build** | Execute plan with git checkpoint | `/execute` |
| **Verify** | Scenario-based validation, then commit | `/validate-implementation`, `/commit` |
| **Evolve** | Add new generation of features | `/evolve` |

---

## Commands Reference

| Command | Purpose | Output | Key Flags |
|---------|---------|--------|-----------|
| `/prime` | Load context, reconcile manifest, recommend next action | Terminal | `--with-refs`, `--no-manifest` |
| `/create-prd` | Agent-native PRD with behavior specs and scenarios (500-750 lines) | `PRD.md` | `[filename]` |
| `/research-stack` | Technology deep-dives: auth, endpoints, rate limits, gotchas | `.agents/reference/*.md` | `--refresh`, `--only [tech]` |
| `/preflight` | Verify all credentials and env vars before autonomous run | Terminal | — |
| `/plan-feature` | Implementation plan consuming PRD + technology profiles (500-750 lines) | `.agents/plans/*.md` | `--reflect` |
| `/execute` | Execute plan with git checkpoint and task parallelization | Source code | `[plan-path]` |
| `/validate-implementation` | 4-level scenario-based validation against PRD | `.agents/validation/*.md` | `--full` |
| `/commit` | Git commit following project conventions | Git history | `[message]` |
| `/evolve` | Register new-generation PRD, assign sequential phase numbers | Manifest update | `[PRD-path]` |
| `/go` | Build and launch orchestrator as background process | Process | — |
| `/create_global_rules_prompt` | Generate project-specific CLAUDE.md rules | `CLAUDE.md` | — |
| `/orchestrate-analysis` | Multi-agent codebase analysis | Analysis report | — |

### Validation Levels

| Level | What It Tests | Source |
|-------|---------------|--------|
| Level 1 | Syntax, types, lint | Plan validation commands |
| Level 2 | Unit + component tests | Plan validation commands |
| Level 3 | PRD scenario validation (happy, error, edge) | PRD Section 4.3 |
| Level 4 | Full pipeline end-to-end | Plan + PRD (`--full` only) |

### Commands Added After Gen 1

**`/evolve`** — Bridges a completed project to a new generation. Validates all gen 1 phases pass, reads PRD2, assigns sequential phase numbers (gen 1 was 1-4, gen 2 becomes 5-8), diffs technologies for new research needs, updates manifest with evolution section. After evolving, run `/go` to start the autonomous loop for the new generation.

**`/preflight`** — Pre-flight credential verification. Extracts required env vars from PRD + technology profiles, creates/updates `.env`, runs Tier 1 health checks against live services. Blocks autonomous execution until all credentials pass.

**`/go`** — Builds the orchestrator TypeScript, checks for already-running instances via PID file, sources `.env` for OAuth token and Telegram credentials, starts the orchestrator as a detached background process with `nohup`.

---

## PIV Orchestrator

The orchestrator is an autonomous TypeScript agent that runs the complete PIV loop from manifest state to completion without human intervention.

### How It Works

```
Pre-loop:
  Verify profiles exist and are fresh
  Run /preflight (if not already passed)

Per phase:
  1. /prime + /plan-feature       -> plan complete
  2. Git checkpoint (tag)
  3. /prime + /execute            -> code implemented
  4. Fidelity check               -> plan vs actual files
  5. Drift detection              -> run prior-phase tests
  6. /prime + /validate --full    -> scenarios validated
  7. /commit + push               -> checkpoint resolved
  8. Move to next phase
```

On failure at any step: classify error (11 categories), check retry budget, auto-fix or rollback to git checkpoint, escalate to Telegram if retries exhausted.

### Key Features

- **Adaptive Budgets**: Turn limits and timeouts scale based on phase complexity — more tasks means more turns allocated
- **Context Scoring**: Scores each `/prime` session for completeness (PRD loaded, profiles found, manifest accurate) on a 0-10 scale
- **Fidelity Checking**: After `/execute`, compares files listed in the plan vs files actually created/modified
- **Drift Detection**: Before validation, runs prior-phase tests to catch regressions introduced by the current phase
- **Session Recovery**: Detects crash/interrupt, resumes from last known manifest state on restart
- **Heartbeat**: Writes to central registry every 2 minutes (for supervisor stall detection) and sends Telegram heartbeat every 30 minutes
- **Live Test Gate**: Enforces that `/validate-implementation` actually runs live API tests, not just static analysis — re-invokes validation if only static tests detected
- **Hooks Parsing**: Reads `## PIV-Automator-Hooks` blocks from command output to extract machine-readable metadata (validation status, confidence, suggested next action)
- **Multi-Instance Support**: Multiple orchestrators share one Telegram bot token — first instance owns polling, others run in notification-only mode; global registry at `~/.piv-orchestrator/registry.json` tracks all instances

### Orchestrator Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | No | OAuth token; CLI uses own auth if not set |
| `PIV_PROJECT_DIR` | No | Project directory (defaults to cwd) |
| `PIV_MODEL` | No | Model override (defaults to `claude-opus-4-6`) |
| `TELEGRAM_BOT_TOKEN` | No | Telegram bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | No | Your personal chat ID (from @userinfobot) |
| `TELEGRAM_PROJECT_PREFIX` | No | Project name prefix in Telegram messages |
| `PIV_REGISTRY_DISABLED` | No | Set `1` to disable instance registry |

### Telegram Remote Control

When `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are configured, the orchestrator connects to Telegram for bidirectional control:

| Command | Action |
|---------|--------|
| `/go` | Start autonomous execution |
| `/pause` | Pause after current session completes |
| `/resume` | Resume paused execution |
| `/status` | Show current phase, cost, manifest state |
| `/status all` | Show all registered project instances |
| `/create_prd` | Start interactive PRD conversation |
| `/end_prd` | End PRD conversation, write PRD file |
| `/preflight` | Show credential verification status |

The bot is restricted to the configured `TELEGRAM_CHAT_ID`. Unauthorized messages are silently ignored.

### Orchestrator Source Modules (24 files)

| Module | Purpose |
|--------|---------|
| `index.ts` | Entry point, main loop |
| `piv-runner.ts` | Per-phase execution pipeline |
| `state-machine.ts` | Phase progression logic |
| `session-manager.ts` | Agent SDK session lifecycle |
| `manifest-manager.ts` | Manifest read/write |
| `hooks-parser.ts` | Parse PIV-Automator-Hooks from output |
| `error-classifier.ts` | Classify errors into 11 categories |
| `budget-calculator.ts` | Adaptive turn/timeout budgets |
| `context-scorer.ts` | Score prime session completeness |
| `fidelity-checker.ts` | Compare plan files vs actual files |
| `drift-detector.ts` | Run prior-phase tests for regressions |
| `git-manager.ts` | Checkpointing, tagging, rollback |
| `process-manager.ts` | PID management, process lifecycle |
| `progress-tracker.ts` | Task completion tracking |
| `heartbeat.ts` | Registry heartbeat (2-min interval) |
| `instance-registry.ts` | Multi-instance coordination |
| `signal-handler.ts` | Graceful shutdown (SIGINT/SIGTERM) |
| `telegram-bot.ts` | Telegram polling and command dispatch |
| `telegram-notifier.ts` | Send notifications/escalations |
| `telegram-formatter.ts` | HTML message formatting |
| `prd-relay.ts` | Interactive PRD creation via Telegram |
| `response-handler.ts` | Parse and route session responses |
| `config.ts` | Environment variable loading |
| `types.ts` | Shared type definitions |

---

## PIV Project Supervisor

The supervisor monitors multiple PIV orchestrators across distributed projects. It detects stalls, diagnoses root causes, applies hot fixes, and propagates corrections framework-wide.

### CLI Commands

```bash
piv init <path> [--name <name>]   # Bootstrap new PIV project from dev kit
piv status                        # Show all registered projects
piv monitor                       # Start persistent supervisor loop
piv monitor --once                # Run single monitoring cycle and exit
```

`piv init` copies `.claude/commands/` and `.claude/orchestrator/` to the target project, creates `.agents/`, initializes git if needed, computes framework version, and registers the project in the central registry at `~/.piv/registry.yaml`.

### How the Monitor Cycle Works

```
Every 15 minutes (zero token cost when healthy):

  1. Read central registry (~/.piv/registry.yaml)
  2. For each project with status="running":
     - Check heartbeat age vs stale threshold (15 min)
     - If fresh: skip (healthy)
     - If stale + PID dead:        orchestrator_crashed  (high confidence)
     - If stale + pending failures: execution_error       (high confidence)
     - If stale + PID alive:        session_hung          (medium confidence)

  3. For each stalled project, determine recovery:
     - orchestrator_crashed  -> restart (always)
     - session_hung          -> restart (up to 3x, then escalate)
     - execution_error       -> diagnose via Agent SDK

  4. If diagnosis returns a fixable bug:
     ┌─────────────────────────────────────────────┐
     │  Classify: framework_bug vs project_bug     │
     │  vs human_required                          │
     │                                             │
     │  framework_bug:                             │
     │    Apply fix in dev kit -> validate (tsc +  │
     │    vitest) -> propagate to all projects ->  │
     │    restart orchestrator                     │
     │                                             │
     │  project_bug:                               │
     │    Apply fix in project -> validate ->      │
     │    restart orchestrator                     │
     │                                             │
     │  human_required:                            │
     │    Escalate via Telegram immediately        │
     └─────────────────────────────────────────────┘

  5. Log intervention to improvement-log.md
  6. Notify via Telegram on escalation or fix failure
```

### Diagnosis and Hot Fixing

Diagnosis uses a **read-only** Agent SDK session (tools: Read, Glob, Grep only) with a $0.50 budget and 15-turn limit. It reads the manifest failures section, checks progress files, traces the error to a specific file and line, and returns a structured diagnostic.

Hot fixing uses a **write-capable** Agent SDK session (tools: Read, Glob, Grep, Bash, Edit, Write) with a $2.00 budget and 30-turn limit. Fixes are constrained to a single file and max 30 lines of changes. Validation (`tsc --noEmit && vitest run`) must pass before the fix is accepted. If validation fails, the fix is reverted with `git checkout`.

### Fix Propagation

The dev kit is canonical. When a framework bug is fixed:

1. The fixed file is copied from the dev kit to every registered project whose `pivCommandsVersion` differs from the current version
2. Registry entries are updated with the new version
3. Orchestrators in affected projects are restarted

### SuperMemory Integration

Optional (requires `SUPERMEMORY_API_KEY`). Enables long-term pattern learning:

- **Before diagnosis**: Searches SuperMemory for similar past fixes (project-scoped + cross-project)
- **During diagnosis**: Past fix context is injected into the diagnosis prompt to improve accuracy
- **After successful fix**: Stores a structured fix record with error category, root cause, file, and outcome
- **Cross-project**: Hybrid search (keyword + semantic) finds patterns even when the same error hits a different project

### Supervisor Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PIV_MONITOR_INTERVAL_MS` | 900000 (15 min) | Monitor cycle polling interval |
| `PIV_HEARTBEAT_STALE_MS` | 900000 (15 min) | Heartbeat age before stall detection |
| `PIV_MAX_RESTART_ATTEMPTS` | 3 | Max restart attempts per project per phase |
| `PIV_DIAGNOSIS_BUDGET_USD` | 0.50 | Budget per diagnosis session |
| `PIV_FIX_BUDGET_USD` | 2.00 | Budget per hot fix session |
| `PIV_DIAGNOSIS_MAX_TURNS` | 15 | Max turns for diagnosis |
| `PIV_FIX_MAX_TURNS` | 30 | Max turns for hot fix |
| `PIV_INTERVENTION_TIMEOUT_MS` | 300000 (5 min) | Timeout per intervention |
| `SUPERMEMORY_API_KEY` | — | SuperMemory.AI API key (optional) |
| `PIV_MEMORY_SEARCH_THRESHOLD` | 0.4 | Similarity threshold for memory recall |
| `PIV_MEMORY_SEARCH_LIMIT` | 5 | Max results per memory search |
| `TELEGRAM_BOT_TOKEN` | — | Shared with orchestrator |
| `TELEGRAM_CHAT_ID` | — | Shared with orchestrator |

### Supervisor Source Modules (14 files)

| Module | Purpose |
|--------|---------|
| `index.ts` | CLI entry point (init, status, monitor) |
| `init.ts` | Project bootstrapper (`piv init`) |
| `registry.ts` | Central YAML registry at `~/.piv/registry.yaml` |
| `monitor.ts` | Main polling loop, cycle orchestration |
| `classifier.ts` | Stall detection decision tree |
| `recovery.ts` | Recovery action determination and execution |
| `interventor.ts` | Agent SDK diagnosis and hot fixing |
| `propagator.ts` | Fix distribution to all registered projects |
| `memory.ts` | SuperMemory.AI client (store/recall fixes) |
| `telegram.ts` | Direct HTTP escalation notifications |
| `improvement-log.ts` | Append-only intervention audit trail |
| `version.ts` | Git-based framework version detection |
| `config.ts` | Environment variable loading with defaults |
| `types.ts` | Shared type definitions |

---

## Evolution System

The evolution system extends completed projects with new PRDs without disrupting previous work.

```
Gen 1: PRD.md  -> Phases 1, 2, 3, 4  -> All validated and committed
                       |
                   /evolve PRD2.md
                       |
Gen 2: PRD2.md -> Phases 5, 6, 7, 8  -> Autonomous loop continues
                       |
                   /evolve PRD3.md
                       |
Gen 3: PRD3.md -> Phases 9, 10, 11   -> ...
```

How it works:

- **Phase numbering**: Gen 1 phases retain their numbers. Gen 2 phases are assigned sequential numbers continuing from the last gen 1 phase.
- **Manifest evolution section**: Records generation number, phase ranges per generation, and PRD paths for each generation.
- **Technology diff**: `/evolve` compares PRD2 technologies against existing profiles. Only new technologies need research; shared technologies use existing fresh profiles.
- **Context continuity**: `/prime` reads the `evolution` section and loads both PRDs when present. `/plan-feature` injects a foundation block describing what previous generations built.
- **Archive preservation**: Gen 1 plans, validations, and progress files are never deleted or modified.

After running `/evolve`, use `/go` to start the orchestrator for the new generation. It automatically skips completed phases and begins planning the first new phase.

---

## State & Manifest

The framework tracks all project state in `.agents/manifest.yaml` — a YAML file providing deterministic, machine-readable state instead of inference-based guessing.

### What the Manifest Tracks

| Section | Purpose |
|---------|---------|
| `phases` | Plan, execution, and validation status per phase |
| `prd` | PRD path, status, generation date, phases defined |
| `profiles` | Per-technology: path, freshness (fresh/stale), phases used in |
| `plans` | Generated plans with phase, status, date |
| `executions` | Execution runs with task counts and status |
| `validations` | Validation runs with scenario pass/fail/skip counts |
| `checkpoints` | Git tag checkpoints with status (active/resolved) |
| `failures` | Error history with category, retry count, resolution |
| `preflight` | Credential verification status per service |
| `evolution` | Generation number, phase ranges, PRD paths |
| `notifications` | Structured notifications for Telegram forwarding |
| `next_action` | Recommended next command with argument and reasoning |
| `settings` | Framework configuration (`profile_freshness_window`, etc.) |

### How It Works

1. **`/prime` builds and reconciles** — On first run, scans existing artifacts and builds the manifest. On every run, reconciles against disk, recalculates profile freshness, detects coverage gaps, and writes a `next_action` recommendation.
2. **All other PIV commands update it** — `/create-prd` initializes phases, `/research-stack` writes profiles, `/plan-feature` marks plan complete, `/execute` records task counts, `/validate-implementation` records scenario results.
3. **Profile freshness** — Profiles older than 7 days are flagged `stale`. `/prime` recommends `/research-stack --refresh`.
4. **Failure persistence** — Error history survives `/clear` + `/prime` cycles. The orchestrator reads failures to determine retry vs rollback vs escalate.

### Error Taxonomy

Every command failure is classified into one of these categories with a mapped recovery action:

| Category | Where It Happens | Recovery | Max Retries |
|----------|-----------------|----------|-------------|
| `syntax_error` | `/execute`, `/validate` L1 | Auto-fix and retry | 2 |
| `test_failure` | `/execute`, `/validate` L2 | Auto-fix and retry | 2 |
| `scenario_mismatch` | `/validate` L3 | Re-read PRD, adjust | 1 |
| `integration_auth` | `/validate` T1, `/research-stack` | Escalate immediately | 0 |
| `integration_rate_limit` | `/validate` T2-3 | Backoff and retry | 3 |
| `stale_artifact` | `/prime` reconciliation | Auto-refresh profiles | 1 |
| `prd_gap` | `/plan-feature` | Assume + document reasoning | 0 |
| `partial_execution` | `/execute` | Rollback to checkpoint | 1 |
| `line_budget_exceeded` | `/create-prd`, `/plan-feature` | Auto-trim and retry | 1 |
| `static_only_validation` | `/validate` (orchestrator) | Re-invoke validation | 1 |
| `orchestrator_crash` | Orchestrator process | Supervisor restarts | 0 |
| `manifest_corruption` | Any command | Rebuild from scratch | 0 |

### Git Checkpointing

Before `/execute` modifies source code, it creates a lightweight git tag:

```
piv-checkpoint/phase-2-2026-02-10T16:30:00Z
```

- **Success path**: Checkpoint -> Execute -> Validate -> Commit -> checkpoint resolved
- **Retry path**: Checkpoint -> Execute fails -> resume from failed task -> succeeds
- **Rollback path**: Retries exhausted -> `git reset --hard piv-checkpoint/...` -> clean state restored

---

## Project Structure

```
piv-dev-kit-agentic/                   # Framework source (canonical)
├── .claude/
│   ├── commands/                      # 12 PIV command files (.md)
│   │   ├── prime.md
│   │   ├── create-prd.md
│   │   ├── research-stack.md
│   │   ├── preflight.md
│   │   ├── plan-feature.md
│   │   ├── execute.md
│   │   ├── validate-implementation.md
│   │   ├── commit.md
│   │   ├── evolve.md
│   │   ├── go.md
│   │   ├── create_global_rules_prompt.md
│   │   └── orchestrate-analysis.md
│   └── orchestrator/                  # Autonomous orchestrator
│       ├── src/                       # 24 TypeScript modules
│       ├── tests/                     # 14 test files
│       ├── package.json
│       ├── tsconfig.json
│       └── .env.example
├── supervisor/                        # Multi-project supervisor
│   ├── src/                           # 14 TypeScript modules
│   ├── tests/
│   ├── package.json
│   └── tsconfig.json
├── CLAUDE.md                          # Framework development rules
├── PRD.md                             # Current/latest PRD
└── README.md

your-project/                          # A PIV-powered project
├── .claude/
│   ├── commands/                      # Copied from dev kit
│   └── orchestrator/                  # Copied from dev kit
│       └── .env                       # Your credentials
├── .agents/
│   ├── manifest.yaml                  # Deterministic state tracking
│   ├── plans/                         # Implementation plans per phase
│   ├── validation/                    # Validation reports per phase
│   ├── reference/                     # Technology profiles
│   ├── progress/                      # Execution progress tracking
│   ├── orchestrator.log               # Orchestrator output log
│   └── orchestrator.pid               # Process ID file
├── CLAUDE.md                          # Project-specific rules
├── PRD.md                             # Agent requirements
└── src/                               # Generated agent code
```

---

## Configuration

### PIV Settings (in CLAUDE.md)

| Setting | Default | Description |
|---------|---------|-------------|
| `profile_freshness_window` | 7d | Profiles older than this flagged stale |
| `checkpoint_before_execute` | true | Create git tag before `/execute` |
| `mode` | autonomous | Framework operates without human checkpoints |
| `reasoning_model` | opus-4-6 | Model for all reasoning and validation |
| `validation_mode` | full | Always run full validation including Tier 3 |
| `agent_teams` | prefer_parallel | Use Agent Teams for parallel execution when available |

### Context Window Pairings

Commands that share a single context window before clearing:

| Session | Commands | Notes |
|---------|----------|-------|
| PRD Creation | `/create-prd`, `/create_global_rules_prompt` | Human-in-the-loop |
| Research | `/research-stack` | One session per technology if sequential |
| Plan | `/commit`, `/prime`, `/plan-feature` | Plan follows immediately after priming |
| Execution | `/prime`, `/execute` | Execute follows immediately after priming |
| Validation | `/prime`, `/validate-implementation` | Validate follows immediately after priming |
| Commit | `/commit` | Lightweight, own session |
| Pre-flight | `/preflight` | Runs once before autonomous loop |

---

## Troubleshooting

### Orchestrator not starting
```bash
cat .agents/orchestrator.pid        # Check for stale PID file
rm .agents/orchestrator.pid         # Remove if process is dead
/go                                 # Relaunch
```

### Orchestrator skips all phases
All phases are already marked complete in the manifest. If you want to add new features, use `/evolve PRD2.md` to register a new generation.

### Preflight blocked
Missing credentials. Check `.claude/orchestrator/.env` has `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` set. Run `/preflight` to see which checks fail.

### `/prime` reports stale profiles
```bash
/research-stack --refresh              # Refresh all stale profiles
/research-stack --refresh instantly    # Refresh a specific one
```

### `/execute` failed partway through
```bash
/clear
/prime                  # Shows failure details, retry count, checkpoint
# Follow the recommendation — retry or rollback
```

### Evolution failed: gen 1 incomplete
All phases from the previous generation must be validated and committed before `/evolve` will proceed.

### Supervisor shows stalled project
Check `~/.piv/registry.yaml` for the project entry. Verify the orchestrator PID is alive. Check `.agents/orchestrator.log` in the project directory for errors. The supervisor will attempt automatic recovery on the next cycle.

### Context lost after `/clear`
```bash
/prime  # Reloads everything from manifest — context survives /clear
```

### Manifest out of sync
```bash
rm .agents/manifest.yaml    # Delete manifest
/prime                       # Rebuilds from scratch by scanning .agents/
```

---

## Contributing

This framework evolves based on real-world usage. Key locations:

- `.claude/commands/*.md` — PIV command definitions (Layer 1)
- `.claude/orchestrator/src/` — Orchestrator source (Layer 2)
- `supervisor/src/` — Supervisor source (Layer 3)
- `CLAUDE.md` — Framework development rules

When modifying:
1. Read the full file first — understand current behavior
2. Preserve the PIV loop philosophy
3. Test the workflow end-to-end
4. Keep cross-references consistent (PRD sections, profile structure, manifest keys)

---

## License

MIT
