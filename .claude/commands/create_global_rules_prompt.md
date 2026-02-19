 when the user runs this command, the Coding Assistant (you) should run the prompt listed below, to help the user to develop there global rules:
---

**PROMPT BEGINS HERE:**

---

## Reasoning Approach

**CoT Style:** Few-shot

Before generating CLAUDE.md:
1. Determine project type — new or existing codebase
2. If existing: analyze structure, config files, patterns, conventions
3. If new: gather requirements via questions, research best practices
4. Structure findings into the required sections
5. Ensure all sections are specific to this project, not generic

## Hooks

Hooks are always enabled. `## PIV-Automator-Hooks` is appended to terminal output (this command does not produce a file artifact — it creates/updates CLAUDE.md, but hooks go to terminal).

---

Help me create the global rules for my project. Analyze the project first to see if it is a brand new project or if it is an existing one, because if it's a brand new project, then we need to do research online to establish the tech stack and architecture and everything that goes into the global rules. If it's an existing code base, then we need to analyze the existing code base.

## Instructions for Creating Global Rules

Create a `CLAUDE.md` file (or similar global rules file) following this structure:

### Required Sections:

1. **Core Principles**
   - Non-negotiable development principles (naming conventions, logging requirements, type safety, documentation standards)
   - Keep these clear and actionable

2. **Tech Stack**
   - Backend technologies (framework, language, package manager, testing tools, linting/formatting)
   - Frontend technologies (framework, language, runtime, UI libraries, linting/formatting)
   - Include version numbers where relevant
   - Backend/frontend is just an example, this depends on the project of course

3. **Architecture**
   - Backend structure (folder organization, layer patterns like service layer, testing structure)
   - Frontend structure (component organization, state management, routing if applicable)
   - Key architectural patterns used throughout
   - Backend/frontend is just an example, this depends on the project of course

4. **Code Style**
   - Backend naming conventions (functions, classes, variables, model fields)
   - Frontend naming conventions (components, functions, types)
   - Include code examples showing the expected style
   - Docstring/comment formats required

5. **Logging**
   - Logging format and structure (structured logging preferred)
   - What to log (operations, errors, key events)
   - How to log (code examples for both backend and frontend)
   - Include examples with contextual fields

6. **Testing**
   - Testing framework and tools
   - Test file structure and naming conventions
   - Test patterns and examples
   - How to run tests
   - **Unit test rule:** Mock external APIs in unit tests. Unit tests MUST run offline with zero network calls.
   - **Live integration testing rule (MANDATORY for projects with external APIs):** `/validate-implementation` MUST execute live API tests against real external services during validation. Mocked-only validation is NEVER sufficient for projects with API integrations.
   - **Test directory structure:**
     - `tests/` — mocked unit tests (run offline, use mock fixtures)
     - `tests/integration/` — live API tests using real `.env` credentials
   - **Conftest patterns:**
     - Unit test conftest: mock fixtures simulating API responses (AsyncMock, MagicMock)
     - Integration test conftest: live fixtures loading credentials from `.env`, making real API calls
     - These MUST be separate — unit tests must never accidentally hit real APIs
   - **Fixture storage:** `.agents/fixtures/` stores recorded responses from Tier 3 live tests — serves as historical records and fallback data for Tier 4 mock-only tests

7. **Live Integration Testing Protocol** (for projects with external API integrations)
   - This project uses the PIV four-tier testing system. All tiers are defined in technology profiles (`.agents/reference/*-profile.md`, Section 9).

   **The Four Tiers:**
   - **Tier 1 — Auto-Live Health Checks:** Read-only, zero-cost calls (e.g., `GET /me`, `GET /models`, `GET /status`). Run automatically every validation. Verify connectivity and authentication.
   - **Tier 2 — Auto-Live with Test Data:** Controlled write operations using test-prefixed data. Includes automatic cleanup. Run automatically every validation.
   - **Tier 3 — Auto-Approved Live:** Calls that consume credits or create visible records. Credentials verified by `/preflight` before autonomous loop. Run automatically after preflight passes. Responses saved to `.agents/fixtures/`.
   - **Tier 4 — Mock Only:** Irreversible or high-risk operations. Always use fixture data from `.agents/fixtures/`. Never make live calls.

   **Enforcement rules:**
   - `/validate-implementation` MUST execute Tier 1-3 live tests — not just mocked pytest
   - If a technology profile exists in `.agents/reference/` with Section 9, its live tests are MANDATORY during validation
   - Technology profile Section 9 is the source of truth for which endpoints to test, at which tier, with what test data and cleanup procedures
   - Live test failures are classified per the error taxonomy: `integration_auth` (Tier 1 auth fails), `integration_rate_limit` (429s), `scenario_mismatch` (wrong response shape)

   **Environment variables:**
   - All API credentials for live testing are stored in `.env`
   - `/preflight` verifies these before autonomous execution begins
   - Integration test conftest loads from `.env` — never hardcodes test keys

   **Example conftest pattern for integration tests:**
   ```python
   import os
   import pytest

   @pytest.fixture
   def live_api_key():
       key = os.environ.get("API_KEY")
       if not key:
           pytest.skip("API_KEY not set — skipping live test")
       return key
   ```

8. **API Contracts** (if applicable - full-stack projects)
   - How backend models and frontend types must match
   - Error handling patterns across the boundary
   - Include examples showing the contract

9. **Common Patterns**
   - 2-3 code examples of common patterns used throughout the codebase
   - Backend service pattern example
   - Frontend component/API pattern example
   - These should be general templates, not task-specific

10. **Development Commands**
   - Backend: install, dev server, test, lint/format commands
   - Frontend: install, dev server, build, lint/format commands
   - Any other essential workflow commands

11. **AI Coding Assistant Instructions**
    - 10 concise bullet points telling AI assistants how to work with this codebase
    - Include reminders about consulting these rules, following conventions, running linters, etc.

12. **Terminal Output Standards**
    - How AI assistants should format their responses when working on this project
    - Emphasize plain English explanations over code dumps
    - Use structured output (bullets, headers, tables) for scannability
    - Include guidelines like:
      - Explain what you're doing before showing code
      - Use brief summaries before detailed sections
      - Prefer bullet points over paragraphs
      - Only show code when actively implementing (not when explaining)
      - Use status indicators for progress (⚪🟡🟢🔴 or similar)

    **Task Progress Reporting (REQUIRED — applies to ALL execution, not just Agent Teams):**
    - Before starting ANY task, output what is about to happen:
      ```
      🔄 Starting: [task description]
         Files: [files that will be created/modified]
         Depends on: [completed prerequisites, or "none"]
      ```
    - After completing any task, output the result:
      ```
      ✅ Complete: [task description]
         Result: [brief summary — files created, tests passed, etc.]
      ```
    - If a task fails, output the failure clearly:
      ```
      ❌ Failed: [task description]
         Error: [what went wrong]
         Impact: [what is now blocked]
      ```
    - For multi-step work, output periodic progress so the user is never left wondering what is happening:
      ```
      📊 Progress: [N]/[Total] tasks complete | [N] in progress | [N] remaining
      ```
    - This applies to EVERY command that does implementation work — `/execute`, `/validate-implementation`, `/research-stack`, and any custom commands
    - The user must ALWAYS be able to see what the agent is currently doing and how far along it is
    - Never work silently — if more than 30 seconds passes without terminal output, something is wrong

13. **Service Configuration** (for AI Agent Projects)
    - Include this section only if the project is an AI agent with external service integrations
    - Document which services the agent uses and how to configure them
    - Specify environment variables for API keys and credentials
    - Note any test accounts or sandbox endpoints for validation

    **⛔ HARD RULE — ANTHROPIC_API_KEY EXCLUSION:**
    - `ANTHROPIC_API_KEY` MUST NEVER appear in `.env`, `.env.example`, settings files, config dataclasses, conftest fixtures, or any generated code
    - The PIV orchestrator uses the Claude Agent SDK which spawns the `claude` CLI as a subprocess — the CLI handles its own auth via the user's OAuth token (Claude Max subscription, stored in macOS Keychain)
    - No Anthropic-specific env var is needed — not `ANTHROPIC_API_KEY`, not `ANTHROPIC_AUTH_TOKEN`, not any `sk-ant-*` key
    - This is a billing decision: subscription billing via subprocess, NOT pay-per-token via API key
    - If the project's technology profile for Claude/Anthropic SDK mentions `ANTHROPIC_API_KEY`, IGNORE that recommendation — it is incorrect for projects using the PIV orchestrator
    - The CLAUDE.md MUST include this exclusion prominently so no downstream command (`/execute`, `/preflight`, `/plan-feature`) ever generates code that imports or references an Anthropic API key
    - If the agent needs to call Claude programmatically (e.g., as a tool), it should use the `claude` CLI subprocess pattern, not direct SDK instantiation with an API key

    - Reference `.agents/services.yaml` for structured service configuration:
      ```yaml
      services:
        openai:
          auth_env: OPENAI_API_KEY
          health: /models
        postgres:
          auth_env: DATABASE_URL
          skip: false  # include in validation
      ```
    - This enables the validation system to test integrations automatically

14. **Planning Workflow** (for projects using PIV loop)
    - Document the plan-feature two-phase process if the project uses `/plan-feature`:
      1. **Scope Analysis**: Output recommendations with justifications to terminal
      2. **Plan Generation**: Create plan only after user validates approach
    - Explain that recommendations must include WHY:
      - Reference PRD requirements or user stories
      - Reference codebase patterns that inform the choice
      - Explain how the recommendation serves the implementation goal
    - Note the conversational validation checkpoint:
      - User reviews recommendations in terminal
      - Confirms or discusses changes
      - Plan generated with validated decisions baked in
    - This ensures plans are solid before execution begins

15. **Agent Teams Playbook** (for projects using Agent Teams)
    - Include this section if the project uses Claude Code Agent Teams for parallel execution
    - Document the teammate roles available in this project:

    **Teammate Roles:**

    ```markdown
    ### Implementer
    - **Purpose**: Execute implementation tasks from plans
    - **Tools**: Full codebase access, Bash, file operations
    - **Context**: Receives task description + technology profiles + codebase analysis
    - **Output**: Implemented code pushed to shared repo

    ### Validator
    - **Purpose**: Run scenario validation against PRD definitions
    - **Tools**: Test runners, Bash, file read access
    - **Context**: Receives PRD scenarios + plan acceptance criteria
    - **Output**: Validation report with pass/fail per scenario

    ### Researcher
    - **Purpose**: Deep-dive technology documentation and patterns
    - **Tools**: WebSearch, WebFetch, file write
    - **Context**: Receives technology name + PRD capability requirements
    - **Output**: Technology profile in `.agents/reference/`
    ```

    **Agent Teams Conventions:**
    - Each teammate gets a clear, single responsibility
    - Teammates coordinate through git push/pull on shared upstream
    - Direct messaging for integration questions
    - Lead coordinates but delegates implementation
    - One team per session only (experimental limitation)

    **Terminal Visibility (REQUIRED):**
    The Lead MUST output progress updates to the terminal so the user can track what teammates are doing. Format:
    ```
    🚀 Agent Teams: Spawning [N] teammates for [phase/command]

    Teammate 1: [Role] → [specific task description]
    Teammate 2: [Role] → [specific task description]
    Teammate 3: [Role] → [specific task description]

    ⏳ Teammates working...

    ✅ Teammate 1 complete: [brief result - e.g., "instantly-api-profile.md written (245 lines)"]
    ✅ Teammate 2 complete: [brief result]
    ❌ Teammate 3 failed: [brief error]

    📊 Team Summary: [N]/[N] succeeded, [time elapsed]
    ```
    - Lead announces BEFORE spawning (what each teammate will do)
    - Lead reports AFTER each teammate completes (what they produced or why they failed)
    - Lead provides a final summary with pass/fail counts
    - If a teammate is blocked or slow, Lead reports status updates
    - Never run teammates silently — the user must always see what is happening

    **When to Use Agent Teams:**
    - `/execute` with 3+ independent tasks → parallel implementers
    - `/research-stack` with 2+ technologies → parallel researchers
    - `/validate-implementation` with many scenarios → parallel validators
    **When NOT to Use Agent Teams:**
    - Tasks with tight sequential dependencies
    - Simple single-file changes
    - Quick bug fixes
    - When token budget is a concern (each teammate = full Claude instance)

16. **PIV Configuration** (for projects using PIV loop)
    - Add the configuration block:
      ```markdown
      ## PIV Configuration
      - profile_freshness_window: 7d
      - checkpoint_before_execute: true
      - mode: autonomous
      - reasoning_model: opus-4-6
      - validation_mode: full
      - agent_teams: prefer_parallel
      ```
    - Hooks are always enabled — all commands append `## PIV-Automator-Hooks` to their primary file artifact
    - `mode: autonomous` means no human checkpoints during execution — agent self-validates all decisions
    - `reasoning_model` specifies the model for all autonomous reasoning and self-validation
    - `validation_mode: full` means always run full live validation including Tier 3 API calls
    - `agent_teams: prefer_parallel` means use Agent Teams for parallel execution whenever available
    - `profile_freshness_window` controls when `/prime` flags profiles as stale (default 7 days)
    - `checkpoint_before_execute` creates a git tag before `/execute` runs — enables safe rollback on failure
    - Add a manifest paragraph: "The framework tracks project state in `.agents/manifest.yaml`. All PIV commands read and write to this file — phase progress, profile freshness, coverage gaps, and next-action recommendations. `/prime` builds and reconciles the manifest; other commands update it after producing artifacts."
    - Add context window pairings: Document which commands share a session before clearing. This enables the orchestrator to manage Claude Code sessions correctly.

17. **Prompting & Reasoning Guidelines** (for projects using PIV loop)
    - Add the CoT styles table (zero-shot, few-shot, ToT, per-subtask)
    - Add the Terminal Reasoning Summary format (4-8 bullets)
    - Add the Reflection pattern description (terminal only, ✅/⚠️ format)
    - Add the Hook Block Format specification (key-value, regex-parseable)
    - Reference CLAUDE.md in piv-dev-kit for the canonical version of these guidelines

18. **Manifest Reference** (for projects using PIV loop)
    - Document what `.agents/manifest.yaml` tracks and its purpose:
      ```markdown
      ## Manifest Reference

      The manifest (`.agents/manifest.yaml`) provides deterministic state tracking for the PIV loop.
      `/prime` builds and reconciles it; all other PIV commands update it after producing artifacts.

      **What it tracks:**
      - **Phase progress**: plan, execution, and validation status per phase
      - **PRD metadata**: path, generation date, phases defined
      - **Profile freshness**: generation date and stale/fresh status per technology profile
      - **Plans and executions**: paths, phases, completion status
      - **Validation results**: scenarios passed/failed/skipped per validation run
      - **Checkpoints**: git tags created before `/execute`, with active/resolved status
      - **Failures**: structured error history with category, retry count, and resolution status
      - **Next action**: recommended command, argument, reason, and confidence
      - **Coverage gaps**: missing or stale profiles for the next unfinished phase
      - **Notifications**: structured events for the orchestrator to forward to Telegram (escalations, completions)
      - **Pre-flight**: credential verification status and timestamp

      **Which commands write what:**
      | Command | Manifest Section Updated |
      |---------|--------------------------|
      | `/prime` | Builds/reconciles full manifest, writes `next_action`, reads `failures`/`checkpoints` |
      | `/create-prd` | Writes `prd` entry, initializes `phases` |
      | `/research-stack` | Writes `profiles` entries |
      | `/plan-feature` | Appends to `plans`, updates `phases.[N].plan` |
      | `/execute` | Writes `checkpoints`, appends to `executions`, updates `phases.[N].execution` |
      | `/validate-implementation` | Appends to `validations`, updates `phases.[N].validation` |
      | `/commit` | Resolves `checkpoints` (active → resolved), clears pending `failures`, writes `notifications` (phase_complete) |
      | `/preflight` | Writes `preflight` entry, writes `notifications` for missing credentials |
      | All failing commands | Write to `failures` section with error category and retry state |

      **Conventions:**
      - Always read manifest before writing — merge, never overwrite
      - Timestamps use ISO 8601 format
      - Profile freshness: `stale` if `generated_at` + `profile_freshness_window` < today
      - Phase status values: `not_started`, `in_progress`, `complete` (plan/execution); `not_run`, `pass`, `partial`, `fail` (validation)

      **Refresh workflow:**
      When `/prime` flags stale profiles → run `/research-stack --refresh` → profiles updated with fresh timestamps → `/prime` reports clean status on next run.
      ```

19. **Failure Intelligence Reference** (for projects using PIV loop)
    - Document the error taxonomy, checkpointing, and structured error handling:
      ```markdown
      ## Failure Intelligence

      The PIV framework classifies every command failure and persists recovery state in the manifest.

      ### Error Taxonomy

      | Category | Where It Happens | Recovery Action | Max Retries | Human Needed? |
      |----------|-----------------|-----------------|-------------|---------------|
      | `syntax_error` | `/execute`, `/validate` L1 | Auto-fix and retry | 2 | No (unless retries exhausted) |
      | `test_failure` | `/execute` validation, `/validate` L2 | Auto-fix and retry | 2 | No (unless retries exhausted) |
      | `scenario_mismatch` | `/validate` Phase 3 | Re-read PRD, adjust implementation | 1 | Maybe (after retry) |
      | `integration_auth` | `/validate` Tier 1, `/research-stack` | Escalate immediately | 0 | Yes |
      | `integration_rate_limit` | `/validate` Tier 2-3 | Wait with backoff, retry | 3 | No |
      | `stale_artifact` | `/prime` reconciliation | Auto-refresh via `/research-stack --refresh` | 1 | No |
      | `prd_gap` | `/plan-feature` Phase 0 | Make best-effort assumption, document reasoning, continue | 0 | No — agent resolves with documented assumption |
      | `partial_execution` | `/execute` | Auto-rollback to checkpoint, retry once | 1 | Yes — only after auto-retry fails |
      | `line_budget_exceeded` | `/create-prd`, `/plan-feature` | Auto-trim and retry | 1 | No |

      ### Git Checkpointing

      A lightweight git tag is created automatically before `/execute` runs (when `checkpoint_before_execute: true`).

      **Tag format**: `piv-checkpoint/{phase}-{ISO-8601-timestamp}`
      **Lifecycle**: `active` (created) → `resolved` (after `/commit` succeeds)
      **Rollback**: `git reset --hard {tag} && git clean -fd`

      Only `/execute` creates checkpoints — it's the only command that modifies source code.

      ### PIV-Error Block

      Always-on (not gated by hooks). Output to terminal on any command failure:
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
      Same data is written to manifest `failures` section. Regex-parseable: `^([a-z_]+): (.+)$`

      ### Retry vs Rollback

      **Retry** = resume from failure point. Previous tasks are fine — fix the error and continue. Progress file tracks what's done.
      **Rollback** = retries exhausted or `partial_execution`. Reset to checkpoint, wipe all execution changes. Manifest retains full failure history.

      ### How `/prime` Uses Failure State

      On every run, `/prime` reads `checkpoints` and `failures` from manifest:
      - Pending failure + retries remaining → recommend retry with fix guidance
      - Pending failure + no retries → recommend rollback + escalate
      - Active checkpoint + no failure → execution interrupted, recommend resume
      - Resolved checkpoint → historical, no action needed
      ```

20. **Pre-Flight & Credential Management** (for projects using PIV loop)
    - Document the `/preflight` command and its role in the autonomous workflow
    - Explain that all credentials are verified BEFORE autonomous execution begins
    - Document the notification mechanism for mid-execution credential failures
    - Include the pre-flight manifest entry format:
      ```yaml
      preflight:
        status: passed | blocked
        completed_at: [ISO 8601]
        credentials_verified: [N]
        technologies_checked: [list]
      ```
    - Only `integration_auth` errors are always blocking — the agent cannot fix credentials

21. **Orchestrator Interface** (for projects using PIV loop with autonomous orchestration)
    - Document the command execution sequence the orchestrator follows
    - Document context window pairings (which commands share a session)
    - Document the manifest as the sole decision interface:
      - `next_action` → what to run next
      - `failures` → error state and retry eligibility
      - `notifications` → events to forward to Telegram
      - `preflight` → whether credentials are verified
    - Document the orchestrator's core loop:
      1. Read manifest `next_action`
      2. Start Claude Code session (CLAUDE.md loads automatically)
      3. Run `/prime` + recommended command
      4. Session ends, read manifest
      5. If `notifications` has `blocking: true` → pause, notify human, wait
      6. If all phases complete → notify human, stop
      7. Otherwise → repeat from step 1
    - Document the notification lifecycle:
      - Framework appends notifications — never deletes or acknowledges
      - Orchestrator reads after each session, forwards to Telegram, sets `acknowledged: true`
      - `/prime` only reports unacknowledged notifications

## Process to Follow:

### For Existing Projects:
1. **Analyze the codebase thoroughly:**
   - Read package.json, pyproject.toml, or equivalent config files
   - Examine folder structure
   - Review 3-5 representative files from different areas (models, services, components, etc.)
   - Identify patterns, conventions, and architectural decisions already in place
2. **Extract and document the existing conventions** following the structure above
3. **Be specific and use actual examples from the codebase**

### For New Projects:
1. **Ask me clarifying questions:**
   - What type of project is this? (web app, API, CLI tool, mobile app, etc.)
   - What is the primary purpose/domain?
   - Any specific technology preferences or requirements?
   - What scale/complexity? (simple, medium, enterprise)
   - **Will this project use Agent Teams for parallel execution?**
2. **After I answer, research best practices:**
   - Use WebSearch for current best practices matching the tech stack
3. **Create global rules based on research and best practices**
4. **Include Agent Teams Playbook** if the project will use Agent Teams

## Critical Requirements:

- **Length: 100-500 lines MAXIMUM** - The document MUST be less than 500 lines. Keep it concise and practical.
- **Be specific, not generic** - Use actual code examples, not placeholders
- **Focus on what matters** - Include conventions that truly guide development, not obvious statements
- **Keep it actionable** - Every rule should be clear enough that a developer (or AI) can follow it immediately
- **Use examples liberally** - Show, don't just tell

## Output Format:

Create the CLAUDE.md with:
- Clear section headers (## 1. Section Name)
- Code blocks with proper syntax highlighting
- Concise explanations
- Real examples from the codebase (existing projects) or based on best practices (new projects)

Start by analyzing the project structure now. If this is a new project and you need more information, ask your clarifying questions first.

### Reasoning

Output 4-6 bullets:

```
### Reasoning
- Project type: [new|existing] — [brief justification]
- Analyzed [N] config files, [N] source files for patterns
- Tech stack: [summary]
- Included Agent Teams playbook: [yes|no]
- Included PIV Configuration + Reasoning Guidelines: [yes|no]
```

### Reflection

Self-critique (terminal only):
- Is the CLAUDE.md tailored to this specific project?
- Does it cover the PIV philosophy and prompting guidelines?
- Are code examples drawn from the actual codebase (not generic)?
- Is it within 100-500 lines?
- Does it include the Live Integration Testing Protocol for projects with external APIs?

### PIV-Automator-Hooks

Output to terminal:

```
## PIV-Automator-Hooks
rules_status: generated
includes_teams_playbook: [true|false]
includes_piv_config: [true|false]
includes_reasoning_guidelines: [true|false]
includes_live_testing_protocol: [true|false]
next_suggested_command: create-prd
next_arg: ""
confidence: [high|medium|low]
```
