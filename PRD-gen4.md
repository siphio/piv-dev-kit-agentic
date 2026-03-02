# PRD: PIV Dev Kit — Generation 4: Context Intelligence Layer

**Version:** 1.0
**Date:** 2026-03-02
**Status:** ⚪ Not Started

---

## Status Legend

```
⚪ Not Started | 🟡 In Progress | 🟢 Complete | 🔴 Blocked
```

---

## 1. Executive Summary

The PIV Dev Kit Generation 4 transforms the Context Plugin from a structured note-taker into an intelligent collaborator. Currently, every context plugin command (`/scaffold`, `/discuss-module`, `/discuss-slice`, `/review-context`, `/map-dependencies`) accepts human input at face value — recording decisions, specifications, and constraints without independent verification, research, or challenge. The resulting artifacts are only as good as the human's knowledge at the time of capture.

This generation adds three capabilities to the existing command set:

1. **Enriched Research Profiles** — `/research-stack` evolves to produce profiles containing performance characteristics, technology compatibility matrices, negative constraints ("does NOT support X"), common failure patterns at scale, and alternative technology comparisons. These richer profiles become the knowledge base that powers all downstream intelligence.

2. **Verification Layer** — Context plugin commands gain the ability to cross-reference artifacts against each other and against research profiles. Data contract bidirectionality is enforced across modules. Slice dependency cycles are detected. Validation gates are checked against profile performance data. The DAG is validated for hidden sequential dependencies. Errors caught at specification time instead of build time.

3. **Research & Challenge Layer** — Commands inject live research into conversations. When a developer names a technology, the system checks the profile and brings domain-specific knowledge to the discussion. When a developer sets a validation gate, the system cross-references it against realistic benchmarks. When specifications are vague or over-engineered, the system pushes back with evidence. The conversation becomes a dialogue between the developer's intent and the system's research.

**Core Value Proposition:** Higher-quality context artifacts produce higher-quality agent output. Every assumption verified at specification time is a failure prevented at build time. The human stays in control — the system just shows up prepared.

**MVP Goal:** Context plugin commands that verify, research, and challenge during specification conversations, powered by enriched technology profiles.

**Agent Type:** Semi-autonomous (human-guided conversations enhanced with AI-driven verification and research)

---

## 2. Agent Identity

**Purpose:** Make the context specification conversation smarter by bringing independent verification, research, and challenge to every human decision captured in context artifacts.

**Personality & Tone:** Senior architect reviewing a junior's design. Not adversarial — collaborative but rigorous. Presents evidence before recommendations. Explains WHY something is flagged, not just THAT it is. Accepts human overrides but records the reasoning for downstream agents.

**Decision Philosophy:**
- Verify before recording — check claims against existing artifacts and profiles before writing them down
- Research before asking — come to each conversation topic with relevant knowledge from profiles and web research
- Challenge with evidence — push back on vague, unrealistic, or over-engineered specifications using concrete data
- Never block the human — flag concerns, recommend alternatives, but always let the developer make the final call
- Record overrides — when the human disagrees with a recommendation, document both the recommendation and the override reasoning

**Autonomy Level:**
- Fully autonomous: cross-referencing artifacts, checking profile data, detecting cycles, flagging mismatches
- Fully autonomous: researching domain-specific patterns, error codes, performance benchmarks during conversation
- Human controls: all specification decisions, technology choices, validation gate targets, module boundaries
- Human controls: overriding any system recommendation with documented reasoning

**Core Competencies:**
1. Cross-artifact verification — checking consistency across modules, slices, profiles, and the DAG
2. Profile-powered conversation — enriching discussions with technology-specific knowledge
3. Evidence-based challenge — rejecting vague specs and unrealistic targets with concrete data
4. Technology suitability assessment — validating that chosen technologies actually support stated requirements
5. Risk identification — flagging high-risk items on critical paths before agents start building

---

## 3. Technology Decisions

#### WebSearch / WebFetch (Claude Code Native Tools)

**What**: Built-in web research capabilities available to all Claude Code commands
**Why chosen**: Already used by `/research-stack`. Extending use to discuss commands enables live research during specification conversations without new infrastructure.
**Agent needs from it**:
- Real-time technology research during `/discuss-module` and `/discuss-slice` conversations
- API documentation lookup for domain-specific error codes and performance data
- SDK health checks (last commit date, open security issues, maintenance status)
- Alternative technology discovery and comparison
**Integration approach**: Direct tool calls within command markdown instructions
**Known constraints**: Web search quality varies. Results must be verified before presenting to user. Rate limits apply to rapid successive searches.

#### Enriched Technology Profiles (Artifact Format Evolution)

**What**: Extended profile format with 5 new sections beyond the current 9-section structure
**Why chosen**: The current profile format covers authentication, endpoints, rate limits, and testing tiers. It lacks performance characteristics, compatibility data, negative constraints, and alternative comparisons. These gaps mean downstream commands can't verify claims against profiles.
**Agent needs from it**:
- Section 10: Performance Characteristics (latency ranges, throughput limits, scaling patterns)
- Section 11: Compatibility Matrix (works with / conflicts with / requires)
- Section 12: Negative Constraints (capabilities NOT supported, known limitations at scale)
- Section 13: Common Failure Patterns (domain-specific errors beyond HTTP codes, scale-related failures)
- Section 14: Alternative Technologies (comparison table with tradeoffs, when to prefer each)
**Integration approach**: Markdown file format extension, consumed by discuss commands via Read tool
**Known constraints**: Profile generation takes longer with additional sections. Refresh mode must update new sections too.

#### Cross-Reference Engine (Command Logic Pattern)

**What**: Verification logic embedded in context plugin commands that cross-references artifacts
**Why chosen**: Most specification errors are consistency errors — Module A says it provides X, Module B doesn't list X as consumed. These are mechanically detectable by reading existing artifacts. No external service needed.
**Agent needs from it**:
- Read all module specifications to build data contract map
- Parse slice dependencies into graph structure for cycle detection
- Compare validation gate targets against profile performance data
- Check API endpoint lists against data contract requirements
**Integration approach**: Logic instructions within command markdown files, using Read/Glob/Grep tools
**Known constraints**: Cross-referencing quality depends on artifact format consistency. Partial or malformed specs may produce false positives.

---

## 4. Agent Behavior Specification

### 4.1 Tool Orchestration

| Tool/Capability | Purpose | When Used | Fallback If Unavailable |
|----------------|---------|-----------|------------------------|
| Read | Load existing specs, profiles, architecture for cross-referencing | Every discuss/review command | Skip verification, warn user |
| WebSearch | Research technology during conversation | discuss-module (tech selection), discuss-slice (domain errors) | Use existing profile data only |
| WebFetch | Retrieve specific API docs for validation | discuss-slice (schema validation, error codes) | Flag as unverified assumption |
| Glob | Discover all module/slice specs for cross-referencing | discuss-module, review-context, map-dependencies | Manual path specification |
| Grep | Search across artifacts for data contract references | Cross-module contract validation | Sequential file reads |

### 4.2 Decision Trees

**Decision: Should the system verify a claim against profiles?**
- IF technology profile exists for the referenced tech → read profile, cross-reference claim
- ELSE IF technology is in research.pending → flag: "No profile yet — run `/research-stack` for verification"
- ELSE → flag: "Unknown technology — no profile available. Accepting claim as unverified"
- ON FAILURE (profile read error) → skip verification, note in artifact as unverified

**Decision: Should the system challenge a validation gate?**
- IF profile has Section 10 (Performance Characteristics) for the relevant tech → compare gate target against profile benchmarks
- IF gate target is within profile range → accept silently
- IF gate target is tighter than profile range → warn: "Profile shows typical range is X-Y. Your target Z is aggressive. Confirm?"
- IF gate target is impossible per profile → reject: "Profile shows minimum latency is Xms. Your target of Yms is not achievable. Revise."
- ELSE (no performance data in profile) → accept but flag: "Cannot verify — no performance data in profile"
- ON USER OVERRIDE → record: "Gate set to [value] despite profile indicating [range]. Developer reasoning: [captured]"

**Decision: Should the system suggest an alternative technology?**
- IF profile has Section 14 (Alternative Technologies) → present alternatives only when asked or when suitability check fails
- IF suitability check fails (tech doesn't support required capability) → present alternatives proactively
- IF suitability check passes → do NOT suggest alternatives (don't second-guess valid choices)
- ON FAILURE (no alternatives in profile) → flag gap, suggest running `/research-stack --refresh`

**Decision: How should a data contract mismatch be reported?**
- IF provider module spec exists AND consumer module spec exists → cross-reference provides/consumes
- IF mismatch found (field name, type, or format differs) → present both sides, ask user to resolve
- IF provider module spec doesn't exist yet → flag as "pending verification — will check when [module] is specified"
- IF consumer references a module not yet created → note as TBD, add to review-context checklist
- ON RESOLUTION → update both specs to match, record the resolution

**Decision: How should circular dependencies be handled?**
- IF cycle detected in slice dependency graph → present the cycle path, suggest where to break it
- IF cycle detected in module dependency graph → escalate — module-level cycles indicate architectural issues
- IF no cycle detected → confirm: "Dependency graph is acyclic"
- ON USER OVERRIDE → record: "Cycle acknowledged by developer. Reasoning: [captured]"

### 4.3 Scenario Definitions

**SC-001: Enriched Profile Generation**
- Given: Developer runs `/research-stack` on a PRD with technology decisions
- When: Profile generation runs for each technology
- Then: Profile includes all 14 sections including performance characteristics, compatibility matrix, negative constraints, failure patterns, and alternatives
- Error: If web research returns insufficient data for new sections, mark sections as "insufficient data — verify manually" rather than omitting
- Edge: Technology is very new with minimal documentation — profile notes low confidence and recommends manual validation

**SC-002: Data Contract Bidirectionality Enforcement**
- Given: Developer runs `/discuss-module` for Module B, and Module A's spec already exists with data contracts
- When: Developer defines data contracts for Module B that reference Module A
- Then: System cross-references Module A's spec and flags mismatches ("Module A provides 'userId: string' but Module B expects 'user_id: number'")
- Error: Module A's spec is malformed or missing data contracts section — warn and skip verification
- Edge: Module B references a module that hasn't been specified yet — note as pending, add to review-context gaps

**SC-003: Validation Gate Realism Check**
- Given: Developer runs `/discuss-slice` and sets a validation gate (e.g., "P95 < 100ms")
- When: Technology profile for the relevant tech has performance characteristics
- Then: System compares gate against profile data and warns if target is tighter than documented range
- Error: No performance data in profile — accept gate but flag as unverified
- Edge: Gate references a compound metric spanning multiple technologies — check each independently

**SC-004: Slice Dependency Cycle Detection**
- Given: Developer defines slice breakdown in `/discuss-module` with inter-slice dependencies
- When: Slice A depends on B and B depends on A (directly or transitively)
- Then: System reports the cycle path and suggests where to break it
- Error: Dependency references a slice ID that doesn't exist — warn about dangling reference
- Edge: Cycle involves 4+ slices making the path non-obvious — system traces and presents full chain

**SC-005: Technology Suitability Validation**
- Given: Developer runs `/research-stack` and PRD requires a specific capability from a technology
- When: Research reveals the technology does NOT support that capability
- Then: Profile Section 12 documents the negative constraint and Section 14 presents alternatives that do support it
- Error: Suitability cannot be determined from available documentation — flag as uncertain
- Edge: Technology supports the capability only in a paid tier — note pricing constraint

**SC-006: Cross-Module Contract Consistency in Review-Context**
- Given: Developer runs `/review-context` after specifying 3+ modules
- When: All module specs have data contract sections
- Then: System builds a contract map, identifies all bidirectional matches and mismatches, reports consistency score
- Error: One or more modules have incomplete contract sections — report as gap, not as mismatch
- Edge: Circular data flow (A provides to B, B provides to C, C provides to A) — flag as architectural concern

**SC-007: User Override of System Recommendation**
- Given: System recommends against a validation gate or technology choice
- When: Developer disagrees and proceeds with their original choice
- Then: System records both the recommendation and the developer's reasoning in the artifact, proceeds without blocking
- Error: Developer provides no reasoning for override — prompt once, then accept with "no reasoning provided"
- Edge: Developer overrides a critical warning (impossible gate, deprecated technology) — add prominent warning to artifact for downstream agents

**SC-008: Live Research During Discuss-Slice**
- Given: Developer discusses error handling for a specific API integration in `/discuss-slice`
- When: Technology profile exists with endpoint documentation
- Then: System researches domain-specific error codes beyond generic HTTP errors and presents them for inclusion
- Error: API documentation is behind authentication wall — use profile data only, flag as incomplete
- Edge: API has changed since profile was generated — note version discrepancy, suggest profile refresh

**SC-009: Technology Compatibility Check**
- Given: Developer selects multiple technologies in `/discuss-module` for the same module
- When: Profile compatibility matrices exist for those technologies
- Then: System checks compatibility and flags conflicts ("PostGIS + MongoDB in same module — overlapping spatial capabilities")
- Error: No compatibility data in profiles — skip check, note as unverified
- Edge: Technologies are compatible but require specific version pairing — note version requirement

**SC-010: Critical Path Risk Assessment**
- Given: Developer runs `/map-dependencies` after all modules and slices are specified
- When: Critical path includes a slice with unresearched technology or vague validation gates
- Then: System flags the high-risk slice with specific concerns and recommends mitigation
- Error: Cannot determine critical path due to incomplete specifications — report as incomplete
- Edge: Multiple equally-long critical paths — assess risk on all of them

**SC-011: Vague Validation Gate Rejection**
- Given: Developer provides a vague validation gate during `/discuss-slice` (e.g., "handles errors properly")
- When: System detects non-measurable language
- Then: System rejects and offers 2-3 concrete measurable alternatives to choose from
- Error: Developer insists on vague gate after rejection — accept but mark as "unmeasurable — agent validation may be inconclusive"
- Edge: Gate is measurable but ambiguous (e.g., "fast response" without a number) — prompt for specific threshold

**SC-012: Profile-Powered Technology Recommendation in Scaffold**
- Given: Developer runs `/scaffold` and describes a project involving specific domains (e.g., "real-time geospatial data processing")
- When: Vision conversation reveals technology-adjacent requirements
- Then: System suggests a preliminary technology stack with reasoning based on domain patterns
- Error: Project type is too novel for pattern matching — skip recommendation, proceed with blank slate
- Edge: Multiple valid tech stacks exist for the same requirements — present top 2-3 with tradeoffs

### 4.4 Error Recovery Patterns

| Error Type | Detection | Recovery Action | User Communication |
|-----------|-----------|-----------------|-------------------|
| Profile not found for referenced tech | Read tool returns file-not-found | Skip verification, add to research.pending | "No profile for [tech]. Running unverified. Run `/research-stack` to enable checks." |
| Profile section missing (new format) | Section header not found in profile | Use available data, flag gap | "Profile exists but missing [section]. Verification limited. Run `/research-stack --refresh`." |
| Cross-reference finds no matching module | Glob/Read finds no spec for referenced module | Record as pending verification | "Module [X] not yet specified. Contract will be verified when you run `/discuss-module [X]`." |
| Web research returns no results | WebSearch returns empty or irrelevant | Fall back to profile data | "Couldn't find additional research for [topic]. Using profile data only." |
| User rejects all alternatives | User overrides every recommendation | Accept choices, record overrides | "Noted. Your choices recorded with reasoning. Agents will build per your specification." |
| Line budget exceeded on profile | Profile generation exceeds format limits | Auto-trim examples and verbose descriptions | "Profile trimmed to fit format. Full research available via web links in profile." |

---

## 5. User Stories

### US-001: Enriched Technology Profiles

**As a** developer specifying a new project
**I want** research profiles to include performance data, compatibility info, and alternatives
**So that** downstream commands can verify my specifications against realistic benchmarks

**Acceptance Criteria:**
- [ ] Profiles contain Sections 10-14 (Performance, Compatibility, Negative Constraints, Failure Patterns, Alternatives)
- [ ] Performance characteristics include latency ranges and throughput limits
- [ ] Compatibility matrix identifies conflicts and requirements between technologies
- [ ] Alternatives section compares at least 2 options with tradeoff analysis

**Scenarios:** SC-001, SC-005
**Phase:** Phase 13
**Status:** ⚪ Not Started

### US-002: Data Contract Verification

**As a** developer specifying module data contracts
**I want** the system to cross-reference contracts across all existing modules
**So that** integration mismatches are caught at specification time, not build time

**Acceptance Criteria:**
- [ ] discuss-module checks new contracts against all existing module specs
- [ ] Mismatches are reported with both sides shown for comparison
- [ ] Pending references (to unspecified modules) are tracked for later verification
- [ ] review-context reports a contract consistency score across all modules

**Scenarios:** SC-002, SC-006
**Phase:** Phase 14
**Status:** ⚪ Not Started

### US-003: Validation Gate Verification

**As a** developer setting validation gates on slices
**I want** the system to check my targets against technology profile benchmarks
**So that** I don't set impossible or unrealistic gates that waste agent build time

**Acceptance Criteria:**
- [ ] discuss-slice compares each gate against profile Section 10 data
- [ ] Targets tighter than documented range trigger a warning with profile evidence
- [ ] Impossible targets (below documented minimum) are rejected with alternatives
- [ ] Unverifiable gates (no profile data) are flagged but accepted

**Scenarios:** SC-003, SC-011
**Phase:** Phase 14
**Status:** ⚪ Not Started

### US-004: Dependency Graph Validation

**As a** developer defining module and slice structure
**I want** the system to detect circular dependencies and hidden sequential constraints
**So that** the DAG is sound before agents start executing

**Acceptance Criteria:**
- [ ] discuss-module detects cycles in slice dependency graphs
- [ ] map-dependencies detects cycles in module dependency graphs
- [ ] review-context validates the full DAG before agent handover
- [ ] Hidden sequential dependencies (shared infrastructure) are flagged

**Scenarios:** SC-004, SC-010
**Phase:** Phase 14
**Status:** ⚪ Not Started

### US-005: Live Research During Conversations

**As a** developer discussing technology choices and error handling
**I want** the system to research domain-specific knowledge during our conversation
**So that** my specifications include details I wouldn't have known to include

**Acceptance Criteria:**
- [ ] discuss-slice researches API-specific error codes during error handling section
- [ ] discuss-module suggests domain patterns when technology decisions are discussed
- [ ] Research results are presented inline during conversation, not as a separate step
- [ ] Fallback to profile-only data when web research is unavailable

**Scenarios:** SC-008, SC-012
**Phase:** Phase 15
**Status:** ⚪ Not Started

### US-006: Evidence-Based Challenge

**As a** developer making specification decisions
**I want** the system to push back on vague, unrealistic, or over-engineered choices with evidence
**So that** my specifications are precise, achievable, and right-sized

**Acceptance Criteria:**
- [ ] Vague validation gates are rejected with measurable alternatives offered
- [ ] Over-engineered infrastructure is questioned with simpler alternatives
- [ ] Technology compatibility conflicts are flagged with profile evidence
- [ ] All challenges include evidence source (profile section, web research, cross-reference)
- [ ] User overrides are always accepted but recorded with reasoning

**Scenarios:** SC-007, SC-009, SC-011
**Phase:** Phase 15
**Status:** ⚪ Not Started

---

## 6. Architecture & Patterns

**High-level architecture:** Gen 4 modifies existing markdown command files and the technology profile format. No new TypeScript modules. The intelligence is embedded in the command instructions that Claude Code executes.

**Enhancement flow:**
1. `/research-stack` generates enriched profiles with 14 sections (up from 9)
2. `/discuss-module` reads existing module specs + profiles during conversation, cross-references in real-time
3. `/discuss-slice` reads parent spec + profiles during conversation, verifies gates and contracts
4. `/review-context` performs deep validation: contract consistency, DAG soundness, gate realism
5. `/map-dependencies` adds risk assessment to critical path analysis

**Directory structure:** No new directories. Changes to existing files only:
- `.claude/commands/research-stack.md` — extended profile format
- `.claude/commands/discuss-module.md` — verification + research steps
- `.claude/commands/discuss-slice.md` — verification + research steps
- `.claude/commands/review-context.md` — deep validation logic
- `.claude/commands/map-dependencies.md` — risk assessment
- `.claude/commands/scaffold.md` — technology inference

**Key patterns:**
- **Verify-then-record** — check claims against artifacts before writing them to spec
- **Research-before-ask** — load relevant profile data before prompting the human
- **Challenge-with-evidence** — every pushback includes the source (profile section, web result, cross-reference)
- **Override-with-audit** — human always wins, but overrides are documented for downstream agents

---

## 7. Technology Stack

| Component | Technology | Version | Purpose |
|-----------|------------|---------|---------|
| Command format | Markdown | N/A | Slash command instructions for Claude Code |
| Runtime | Claude Code | Latest | Executes command instructions with tool access |
| Research | WebSearch/WebFetch | Built-in | Live web research during conversations |
| Artifact format | Markdown/YAML | N/A | Technology profiles, specifications, manifests |
| State tracking | Manifest YAML | N/A | Phase progress, profile freshness, next action |

**External Services:** None new. All intelligence is powered by Claude Code's native tools (Read, Glob, Grep, WebSearch, WebFetch) operating on local artifacts.

---

## 8. MVP Scope

**In Scope:**
- ✅ **Profile Evolution**: Extend research-stack to produce 14-section profiles with performance, compatibility, negative constraints, failure patterns, alternatives
- ✅ **Cross-Reference Verification**: Data contract bidirectionality, slice cycle detection, technology compatibility checks
- ✅ **Gate Verification**: Validation gate realism checking against profile performance data
- ✅ **DAG Validation**: Cycle detection, hidden dependency analysis, critical path risk assessment
- ✅ **Live Research**: Domain-specific error codes, schema patterns, infrastructure recommendations during conversations
- ✅ **Challenge Layer**: Rejection of vague specs, over-engineering warnings, evidence-based alternative suggestions
- ✅ **Override Recording**: All human overrides documented with reasoning in artifacts

**Out of Scope:**
- ❌ Automated context generation (human stays in the loop for all specification decisions)
- ❌ New TypeScript orchestrator modules (all changes are to markdown command files)
- ❌ New slash commands (improvements to existing commands only)
- ❌ Automated profile refresh triggers (developer still initiates `/research-stack`)
- ❌ Command testing harness (manual testing against real projects)

---

## Phase 13: Research-Stack Intelligence

**Status:** ⚪ Not Started

**User Stories Addressed:** US-001
**Scenarios Validated:** SC-001, SC-005

**What This Phase Delivers:**
Evolves `/research-stack` to produce enriched technology profiles with 5 new sections: Performance Characteristics, Compatibility Matrix, Negative Constraints, Common Failure Patterns, and Alternative Technologies. These richer profiles become the knowledge base that powers verification and challenge in Phases 14-15.

**Prerequisites:**
- Gen 3 complete (all 12 phases validated and shipped)
- Existing `/research-stack` command functional

**Scope — Included:**
- ✅ Profile format extension: Sections 10-14 added to profile template
- ✅ Performance research: latency ranges, throughput limits, scaling inflection points
- ✅ Compatibility research: technology pairing data, version requirements, known conflicts
- ✅ Negative constraint capture: explicit "does NOT support" statements with evidence
- ✅ Failure pattern research: domain-specific error modes beyond HTTP status codes, scale-related failures
- ✅ Alternative technology comparison: 2-3 alternatives per tech with tradeoff table
- ✅ Suitability validation: cross-reference PRD capability requirements against researched capabilities
- ✅ SDK health check: last release date, open security issues, maintenance activity
- ✅ Refresh mode update: `--refresh` updates new sections alongside existing ones

**Scope — NOT Included:**
- ❌ Changes to discuss commands (Phase 14)
- ❌ Live research during conversations (Phase 15)
- ❌ Profile auto-refresh triggers

**Technologies Used This Phase:**
- WebSearch/WebFetch: Extended research queries for performance data, compatibility, alternatives
- Profile format: New sections appended to existing 9-section structure

**Key Technical Decisions:**
- New sections are appended (10-14) rather than restructuring existing sections — preserves backward compatibility with commands that read Sections 1-9
- Suitability validation runs after all sections are researched — cross-references Section 14 alternatives against PRD requirements
- SDK health checks use GitHub API search for commit recency and security advisories

**Discussion Points:**
- Should profiles include estimated costs per API call/month for budget planning?
- Should compatibility matrix cover only technologies in the same PRD, or broader ecosystem?

**Done When:**
- `/research-stack` generates profiles with all 14 sections populated
- Performance characteristics include measurable ranges (not just "fast" or "slow")
- Compatibility matrix correctly identifies at least one known conflict in test data
- Alternative comparison includes tradeoff analysis with recommendation
- Suitability validation catches a technology that doesn't support a PRD requirement
- SC-001 and SC-005 pass validation

---

## Phase 14: Context Plugin Verification Layer

**Status:** ⚪ Not Started

**User Stories Addressed:** US-002, US-003, US-004
**Scenarios Validated:** SC-002, SC-003, SC-004, SC-006, SC-009, SC-010, SC-011

**What This Phase Delivers:**
Adds verification logic to context plugin commands that cross-references artifacts against each other and against enriched profiles. Data contracts are checked bidirectionally. Slice dependencies are checked for cycles. Validation gates are checked for realism. The DAG is validated for soundness. Errors are caught at specification time.

**Prerequisites:**
- Phase 13 complete (enriched profiles available)
- Existing context plugin commands functional

**Scope — Included:**
- ✅ discuss-module: Cross-reference data contracts against all existing module specs
- ✅ discuss-module: Detect circular dependencies in slice breakdown
- ✅ discuss-module: Check technology compatibility using profile Section 11
- ✅ discuss-slice: Verify validation gates against profile Section 10 performance data
- ✅ discuss-slice: Check API endpoint completeness against parent module's data contracts
- ✅ discuss-slice: Reject unmeasurable validation gates with concrete alternatives
- ✅ review-context: Build and report cross-module data contract consistency map
- ✅ review-context: Parse and validate DAG for cycles and hidden sequential dependencies
- ✅ review-context: Check validation gate realism across all slices
- ✅ map-dependencies: Add critical path risk assessment (unresearched tech, vague gates)
- ✅ Override recording: All developer overrides documented with reasoning in artifacts

**Scope — NOT Included:**
- ❌ Live web research during conversations (Phase 15)
- ❌ Technology recommendations in scaffold (Phase 15)
- ❌ Proactive challenge on over-engineering (Phase 15)

**Technologies Used This Phase:**
- Enriched profiles (Sections 10-14): Cross-referenced during discuss conversations
- Read/Glob/Grep tools: Load and search existing specs for cross-referencing
- Profile format: Section 10 for gate verification, Section 11 for compatibility

**Key Technical Decisions:**
- Verification runs inline during conversation, not as a post-processing step — catches issues while the developer can immediately address them
- Mismatches are reported as warnings, not blockers — the developer always decides
- Pending references (modules not yet specified) are tracked and deferred to review-context
- Override pattern: system presents evidence → developer responds → override recorded in artifact with both sides

**Discussion Points:**
- Should verification run on every discuss-module invocation or only on explicit request?
- Should review-context auto-fix simple mismatches (field name case differences) or always require human decision?

**Done When:**
- discuss-module catches a data contract mismatch between two modules
- discuss-module detects a circular slice dependency and suggests where to break it
- discuss-slice warns when a validation gate exceeds profile performance range
- discuss-slice rejects "handles errors properly" and offers measurable alternatives
- review-context reports a contract consistency score with specific mismatches listed
- map-dependencies flags a high-risk slice on the critical path
- Developer override is recorded in artifact with reasoning
- SC-002, SC-003, SC-004, SC-006, SC-009, SC-010, SC-011 pass validation

---

## Phase 15: Context Plugin Research & Challenge Layer

**Status:** ⚪ Not Started

**User Stories Addressed:** US-005, US-006
**Scenarios Validated:** SC-007, SC-008, SC-012

**What This Phase Delivers:**
Adds live research and proactive challenge capabilities to context plugin commands. Commands research domain-specific knowledge during conversations — error codes, schema patterns, infrastructure recommendations. Scaffold infers technology stacks from project descriptions. The system challenges over-engineering and vague specifications with evidence-based pushback. The conversation shifts from note-taking to collaborative architecture review.

**Prerequisites:**
- Phase 14 complete (verification layer functional)
- Enriched profiles available (Phase 13)

**Scope — Included:**
- ✅ discuss-slice: Research domain-specific error codes for chosen APIs during error handling section
- ✅ discuss-slice: Research schema optimization patterns for chosen database during schema section
- ✅ discuss-slice: Research infrastructure best practices (HA patterns, connection pooling) during infrastructure section
- ✅ discuss-module: Suggest domain patterns when technology decisions are discussed
- ✅ scaffold: Infer preliminary technology stack from vision conversation with reasoning
- ✅ map-dependencies: Assess risk on all critical path slices, recommend mitigation for high-risk items
- ✅ Challenge: Flag over-engineered infrastructure with simpler alternatives
- ✅ Challenge: Question module granularity (too large = split, too small = merge)
- ✅ All challenges include evidence source (profile section, web result, artifact cross-reference)

**Scope — NOT Included:**
- ❌ Automated context generation (human remains author, system is reviewer)
- ❌ Automated profile refresh during discussions
- ❌ Integration with external knowledge bases beyond web search

**Technologies Used This Phase:**
- WebSearch/WebFetch: Live research during discuss conversations
- Enriched profiles (all 14 sections): Knowledge base for recommendations
- Read tool: Cross-reference existing artifacts for consistency

**Key Technical Decisions:**
- Research runs mid-conversation, not before — keeps the discussion natural and responsive to what the developer actually says
- Challenge is evidence-based only — system never says "that's wrong" without a source
- Technology inference in scaffold is suggestive only — presented as "common stacks for this project type" not prescriptive
- Research results cached within conversation context — avoids duplicate web searches for same topic

**Discussion Points:**
- How much research latency is acceptable mid-conversation? Should searches be async?
- Should the challenge layer have a "strictness" setting (gentle / moderate / rigorous)?

**Done When:**
- discuss-slice presents API-specific error codes researched live during conversation
- discuss-module suggests infrastructure pattern based on domain research
- scaffold recommends a technology stack based on project vision with reasoning
- System challenges over-engineered infrastructure with simpler alternative and evidence
- System rejects vague spec with concrete measurable options
- Developer override is accepted and recorded
- SC-007, SC-008, SC-012 pass validation

---

## 10. Current Focus

**Active Phase:** Phase 13 — Research-Stack Intelligence
**Active Stories:** US-001
**Status:** ⚪ Not Started
**Research Status:** Not needed — changes are to the research command itself

**Blockers:**
- None

**Session Context:**
- Gen 3 (12 phases) complete and shipped. Clean working tree.
- This PRD covers improvements to existing context plugin commands.
- No new TypeScript modules — all changes are to markdown command files.

**Last Updated:** 2026-03-02

---

## 11. Success Criteria

**MVP is successful when:**
1. Research profiles contain performance, compatibility, and alternatives data (Sections 10-14)
2. Context plugin commands verify specifications against profiles and cross-reference artifacts
3. Vague or unrealistic specifications are challenged with evidence-based alternatives
4. Developer overrides are recorded with reasoning for downstream agent awareness
5. All 12 scenarios (SC-001 through SC-012) pass validation
6. No existing command functionality is broken — all current behavior preserved

**Validation approach:**
- Run improved commands against a test project with intentional specification errors
- Verify verification layer catches: contract mismatches, cycles, unrealistic gates
- Verify challenge layer pushes back on: vague gates, over-engineering, incompatible technologies
- Verify override recording: artifacts contain both recommendation and developer reasoning

---

## 12. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Research latency slows conversations | Medium | Cache results within context; limit searches to 2-3 per topic; fall back to profile data if slow |
| False positive verification warnings | High | Always present evidence with warnings; make overrides easy; track false positive rate |
| Profile format changes break existing commands | High | New sections appended (10-14); existing sections unchanged; backward compatible |
| Over-aggressive challenge annoys developer | Medium | Challenge with evidence only; accept overrides gracefully; consider strictness setting |
| Web research returns outdated or incorrect data | Medium | Cross-reference web results against profile data; flag confidence level; prefer official docs |

---

## 13. Document History

| Date | Version | Changes |
|------|---------|---------|
| 2026-03-02 | 1.0 | Initial PRD — Context Intelligence Layer (Gen 4) |

## PIV-Automator-Hooks
prd_status: complete
technologies_to_research: none
scenarios_count: 12
phases_count: 3
next_suggested_command: plan-feature
next_arg: "Phase 13: Research-Stack Intelligence"
confidence: high
