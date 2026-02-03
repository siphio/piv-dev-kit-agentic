# PIV Loop Intelligent Validation System - Product Requirements Document

## 1. Executive Summary

This PRD defines the upgrade to the PIV Loop framework that adds intelligent, autonomous validation capabilities. The current system validates code (lint, tests) but not behavior. AI agents have complex workflows, tool chains, and service integrations that require human-like testing to verify they actually work as intended.

The Intelligent Validation System will act as a thorough QA engineer who understands the agent's purpose, maps all possible workflows, tests each path with real and mock data, and reports findings with actionable fixes. This eliminates the common pattern of "tests pass but agent fails in production."

**MVP Goal:** After implementing any phase of an AI agent, the developer can run a single command that autonomously validates all implemented functionality works correctly from the user's perspective.

---

## 2. Mission & Principles

**Mission:** Enable 100% confidence that implemented agent features work correctly before moving to the next phase.

**Core Principles:**

1. **User Perspective First** - Validate what the feature MEANS to users, not just that code runs
2. **Autonomous Intelligence** - Go as deep as needed without manual configuration
3. **Real + Mock** - Test with real services AND generated edge cases
4. **Actionable Output** - Don't just report failures, suggest fixes
5. **Context is King** - Full understanding of PRD, plan, user stories before testing

---

## 3. Target Users

**Primary Persona: AI Agent Developer**

- **Who:** Developer building AI agents that act as autonomous employees
- **Technical Comfort:** High - comfortable with code, APIs, agent frameworks
- **Goals:**
  - Ship reliable agents that don't fail in production
  - Catch integration issues before they reach users
  - Reduce time spent manually testing workflows
- **Pain Points:**
  - Basic tests pass but agent fails on edge cases
  - Hard to test all workflow paths manually
  - Service integrations break silently
  - No confidence that "done" actually means "working"

---

## 4. MVP Scope

**In Scope:**

Core Functionality:
- ✅ Enhanced plan-feature with scoping & recommendations phase
- ✅ Post-execution intelligent validation command (`/validate-implementation`)
- ✅ Subagent coordination for thorough testing
- ✅ Auto-detection of services from codebase
- ✅ Mock data generation for edge cases
- ✅ Real service integration testing

Framework Updates:
- ✅ PRD template updates (Agent Validation Profile section)
- ✅ Plan-feature updates (Validation Strategy section + Scoping Phase)
- ✅ Global rules updates (Service Configuration section)

**Out of Scope:**

- ❌ Visual UI for validation results (CLI output only)
- ❌ Continuous monitoring after deployment
- ❌ Performance/load testing
- ❌ Security vulnerability scanning
- ❌ Multi-agent orchestration testing (single agent focus for MVP)

---

## 5. User Stories

### US-001: Pre-Planning Scope Analysis & Recommendations

**As a** developer about to plan a feature implementation
**I want to** see scope analysis and decision recommendations before the plan is generated
**So that** I validate the approach early and the plan is generated with correct decisions baked in

**Acceptance Criteria:**
- [x] Plan-feature first outputs scope analysis to terminal
- [x] Identifies all decision points from PRD phase and user stories
- [x] Provides recommendations for each decision with justification
- [x] Waits for user validation before generating plan
- [x] Plan is generated with validated decisions (no ambiguity)

**Phase:** Phase 2
**Status:** 🟢 Complete

---

### US-002: Post-Implementation Validation

**As a** developer who just finished implementing a phase
**I want to** automatically validate everything works correctly
**So that** I have confidence the phase is truly complete

**Acceptance Criteria:**
- [x] Command reads plan, PRD phase, and user stories for context
- [x] Maps all implemented tools and workflows
- [x] Tests each tool with various inputs
- [x] Tests workflow paths end-to-end
- [x] Reports what passed/failed with root cause analysis
- [x] Suggests fixes for failures

**Phase:** Phase 3
**Status:** 🟢 Complete

---

### US-003: Real Service Integration Testing

**As a** developer with agents that call external APIs
**I want to** test against real services with real credentials
**So that** I know the integrations actually work in production

**Acceptance Criteria:**
- [x] Auto-detects services from .env and codebase
- [x] Tests authentication flows
- [x] Tests actual API calls with real data
- [x] Handles rate limits gracefully
- [x] Reports service-specific issues clearly

**Phase:** Phase 3
**Status:** 🟢 Complete

---

### US-004: Mock Data Generation

**As a** developer who needs to test edge cases
**I want to** automatically generate mock data for scenarios hard to hit live
**So that** I can test error handling, empty states, and edge cases

**Acceptance Criteria:**
- [x] Generates mocks based on API response schemas
- [x] Creates edge case scenarios (empty, error, timeout, malformed)
- [x] Mocks are realistic and match expected data shapes
- [x] Can test with mocks when real services unavailable

**Phase:** Phase 3
**Status:** 🟢 Complete

---

### US-005: Workflow Path Testing

**As a** developer with agents that have multiple conversation paths
**I want to** test all possible workflow paths automatically
**So that** no path is left untested

**Acceptance Criteria:**
- [x] Maps all workflow paths from user stories and code
- [x] Tests happy path for each workflow
- [x] Tests error/exception paths
- [x] Tests state transitions if agent maintains state
- [x] Reports coverage of paths tested

**Phase:** Phase 3
**Status:** 🟢 Complete

---

### US-006: Actionable Fix Suggestions

**As a** developer who encounters validation failures
**I want to** receive specific fix suggestions with code
**So that** I can quickly resolve issues without deep debugging

**Acceptance Criteria:**
- [x] Root cause analysis for each failure
- [x] Specific code suggestions when applicable
- [ ] Option to auto-apply simple fixes (deferred - MVP suggests only)
- [x] Clear explanation of why the fix works

**Phase:** Phase 3
**Status:** 🟢 Complete

---

### US-007: Updated PRD Captures Validation Requirements

**As a** developer creating a new agent PRD
**I want to** capture all validation requirements upfront
**So that** the validation system knows what to test

**Acceptance Criteria:**
- [ ] PRD template includes Agent Validation Profile section
- [ ] Tools inventory with service dependencies captured
- [ ] Workflow paths documented
- [ ] Error scenarios defined
- [ ] Validation requirements per phase specified

**Phase:** Phase 1
**Status:** 🟢 Complete

---

### US-008: Plans Include Validation Strategy

**As a** developer planning a feature
**I want to** define the validation strategy during planning
**So that** I think about testing upfront and validation knows what to check

**Acceptance Criteria:**
- [ ] Plan template includes Validation Strategy section
- [ ] Tools implemented this phase listed with test inputs
- [ ] Workflows added/modified documented
- [ ] Integration points and mock needs specified

**Phase:** Phase 1
**Status:** 🟢 Complete

---

### US-009: Archon Integration for Context & Tracking

**As a** developer running validation
**I want to** leverage Archon for documentation lookup and result tracking
**So that** validation has access to relevant docs and results persist across sessions

**Acceptance Criteria:**
- [x] Validation queries Archon RAG for service documentation
- [x] Validation queries Archon for testing patterns/examples
- [x] Validation results logged to Archon task system
- [x] Can query past validation results from Archon

**Phase:** Phase 3
**Status:** 🟢 Complete

---

## 6. Architecture & Patterns

**Subagent Coordination Model:**

The validation system uses an orchestrator pattern with specialized subagents. This manages context limits and allows focused, thorough testing.

```
Orchestrator Agent
├── Reads: PRD Phase, Plan, User Stories, Codebase
├── Determines: What needs testing, spawns relevant subagents
├── Coordinates: Sequences tests, manages state
└── Synthesizes: Combines results into unified report

Specialist Subagents (spawned as needed):
├── Tool Validator - Tests each tool in isolation
├── Workflow Validator - Tests user story paths end-to-end
├── Integration Tester - Hits real services
├── Error Path Tester - Deliberately triggers failures
└── Mock Generator - Creates test data for edge cases
```

**Service Auto-Detection (Hybrid Approach):**

1. Scan `.env` for API keys and URLs
2. Scan codebase imports for service SDKs
3. Check for `.agents/services.yaml` override
4. Report detected services for user verification

**Directory Structure:**

```
.agents/
├── plans/              # Implementation plans
├── validation/         # Validation reports
│   └── {phase}-validation-{date}.md
├── mocks/              # Generated mock data
└── services.yaml       # Optional service override
```

---

## 7. Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Commands | Markdown (Claude Code) | Slash command definitions |
| Orchestration | Claude Task tool | Subagent coordination |
| File Output | Markdown | Validation reports |
| Mock Storage | JSON/YAML | Generated mock data |
| Documentation RAG | Archon MCP | Query relevant docs during validation |
| Task Management | Archon MCP | Track validation tasks, log results |

**Archon Integration:**
- Use `mcp__archon__rag_search_knowledge_base()` to find relevant documentation for services being tested
- Use `mcp__archon__rag_search_code_examples()` to find testing patterns
- Log validation results to Archon for tracking across sessions
- Query Archon for similar validation patterns from past projects

---

## 8. Current Focus

**Active Phase:** Phase 4 - Integration & Iteration
**Active Stories:** All (integration testing)
**Status:** ⚪ Not Started

**Blockers:** None

**Session Context:**
- Phase 1 complete: PRD, plan-feature, and global rules templates updated with validation sections
- Phase 2 complete: Enhanced plan-feature with Phase 0 Scope Analysis & Recommendations
- Phase 3 complete: /validate-implementation command created with all 5 subagents
  - Tool Validator, Mock Generator, Workflow Validator, Integration Tester, Error Path Tester
  - Service auto-detection from .env and imports
  - Orchestration with progress indicators
  - Report synthesis to .agents/validation/
  - Optional Archon integration with graceful fallback
- Ready for Phase 4: Test validation system on real agent projects

**Last Updated:** 2026-02-03

---

## 9. Implementation Phases

---

## Phase 1: Framework Foundation

**Status:** 🟢 Complete

**User Stories Addressed:** US-007, US-008

**What This Phase Delivers:**
Updates to existing PIV loop commands (create-prd, plan-feature, create_global_rules_prompt) to capture validation requirements. This creates the foundation that the new validation commands will use. Without this, the validation system won't know what to test.

**Prerequisites:**
- Current PIV loop commands working (create-prd, plan-feature, execute)
- Understanding of agent project structures

**Scope - Included:**
- ✅ Update create-prd.md with Agent Validation Profile section
- ✅ Update plan-feature.md with Validation Strategy section
- ✅ Update create_global_rules_prompt.md with Service Configuration section
- ✅ Create .agents/services.yaml template/schema

**Scope - NOT Included:**
- ❌ The actual validation commands (Phase 2, 3)
- ❌ Subagent implementation
- ❌ Mock generation logic

**Key Technical Decisions:**
- PRD section should be optional (not all projects are agents)
- Service detection schema should be simple but extensible
- Plan validation strategy should integrate with existing task structure

**Discussion Points for Clarification:**
- Should Agent Validation Profile be a separate section or integrated into existing sections?
- What's the minimum viable service configuration schema?
- How do we handle projects that aren't agents (skip validation sections)?

**Done When:**
- create-prd.md generates PRDs with validation profile for agent projects
- plan-feature.md generates plans with validation strategy
- create_global_rules_prompt.md includes service configuration guidance
- .agents/services.yaml template exists with clear schema

---

## Phase 2: Enhanced Plan-Feature

**Status:** 🟢 Complete

**User Stories Addressed:** US-001

**What This Phase Delivers:**
An enhanced `/plan-feature` command with a built-in scoping and recommendations phase. Before generating the plan, it analyzes the PRD phase and user stories, identifies all decision points, and outputs recommendations with justifications to the terminal. User validates the approach conversationally, then the plan is generated with decisions baked in. This catches issues BEFORE planning, not after.

**Prerequisites:**
- Phase 1 complete (PRD and plans have validation sections)
- Understanding of PRD phase structure and user story format

**Scope - Included:**
- ✅ Phase 0 added to plan-feature: Scope Analysis & Recommendations
- ✅ Deep PRD phase analysis (extract scope, user stories, prerequisites)
- ✅ Decision point identification from "Discussion Points" sections
- ✅ Justified recommendations for each decision (with reasoning)
- ✅ Terminal output of recommendations before plan generation
- ✅ Conversational validation (user confirms or adjusts)
- ✅ Plan generated with validated decisions (no ambiguity)
- ✅ Prerequisite validation (prior phases complete, files exist)

**Scope - NOT Included:**
- ❌ Separate /review-plan command (eliminated - scoping built into plan-feature)
- ❌ Post-plan validation (plan is solid because approach was validated first)
- ❌ New subagents (existing subagents sufficient for scoping)

**Key Technical Decisions:**
- Scoping is Phase 0 of plan-feature, not a separate command
- Recommendations output to terminal, plan output to file
- Existing subagents (Pattern Recognition, Codebase Analysis) inform recommendations
- No terminal Q&A loop for decisions - recommendations are justified and logical

**Plan Output Format:**
- Dual-purpose: human readable AND AI executable
- Each task includes "What this achieves" (human) and code snippets (AI)
- Decisions documented in plan so executor understands constraints
- Natural language explanations with relevant code examples

**Done When:**
- plan-feature outputs scope analysis before generating plan
- All PRD "Discussion Points" resolved with justified recommendations
- User can validate approach conversationally in terminal
- Plan is generated only after approach is validated
- Plans are cleaner (no ambiguous decisions for executor to resolve)

---

## Phase 3: Intelligent Validation Command

**Status:** 🟢 Complete

**User Stories Addressed:** US-002, US-003, US-004, US-005, US-006, US-009

**What This Phase Delivers:**
The core `/validate-implementation` command with full subagent coordination. This is the intelligent QA engineer that tests everything from the user's perspective. It auto-detects services, generates mocks, tests all workflows, hits real APIs, and reports findings with fixes.

**Prerequisites:**
- Phase 1 complete (PRD and plans have validation sections)
- Phase 2 complete (enhanced plan-feature with scoping)
- Test agent project available (lead-agent or x-agent-v2)

**Scope - Included:**
- ✅ Orchestrator agent design and implementation
- ✅ Tool Validator subagent
- ✅ Workflow Validator subagent
- ✅ Integration Tester subagent
- ✅ Error Path Tester subagent
- ✅ Mock Generator subagent
- ✅ Service auto-detection from codebase
- ✅ Real service integration testing
- ✅ Mock data generation for edge cases
- ✅ Comprehensive validation report
- ✅ Fix suggestions with code
- ✅ Archon RAG integration for documentation lookup
- ✅ Archon task management for result tracking

**Scope - NOT Included:**
- ❌ Auto-fix without user approval (suggest only for MVP)
- ❌ Multi-agent system testing (single agent focus)
- ❌ Performance testing
- ❌ Deployment validation

**Key Technical Decisions:**
- Use Claude Task tool for subagent coordination
- Each subagent gets focused context slice (not full codebase)
- Orchestrator synthesizes results from all subagents
- Reports saved to .agents/validation/ for history

**Discussion Points for Clarification:**
- How long is acceptable for full validation to run? (May need progress indicators)
- Should subagents run in parallel or sequence?
- How to handle when real services are unavailable (fallback to mock-only)?

**Done When:**
- /validate-implementation command exists and is documented
- Subagents coordinate through orchestrator
- Auto-detects services from codebase
- Tests tools, workflows, integrations
- Generates mocks for edge cases
- Outputs comprehensive report with fix suggestions
- Successfully validates a real agent project (lead-agent or x-agent-v2)

---

## Phase 4: Integration & Iteration

**Status:** ⚪ Not Started

**User Stories Addressed:** All (integration testing)

**What This Phase Delivers:**
Testing the complete validation system on real agent projects (lead-agent, x-agent-v2). This phase is about finding gaps, fixing issues, and refining the system based on real-world usage. Also includes documentation and workflow integration.

**Prerequisites:**
- Phase 3 complete (validation command working)
- Real agent projects to test against

**Scope - Included:**
- ✅ Test validation system on lead-agent
- ✅ Test validation system on x-agent-v2
- ✅ Fix issues discovered during testing
- ✅ Refine subagent prompts based on results
- ✅ Update documentation with examples
- ✅ Create reference guide for validation system

**Scope - NOT Included:**
- ❌ New features beyond MVP scope
- ❌ Advanced capabilities (deferred to future)

**Key Technical Decisions:**
- Iterate based on real findings, not assumptions
- Document patterns that work well
- Create reusable reference for future agents

**Discussion Points for Clarification:**
- Which agent to test first (lead-agent or x-agent-v2)?
- How many iteration cycles before considering MVP complete?
- What success criteria for "validation system works"?

**Done When:**
- Validation system successfully tests lead-agent
- Validation system successfully tests x-agent-v2
- Issues found during testing are resolved
- Documentation complete with real examples
- Confidence that system catches real issues

---

## 10. Success Criteria

**MVP is successful when:**
1. Developer runs /plan-feature and sees scope analysis with justified recommendations before plan generation
2. Developer validates approach conversationally, plan is generated with decisions baked in
3. Developer can run /validate-implementation and get comprehensive test results
4. Validation catches issues that basic pytest would miss
5. Real agent projects (lead-agent, x-agent-v2) can be validated
6. Fix suggestions are accurate and actionable

**Validation Commands:**
```bash
# Plan a feature (includes scoping phase)
/plan-feature Phase 2 - Enhanced Plan-Feature
# → Outputs recommendations to terminal
# → User validates: "looks good" or discusses changes
# → Plan generated to .agents/plans/

# Validate implementation
/validate-implementation .agents/plans/feature-name.md

# Check validation report
cat .agents/validation/latest-report.md
```

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Context limits with subagents | High | Carefully scope each subagent's context, use focused file reads |
| Real service testing costs money | Medium | Use mock-first approach, real services only for final validation |
| Validation takes too long | Medium | Progress indicators, option to skip certain validators |
| Edge cases in mock generation | Medium | Start simple, iterate based on real failures |
| Subagent coordination complexity | High | Enhanced plan-feature (Phase 2) uses existing subagents, learn patterns before Phase 3 |
| Scoping recommendations miss edge cases | Medium | Justify recommendations with PRD/user story references, user validates before plan generation |

---

## 12. Document History

| Date | Version | Changes |
|------|---------|---------|
| 2026-02-03 | 1.0 | Initial PRD |
| 2026-02-03 | 1.1 | Replaced Phase 2 (review-plan command) with Enhanced Plan-Feature; scoping & recommendations built into plan-feature instead of separate command; updated US-001 |

---

*Status Legend:*
- ⚪ Not Started
- 🟡 In Progress
- 🟢 Complete
- 🔴 Blocked
