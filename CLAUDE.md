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
5. **Human checkpoints** - The framework enables discussion before implementation

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

**Phase 0: Scope Analysis (Terminal Output)**
1. Read the PRD phase being planned
2. Extract user stories, prerequisites, scope boundaries
3. Identify decision points from "Discussion Points" sections
4. Output recommendations with justifications to terminal:
   ```
   ### Recommendations

   1. **[Decision Point]**
      → [Recommendation]
      Why: [Justification - how this serves the goal]
   ```
5. Wait for user validation (confirm or discuss changes)

**Plan Generation (File Output)**
- Only proceed after user validates approach
- Bake validated decisions into the plan
- Document decisions in NOTES section so executor understands constraints

**Key Principle:** Recommendations must include WHY - the justification based on PRD requirements, user stories, or codebase patterns. This enables informed validation.
