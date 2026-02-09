---
description: Commit and push changes to GitHub repository
---

# Commit: Push Changes to GitHub

## Objective

Quickly commit all current changes and push them to the remote GitHub repository using the GitHub CLI.

## Pre-Flight Check

First, check for and remove any stale git lock files:
```bash
rm -f .git/index.lock
```

## Reasoning Approach

**CoT Style:** Zero-shot

Before committing, think step by step:
1. Review all staged changes — what files, what type of change
2. Determine commit type (feat/fix/docs/refactor/etc.) from the changes
3. Generate a descriptive message following project conventions
4. Verify no sensitive files (.env, credentials) are staged

## Hook Toggle

Check CLAUDE.md for `## PIV Configuration` → `hooks_enabled` setting.
If arguments contain `--with-hooks`, enable hooks. If `--no-hooks`, disable.
Strip flags from arguments before using remaining text as custom commit message.

## Process

### 1. Check Current State

Review what will be committed:
```bash
git status
```

View staged and unstaged changes:
```bash
git diff --stat
```

### 2. Stage Changes

Stage all changes (tracked and untracked):
```bash
git add -A
```

### 3. Create Commit

Analyze the changes and create a meaningful commit message following these guidelines:
- Use conventional commit format: `type(scope): description`
- Types: feat, fix, docs, style, refactor, test, chore
- Keep the first line under 72 characters
- Add a body if needed to explain the "why"

Create the commit with an appropriate message based on the changes.

### 4. Push to Remote

Push to the current branch:
```bash
git push
```

If the branch doesn't have an upstream set:
```bash
git push -u origin HEAD
```

### 5. Verify Success

Confirm the push was successful:
```bash
git log -1 --oneline && git status
```

## Commit Message Format

```
<type>(<scope>): <short description>

<optional body explaining why the change was made>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Types
- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Formatting, whitespace (no code change)
- **refactor**: Code restructuring (no behavior change)
- **test**: Adding or updating tests
- **chore**: Build process, dependencies, tooling

## Output

After completion, report:
- Branch name
- Commit hash (short)
- Commit message summary
- Remote push status
- Link to view on GitHub (if available via `gh browse`)

### Reasoning

Output 3-5 bullets:

```
### Reasoning
- Staged [N] files ([N] created, [N] modified)
- Commit type: [type] based on [rationale]
- Verified no sensitive files included
```

### Reflection

Quick self-critique (terminal only):
- Does the commit message accurately describe the changes?
- Were all relevant files included?
- Does it follow project conventions?

### PIV-Automator-Hooks (If Enabled)

If hooks are enabled, output to terminal after commit:

```
## PIV-Automator-Hooks
commit_status: [success|failed]
commit_hash: [short hash]
files_committed: [N]
next_suggested_command: prime
next_arg: ""
confidence: high
```