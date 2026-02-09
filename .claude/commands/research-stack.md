---
description: Deep-dive technology research producing structured profiles for all platforms in the PRD
argument-hint: [prd-file-path]
---

# Research Stack: Deep Technology Profiling

## Overview

Perform comprehensive research on every external technology, API, and platform referenced in the PRD. Produces structured technology profiles in `.agents/reference/` that are consumed by `/plan-feature`, `/execute`, and `/validate-implementation`.

**Run ONCE after PRD creation. Rerun only if new technologies are added.**

## When to Run

```
/create-prd → /research-stack → /plan-feature (Phase 1, 2, 3...)
                  ↑ RUN ONCE        ↑ reads profiles every time
```

## Input

Read the PRD from: `$ARGUMENTS` (default: `PRD.md`)

Extract technologies from:
- **Section 3: Technology Decisions** - Primary source of what to research
- **Section 7: Technology Stack** - External services table
- **Section 4: Agent Behavior Specification** - Tools and their platforms

## Output

For each technology, write a structured profile to:
`.agents/reference/{technology-name}-profile.md`

Examples: `instantly-api-profile.md`, `x-api-profile.md`, `elevenlabs-profile.md`

## Agent Teams Mode

> **When Agent Teams is available**, this command naturally parallelizes. Each technology gets its own research teammate working simultaneously.

**With Agent Teams:**
```
Team Lead reads PRD → identifies N technologies → spawns N research teammates
   ├── Teammate 1: Research Technology A → writes profile A
   ├── Teammate 2: Research Technology B → writes profile B
   └── Teammate 3: Research Technology C → writes profile C
All teammates work simultaneously, each producing their profile.
```

**Without Agent Teams:**
Research technologies sequentially, producing each profile before moving to the next.

## Reasoning Approach

**CoT Style:** Per-subtask (one per technology)

For each technology being researched:
1. Extract PRD context — why chosen, what agent needs, relevant scenarios
2. Research official documentation — auth, endpoints, rate limits, SDKs
3. Research community knowledge — gotchas, workarounds, real-world patterns
4. Structure findings into profile format
5. Classify all endpoints into testing tiers (1-4)

After completing each profile, reflect:
- Is the profile accurate and complete for this agent's needs?
- Are there missing gotchas or undocumented limitations?
- Does the testing tier classification cover all endpoints?

## Hook Toggle

Check CLAUDE.md for `## PIV Configuration` → `hooks_enabled` setting.
If arguments contain `--with-hooks`, enable hooks. If `--no-hooks`, disable.
Strip flags from arguments. Check for `--only [tech]` to research single technology.

---

## Research Process (Per Technology)

### Step 1: Read PRD Context

For this technology, extract from the PRD:
- **Why chosen**: The rationale from Technology Decisions (Section 3)
- **What the agent needs**: Specific capabilities required
- **Integration approach**: REST/SDK/MCP
- **Known constraints**: Rate limits, auth, pricing mentioned
- **Relevant scenarios**: Which scenarios from Section 4.3 involve this technology
- **Decision trees**: Which decisions from Section 4.2 depend on this technology

This context focuses the research. You're not documenting the entire API — only what this agent needs.

### Step 2: Research Official Documentation

Use WebSearch and WebFetch to find and read:

1. **Official API documentation**
   - Authentication guides (API keys, OAuth flows, token refresh)
   - Endpoint reference for capabilities the agent needs
   - Rate limit documentation
   - Error code reference
   - SDK/client library documentation

2. **Getting started / quickstart guides**
   - Setup requirements
   - First API call examples
   - Common patterns

3. **Changelog / what's new**
   - Recent breaking changes
   - Deprecated endpoints
   - New features relevant to agent's use case

### Step 3: Research Community Knowledge

Search for practical implementation experience:

1. **GitHub repositories**
   - Search for popular libraries/SDKs for this API
   - Check issues for common problems
   - Review example implementations

2. **Stack Overflow / Developer forums**
   - Common pitfalls and workarounds
   - Undocumented behaviors
   - Performance tips

3. **Blog posts / tutorials**
   - Real-world integration patterns
   - Gotchas from production use
   - Best practices not in official docs

### Step 4: Compile Technology Profile

Write the profile to `.agents/reference/{technology-name}-profile.md` using the format below.

---

## Technology Profile Format

Every profile MUST follow this exact structure for consistency. The `/plan-feature` and `/execute` commands expect this format.

```markdown
# Technology Profile: [Technology Name]

**Generated**: [Date]
**PRD Reference**: Section 3 - [Technology Name]
**Agent Use Case**: [One sentence from PRD describing what agent needs this for]

---

## 1. Authentication & Setup

**Auth Type**: [API Key / OAuth 2.0 / Bearer Token / etc.]
**Auth Location**: [Header / Query param / Body]

**Setup Steps:**
1. [Create account at URL]
2. [Generate API key at URL]
3. [Set environment variable: ENV_VAR_NAME]

**Auth Code Pattern:**
```[language]
[Minimal working auth example - actual code, not pseudocode]
```

**Environment Variables:**
| Variable | Purpose | Required |
|----------|---------|----------|
| [VAR_NAME] | [What it's for] | Yes/No |

---

## 2. Core Data Models

> Only models relevant to this agent's use case.

**[Model Name]:**
| Field | Type | Description | Required |
|-------|------|-------------|----------|
| [field] | [type] | [what it is] | Yes/No |

[Repeat for each relevant model]

---

## 3. Key Endpoints

> Only endpoints the agent needs based on PRD capabilities.

### [Capability from PRD]: [Endpoint Name]

**Method**: [GET/POST/PUT/DELETE]
**URL**: `[full endpoint URL with path params]`

**Request:**
```json
{
  "field": "example_value"
}
```

**Response:**
```json
{
  "field": "example_value"
}
```

**Notes**: [Pagination, filtering, important behaviors]

[Repeat for each needed endpoint]

---

## 4. Rate Limits & Throttling

| Endpoint/Scope | Limit | Window | Retry Strategy |
|----------------|-------|--------|----------------|
| [Global] | [N] req | [per second/minute] | [Exponential backoff / wait] |
| [Specific endpoint] | [N] req | [per period] | [Strategy] |

**Recommended throttle implementation:**
- [Specific guidance for this agent's use pattern]
- [How to detect rate limiting - headers, status codes]
- [Backoff strategy that fits the agent's workflow]

---

## 5. Error Handling

| Status Code | Meaning | Agent Should |
|-------------|---------|-------------|
| [400] | [Bad request] | [Validate input and retry with corrections] |
| [401] | [Unauthorized] | [Refresh token / alert user] |
| [429] | [Rate limited] | [Back off per Section 4 strategy] |
| [500] | [Server error] | [Retry with exponential backoff, max 3 attempts] |

**Error Response Format:**
```json
{
  "error": "example_error_response"
}
```

---

## 6. SDK / Library Recommendation

**Recommended**: [Library name] v[version]
**Install**: `[install command]`
**Why**: [Brief justification - maintained, typed, covers needed endpoints]

**Alternative**: [If primary is unavailable]

**If no suitable SDK**: Use raw HTTP with [requests/fetch/axios] - patterns below:
```[language]
[Minimal HTTP client example]
```

---

## 7. Integration Gotchas

> Practical issues discovered from community research that official docs don't cover.

1. **[Gotcha title]**: [Description and workaround]
2. **[Gotcha title]**: [Description and workaround]
3. **[Gotcha title]**: [Description and workaround]

---

## 8. PRD Capability Mapping

> Maps PRD requirements to specific implementation paths.

| PRD Capability (from Section 3) | Endpoints/Methods | Notes |
|--------------------------------|-------------------|-------|
| [Capability 1] | [POST /endpoint] | [Implementation notes] |
| [Capability 2] | [GET /endpoint + POST /other] | [Sequence/workflow notes] |

---

## 9. Live Integration Testing Specification

> **This section drives `/validate-implementation` Phase 3.** It classifies every endpoint the agent uses into testing tiers and provides the exact data, commands, and approval requirements for live API validation.

### 9.1 Testing Tier Classification

Classify EVERY endpoint from Section 3 into exactly one tier:

#### Tier 1: Auto-Live (No Approval Needed)

> Read-only, zero cost, zero side effects. Runs automatically every validation.

| Endpoint | Method | Purpose | Expected Response Shape | Failure Means |
|----------|--------|---------|------------------------|---------------|
| [GET /endpoint] | GET | [Verify auth, check account] | `{ "field": "type" }` | [Auth broken / service down] |

**Health Check Command:**
```[language]
[Actual executable code that calls a Tier 1 endpoint and verifies response]
```

**Schema Validation:**
```[language]
[Code that parses response and checks expected fields exist with correct types]
```

#### Tier 2: Auto-Live with Test Data (No Approval Needed)

> Controlled side effects with pre-defined test data. Includes automatic cleanup.

| Endpoint | Action | Test Data | Cleanup Action | Why Safe |
|----------|--------|-----------|----------------|----------|
| [POST /endpoint] | [Create test record] | [Test input with PIV_TEST_ prefix] | [DELETE /endpoint/{id}] | [Isolated, auto-deleted] |
| [POST /send] | [Send test message] | [To: user's personal email] | [None needed] | [Only affects user] |

**Test Data Configuration:**
```[language]
# Define test data used for Tier 2 validation
TEST_CONFIG = {
    "test_email": "[user's personal email - set in .env as PIV_TEST_EMAIL]",
    "test_prefix": "PIV_TEST_",
    "test_identifiers": []  # Populated during test, used for cleanup
}
```

**Cleanup Procedure:**
```[language]
[Actual executable code that cleans up all Tier 2 test artifacts]
[Must be idempotent - safe to run even if tests partially failed]
```

**Important:** Test data values that are user-specific (email addresses, account IDs) should reference environment variables, not hardcoded values. Document the required env vars.

#### Tier 3: Approval-Required Live (Human in the Loop)

> Costs real credits, has non-trivial side effects, or consumes metered resources. Validation MUST ask user before executing.

| Endpoint | Action | Estimated Cost | Side Effect | Fallback Fixture |
|----------|--------|---------------|-------------|-----------------|
| [POST /generate] | [AI inference call] | [~$0.01-0.05 per call] | [Consumes API credits] | `.agents/fixtures/{tech}-generate.json` |
| [POST /campaign/launch] | [Activates campaign] | [Free but visible] | [Campaign appears in dashboard] | `.agents/fixtures/{tech}-launch.json` |

**Approval Prompt Format** (used by `/validate-implementation`):
```
🔔 Tier 3 Approval Required: [Technology Name]

To validate [scenario name], I need to:
→ Call: [METHOD /endpoint]
→ With: [brief description of test input]
→ Cost: [estimated cost or "free but creates visible record"]
→ Effect: [what happens - credits consumed, record created, etc.]
→ Cleanup: [auto-cleanup available / manual cleanup needed / none needed]

Options:
  [1] Approve - make live call
  [2] Use recorded fixture (last recorded: [date or "none"])
  [3] Skip this test
```

**Response Recording:**
When user approves a Tier 3 call:
1. Execute the API call
2. Save full response to `.agents/fixtures/{technology}-{endpoint-name}.json`
3. Log timestamp and input used
4. On next validation run, offer choice: use recorded response or make fresh call

**Fixture Format:**
```json
{
  "recorded_at": "2026-02-05T14:30:00Z",
  "endpoint": "POST /generate",
  "request": { "input": "test prompt" },
  "response": { "actual response body" },
  "status_code": 200,
  "notes": "Recorded during Phase 1 validation"
}
```

#### Tier 4: Mock Only (Never Live)

> Irreversible, affects real users/customers, or high financial risk. Always use fixtures.

| Endpoint | Why Mock Only | Fixture File | Mock Strategy |
|----------|-------------- |-------------|---------------|
| [POST /bulk-send] | [Sends to real customers] | `.agents/fixtures/{tech}-bulk-send.json` | [Return pre-recorded success response] |
| [DELETE /account] | [Irreversible deletion] | `.agents/fixtures/{tech}-delete-account.json` | [Return pre-recorded confirmation] |

**Mock Implementation:**
```[language]
[Code showing how to mock this endpoint - interceptor, fixture loader, etc.]
[Must return realistic response matching actual API format from Section 3]
```

**Fixture Data:**
```json
[Actual realistic response that matches the API's real response format]
[Include edge cases: empty results, pagination, partial failures]
```

### 9.2 Test Environment Configuration

**Environment Variables Required for Testing:**
| Variable | Purpose | Tier | Example |
|----------|---------|------|---------|
| [API_KEY] | Authentication | All tiers | `sk-test-...` |
| [PIV_TEST_EMAIL] | Tier 2 test recipient | Tier 2 | `marley@personal.com` |
| [SANDBOX_MODE] | Enable sandbox if available | Tier 1-2 | `true` |

**Sandbox Availability:**
- [ ] This API has a sandbox/test mode: [Yes/No]
- If yes: [How to enable - test API key, sandbox URL, env flag]
- If yes: [Differences between sandbox and production responses]
- If no: [Tier 1-2 tests use production API with safe operations]

### 9.3 Testing Sequence

The recommended order for `/validate-implementation` to execute tests:

```
1. Tier 1 (auto-live) → Verify connectivity and auth
   ├── If FAIL → Stop. Integration is broken.
   └── If PASS → Continue

2. Tier 2 (auto-live with test data) → Verify write operations
   ├── Execute test operations
   ├── Verify responses match expected schemas
   ├── Run cleanup procedure
   └── If cleanup FAILS → WARN user, continue

3. Tier 3 (approval-required) → Verify costly operations
   ├── Present approval prompt for each
   ├── If approved → Execute, record response, validate
   ├── If "use fixture" → Load recorded fixture, validate against it
   └── If "skip" → Log as SKIPPED in report

4. Tier 4 (mock only) → Verify agent handles responses correctly
   ├── Load fixtures
   ├── Feed to agent's processing logic
   └── Verify agent behavior matches PRD decision trees
```

---

## Profile Quality Criteria

Each profile must:
- [ ] Follow the exact structure above (commands expect this format)
- [ ] Include ONLY capabilities relevant to this agent's PRD
- [ ] Have working code examples (not pseudocode)
- [ ] Include actual request/response examples from docs
- [ ] Document rate limits with retry strategies
- [ ] Map every PRD capability to specific endpoints
- [ ] Include community-sourced gotchas (not just official docs)
- [ ] **Classify every endpoint into a testing tier (1-4)**
- [ ] **Provide test data and cleanup procedures for Tier 2**
- [ ] **Document cost estimates and approval prompts for Tier 3**
- [ ] **Include realistic fixture data for Tier 3 fallbacks and Tier 4**
- [ ] **Specify environment variables needed for testing**

**Length guideline**: 150-400 lines per profile. Dense and actionable. The testing specification (Section 9) typically accounts for 30-40% of the profile.

### PIV-Automator-Hooks Per Profile (If Enabled)

If hooks are enabled, append to each profile file:

```
## PIV-Automator-Hooks
tech_name: [technology name]
research_status: complete
endpoints_documented: [N]
tier_1_count: [N]
tier_2_count: [N]
tier_3_count: [N]
tier_4_count: [N]
gotchas_count: [N]
confidence: [high|medium|low]
```

---

## Final Output

After generating all profiles:

### Summary Report (Terminal Output)

```
## Research Stack Complete

**PRD**: [path]
**Technologies Researched**: [N]

### Profiles Generated

| Technology | Profile | Endpoints | T1 Auto | T2 Test | T3 Approval | T4 Mock |
|-----------|---------|-----------|---------|---------|-------------|---------|
| [Name] | `.agents/reference/[name]-profile.md` | [N] | [N] | [N] | [N] | [N] |

### Key Findings
- [Any critical discovery that affects the PRD or architecture]
- [Any technology limitation that may require PRD revision]
- [Any recommended additional technology not in PRD]

### Next Step
→ Run `/plan-feature "Phase 1: [Name]"` to begin implementation planning
```

### Reasoning

Output 4-8 bullets summarizing all research:

```
### Reasoning
- Researched [N] technologies from PRD Section 3
- Generated [N] profiles totaling [N] endpoints documented
- Key finding: [most important discovery]
- Potential issue: [any technology limitation affecting PRD]
```

### Reflection

Self-critique the research (terminal only):
- Are all PRD technologies covered?
- Are profiles accurate based on official docs + community sources?
- Do testing tier classifications make sense for each endpoint?
- Any profile gaps that could cause issues during planning?

---

## Error Handling

### Technology docs not accessible
- Try alternative documentation sources (GitHub README, dev portal)
- Note gaps in profile and flag to user

### Technology appears unsuitable
- If research reveals the technology can't support a PRD capability:
  - Flag immediately in terminal output
  - Suggest alternatives with brief rationale
  - Do NOT silently proceed — this needs user decision

---

## Rerun Policy

**Run once** after PRD creation. Rerun only when:
- New technology added to PRD
- Existing technology swapped for alternative
- Major API version change discovered during implementation
- `/validate-implementation` reveals profile gaps

When rerunning for a single technology:
```bash
/research-stack --only [technology-name]
```
Parse `--only` from arguments to research just that technology and update its profile.
