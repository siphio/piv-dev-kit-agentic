# PIV Dev Kit - Development Rules

This project contains the PIV loop framework commands. These rules govern how to develop and improve the framework itself.

## 1. Project Purpose

This is a **meta-project** - a collection of Claude Code slash commands that implement the PIV (Prime-Implement-Validate) loop methodology. The commands here are used in OTHER projects.

**We are building tools for AI-assisted development, not an application.**

## 2. Core Principles

1. **Plain English over code snippets** - Command outputs should be readable, not walls of code
2. **Context is King** - Every command should maximize useful context while minimizing noise
3. **Self-contained phases** - Each PRD phase must work standalone after `/clear` + `/prime`
4. **Line discipline** - PRDs: 500-750 lines, Plans: 500-750 lines. No exceptions.
5. **Self-validation** - The framework validates decisions against PRD criteria before implementation

## 3. Terminal Output Standards

When writing or modifying commands, ensure outputs follow these rules:

**DO:**
- Use plain English to explain what's happening
- Use bullet points and headers for scannability
- Show status with emojis: ⚪🟡🟢🔴
- Provide brief summaries before detailed sections
- Use tables for structured comparisons

**DON'T:**
- Output large code blocks unless explicitly implementing
- Use technical jargon when plain words work
- Create walls of text without structure
- Include code snippets in PRD outputs (save for plan-feature)

**Example Good Output:**
```
## Phase 2 Analysis Complete

**What I found:**
- 3 API endpoints need implementation
- Authentication pattern exists in `auth/` folder
- Tests follow pytest conventions

**Recommended approach:**
Use the existing HTTP client wrapper and add new endpoints following the pattern in `api/users.py`.

**Ready for questions before planning.**
```

**Example Bad Output:**
```python
# Here's what the implementation might look like:
class APIClient:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = aiohttp.ClientSession()

    async def get(self, endpoint: str) -> dict:
        async with self.session.get(f"{self.base_url}/{endpoint}") as resp:
            return await resp.json()
# ... 50 more lines of code
```

## 4. Command File Structure

All commands live in `/commands/` with this structure:

```
commands/
├── prime.md                 # Context loading
├── create-prd.md           # PRD generation
├── plan-feature.md         # Implementation planning
├── execute.md              # Plan execution
├── commit.md               # Git commits
├── create_reference.md     # Reference guide creation
├── create_global_rules_prompt.md  # CLAUDE.md generation
└── orchestrate-analysis.md # Multi-agent analysis
```

## 5. Command Writing Conventions

**Frontmatter:**
```yaml
---
description: Brief description of what this command does
argument-hint: [optional-argument]
---
```

**Section Headers:** Use `##` for main sections, `###` for subsections

**Instructions to Claude:** Write as clear directives, not suggestions
- DO: "Create a summary with these sections..."
- DON'T: "You might want to consider creating..."

**Output Specifications:** Always define:
- Where output goes (file path or terminal)
- Expected format
- Length constraints if applicable

## 6. PIV Loop Philosophy

The framework implements this cycle:

```
PRIME (Context) → IMPLEMENT (Plan + Execute) → VALIDATE (Test + Review)
     ↑                                                    │
     └────────────────── Feedback Loop ──────────────────┘
```

**Key insight:** Most AI coding failures are context failures, not capability failures.

Every command should either:
1. **Load context** (prime, reading PRD phases)
2. **Create context** (PRD, plans, references)
3. **Use context** (execute, commit)
4. **Validate context** (review, test)

## 7. Editing Commands

When modifying existing commands:

1. **Read the full command first** - Understand current behavior
2. **Preserve the philosophy** - Don't break the PIV loop flow
3. **Test the workflow** - Ensure changes work in the full cycle
4. **Update related commands** - If PRD format changes, check plan-feature compatibility

## 8. Length Constraints

| Document | Min Lines | Max Lines | Reason |
|----------|-----------|-----------|--------|
| PRD | 500 | 750 | Human readable, context efficient |
| Plan | 500 | 750 | One-pass implementation guidance |
| CLAUDE.md | 100 | 500 | Quick reference, not a manual |
| Reference guides | 50 | 200 | Scannable, actionable |

## 9. Development Commands

```bash
# No build process - these are markdown files

# Test a command manually:
# 1. Open a test project
# 2. Copy command to .claude/commands/
# 3. Run with /command-name
# 4. Verify output meets standards
```

## 10. AI Assistant Instructions

When working on this project:

1. Read this CLAUDE.md first for context
2. Prioritize plain English readability in all outputs
3. Respect line limits - trim ruthlessly if needed
4. Keep the PIV loop workflow intact
5. Test changes mentally through the full cycle
6. Don't add code snippets to PRD-related outputs
7. Use status emojis consistently (⚪🟡🟢🔴)
8. Ensure phases remain self-contained
9. Link user stories to phases bidirectionally
10. When in doubt, optimize for human scannability

## 11. Plan-Feature Workflow

When running `/plan-feature` on a project with a PRD:

**Phase 0: Scope Analysis & Autonomous Self-Validation**
1. Read the PRD phase being planned
2. Extract user stories, prerequisites, scope boundaries
3. Identify decision points from "Discussion Points" sections
4. Generate recommendations with justifications (Pass 1)

**Pass 2: Self-Validation Against PRD Criteria**
For each recommendation, verify:
1. **PRD Alignment** — Does this serve the user stories for this phase?
2. **Technology Fit** — Does this respect constraints in the technology profiles?
3. **Codebase Consistency** — Does this match existing patterns?
4. **Simplicity Check** — Is there a simpler approach that achieves the same goal?
5. **Risk Assessment** — What could go wrong with this choice?

For complex multi-technology decisions, spawn a sub-agent as an adversarial critic to find flaws or missed alternatives.

**Plan Generation (File Output)**
- Proceed directly after self-validation passes — no human checkpoint
- Bake validated decisions into the plan
- Document decisions and reasoning in NOTES section for traceability

**Key Principle:** Recommendations must include WHY — the justification based on PRD requirements, user stories, or codebase patterns. Self-validation ensures quality without human intervention.

## 12. PIV Configuration

Settings that control PIV command behavior across all commands.

| Setting | Default | Description |
|---------|---------|-------------|
| profile_freshness_window | 7d | Profiles older than this are flagged as stale by `/prime` |
| checkpoint_before_execute | true | Create git tag before /execute runs |
| mode | autonomous | Framework operates without human checkpoints (except PRD creation) |
| reasoning_model | opus-4-6 | Model used for all autonomous reasoning and self-validation |
| validation_mode | full | Always run full live validation including Tier 3 |
| agent_teams | prefer_parallel | Use Agent Teams for parallel execution whenever available |

**Current Settings:**
- Hooks are always enabled — all commands append `## PIV-Automator-Hooks` to their primary file artifact.
- profile_freshness_window: 7d
- checkpoint_before_execute: true
- mode: autonomous
- reasoning_model: opus-4-6
- validation_mode: full
- agent_teams: prefer_parallel

**Manifest**: The framework tracks project state in `.agents/manifest.yaml`. All PIV commands read and write to this file — phase progress, profile freshness, coverage gaps, and next-action recommendations. `/prime` builds and reconciles the manifest; other commands update it after producing artifacts. When writing new settings to manifest, always MERGE with the existing `settings` section — never replace. Existing keys (e.g., `profile_freshness_window`) must be preserved alongside new ones.

### Context Window Pairings

Commands that share a single context window before clearing:

| Session | Commands | Notes |
|---------|----------|-------|
| PRD Creation | /create-prd, /create_global_rules_prompt | Human-in-the-loop via Telegram |
| Research | /research-stack | One session per technology if sequential |
| First Commit + Plan | /commit, /prime, /plan-feature | Plan follows immediately after priming |
| Execution | /prime, /execute | Execute follows immediately after priming |
| Validation | /prime, /validate-implementation | Validate follows immediately after priming |
| Commit | /commit | Lightweight, own session |
| Pre-flight | /preflight | Runs once before autonomous loop begins |

### Error Taxonomy & Retry Budget

Every command failure is classified into one of these categories with a mapped recovery action:

| Category | Where It Happens | Recovery Action | Max Retries | Human Needed? |
|----------|-----------------|-----------------|-------------|---------------|
| `syntax_error` | `/execute`, `/validate` L1 | Auto-fix and retry | 2 | No (unless retries exhausted) |
| `test_failure` | `/execute` validation, `/validate` L2 | Auto-fix and retry | 2 | No (unless retries exhausted) |
| `scenario_mismatch` | `/validate` Phase 3 | Re-read PRD, adjust implementation | 1 | Maybe (after retry) |
| `integration_auth` | `/validate` Tier 1, `/research-stack` | Escalate immediately | 0 | Yes — credentials are a human problem |
| `integration_rate_limit` | `/validate` Tier 2-3 | Wait with backoff, retry | 3 | No |
| `stale_artifact` | `/prime` reconciliation | Auto-refresh via `/research-stack --refresh` | 1 | No |
| `prd_gap` | `/plan-feature` Phase 0 | Make best-effort assumption, document reasoning, continue | 0 | No — agent resolves with documented assumption |
| `partial_execution` | `/execute` | Auto-rollback to checkpoint, retry once | 1 | Yes — only after auto-retry fails |
| `line_budget_exceeded` | `/create-prd`, `/plan-feature` | Auto-trim and retry | 1 | No |

On failure, all commands output a `## PIV-Error` block (always-on, not gated by hooks) and write to manifest `failures` section. Format:

```
## PIV-Error
error_category: [taxonomy category]
command: [command that failed]
phase: [phase number if applicable]
details: "[human-readable error description]"
retry_eligible: [true|false]
retries_remaining: [N]
checkpoint: [tag name or "none"]
```

Hooks are always enabled. All commands append `## PIV-Automator-Hooks` to their primary file artifact. For commands that output only to terminal (e.g., `/prime`, `/commit`), the hooks block appears in terminal output.

### Notifications

Commands write structured notifications to manifest for the orchestrator to forward to Telegram:

```yaml
notifications:
  - timestamp: [ISO 8601]
    type: escalation | info | completion
    severity: warning | critical | info
    category: [error taxonomy category or "phase_complete"]
    phase: [N]
    details: "[human-readable description]"
    blocking: [true|false]
    action_taken: "[what the agent did or is waiting for]"
    acknowledged: [true|false]
```

The orchestrator reads `blocking: true` to know when to pause and wait for human response (only `integration_auth` after `/preflight`, and `partial_execution` after auto-retry fails).

**Notification Lifecycle:**
- Commands APPEND notifications — they never delete or modify existing entries
- The orchestrator reads notifications after each session, forwards to Telegram, and sets `acknowledged: true`
- `/prime` only reports notifications where `acknowledged` is absent or `false`
- Acknowledged notifications are retained for history but excluded from active reporting
- The framework writes; the orchestrator manages lifecycle

## 13. Prompting & Reasoning Guidelines

All PIV commands use structured reasoning internally. These are the shared patterns.

### CoT Styles

| Style | When Used | Commands |
|-------|-----------|----------|
| Zero-shot | Lightweight/focused tasks | /prime, /commit |
| Few-shot | Complex generation with examples | /create-prd, /create_global_rules_prompt |
| Tree-of-Thought | Decision exploration with multiple approaches | /plan-feature, /orchestrate-analysis |
| Per-subtask | Parallel teammate tasks | /execute, /research-stack, /validate-implementation |

### Terminal Reasoning Summary

Every command outputs a brief `### Reasoning` section to terminal showing the key steps taken:

```
### Reasoning
- Scanned 14 tracked files, identified 3 config patterns
- Cross-referenced PRD Phase 2 with 2 technology profiles
- Gap found: no rate limit handling for X API
- Recommending: add retry logic before planning
```

Rules:
- 4-8 bullet points maximum
- Shows *what was found*, not the full thinking process
- Appears before the main output section

### Reflection Pattern

After main generation, each command performs a brief self-critique:
- Is output aligned with PRD/scenarios/profiles?
- Is it complete — any missing sections or gaps?
- Is it consistent with existing artifacts?

Reflection output goes to **terminal only** — never into file artifacts. Format:

```
### Reflection
- ✅ All PRD scenarios accounted for
- ⚠️ Technology profile for Redis not found — flagged in recommendations
- ✅ Line count within budget (623 lines)
```

### Hook Block Format

Append to the **end** of file artifacts:

```
## PIV-Automator-Hooks
key: value
key: value
```

Rules:
- 5-15 lines maximum
- Simple key-value pairs (no nesting, no arrays)
- Parseable with regex: `^([a-z_]+): (.+)$`
- Each command defines its own keys (documented per command)
- **Placement rule**: Hooks are appended to the primary file artifact when the command produces one (e.g. PRD.md, plan.md, profile.md). For commands that output only to terminal (e.g. /prime, /commit, /create_global_rules_prompt), the hooks block appears in terminal output.

### Argument Parsing

Commands that accept flags parse them from `$ARGUMENTS`:
- Strip `--reflect` where applicable — currently supported only by `/plan-feature`; other commands ignore it
- Strip `--no-manifest` where applicable — supported by `/prime` for legacy fallback without manifest
- Strip `--refresh [tech-name]` where applicable — supported by `/research-stack` for stale profile updates
- Remaining text is the actual argument (filename, phase name, etc.)
- `## PIV-Error` block is always-on — output on any command failure
