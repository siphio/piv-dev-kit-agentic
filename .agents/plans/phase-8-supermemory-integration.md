# Feature: SuperMemory Integration & Long-Term Pattern Memory

The following plan should be complete, but validate documentation and codebase patterns before implementing.
Pay special attention to naming of existing utils, types, and models. Import from the right files.

## Feature Description

Integrate SuperMemory.AI into the PIV Supervisor to provide long-term pattern memory across interventions.
Every fix is stored as a structured record with metadata. During diagnosis, the supervisor queries past
fixes for similar error patterns, enriching the diagnosis prompt with prior context. The system degrades
gracefully when SuperMemory is unavailable — the supervisor works fully without it.

## User Story

As a developer running many projects over weeks/months
I want the supervisor to remember past fixes and apply them faster to similar errors
So that diagnosis time decreases as the system encounters more edge cases

## Problem Statement

The supervisor currently diagnoses each stall from scratch. If the same error pattern recurs across
projects or across time, the supervisor has no memory of past fixes. This means identical problems
take the same amount of time and tokens to diagnose every occurrence.

## Solution Statement

Add a `memory.ts` module that wraps the SuperMemory.AI SDK. After each successful fix, store a
structured fix record. Before each diagnosis session, query SuperMemory for similar past fixes
and inject them as context into the Agent SDK diagnosis prompt. All SuperMemory operations are
wrapped in try/catch with graceful fallthrough — the supervisor pipeline never blocks on memory.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium
**Primary Systems Affected**: `supervisor/src/` — new `memory.ts`, modified `interventor.ts`, `monitor.ts`, `types.ts`, `config.ts`, `improvement-log.ts`
**Dependencies**: `supermemory` npm package (v4.11+)
**Agent Behavior**: Yes — enriches diagnosis decision tree with past fix context (PRD 4.2 "Bug Location")

---

## TECHNOLOGY PROFILES CONSUMED

**Profiles read from `.agents/reference/`:**

- `supermemory-ai-profile.md` — Used for: all memory storage and retrieval
  - Key endpoints: `POST /v3/documents` (write), `POST /v4/search` (search), `GET /v3/documents/{id}` (status), `DELETE /v3/documents/{id}` (cleanup)
  - Auth method: Bearer token via `SUPERMEMORY_API_KEY` env var
  - SDK: `supermemory` v4.11+, auto-retry 2x on 429/5xx
  - Critical constraints: Async ingestion (not immediately searchable), flat metadata only, `containerTag` for project scoping, `entityContext` is per-container

**Impact on Implementation:**
- Use SDK `client.add()` for writes, `client.search.execute()` for queries — no raw HTTP
- Poll `client.documents.get(id)` after write only when immediate searchability matters (not needed for fix storage — records are historical)
- Use single `containerTag` per project: `"project_{project-name}"`
- For cross-project pattern search, omit `containerTag`
- `searchMode: "hybrid"` returns `memory` OR `chunk` field — check both

---

## CONTEXT REFERENCES

### Relevant Codebase Files — READ BEFORE IMPLEMENTING

- `supervisor/src/types.ts` — All shared type definitions. Add new types here.
- `supervisor/src/interventor.ts` (lines 18-47) — `buildDiagnosisPrompt()` — inject memory context here
- `supervisor/src/interventor.ts` (lines 105-177) — `diagnoseStall()` — call memory recall before diagnosis
- `supervisor/src/monitor.ts` (lines 139-226) — `handleDiagnosis()` — orchestrates the full pipeline, store fix record here after success
- `supervisor/src/improvement-log.ts` (lines 11-40) — `formatEntry()` — add memory reference fields
- `supervisor/src/config.ts` (lines 45-54) — `loadInterventorConfig()` — add SuperMemory config
- `supervisor/tests/interventor.test.ts` — Test patterns: mock Agent SDK, factory helpers
- `supervisor/tests/improvement-log.test.ts` — Test patterns: temp dirs, file assertions

### New Files to Create

- `supervisor/src/memory.ts` — SuperMemory.AI client wrapper (write, search, health check)
- `supervisor/tests/memory.test.ts` — Unit tests for memory module

### Patterns to Follow

**Naming Conventions:**
- Functions: `camelCase` — `storeFix`, `recallSimilarFixes`, `checkMemoryHealth`
- Types: `PascalCase` — `FixRecord`, `MemorySearchResult`, `MemoryConfig`
- Config env vars: `PIV_SUPERMEMORY_*` prefix or `SUPERMEMORY_API_KEY`

**Error Handling (MIRROR: supervisor/src/improvement-log.ts:47-61):**
```typescript
// Pattern: never throw from optional features
try {
  await supermemoryOperation();
} catch {
  // Best-effort — never block the pipeline
}
```

**Config Loading (MIRROR: supervisor/src/config.ts:45-54):**
```typescript
export function loadMemoryConfig(): MemoryConfig {
  return {
    apiKey: process.env.SUPERMEMORY_API_KEY,
    enabled: !!process.env.SUPERMEMORY_API_KEY,
    // ...
  };
}
```

**Test Factory Pattern (MIRROR: supervisor/tests/interventor.test.ts:30-43):**
```typescript
function makeFixRecord(overrides: Partial<FixRecord> = {}): FixRecord {
  return { /* defaults */ ...overrides };
}
```

---

## AGENT BEHAVIOR IMPLEMENTATION

### Decision Trees to Implement

**Decision Tree: Memory-Enhanced Diagnosis (extends PRD 4.2 "Bug Location")**

The existing diagnosis flow is:
1. Detect stall → classify → diagnose via Agent SDK → classify bug location → fix or escalate

Phase 8 adds a memory recall step before the Agent SDK diagnosis session:
1. Detect stall → classify → **query SuperMemory for similar past fixes** → inject as context → diagnose via Agent SDK → classify → fix or escalate → **store fix record**

- Criteria: Memory recall runs if `MemoryConfig.enabled === true`
- Outcomes: If past fixes found, append to diagnosis prompt as "## Past Fixes for Similar Errors"
- Error recovery: If SuperMemory call fails, continue with original prompt (no memory context)
- Technology: `client.search.execute()` with `q: errorDescription`, `containerTag`, `rerank: true`

### Scenario Mappings

| Scenario (PRD 4.3) | Agent Workflow | Decision Tree | Success Criteria |
|---|---|---|---|
| SC-010: Pattern Recall | Query past fixes → inject context → diagnose → fix → store new record | Memory-Enhanced Diagnosis | Past fix retrieved, referenced in log |

### Error Recovery Patterns

- SuperMemory API unavailable → continue without memory (PRD 4.4)
- SuperMemory auth failure (`401`) → log warning, disable for remainder of session
- Rate limit (`429`) → SDK auto-retries 2x, then graceful fallthrough
- Write fails → log warning, don't block fix pipeline
- Search returns no results → proceed with standard diagnosis (no context enrichment)

---

## FOUNDATION (Evolution Mode)

**Generation:** 2 | **Active PRD:** `PRD.md`

### What Gen 1 Already Implemented

| Phase | Name | Delivered |
|-------|------|-----------|
| 1 | Core Orchestration Engine | State machine, PIV runner, session management, hooks/manifest parsing |
| 2 | Telegram Interface | Grammy bot, message relay, PRD conversation flow |
| 3 | VS Code Integration | Error classification, drift detection, fidelity checking |
| 4 | Multi-Instance & Polish | Instance registry, budget calculator, progress tracker |

### Key Existing Files (Do Not Recreate)

- `supervisor/src/monitor.ts` — Main loop, `handleDiagnosis()` — extend, don't replace
- `supervisor/src/interventor.ts` — Agent SDK sessions — modify prompts, don't restructure
- `supervisor/src/types.ts` — Add new types, don't modify existing ones
- `supervisor/src/config.ts` — Add new config loader, keep existing loaders unchanged

### Architecture Established in Gen 1-2

- Standalone TS process: `tsx` for dev, `tsc` for build, Vitest for tests
- Agent SDK `query()` with `bypassPermissions` for diagnosis/fix sessions
- Environment variables for all config (`PIV_*`, `TELEGRAM_*`)
- Append-only improvement log with structured markdown entries
- Central registry at `~/.piv/registry.yaml`

### Gen 2 Adds (This Plan's Scope)

- SuperMemory.AI client for structured fix record storage and semantic search
- Memory-enriched diagnosis prompts with past fix context
- Graceful degradation — full supervisor functionality without SuperMemory

---

## IMPLEMENTATION PLAN

### Phase 1: Foundation — Types, Config, Dependencies

- Add `supermemory` npm dependency
- Define new types: `MemoryConfig`, `FixRecord`, `MemorySearchResult`
- Add memory config loader reading `SUPERMEMORY_API_KEY`
- Extend `ImprovementLogEntry` with optional memory reference fields

### Phase 2: Core — memory.ts Module

- Create `memory.ts` with SuperMemory SDK client wrapper
- Implement `createMemoryClient()` — returns SDK client or null if no API key
- Implement `storeFixRecord()` — writes fix to SuperMemory with structured metadata
- Implement `recallSimilarFixes()` — semantic search for past fixes by error description
- Implement `checkMemoryHealth()` — lightweight auth check (used by preflight/tests)
- All functions wrapped in try/catch — never throw

### Phase 3: Integration — Wire into Intervention Pipeline

- Modify `handleDiagnosis()` in `monitor.ts` to call `recallSimilarFixes()` before diagnosis
- Modify `buildDiagnosisPrompt()` in `interventor.ts` to accept optional memory context
- After successful fix in `handleDiagnosis()`, call `storeFixRecord()`
- Update improvement log entries to include memory record IDs

### Phase 4: Testing & Validation

- Unit tests for `memory.ts` with mocked SuperMemory SDK
- Update `interventor.test.ts` for memory-enhanced prompts
- Update `monitor.test.ts` for memory integration in `handleDiagnosis`
- Live integration tests against real SuperMemory API

---

## VALIDATION STRATEGY

### PRD Scenario Validation

| Scenario | Test Plan | Pass Criteria |
|---|---|---|
| SC-010: Pattern Recall | Store 3 fix records, search for similar error, verify retrieval | Past fix returned with similarity > 0.4, metadata matches |
| SC-010: Graceful Degradation | Set invalid API key, run full diagnosis pipeline | Pipeline completes without error, diagnosis succeeds without memory |
| SC-010: Cross-Project Recall | Store fixes from 2 projects, search without containerTag | Fixes from both projects returned |

### Validation Acceptance Criteria

- [ ] Fix records stored in SuperMemory.AI with structured metadata
- [ ] Diagnosis queries past fixes for similar error patterns
- [ ] Past fixes referenced in improvement-log.md entries
- [ ] System works without SuperMemory (graceful degradation)
- [ ] SC-010 passes validation

---

## STEP-BY-STEP TASKS

### Task 1: ADD `supermemory` dependency to `supervisor/package.json`

- **IMPLEMENT**: Add `"supermemory": "^4.11.0"` to `dependencies`
- **PATTERN**: MIRROR existing dependency format in `supervisor/package.json:17-19`
- **VALIDATE**: `cd supervisor && npm install && npx tsc --noEmit`

### Task 2: UPDATE `supervisor/src/types.ts` — Add memory types

- **IMPLEMENT**: Add these types after the Phase 7 section (after line 147):

```typescript
// --- Phase 8: SuperMemory Integration ---

export interface MemoryConfig {
  apiKey: string | undefined;
  enabled: boolean;
  containerTagPrefix: string;
  searchThreshold: number;
  searchLimit: number;
  entityContext: string;
}

export interface FixRecord {
  content: string;
  customId: string;
  containerTag: string;
  metadata: {
    error_category: string;
    phase: string;
    project: string;
    fix_type: string;
    severity: string;
    command: string;
    resolved: string;
  };
  entityContext: string;
}

export interface MemorySearchResult {
  id: string;
  text: string;
  similarity: number;
  metadata: Record<string, string>;
}
```

- **IMPLEMENT**: Extend `ImprovementLogEntry` — add optional fields:

```typescript
  memoryRecordId?: string;
  memoryRetrievedIds?: string[];
```

- **GOTCHA**: `ImprovementLogEntry` already has optional Phase 7 fields — add after `propagatedTo`
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 3: UPDATE `supervisor/src/config.ts` — Add memory config loader

- **IMPLEMENT**: Add `loadMemoryConfig()` function after `loadInterventorConfig()`:

```typescript
export function loadMemoryConfig(): MemoryConfig {
  const apiKey = process.env.SUPERMEMORY_API_KEY;
  return {
    apiKey,
    enabled: !!apiKey,
    containerTagPrefix: process.env.PIV_MEMORY_CONTAINER_PREFIX ?? "project_",
    searchThreshold: parseFloat(process.env.PIV_MEMORY_SEARCH_THRESHOLD ?? "0.4"),
    searchLimit: parseInt(process.env.PIV_MEMORY_SEARCH_LIMIT ?? "5", 10),
    entityContext: "This is an error fix record from a PIV supervisor agent. Extract the error pattern, root cause, fix approach, and outcome as separate searchable facts.",
  };
}
```

- **IMPORTS**: Add `import type { MemoryConfig } from "./types.js";` (already imports MonitorConfig, InterventorConfig)
- **PATTERN**: MIRROR `loadInterventorConfig()` at `supervisor/src/config.ts:45-54`
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 4: CREATE `supervisor/src/memory.ts` — SuperMemory client wrapper

- **IMPLEMENT**: Full module with these exports:
  - `createMemoryClient(config: MemoryConfig)` → returns `Supermemory` instance or `null`
  - `storeFixRecord(client, record: FixRecord)` → returns `{ id: string; status: string } | null`
  - `recallSimilarFixes(client, query: string, containerTag: string | undefined, config: MemoryConfig)` → returns `MemorySearchResult[]`
  - `checkMemoryHealth(client)` → returns `boolean`
- **PROFILE**: Uses SDK `client.add()` per profile Section 3.1
- **PROFILE**: Uses SDK `client.search.execute()` per profile Section 3.2
- **PROFILE**: Search with `searchMode: "hybrid"`, `rerank: true`, `rewriteQuery: true`
- **PROFILE**: Parse results checking for `memory` OR `chunk` field (Gotcha G8)
- **GOTCHA**: G1 — content not immediately searchable after `add()`. Don't poll — fix records are historical.
- **GOTCHA**: G7 — `entityContext` is per-container. Set on first write per project.
- **GOTCHA**: G3 — metadata is flat only. All values must be `string`.
- **GOTCHA**: G10 — SDK requires Node.js 20+. Already satisfied (package.json engines).
- **IMPORTS**: `import Supermemory from 'supermemory';`, types from `./types.js`, config from `./config.js`

Key implementation guidance:
- `storeFixRecord`: Call `client.add()` with record fields. Return `{ id, status }` or `null` on error. Never throw.
- `recallSimilarFixes`: Call `client.search.execute()` with `q`, `searchMode: "hybrid"`, `rerank: true`, `rewriteQuery: true`. Add `containerTag` if provided. Map results to `MemorySearchResult[]` — check for `memory` OR `chunk` field (Gotcha G8). Return `[]` on error.
- `checkMemoryHealth`: Call `client.documents.list({ limit: 1 })`. Return `true` on success, `false` on error.

- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 5: UPDATE `supervisor/src/interventor.ts` — Accept memory context in diagnosis prompt

- **IMPLEMENT**: Modify `buildDiagnosisPrompt` signature to accept optional `memoryContext: string`:

```typescript
function buildDiagnosisPrompt(
  project: RegistryProject,
  classification: StallClassification,
  memoryContext?: string,
): string {
```

- **IMPLEMENT**: If `memoryContext` is provided and non-empty, append to the prompt before "Instructions:":

```
## Past Fixes for Similar Errors

The following past fixes were found for similar error patterns. Use them as reference
during diagnosis — they may reveal the root cause or suggest a fix approach:

${memoryContext}

Note: These are reference fixes from past interventions. Verify applicability before assuming the same fix works.
```

- **IMPLEMENT**: Export `buildDiagnosisPrompt` (currently not exported — needed by monitor.ts to pass context)
- **GOTCHA**: Don't change `diagnoseStall()` signature directly — memory recall is called from `handleDiagnosis()` in `monitor.ts`, and the prompt is built inside `diagnoseStall`. Instead, add an optional `memoryContext?: string` parameter to `diagnoseStall()` and pass it through.
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 6: UPDATE `supervisor/src/monitor.ts` — Wire memory into handleDiagnosis pipeline

- **IMPLEMENT**: Import memory functions and config:

```typescript
import { createMemoryClient, recallSimilarFixes, storeFixRecord } from "./memory.js";
import { loadMemoryConfig } from "./config.js";
import type { FixRecord } from "./types.js";
```

- **IMPLEMENT**: In `handleDiagnosis()`, before calling `diagnoseStall()`:
  1. Load memory config via `loadMemoryConfig()`
  2. Create client via `createMemoryClient(config)`
  3. If client exists, call `recallSimilarFixes()` with error description built from classification
  4. Format results as markdown string for injection into diagnosis prompt
  5. Pass `memoryContext` to `diagnoseStall()`

- **IMPLEMENT**: After successful fix (when `handleDiagnosis` returns "Fixed..."), call `storeFixRecord()`:
  - Build `FixRecord` from diagnostic result and fix result
  - `customId`: `fix_${new Date().toISOString().replace(/[:.]/g, '-')}_${classified.errorCategory}`
  - `containerTag`: `project_${project.name}`
  - `content`: Structured markdown with error, root cause, fix, files changed, outcome

- **IMPLEMENT**: Update the `appendToImprovementLog()` calls to include memory fields:
  - `memoryRecordId`: ID from `storeFixRecord()` result
  - `memoryRetrievedIds`: IDs from `recallSimilarFixes()` results

- **PATTERN**: MIRROR existing `handleDiagnosis()` flow — add memory as optional enhancement, don't restructure
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 7: UPDATE `supervisor/src/improvement-log.ts` — Format memory fields

- **IMPLEMENT**: In `formatEntry()`, after the Phase 7 diagnostic fields block (after line 36), add:

```typescript
if (entry.memoryRecordId) {
  lines.push(`- **Memory Record:** ${entry.memoryRecordId}`);
}
if (entry.memoryRetrievedIds && entry.memoryRetrievedIds.length > 0) {
  lines.push(`- **Past Fixes Referenced:** ${entry.memoryRetrievedIds.join(", ")}`);
}
```

- **PATTERN**: MIRROR existing optional field pattern at `supervisor/src/improvement-log.ts:22-36`
- **VALIDATE**: `cd supervisor && npx tsc --noEmit`

### Task 8: CREATE `supervisor/tests/memory.test.ts` — Unit tests for memory module

- **IMPLEMENT**: Full test suite with mocked `supermemory` SDK:

```typescript
vi.mock("supermemory", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      add: vi.fn(),
      search: { execute: vi.fn() },
      documents: { get: vi.fn(), list: vi.fn() },
    })),
  };
});
```

- **TEST CASES**:
  1. `createMemoryClient` returns `null` when `enabled: false`
  2. `createMemoryClient` returns `Supermemory` instance when `enabled: true`
  3. `storeFixRecord` calls `client.add()` with correct params
  4. `storeFixRecord` returns `null` on SDK error (never throws)
  5. `recallSimilarFixes` calls `client.search.execute()` with correct params
  6. `recallSimilarFixes` returns empty array on SDK error (never throws)
  7. `recallSimilarFixes` parses hybrid results (memory + chunk fields)
  8. `recallSimilarFixes` includes `containerTag` when provided, omits when `undefined`
  9. `checkMemoryHealth` returns `true` on successful list call
  10. `checkMemoryHealth` returns `false` on error (never throws)

- **PATTERN**: MIRROR factory helper pattern from `supervisor/tests/interventor.test.ts:30-78`
- **VALIDATE**: `cd supervisor && npx vitest run tests/memory.test.ts`

### Task 9: UPDATE `supervisor/tests/interventor.test.ts` — Test memory-enhanced prompts

- **IMPLEMENT**: Add test cases:
  1. `diagnoseStall` with `memoryContext` includes past fixes section in prompt
  2. `diagnoseStall` without `memoryContext` produces original prompt (no regression)
  3. Verify `buildDiagnosisPrompt` output contains "Past Fixes for Similar Errors" when context provided

- **VALIDATE**: `cd supervisor && npx vitest run tests/interventor.test.ts`

### Task 10: UPDATE `supervisor/tests/improvement-log.test.ts` — Test memory fields

- **IMPLEMENT**: Add test cases:
  1. Entry with `memoryRecordId` includes "Memory Record:" in formatted output
  2. Entry with `memoryRetrievedIds` includes "Past Fixes Referenced:" in formatted output
  3. Entry without memory fields produces unchanged format (no regression)

- **VALIDATE**: `cd supervisor && npx vitest run tests/improvement-log.test.ts`

### Task 11: CREATE `supervisor/tests/monitor-memory.test.ts` — Test memory integration in monitor

- **IMPLEMENT**: Test the memory integration points in `handleDiagnosis()`:
  1. Mock memory module — verify `recallSimilarFixes()` called before `diagnoseStall()`
  2. Mock memory module — verify `storeFixRecord()` called after successful fix
  3. Memory unavailable (client null) — pipeline completes without error
  4. Memory search fails — pipeline completes with standard diagnosis
  5. Memory store fails — fix still reported as successful

- **IMPORTS**: Mock both `supermemory` and `@anthropic-ai/claude-agent-sdk`
- **VALIDATE**: `cd supervisor && npx vitest run tests/monitor-memory.test.ts`

### Task 12: Full validation — typecheck, all tests, build

- **VALIDATE**: `cd supervisor && npx tsc --noEmit && npx vitest run && npx tsc`

---

## TESTING STRATEGY

### Unit Tests

- `memory.test.ts`: 10 tests covering all 4 exported functions + edge cases
- `interventor.test.ts`: 3 new tests for memory-enhanced diagnosis prompts
- `improvement-log.test.ts`: 3 new tests for memory fields in formatted output
- `monitor-memory.test.ts`: 5 tests for pipeline integration

### Integration Tests (Live API)

Pull from SuperMemory profile Section 9:

**Tier 1 — Auth & Read-Only:**
- T1.1: Auth check — `checkMemoryHealth()` returns `true` with valid key
- T1.2: Empty search — search with nonce query returns 0 results
- T1.3: List test container — list `piv_test_ephemeral` container returns (possibly empty)

**Tier 2 — Write, Search, Cleanup:**
- T2.1: Add test fix record with `customId: "piv_test_fix_001"`, `containerTag: "piv_test_ephemeral"`
- T2.2: Poll until `status: "done"` (timeout 30s)
- T2.3: Search for test record — verify retrieval
- T2.4: Verify metadata fields present in result
- T2.5: Update record metadata
- T2.6: Search with metadata filter — verify narrowing
- T2.7: Delete test record
- T2.8: Verify deletion (GET returns 404)

**Tier 3 — Bulk Operations:**
- T3.1: Add 3 test records with different error categories
- T3.2: Broad search — verify ranking across all 3
- T3.3: Filtered search — narrow to 1 category
- T3.4: Bulk delete by `containerTag: "piv_test_ephemeral"`
- T3.5: Verify all deleted

### Edge Cases

- SuperMemory API key missing → `createMemoryClient()` returns `null`, pipeline unaffected
- SuperMemory API key invalid → `checkMemoryHealth()` returns `false`, all operations gracefully fail
- SDK timeout → caught by try/catch, returns default values
- Search returns mixed `memory` + `chunk` results → both parsed correctly
- Empty search results → empty array, diagnosis proceeds normally
- `containerTag` with special characters in project name → sanitize to alphanumeric + hyphens

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
cd supervisor && npx tsc --noEmit
```

**Expected**: Exit code 0, no type errors

### Level 2: Unit Tests

```bash
cd supervisor && npx vitest run
```

**Expected**: All tests pass (existing 104 + ~21 new = ~125 total)

### Level 3: Live Integration Tests

```bash
# T1.1: Auth check
cd supervisor && npx tsx -e "
import { createMemoryClient } from './src/memory.js';
import { loadMemoryConfig } from './src/config.js';
const config = loadMemoryConfig();
const client = createMemoryClient(config);
if (!client) { console.log('SKIP: No SUPERMEMORY_API_KEY'); process.exit(0); }
const ok = await import('./src/memory.js').then(m => m.checkMemoryHealth(client));
console.log('Health:', ok);
if (!ok) process.exit(1);
"

# T1.2: Empty search
cd supervisor && npx tsx -e "
import { createMemoryClient, recallSimilarFixes } from './src/memory.js';
import { loadMemoryConfig } from './src/config.js';
const config = loadMemoryConfig();
const client = createMemoryClient(config);
if (!client) { console.log('SKIP: No SUPERMEMORY_API_KEY'); process.exit(0); }
const results = await recallSimilarFixes(client, 'supermemory_integration_test_nonce_xyz_abc', undefined, config);
console.log('Results:', results.length);
if (results.length !== 0) process.exit(1);
"

# T2.1-T2.8: Write, search, cleanup cycle
cd supervisor && npx tsx -e "
import Supermemory from 'supermemory';
const client = new Supermemory();
const TAG = 'piv_test_ephemeral';
const ID = 'piv_test_fix_001';

// Write
const doc = await client.add({ content: '## Test Fix\nError: test_failure at Phase 2.\nFix: Added null check.\nOutcome: Passed.', customId: ID, containerTag: TAG, metadata: { error_category: 'test_failure', phase: '2', project: 'test', fix_type: 'code_change', severity: 'warning', command: '/execute', resolved: 'true' }, entityContext: 'Test fix record for PIV integration validation.' });
console.log('Added:', doc.id, doc.status);

// Poll for done
let status = 'queued';
for (let i = 0; i < 15 && status !== 'done'; i++) { await new Promise(r => setTimeout(r, 2000)); const d = await client.documents.get(doc.id); status = d.status; }
console.log('Status:', status);
if (status !== 'done') { console.error('Processing timeout'); process.exit(1); }

// Search
const sr = await client.search.execute({ q: 'test_failure null check', containerTag: TAG, searchMode: 'hybrid', limit: 5, threshold: 0.3, rerank: true });
console.log('Search results:', sr.results?.length ?? 0);

// Delete
await client.documents.delete(doc.id);
console.log('Deleted');

// Verify deletion
try { await client.documents.get(doc.id); console.error('Should have been 404'); process.exit(1); } catch (e) { console.log('Confirmed deleted (404)'); }
"
```

### Level 4: Live Integration Validation

```bash
# T3.1-T3.5: Bulk operations
cd supervisor && npx tsx -e "
import Supermemory from 'supermemory';
const client = new Supermemory();
const TAG = 'piv_test_ephemeral';

// Add 3 records
const ids = [];
for (const [i, cat] of ['syntax_error', 'test_failure', 'integration_auth'].entries()) {
  const doc = await client.add({ content: 'Fix record ' + i + ': ' + cat + ' error.', customId: 'piv_test_bulk_' + i, containerTag: TAG, metadata: { error_category: cat, phase: String(i+1), project: 'test', fix_type: 'code_change', severity: 'warning', command: '/execute', resolved: 'true' } });
  ids.push(doc.id);
}

// Wait for processing
await new Promise(r => setTimeout(r, 10000));

// Search across all
const all = await client.search.execute({ q: 'error fix record', containerTag: TAG, searchMode: 'hybrid', limit: 10, threshold: 0.2 });
console.log('All results:', all.results?.length ?? 0);

// Filtered search
const filtered = await client.search.execute({ q: 'error fix', containerTag: TAG, searchMode: 'hybrid', limit: 10, filters: { AND: [{ key: 'error_category', value: 'syntax_error' }] } });
console.log('Filtered results:', filtered.results?.length ?? 0);

// Bulk delete
await client.documents.deleteBulk({ containerTags: [TAG] });
console.log('Bulk deleted');
await new Promise(r => setTimeout(r, 2000));

// Verify deleted
const check = await client.search.execute({ q: 'error fix', containerTag: TAG, searchMode: 'hybrid', limit: 10 });
console.log('After delete:', check.results?.length ?? 0);
"

# End-to-end: Full pipeline with memory (mocked stall)
cd supervisor && npx vitest run tests/monitor-memory.test.ts
```

### Level 5: Build Validation

```bash
cd supervisor && npx tsc
```

---

## ACCEPTANCE CRITERIA

- [ ] `supermemory` package installed and TypeScript compiles cleanly
- [ ] `memory.ts` exports `createMemoryClient`, `storeFixRecord`, `recallSimilarFixes`, `checkMemoryHealth`
- [ ] Fix records stored in SuperMemory.AI with structured metadata (error_category, phase, project, etc.)
- [ ] Diagnosis sessions receive past fix context via enriched prompt
- [ ] Past fixes referenced in improvement-log.md entries (`memoryRecordId`, `memoryRetrievedIds`)
- [ ] System works fully without SuperMemory (graceful degradation) — no errors when API key missing
- [ ] All existing 104 tests continue to pass (no regressions)
- [ ] ~21 new tests pass (memory.test.ts + updates to interventor/improvement-log/monitor tests)
- [ ] SC-010 validation scenario passes
- [ ] Build succeeds (`npx tsc`)

---

## COMPLETION CHECKLIST

- [ ] All 12 tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully (Level 1-5)
- [ ] Full test suite passes (~125 tests)
- [ ] No type errors (`npx tsc --noEmit`)
- [ ] Build succeeds (`npx tsc`)
- [ ] All acceptance criteria met
- [ ] SC-010 scenario validated

---

## NOTES

### Decisions from Scope Analysis

1. **Retention policy**: Keep all records indefinitely — no pruning at MVP. SuperMemory handles relevance via search ranking.
2. **No auto-promotion**: Fix patterns stay in SuperMemory only — no auto-modification of CLAUDE.md or command files.
3. **SDK over HTTP**: Using `supermemory` TypeScript SDK v4.11+ for type safety and built-in retry.
4. **Pipeline integration point**: Memory recall before diagnosis, storage after successful fix.
5. **Graceful degradation**: All SuperMemory calls wrapped in try/catch. Pipeline never blocks on memory.
6. **Improvement log enrichment**: `memoryRecordId` and `memoryRetrievedIds` added to log entries.

### PRD Gap Notes

- PRD references `.agents/reference/supermemory-profile.md` (missing hyphen) but actual file is `supermemory-ai-profile.md`. Using actual filename.

### Architecture Decisions

- `memory.ts` is a standalone module (not a class) — matches existing `improvement-log.ts` pattern
- `MemoryConfig` loaded from environment like all other configs — no config file
- `containerTag` format: `project_{project-name}` — one tag per project for isolation
- Cross-project search: omit `containerTag` parameter (searches all memories)
- `customId` format: `fix_{ISO-timestamp}_{error_category}` — enables deduplication

## PIV-Automator-Hooks
plan_status: ready_for_execution
phase_source: Phase 8 from PRD2
independent_tasks_count: 2
dependent_chains: 4
technologies_consumed: supermemory-ai
next_suggested_command: execute
next_arg: ".agents/plans/phase-8-supermemory-integration.md"
estimated_complexity: medium
confidence: 9/10
