Autonomous Agent Wrapper for PIV Dev Kit Agentic Framework
Overview and Philosophy
This document outlines the design and implementation plan for an autonomous agent wrapper built around the piv-dev-kit-agentic framework (the "agentic PIV"). The wrapper transforms the existing human-in-the-loop (HITL) AI-assisted development system into a semi-autonomous orchestrator capable of handling end-to-end agent development workflows with minimal human intervention after initial setup. It leverages the agentic PIV's core features—such as the PIV (Prime-Implement-Validate) loop, manifest.yaml for deterministic state tracking, PIV-Automator-Hooks for machine-readable metadata, failure intelligence with error taxonomy and git checkpoints, and Agent Teams for parallelization—while adding layers for interactivity, autonomy, and hosting.
Core Philosophy:

Hybrid Approach: Start with interactive human-guided refinement of the Product Requirements Document (PRD) to ensure high-quality foundational context, then transition to fully autonomous execution of the PIV loop.
Context Preservation: All phases produce persistent artifacts (e.g., PRD.md, manifest.yaml, plans, profiles) that survive session resets, enabling reliable resumption.
Deterministic Decision-Making: Rely on manifest.yaml for global state (phase progress, profile freshness, failures, next actions) and hooks for per-artifact insights to minimize LLM inference and enable scriptable logic.
Failure Resilience: Use the agentic error taxonomy (e.g., syntax_error with auto-retries, integration_auth with escalation) and git checkpoints for safe rollbacks.
Human Oversight: Telegram interface for interactive phases, notifications, and interventions, ensuring the system is inspectable and controllable.
Live Validation Focus: Incorporate .env provisioning for real credentials, enabling /validate-implementation --full with live integrations (no mocks) in every phase.
Hosting Alignment: Designed for deployment on a Mac Mini as a 24/7 server that doubles as a personal development desktop, allowing manual inspection of files, .env, repo, and artifacts.

The wrapper is not a replacement for the agentic PIV but an orchestrator that invokes its commands (e.g., /prime, /create-prd, /execute) programmatically via the Claude Code Agent SDK, parsing outputs to drive the loop.
Key Features and Changes from Base Agentic PIV
The base piv-dev-kit-agentic provides:

PIV loop phases: Prime (/prime), Define (/create-prd, /create_global_rules_prompt), Research (/research-stack with --refresh), Plan (/plan-feature), Build (/execute), Verify (/validate-implementation --full, /commit).
State awareness via .agents/manifest.yaml (tracks phases, profiles freshness with 7-day window, executions, validations, checkpoints, failures, next_action).
Failure intelligence: Error taxonomy (e.g., syntax_error with 2 retries, integration_rate_limit with backoff, prd_gap with escalation), ## PIV-Error blocks, git checkpoints (tags like piv-checkpoint/phase-2-... for rollbacks).
Structured reasoning: CoT styles (zero-shot, few-shot, tree-of-thought), reasoning summaries, self-reflections.
Automation prep: Optional hooks (key-value blocks like validation_status: partial, retry_remaining: 2) appended to artifacts.
Agent Teams integration for parallelism in research, execution, validation.

Enhancements in the Wrapper:

Interactivity Layer: Telegram bot for conversational PRD refinement, reducing context loss during human-Claude discussions.
.env Integration: Post-PRD validation prompting for credentials inferred from PRD sections (tech decisions, scenarios, user stories), enabling live testing.
Autonomous Loop Logic: Post-/go, the wrapper loops: /prime → parse manifest/hooks → execute next_action → handle failures/retries/rollbacks → repeat until all phases validated and committed.
Escalation Mechanisms: Pause and notify via Telegram for 0-retry errors or low-confidence hooks; support for /intervene to revert to interactive mode.
Hosting Adaptations: Persistent background service on Mac Mini using launchd, with logs and file accessibility for manual dev/inspection.
Multi-Tenancy Prep: Potential for project IDs to handle multiple repos from one bot/instance.
Completion Criteria: All phases marked complete in manifest, no pending failures, final /commit, Telegram summary with artifact links.

These changes shift the system from manual command invocation to orchestrated autonomy, while preserving the agentic PIV's principles of phase isolation, scenario-based validation, and structured reasoning.
Architecture
The wrapper is a Python-based application integrating:

Claude Code Agent SDK: For invoking PIV slash-commands (/prime, /execute, etc.) and maintaining conversational state during interactive phases. SDK handles Agent Teams parallelism natively.
Telegram Bot: Using python-telegram-bot library for user interface—commands (/start_goal, /draft_prd, /validate_prd, /go, /status, /intervene), file uploads (.env), and notifications.
State Parsers: PyYAML for manifest.yaml; regex (^([a-z_]+): (.+)$) for hooks and ## PIV-Error blocks. Critical hook keys to parse post-validation: live_tests_executed, live_tests_required, validation_status.
Git Integration: GitPython for checkpoint creation/resolution, rollbacks (git reset --hard), and commits.
.env Handling: python-dotenv for loading/parsing; secure storage (gitignore'd, masked logs).
Logging: Standard Python logging to files for inspection.

Directory Structure (on Mac Mini):
text~/projects/agent-wrapper/
├── venv/                     # Python env
├── repo/                     # Git repo for the project
│   ├── .agents/              # manifest.yaml, plans/, reference/, validation/, progress/
│   ├── .claude/commands/     # PIV commands copied from agentic repo
│   ├── src/                  # Generated agent code
│   ├── PRD.md                # Agent-native requirements
│   ├── CLAUDE.md             # Rules and configs
│   ├── .env                  # Provided secrets (gitignore'd)
│   └── .git/                 # Repo with checkpoints
├── logs/                     # stdout.log, stderr.log, app.log
├── orchestrator.py           # Main wrapper script
└── requirements.txt          # Dependencies
Autonomy Levels:

Semi-Autonomous: Human approves PRD/.env, wrapper handles loop with escalations.
Full Autonomous: From queued goals, only notifies on unrecoverable issues.

Initialization and Workflow
The workflow is hybrid: Interactive for PRD setup, autonomous for build-out.
Interactive Phase (Human-Guided via Telegram)

Start Session: User sends /start_goal "Goal description" via Telegram.
Wrapper: Creates/clones repo, runs /create_global_rules_prompt for CLAUDE.md, /prime for manifest initialization (prd.status: drafting).
Bot: Responds with "Let's discuss the PRD. What's the core goal/user stories/tech?"

Conversational Refinement: Free-form chat (or structured prompts) to discuss:
Agent Identity: Personality, decision philosophy, autonomy level.
Technology Decisions: Stack with rationale (e.g., Claude SDK, Telegram API).
Agent Behavior: Decision trees, scenario definitions (8-15, including happy/error/edge paths).
User Stories: Linked to scenarios.
Implementation Phases: Referencing tech and scenarios.
SDK maintains context; use CoT for suggestions.

Drafting: /draft_prd → Invokes /create-prd --with-hooks with conversation history, generates draft PRD.md. Bot shares summary or file link.
Validation: /validate_prd → Parses PRD against criteria:
Line count: 500-750.
Sections complete: Agent identity/behavior detailed, 8-15 scenarios with error paths, tech rationales, phase references.
Hooks check: confidence: high, validation_status: pass.
Bot: "Validation: ✅ Scenarios covered; ⚠️ Tech rationale weak—discuss?"
Iterate until satisfied.

.env Provisioning: Post-validation, infer vars from PRD:
Parse Section 3 (tech) + profiles (auth patterns) + Sections 4-5 (stories/scenarios for use cases).
Inference Levels: Medium (common vars from profiles, e.g., API_KEY for each tech) + explicit mentions.
Bot: "Need: TELEGRAM_BOT_TOKEN (for API integration), CLAUDE_API_KEY (SDK calls). Upload .env or provide one-by-one?"
User: Uploads file (bot downloads/parses) or replies with values.
Wrapper: Validates completeness/format, stores in repo/.env (masked in logs), loads into env.


Handoff to Autonomous Phase

User: /go.
Wrapper: Finalizes PRD.md, updates manifest (prd.status: complete, env_status: ready), notifies "Autonomous mode active."

Autonomous Loop

Core Loop: While not complete:
Invoke /prime → Reconcile manifest, detect gaps/staleness/failures.
Parse manifest (next_action, phases, profiles.freshness, failures) + hooks (e.g., retry_remaining).
Decide/Execute: e.g., if stale profiles → /research-stack --refresh; if plan missing → /plan-feature "Phase N"; if executed but not validated → /validate-implementation --full (with .env for live tests).
Handle Output: Parse ## PIV-Error or hooks for failures → Classify (e.g., syntax_error → auto-retry up to max), rollback to checkpoint if exhausted.
Post-Validation Gate: After every /validate-implementation session, run the Live Test Gate (see below) BEFORE accepting the result or proceeding to /commit.
Progress: Update via Telegram (e.g., "Phase 2 validated—no issues").

Live Validation: Every /validate-implementation --full uses .env for real integrations (auth, endpoints, rate limits). Tests all levels: syntax/units/scenarios/pipelines.
Escalations: For 0-retry categories (e.g., integration_auth, prd_gap) or low confidence: Pause, Telegram notify with details ("Auth failed—update key?"), re-enter interactive if user responds.
Intervention: /intervene "Revise PRD" → Rolls back to checkpoint, reverts manifest to drafting.
Completion: All phases marked complete/validated in manifest, no failures, Live Test Gate passed for every phase, final /commit. Bot: "Project done—summary: [links to artifacts]."

Live Test Gate (Orchestrator-Enforced)

Why this exists: The /validate-implementation command instructs Claude Code to run live tests. But Claude Code is an LLM following markdown instructions — it can substitute code review for test execution and still mark validation_status: pass. A human would catch this by reading the report. In autonomous mode, nobody reads the report. The orchestrator must be the enforcement layer that replaces the human eye.

The problem it solves: Without this gate, the agent can complete an entire PIV loop — plan, execute, "validate", commit — without ever running a single live test. Every phase would appear green in the manifest. The shipped code would be untested against real services.

How it works: /validate-implementation writes two machine-readable keys to its hooks block and manifest entry:
- live_tests_executed: [N] — actual count of commands run, API calls made, processes started
- live_tests_required: [N] — count derived from technology profile Section 9 + plan Level 3-4

The orchestrator parses these after every validation session and enforces:

```python
def post_validation_gate(manifest, hooks, retry_count=0):
    """
    Called by orchestrator AFTER every /validate-implementation session.
    This is a HARD GATE — validation cannot pass without live tests.
    """
    live_executed = int(hooks.get("live_tests_executed", 0))
    live_required = int(hooks.get("live_tests_required", 0))
    validation_status = hooks.get("validation_status", "fail")

    # Gate 1: Zero live tests when tests were required
    if live_required > 0 and live_executed == 0:
        if retry_count >= 1:
            # Second attempt also failed — escalate to human
            return {
                "accepted": False,
                "error_category": "static_only_validation",
                "action": "escalate",
                "blocking": True,
                "telegram_message":
                    "🔴 Validation failed twice with zero live tests. "
                    "Agent cannot or will not run live tests. "
                    "Manual intervention needed.",
            }
        # First failure — re-invoke
        return {
            "accepted": False,
            "error_category": "static_only_validation",
            "action": "re-invoke /validate-implementation",
            "retry_count": retry_count + 1,
            "telegram_message":
                f"⚠️ Validation ran with 0/{live_required} live tests. "
                f"Agent substituted code review for testing. Re-running.",
        }

    # Gate 2: Significantly fewer tests than required (< 50%)
    if live_required > 0 and live_executed < (live_required * 0.5):
        if retry_count >= 1:
            return {
                "accepted": False,
                "error_category": "partial_validation",
                "action": "escalate",
                "blocking": True,
                "telegram_message":
                    f"🔴 Only {live_executed}/{live_required} live tests after retry. "
                    f"Manual intervention needed.",
            }
        return {
            "accepted": False,
            "error_category": "partial_validation",
            "action": "re-invoke /validate-implementation",
            "retry_count": retry_count + 1,
            "telegram_message":
                f"⚠️ Only {live_executed}/{live_required} live tests ran. "
                f"Re-running to complete remaining tests.",
        }

    # Gate passed — accept the validation result
    return {
        "accepted": True,
        "live_executed": live_executed,
        "live_required": live_required,
        "validation_status": validation_status,
    }
```

Orchestrator integration points:
1. After /validate-implementation session ends: Parse hooks from validation report file using regex (^live_tests_executed: (\d+)$) AND read manifest validations[-1].live_tests_executed.
2. Before deciding next action: Call post_validation_gate(). If not accepted, re-invoke /validate-implementation instead of proceeding to /commit.
3. On retry failure (second attempt also rejected): Write blocking notification to manifest, send Telegram escalation, pause loop until human responds.
4. On gate pass: Proceed normally — validation_status from hooks drives next action (pass → /commit, fail → fix and re-validate).

What the orchestrator must NEVER do:
- Accept validation_status: pass without checking live_tests_executed
- Proceed to /commit when live_tests_executed is 0 and technology profiles exist
- Trust the agent's self-reported status without verifying the live test count
- Skip the gate for any reason — it runs after EVERY validation, every phase, every loop iteration

Hosting on Mac Mini
Setup:

Run as user-level launchd agent for persistence on boot/login.
Plist in ~/Library/LaunchAgents/: Defines ProgramArguments (cd to dir, activate venv, run orchestrator.py), KeepAlive: true, logs to files.
Manual Inspection: Log in (physical/SSH), browse ~/projects/agent-wrapper/repo/ via Finder/VS Code/terminal (e.g., cat .env, git log, tail logs/app.log).
Dual Use: Background service doesn't interfere with desktop work; stop/restart via launchctl.

Challenges:

Boot without login: Enable auto-login or use system daemon.
Resource: Monitor CPU/token usage; idle shutdown if no active projects.
Security: .env not committed; Telegram for sensitive inputs.

Extensions and Considerations

Multi-Tenancy: Add project IDs (e.g., /start_goal --project=agent1), separate repo subfolders, manifest per project.
Undo Mechanisms: Support rollback to pre-/go checkpoint; manifest tracks history.
Telegram UX: Conversational (like this chat) with commands for structure; notifications for progress/escalations.
Success Metrics: No open failures, all scenarios pass live, Live Test Gate passed for every phase (live_tests_executed > 0 for all validations), git pushed, bot report with confidence from hooks.
Trade-Offs: Autonomy reduces human effort but escalates on ambiguity; live tests risk rate limits (handled via taxonomy).

This artifact provides comprehensive context for discussing implementation in Claude Code within the PIV dev kit agentic codebase. Start by loading this into a session, then invoke /prime and discuss next steps like prototyping orchestrator.py.