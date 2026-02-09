PIV Dev Kit Enhancement Specification
Chain-of-Thought, Self-Reflection, Structured Hooks & Future SDK Automation Preparation
Development Brief & Full Command Change Details
February 09, 2026
1. Purpose of This Document
Claude Code already has full knowledge of the existing piv-dev-kit repository (commands in .claude/commands/, CLAUDE.md, .agents/ structure, Agent Teams support, PIV loop philosophy, human-in-the-loop workflow, etc.).
This file contains only:

The agreed direction of development
Why these changes are valuable
Exact, command-by-command changes to implement
How context management and Agent Teams behave after enhancement
Preparation for future autonomous agent (single orchestrator using Claude Agent SDK)
The role and format of minimal structured "## PIV-Automator-Hooks" blocks and why they matter

Goal: Use this document as context → instruct Claude Code to update .claude/commands/*.md files, CLAUDE.md, and optionally introduce hooks generation.
2. Core Principles & Decisions

Human-in-the-loop forever (for now): every command remains manually invoked
Do not weaken or remove any existing human checkpoint / discussion point
Make each command internally smarter via lightweight CoT + self-reflection
Keep additions token-efficient (5–8 CoT steps + short reflection <200 tokens)
Outputs stay primarily plain, human-readable Markdown
Add optional "## PIV-Automator-Hooks" block at end of major artifacts (5–15 lines)
For future SDK agent to parse reliably with regex / simple parser
Toggleable (e.g. --with-hooks flag) so manual mode stays clean

Preserve current workflow: frequent /clear + /prime cycles, separate windows per major phase when desired
Future vision: single autonomous "PIV Automator" agent that mimics manual flow (including intelligent /clear + /prime) but runs hands-free

3. Chain-of-Thought & Self-Reflection Guidelines
CoT Styles

Zero-shot for lightweight commands (/prime, /commit): "Think step by step: 1. … 2. …"
Few-shot for complex generation (/create-prd, /plan-feature): 1–2 examples from CLAUDE.md
Tree-of-Thought (ToT) for decisions/exploration (/plan-feature, Agent Teams lead)
Per-subtask CoT when Agent Teams spawns teammates

Reflection Pattern

One short critique pass after main generation
Typical questions: Alignment with PRD/scenarios/profiles? Completeness? Gaps? Consistency?
Output: brief ## Reflection Notes section or inline in hooks

Global Location

Embed CoT/reflection directly in each command's prompt text (.claude/commands/*.md)
Add new section to CLAUDE.md: ## Prompting & Reasoning Guidelines
Include reusable CoT templates, reflection questions, hooks format examples


4. Command-by-Command Changes
/prime (incl. --with-refs)

CoT: "Think step by step: 1. Scan codebase structure/files/patterns. 2. Cross-ref .agents/reference/ & .agents/plans/. 3. Assess progress & gaps. 4. Prioritize freshness. 5. Recommend precise next step."
Reflection: "Is this summary complete/accurate? Missed context from CLAUDE.md/PRD.md?"
Structured: <project-overview>, <tech-status>, <progress-assessment>, <recommendation>, <reasoning-trace> (collapsible)
Hooks block (at end):text## PIV-Automator-Hooks
current_phase: planning
completed_phases: define,research
pending_items: execute phase-2
recommended_next_command: plan-feature
recommended_arg: "Phase 2: Agent Intelligence"
requires_clear_before_next: false
confidence: high
Goal: Smarter reload after /clear; hooks allow instant resumption

/create-prd [optional-name]

Preserve exact section structure & 500–750 line target
CoT: Few-shot examples (identity, user-story → scenario linking)
"1. Extract identity/autonomy. 2. Rationalize tech decisions. 3. Define behaviors/decision trees. 4. Create 8–15 scenarios. 5. Link user stories. 6. Phase implementation."
Reflection: "Alignment with conversation? Completeness (sections/scenarios)? Agent-native detail?"
Structured: Light tags <agent-identity>, <tech-decisions>, etc.; append <reflection-notes>
Hooks:text## PIV-Automator-Hooks
prd_status: complete
technologies_to_research: Claude API, ElevenLabs, X API v2
scenarios_count: 12
next_suggested_command: research-stack
next_arg: PRD.md
confidence: high

/create_global_rules_prompt

CoT: "1. Review context/stack. 2. Document patterns. 3. Add AI instructions. 4. Teams playbook if enabled."
Reflection: "Tailored? Covers philosophy? Includes prompting guidelines?"
Add to output CLAUDE.md: ## Prompting & Reasoning Guidelines (CoT/reflection/hook templates)
Hooks: minimaltext## PIV-Automator-Hooks
rules_status: generated
includes_teams_playbook: true
next_suggested: create-prd

/research-stack [prd-file] [--only tech]

CoT per tech: "1. Extract from PRD. 2. Official docs. 3. Community. 4. Structure profile. 5. Add mocks/validation."
Reflection per profile: "Accurate? Missing gotchas/limits?"
Structured: <profile-section> in each .md
Hooks per profile:text## PIV-Automator-Hooks
tech_name: Claude API
research_status: complete
confidence: high
gotchas_count: 4
next_suggested: plan-feature
Teams: Each researcher gets full CoT; lead aggregates reflections

/plan-feature "phase-description"

CoT with ToT: "Explore 2–3 approaches → evaluate vs PRD/profiles → select → detail steps/tasks/validation."
--reflect flag: Extra critique pass before finalizing
Structured: <scope-analysis>, <branch-evaluation>, <task-outline>
Hooks:text## PIV-Automator-Hooks
plan_status: ready_for_execution
independent_tasks_count: 5
next_suggested_command: execute
next_arg: .agents/plans/[file].md
estimated_token_load: medium

/execute plan-path

CoT per task/batch: "1. Load plan/profiles. 2. Resolve deps. 3. Implement. 4. Test locally. 5. Integrate."
Reflection: Post-batch critique (consistency, issues, fixes)
Structured: <dependency-graph> (Mermaid), <progress-summary>
Hooks:text## PIV-Automator-Hooks
execution_status: success
tasks_completed: 7/8
next_suggested_command: validate-implementation
next_arg: [plan-path] --full
requires_clear: true
Teams: Independent tasks get CoT; lead reflects on integration

/validate-implementation [plan] [--full]

CoT per level/scenario: "1. Load PRD/plan. 2. Simulate paths. 3. Verify trees/integrations. 4. Check profiles."
Reflection: "Full scenario coverage? Missed branches? Recommend fixes?"
Structured: <level-1-results>, <scenario-coverage>
Hooks (critical for looping):text## PIV-Automator-Hooks
validation_status: partial
failure_categories: edge-cases,rate-limits
suggested_action: re-execute
suggested_command: execute
suggested_arg: [plan-path] --with-mocks
retry_remaining: 2
Teams: One validator per category with CoT; lead aggregates

/commit [message]

CoT: "1. Verify staged changes. 2. Format/generate message. 3. Commit per conventions."
Reflection: "Follows conventions? Missed files?"
Hooks:text## PIV-Automator-Hooks
commit_status: success
next_suggested: prime

Additional Commands

/create_reference
CoT + reflection similar to research-stack
Hooks: research_complete, confidence

/orchestrate-analysis
ToT for phases + reflection
Hooks: analysis_status, next_action


5. Context Management After Changes

Manual /clear + /prime pattern unchanged
Enhanced /prime → more compact, reasoned summary + hooks → better post-reset continuity
Enables longer same-window runs when tokens allow (/prime → plan-feature → review)
Future SDK agent will use CoT + hooks to decide /clear proactively

6. Agent Teams After Changes

Teammate prompts inherit CoT style of parent command
Lead uses ToT/reflection for batching & integration critique
Remains window-bound (per command invocation)

7. Future Autonomous Agent (SDK Preparation)
Single orchestrator agent that:

Starts from goal / last artifact state
Runs /prime → parses hooks → decides next command/arg/clear
Loops on failures using validation hooks
Mimics phase isolation with intelligent /clear + /prime
Uses regex on "## PIV-Automator-Hooks" for fast, deterministic decisions

Hooks are deliberately minimal (5–15 lines) and boring → fast, deterministic parsing.
8. Implementation Steps for Claude Code

Add ## Prompting & Reasoning Guidelines to CLAUDE.md
Update each .claude/commands/*.md:
Insert CoT/reflection at appropriate points
Generate structured tags where specified
Append ## PIV-Automator-Hooks block (consistent format)

Make hooks optional via flag (clean manual mode)
Test one command at a time (output quality, tokens, readability)
After all updated → prototype simple SDK orchestrator skeleton (optional next phase)

This document defines the complete agreed enhancement target.