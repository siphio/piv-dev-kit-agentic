---
description: Pre-flight verification of credentials, environment, and prerequisites before autonomous execution
---

# Preflight: Autonomous Execution Readiness Check

## Objective

Verify that all credentials, environment variables, and prerequisites are in place before the autonomous agent begins the PIV loop. This command runs ONCE after PRD validation and research, before the first `/plan-feature`.

## Reasoning Approach

**CoT Style:** Zero-shot

Before reporting readiness:
1. Extract all technologies from PRD
2. Cross-reference with profile env var requirements
3. Verify each credential exists and is functional
4. Report readiness or request missing credentials

## Hooks

Hooks are always enabled. `## PIV-Automator-Hooks` is appended to terminal output (this command does not produce a file artifact).

## Process

### 1. Extract Required Credentials

Read PRD Section 3 (Technology Decisions) and Section 7 (Technology Stack) to identify all external technologies.

For each technology, read its profile from `.agents/reference/`:
- Section 1 (Authentication & Setup) → Environment Variables table
- Section 9.2 (Test Environment Configuration) → Testing env vars

Compile a complete list of required environment variables.

### 2. Check .env File

Read `.env` file (or equivalent environment configuration):
- For each required variable: check if present and non-empty
- Categorize: ✅ Present | ❌ Missing | ⚠️ Present but empty

### 3. Verify Credentials (Tier 1 Health Checks)

For each technology with present credentials:
- Execute the Tier 1 health check from the profile's Section 9.1
- Verify: auth works, service is reachable, response matches expected schema

### 4. Report Readiness

```
## Pre-Flight Check

### Credential Status

| Technology | Env Variable | Status | Health Check |
|-----------|-------------|--------|-------------|
| [Name] | [VAR_NAME] | ✅ Present | ✅ Healthy |
| [Name] | [VAR_NAME] | ❌ Missing | ⏭️ Skipped |
| [Name] | [VAR_NAME] | ✅ Present | ❌ Auth Failed |

### Environment

- Runtime: [detected] ✅
- Package manager: [detected] ✅
- Git: clean working tree ✅/❌

### Verdict: [READY | BLOCKED]

[If BLOCKED]:
Missing or failing credentials:
- [VAR_NAME] — needed for [Technology] in Phases [N, N]
- [VAR_NAME] — needed for [Technology] in Phases [N]

Please provide the missing credentials. Build cannot start without them.

[If READY]:
All credentials verified. Ready for autonomous execution.
→ Next: /prime → /plan-feature "Phase 1"
```

### 5. Request Missing Credentials

If any credentials are missing or failing:
- Write to manifest `notifications` section:
  ```yaml
  notifications:
    - timestamp: [ISO 8601]
      type: escalation
      severity: critical
      category: integration_auth
      phase: 0
      details: "Pre-flight: [N] credentials missing — [list of VAR_NAMEs]"
      blocking: true
      action_taken: "Waiting for credentials before starting autonomous execution"
  ```
- Wait for credentials to be provided (via Telegram/environment)
- Re-run verification after credentials are provided
- Only report READY when ALL credentials pass health checks

### 6. Update Manifest

After successful pre-flight:
- Write `preflight` entry to manifest:
  ```yaml
  preflight:
    status: passed
    completed_at: [ISO 8601]
    credentials_verified: [N]
    technologies_checked: [list]
  ```
- Update `last_updated` timestamp

### Reasoning

Output 3-5 bullets:
```
### Reasoning
- Extracted [N] required credentials from [N] technology profiles
- Verified [N] credentials via Tier 1 health checks
- [N] missing, [N] failed, [N] passed
- Verdict: [READY|BLOCKED]
```

### Reflection

Self-critique (terminal only):
- Are all technologies from the PRD accounted for?
- Did health checks verify actual auth, not just variable presence?
- Are there any phase-specific credentials that aren't needed until later phases?

### PIV-Automator-Hooks

Output to terminal:

```
## PIV-Automator-Hooks
preflight_status: [passed|blocked]
credentials_total: [N]
credentials_verified: [N]
credentials_missing: [N]
next_suggested_command: [prime|preflight]
next_arg: ""
confidence: [high|low]
```
