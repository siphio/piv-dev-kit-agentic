# Technology Profile: SuperMemory.AI

**Generated**: 2026-02-20
**PRD Reference**: Section 3 — SuperMemory.AI
**Agent Use Case**: Store and retrieve structured fix records for long-term pattern memory across interventions

---

## 1. Authentication & Setup

### Auth Type
Bearer token via `Authorization` header. API keys start with `sm_` and are generated at the Developer Console.

### Setup Steps

1. Create a free account at [console.supermemory.ai](https://console.supermemory.ai)
2. Navigate to API Keys and create a new key
3. Set the environment variable:

```bash
export SUPERMEMORY_API_KEY="sm_your_key_here"
```

4. Install the TypeScript SDK:

```bash
npm install supermemory
```

### Client Initialization

```typescript
import Supermemory from 'supermemory';

const client = new Supermemory({
  apiKey: process.env['SUPERMEMORY_API_KEY'],
});
```

The SDK automatically reads `SUPERMEMORY_API_KEY` from the environment if not explicitly provided. All API requests target `https://api.supermemory.ai`.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPERMEMORY_API_KEY` | Yes | API key from console.supermemory.ai |

---

## 2. Core Data Models

### Document (Input)

A document is the raw input unit — text, URL, PDF, image, or video. When ingested, Supermemory processes a document through a six-stage pipeline: queued, extracting, chunking, embedding, indexing, done. A single document produces many interconnected memories.

```json
{
  "id": "abc123",
  "status": "done",
  "title": "string",
  "type": "string",
  "createdAt": "2026-02-20T10:00:00Z",
  "containerTags": ["project_xyz"],
  "metadata": {
    "error_category": "test_failure",
    "phase": "2",
    "project": "social-media-leads"
  }
}
```

### Memory (Output / Searchable Unit)

A memory is a semantic chunk with embeddings and relational connections. Search results return memories (extracted facts) and/or chunks (document fragments).

```json
{
  "id": "mem_xyz",
  "memory": "The live_test_gate_failure was caused by missing Bearer token in the auth header. Fixed by adding token refresh logic before validation.",
  "similarity": 0.87,
  "metadata": {
    "error_category": "integration_auth",
    "phase": "3",
    "project": "social-media-leads",
    "fix_type": "code_change"
  },
  "updatedAt": "2026-02-19T14:30:00Z",
  "version": 1
}
```

### Metadata Constraints

| Constraint | Value |
|------------|-------|
| Value types | `string`, `number`, `boolean`, `string[]` |
| No nested objects | Flat key-value pairs only |
| Key format | Alphanumeric, hyphens, underscores, dots |
| Key max length | 64 characters |
| No arrays of objects | Only string arrays via `array_contains` filter |

### Key Organization Fields

| Field | Type | Purpose | Agent Use |
|-------|------|---------|-----------|
| `customId` | string (max 100 chars) | Deduplication and updates; alphanumeric, hyphens, underscores | Unique fix record ID (e.g., `fix_2026-02-20_auth_001`) |
| `containerTag` | string (max 100 chars) | Group content by user/project | Project identifier (e.g., `project_social-media-leads`) |
| `metadata` | object | Filterable key-value pairs | Error category, phase, fix type tags |
| `entityContext` | string (max 1500 chars) | Guides memory extraction | Describe what to extract from fix records |

### Knowledge Graph Relationships

Supermemory builds a knowledge graph with three relationship types:
- **Updates**: New information supersedes existing knowledge (`isLatest` field)
- **Extends**: Information enriches existing memories without replacing them
- **Derives**: Inferred insights from patterns across multiple memories

---

## 3. Key Endpoints

### 3.1 Write Fix Record (Add Document)

**Endpoint**: `POST https://api.supermemory.ai/v3/documents`
**Auth**: `Authorization: Bearer <SUPERMEMORY_API_KEY>`

**Request Body**:

```json
{
  "content": "## Fix Record: live_test_gate_failure\n\n**Error**: Validation endpoint returned 401 during Phase 3 live testing.\n**Root Cause**: OAuth token expired mid-validation run. Token refresh was not triggered before the /validate-implementation command.\n**Fix**: Added pre-validation token refresh check in the orchestrator's post_validation_gate() function. Inserted a conditional refresh call when token age exceeds 45 minutes.\n**Files Changed**: orchestrator.py (lines 234-251)\n**Outcome**: All 5 Tier 2 tests passed on retry.",
  "customId": "fix_2026-02-20_auth_001",
  "containerTag": "project_social-media-leads",
  "metadata": {
    "error_category": "integration_auth",
    "phase": "3",
    "project": "social-media-leads",
    "fix_type": "code_change",
    "severity": "critical",
    "scenario": "SC-010"
  },
  "entityContext": "This is an error fix record from an AI development agent. Extract the error pattern, root cause, fix approach, and outcome as separate searchable facts."
}
```

**Response** (200):

```json
{
  "id": "abc123",
  "status": "queued"
}
```

**TypeScript SDK**:

```typescript
const result = await client.add({
  content: fixRecordContent,
  customId: "fix_2026-02-20_auth_001",
  containerTag: "project_social-media-leads",
  metadata: {
    error_category: "integration_auth",
    phase: "3",
    project: "social-media-leads",
    fix_type: "code_change",
    severity: "critical",
    scenario: "SC-010"
  },
  entityContext: "This is an error fix record from an AI development agent. Extract the error pattern, root cause, fix approach, and outcome as separate searchable facts."
});
// result.id => "abc123"
// result.status => "queued"
```

**Update Pattern** (same `customId`):
Sending a new `client.add()` call with the same `customId` triggers an intelligent diff-based update rather than creating a duplicate. Supermemory only reprocesses new/changed content.

### 3.2 Semantic Search (Core Use Case)

**Endpoint**: `POST https://api.supermemory.ai/v4/search`
**Auth**: `Authorization: Bearer <SUPERMEMORY_API_KEY>`

**Request Body**:

```json
{
  "q": "authentication token expired during live validation testing",
  "containerTag": "project_social-media-leads",
  "searchMode": "hybrid",
  "limit": 5,
  "threshold": 0.5,
  "rerank": true,
  "rewriteQuery": true,
  "filters": {
    "AND": [
      { "key": "error_category", "value": "integration_auth" }
    ]
  }
}
```

**Response** (200):

```json
{
  "results": [
    {
      "id": "mem_xyz",
      "memory": "The live_test_gate_failure was caused by missing Bearer token in the auth header. Fixed by adding token refresh logic before validation.",
      "similarity": 0.87,
      "metadata": {
        "error_category": "integration_auth",
        "phase": "3",
        "project": "social-media-leads",
        "fix_type": "code_change"
      },
      "updatedAt": "2026-02-19T14:30:00Z",
      "version": 1
    },
    {
      "id": "chunk_abc",
      "chunk": "## Fix Record: live_test_gate_failure\n\n**Error**: Validation endpoint returned 401...",
      "similarity": 0.82,
      "metadata": {
        "error_category": "integration_auth",
        "phase": "3"
      },
      "updatedAt": "2026-02-19T14:30:00Z",
      "version": 1
    }
  ],
  "timing": 187,
  "total": 2
}
```

**TypeScript SDK**:

```typescript
const searchResult = await client.search.execute({
  q: "similar errors to live_test_gate_failure",
  containerTag: "project_social-media-leads",
  searchMode: "hybrid",
  limit: 5,
  threshold: 0.5,
  rerank: true,
  rewriteQuery: true,
  filters: {
    AND: [
      { key: "error_category", value: "integration_auth" }
    ]
  }
});

for (const result of searchResult.results) {
  console.log(`[${result.similarity}] ${result.memory || result.chunk}`);
  console.log(`  Metadata: ${JSON.stringify(result.metadata)}`);
}
```

**Search Parameters Reference**:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | string | **required** | Natural language query text |
| `containerTag` | string | optional | Scope to specific project/user |
| `searchMode` | string | `"hybrid"` | `"hybrid"` (memories + chunks) or `"memories"` (facts only) |
| `limit` | number | 10 | Max results returned |
| `threshold` | 0-1 | 0.5 | Similarity cutoff (higher = fewer, more precise results) |
| `rerank` | boolean | false | Re-score for relevance (+~100ms latency) |
| `rewriteQuery` | boolean | false | Generate multiple query rewrites for broader recall (no extra cost, adds latency) |
| `filters` | object | optional | Metadata filters with AND/OR logic |
| `docId` | string | optional | Search within a specific document only |

**Filter Types Available**:

| Filter Type | Syntax | Example |
|-------------|--------|---------|
| String equality (default) | `{ key, value }` | `{ key: "phase", value: "3" }` |
| String contains | `{ filterType: "string_contains", key, value, ignoreCase? }` | `{ filterType: "string_contains", key: "fix_type", value: "code" }` |
| Numeric comparison | `{ filterType: "numeric", key, value, numericOperator }` | `{ filterType: "numeric", key: "severity_score", value: "7", numericOperator: ">=" }` |
| Array contains | `{ filterType: "array_contains", key, value }` | `{ filterType: "array_contains", key: "tags", value: "auth" }` |
| Negation | `{ key, value, negate: true }` | `{ key: "status", value: "resolved", negate: true }` |

**Compound Filter Example (AND + nested OR)**:

```json
{
  "AND": [
    { "key": "project", "value": "social-media-leads" },
    {
      "OR": [
        { "key": "error_category", "value": "integration_auth" },
        { "key": "error_category", "value": "test_failure" }
      ]
    }
  ]
}
```

Filter nesting supports up to 8 levels and a maximum of 200 conditions.

### 3.3 Check Document Processing Status

**Endpoint**: `GET https://api.supermemory.ai/v3/documents/{id}`
**Auth**: `Authorization: Bearer <SUPERMEMORY_API_KEY>`

**Response** (200):

```json
{
  "id": "abc123",
  "status": "done",
  "title": "Fix Record: live_test_gate_failure",
  "createdAt": "2026-02-20T10:00:00Z",
  "containerTags": ["project_social-media-leads"],
  "metadata": {
    "error_category": "integration_auth",
    "phase": "3"
  }
}
```

**TypeScript SDK**:

```typescript
const doc = await client.documents.get("abc123");
console.log(doc.status); // "queued" | "processing" | "done" | "failed"
```

Status values: `queued` (awaiting), `processing` (in pipeline), `done` (searchable), `failed` (irrecoverable — auto-deleted after 2 minutes).

### 3.4 List Documents

**Endpoint**: `POST https://api.supermemory.ai/v3/documents/list`
**Auth**: `Authorization: Bearer <SUPERMEMORY_API_KEY>`

**Request Body**:

```json
{
  "limit": 50,
  "page": 1,
  "containerTags": ["project_social-media-leads"],
  "sort": "createdAt",
  "order": "desc",
  "filters": {
    "AND": [
      { "key": "error_category", "value": "test_failure" }
    ]
  }
}
```

**Response** (200):

```json
{
  "memories": [
    {
      "id": "abc123",
      "title": "Fix Record: test_failure",
      "status": "done",
      "type": "text",
      "createdAt": "2026-02-20T10:00:00Z",
      "containerTags": ["project_social-media-leads"],
      "metadata": { "error_category": "test_failure", "phase": "2" }
    }
  ],
  "pagination": {
    "currentPage": 1,
    "totalPages": 3,
    "totalItems": 127
  }
}
```

**TypeScript SDK**:

```typescript
const list = await client.documents.list({
  limit: 50,
  containerTags: ["project_social-media-leads"]
});
```

Parameters: `limit` (max 200), `page`, `containerTags`, `sort` (`createdAt` | `updatedAt`), `order` (`desc` | `asc`).

### 3.5 Update Document

**Endpoint**: `PUT https://api.supermemory.ai/v3/documents/{id}`
**Auth**: `Authorization: Bearer <SUPERMEMORY_API_KEY>`

Replaces the entire document content and triggers full reprocessing.

**TypeScript SDK**:

```typescript
await client.documents.update("doc_id_123", {
  content: "Updated fix record with additional context...",
  metadata: { version: 2, status: "verified" }
});
```

### 3.6 Update Document Metadata

**Endpoint**: `PATCH https://api.supermemory.ai/v3/documents/{id}`

Adds or updates metadata fields without reprocessing the full content.

### 3.7 Delete Documents

**Single Delete**:
`DELETE https://api.supermemory.ai/v3/documents/{id}`

**Bulk Delete by IDs**:

```typescript
await client.documents.deleteBulk({
  ids: ["doc_1", "doc_2", "doc_3"]
});
```

**Bulk Delete by Container Tag** (delete all memories for a project):

```typescript
await client.documents.deleteBulk({
  containerTags: ["project_social-media-leads"]
});
```

**Warning**: Deletes are permanent with no recovery option.

---

## 4. Rate Limits & Throttling

### Pricing Tiers

| Plan | Price | Tokens | Queries | Best For |
|------|-------|--------|---------|----------|
| Free | $0/mo | 1M tokens | 10K queries | Testing, MVP development |
| Pro | $19/mo | 3M tokens | 100K queries | Startups, production apps |
| Scale | $399/mo | 80M tokens | 20M queries | Enterprise production |

**Overage Pricing**: $0.01 per 1,000 tokens, $0.10 per 1,000 queries.

**Startup Program**: $1,000 in Pro credits for 6 months.

### Rate Limiting Behavior

- HTTP 429 response when rate limited
- Recommended batch size: 3-5 documents per batch
- Recommended delay between batches: 1-2 seconds
- The TypeScript SDK automatically retries rate-limited requests with exponential backoff (default: 2 retries)

### Token Accounting

Tokens are consumed by both ingestion (content processing) and search (query processing). A single fix record of ~200 words consumes approximately 250-400 tokens for ingestion. Search queries consume tokens proportional to query complexity and result count.

### Recommendation for Agent Use

The Free tier (1M tokens, 10K queries) is sufficient for development and testing. For production operation across multiple projects, the Pro tier ($19/mo) provides 100K queries — enough for an active supervisor agent running several dozen interventions per day.

---

## 5. Error Handling

### Error Response Format

```json
{
  "error": "string",
  "details": "string"
}
```

### HTTP Status Codes

| Status | Error Class (SDK) | Meaning | Retry? |
|--------|-------------------|---------|--------|
| 400 | `BadRequestError` | Invalid request body or parameters | No — fix request |
| 401 | `AuthenticationError` | Missing or invalid API key | No — fix credentials |
| 403 | `PermissionDeniedError` | Insufficient account permissions | No — check plan |
| 404 | `NotFoundError` | Document/memory not found | No |
| 422 | `UnprocessableEntityError` | Valid JSON but semantically invalid | No — fix data |
| 429 | `RateLimitError` | Rate limit exceeded | Yes — exponential backoff |
| 500 | `InternalServerError` | Server-side failure | Yes — retry with delay |

### SDK Built-in Retry

The `supermemory` TypeScript SDK automatically retries certain errors (429, 5xx, connection errors) up to 2 times by default with exponential backoff.

```typescript
const client = new Supermemory({
  apiKey: process.env['SUPERMEMORY_API_KEY'],
  maxRetries: 3,     // Override default of 2
  timeout: 120000,   // Override default of 60000ms
});
```

### Retry Strategy for Agent Integration

```typescript
// The SDK handles retries automatically. For manual control:
try {
  const result = await client.search.execute({ q: "error pattern" });
} catch (error) {
  if (error instanceof Supermemory.RateLimitError) {
    // SDK already retried 2x — escalate to orchestrator
    // Map to PIV error_category: integration_rate_limit
  } else if (error instanceof Supermemory.AuthenticationError) {
    // Map to PIV error_category: integration_auth
    // Escalate immediately — human must fix credentials
  } else if (error instanceof Supermemory.InternalServerError) {
    // SDK already retried — log and continue without memory context
  }
}
```

### Processing Failures

Documents that fail processing are automatically deleted after 2 minutes. Check status via `GET /v3/documents/{id}` — a `failed` status means the content could not be processed. Resubmit with corrected content.

---

## 6. SDK / Library Recommendation

### Primary: `supermemory` TypeScript SDK

| Property | Value |
|----------|-------|
| Package | `supermemory` |
| Latest Version | 4.11.1 (as of 2026-02-20) |
| Install | `npm install supermemory` |
| TypeScript | >= 4.9 required, full type definitions |
| Runtime | Node.js 20 LTS+, Deno v1.28.0+, Bun 1.0+ |
| Retries | 2 automatic with exponential backoff |
| Timeout | 60s default, configurable |

**Recommendation**: Use the `supermemory` SDK directly. It provides full type safety, automatic retries, and covers all endpoints. There is no need for raw HTTP — the SDK is well-maintained and published frequently (latest release was 4 days ago as of this writing).

### Alternative Integration: `@supermemory/tools`

For agent frameworks, `@supermemory/tools` provides pre-built tool definitions for:
- Vercel AI SDK (`@supermemory/tools/ai-sdk`)
- OpenAI tools format
- Mastra framework

These are useful if the supervisor agent uses one of those frameworks, but for our orchestrator's direct REST integration, the base `supermemory` SDK is cleaner.

### Not Recommended for This Use Case

- `@supermemory/ai-sdk` — Deprecated in favor of `@supermemory/tools`
- Memory Router (proxy approach) — Designed for chat apps, not structured record storage
- MCP Server — For interactive Claude Code sessions, not programmatic agent access

---

## 7. Integration Gotchas

### G1: Asynchronous Ingestion
Content is not immediately searchable after `client.add()`. The response returns `"status": "queued"` and processing takes seconds to minutes depending on content size. **Agent impact**: After writing a fix record, poll `client.documents.get(id)` before assuming it is searchable. For text-only fix records (~200 words), processing typically completes within 2-5 seconds.

### G2: containerTags Array Matching is Exact and Ordered
When searching with `containerTags`, the tags must match in the same order. Using a single tag per project (e.g., `"project_social-media-leads"`) avoids ordering issues. **Recommendation**: Use a single `containerTag` string per project for all fix records.

### G3: Metadata Values Are Flat Only
No nested objects or arrays of objects. Only `string`, `number`, `boolean`, and `string[]`. If you need structured data (e.g., list of files changed), encode it as a comma-separated string in the `content` field, not metadata.

### G4: Permanent Deletes
There is no soft-delete or recovery. Bulk delete by `containerTags` will destroy all memories for that tag instantly. Test delete operations on non-production data first.

### G5: API Version Split
Document operations use `/v3/documents/*` while search uses `/v4/search`. The SDK abstracts this, but be aware if making raw HTTP calls. Legacy `/v3/memories/*` endpoints redirect to `/v3/documents/*` automatically.

### G6: Token Consumption is Not Transparent
Token usage for ingestion vs. search is not clearly documented per-operation. Monitor usage via the Developer Console dashboard to avoid unexpected overage charges.

### G7: entityContext is Per-ContainerTag
The `entityContext` parameter (which guides memory extraction) applies to the container tag scope, not per-document. Setting it on one document affects how all future documents in that container are processed. Set it once during initialization for the project container.

### G8: Search Mode Affects Result Shape
In `"hybrid"` mode, results contain either a `memory` field (extracted fact) or a `chunk` field (document fragment), never both. Always check which field is present when parsing results.

### G9: Query Rewriting Adds Latency, Not Cost
`rewriteQuery: true` generates multiple query variations for broader recall. No additional token cost, but adds measurable latency (varies). Enable for diagnostic queries where recall matters more than speed.

### G10: SDK Requires Node.js 20+
The `supermemory` npm package requires Node.js 20 LTS or later. Verify the orchestrator runtime version before integrating.

---

## 8. PRD Capability Mapping

| PRD Requirement | SuperMemory Feature | Implementation |
|-----------------|---------------------|----------------|
| Write structured fix records with metadata tags | `POST /v3/documents` with `metadata`, `containerTag`, `customId` | Store each fix as a document with error_category, phase, project in metadata |
| Tag by error_category, phase, project | `metadata` object on add, `filters` on search | Flat key-value metadata with AND/OR filter queries |
| Semantic search across fix history | `POST /v4/search` with `q`, `searchMode: "hybrid"` | Natural language query: "similar errors to live_test_gate_failure" |
| Retrieve past fixes with full context | Search returns `memory` (facts) and `chunk` (full content) | Use `hybrid` mode to get both extracted facts and original fix text |
| Pattern recall during diagnosis (SC-010) | Semantic search + metadata filtering + reranking | Query with error description, filter by category, rerank for precision |
| Deduplication of fix records | `customId` field | Same customId triggers update, not duplicate creation |
| Project-scoped memory isolation | `containerTag` parameter | One tag per project: `"project_{project-name}"` |
| Cross-project pattern search | Omit `containerTag` from search | Search all memories without container scoping |

### Suggested Fix Record Schema

```typescript
interface FixRecord {
  // Content (stored as document body)
  content: string;  // Structured markdown: error, root cause, fix, files changed, outcome

  // Organization
  customId: string;        // "fix_{date}_{category}_{sequence}"
  containerTag: string;    // "project_{project-name}"

  // Searchable Metadata
  metadata: {
    error_category: string;   // PIV taxonomy: syntax_error, test_failure, etc.
    phase: string;            // "1", "2", "3", etc.
    project: string;          // Project identifier
    fix_type: string;         // "code_change", "config_change", "dependency_update"
    severity: string;         // "critical", "warning", "info"
    scenario: string;         // PRD scenario ID: "SC-010"
    resolved: string;         // "true" | "false"
    command: string;           // PIV command that triggered: "/execute", "/validate"
  };

  // Memory extraction guidance
  entityContext: string;  // Set once per project container
}
```

### Example Diagnostic Query Flow (SC-010)

```typescript
// Step 1: Supervisor encounters a new error
const errorDescription = "TypeError: Cannot read property 'token' of undefined during Phase 3 validation";

// Step 2: Search for similar past fixes
const pastFixes = await client.search.execute({
  q: errorDescription,
  containerTag: "project_social-media-leads",
  searchMode: "hybrid",
  limit: 5,
  threshold: 0.4,   // Lower threshold for broader recall
  rerank: true,
  rewriteQuery: true
});

// Step 3: Also search cross-project for patterns
const crossProjectFixes = await client.search.execute({
  q: errorDescription,
  searchMode: "memories",  // Facts only for cross-project
  limit: 3,
  threshold: 0.6,
  rerank: true,
  filters: {
    AND: [
      { key: "error_category", value: "integration_auth" }
    ]
  }
});

// Step 4: Combine context for diagnosis
const memoryContext = [
  ...pastFixes.results.map(r => r.memory || r.chunk),
  ...crossProjectFixes.results.map(r => r.memory || r.chunk)
].join("\n---\n");

// Step 5: After fix is applied, store the new record
await client.add({
  content: formatFixRecord(error, rootCause, fix, outcome),
  customId: `fix_2026-02-20_integration_auth_003`,
  containerTag: "project_social-media-leads",
  metadata: {
    error_category: "integration_auth",
    phase: "3",
    project: "social-media-leads",
    fix_type: "code_change",
    severity: "critical",
    scenario: "SC-010",
    resolved: "true",
    command: "/validate-implementation"
  }
});
```

---

## 9. Live Integration Testing Specification

### 9.1 Testing Tier Classification

**Tier 1 — Auth & Read-Only (Safe, Idempotent)**
- T1.1: Authenticate with API key — verify 200 response from any endpoint
- T1.2: Search with empty results — `POST /v4/search` with a query unlikely to match (`q: "supermemory_integration_test_nonce_xyz"`)
- T1.3: List documents with test container — `POST /v3/documents/list` with `containerTags: ["piv_test_ephemeral"]`

**Tier 2 — Write, Search, Cleanup (Reversible)**
- T2.1: Add a test fix record — `POST /v3/documents` with `customId: "piv_test_fix_001"`, `containerTag: "piv_test_ephemeral"`
- T2.2: Poll for processing completion — `GET /v3/documents/{id}` until status is `done` (timeout: 30s)
- T2.3: Semantic search for the test record — `POST /v4/search` with `q: "piv integration test record"`, `containerTag: "piv_test_ephemeral"`
- T2.4: Verify search result contains expected metadata fields
- T2.5: Update the test record with new metadata — `PATCH /v3/documents/{id}`
- T2.6: Search with metadata filter — verify filter narrows results correctly
- T2.7: Delete the test record — `DELETE /v3/documents/{id}`
- T2.8: Verify deletion — `GET /v3/documents/{id}` returns 404

**Tier 3 — Bulk Operations**
- T3.1: Add 3 test fix records with different metadata (error categories)
- T3.2: Search across all 3 with broad query, verify result ranking
- T3.3: Search with metadata filter to narrow to 1 specific category
- T3.4: Bulk delete by container tag — `deleteBulk({ containerTags: ["piv_test_ephemeral"] })`
- T3.5: Verify all 3 records deleted

**Tier 4 — N/A**
No destructive operations beyond what Tier 2-3 already covers with test data. All tests use the `piv_test_ephemeral` container tag for isolation.

### 9.2 Test Environment Configuration

```typescript
// Test constants
const TEST_CONTAINER_TAG = "piv_test_ephemeral";
const TEST_CUSTOM_ID_PREFIX = "piv_test_fix_";
const TEST_ENTITY_CONTEXT = "This is a test fix record for PIV integration validation. Extract error type, fix approach, and outcome.";
const PROCESSING_POLL_INTERVAL_MS = 2000;
const PROCESSING_TIMEOUT_MS = 30000;
```

**Prerequisites**:
- `SUPERMEMORY_API_KEY` environment variable set with valid key
- Free tier account is sufficient for all test tiers
- Node.js 20+ runtime
- `supermemory` package installed (v4.11+)

**Cleanup**: All tests use `piv_test_ephemeral` container tag. If tests are interrupted, run bulk delete on that tag to clean up orphaned test data.

### 9.3 Testing Sequence

1. Run Tier 1 tests first — if auth fails, abort all remaining tiers
2. Run Tier 2 tests sequentially (each depends on the previous)
3. Run Tier 3 only if Tier 2 passes completely
4. Always run cleanup (bulk delete by container tag) as final step, even if tests fail
5. Report `live_tests_executed` and `live_tests_required` counts to manifest

**Expected Timing**: Tier 1 (~2s), Tier 2 (~45s including processing wait), Tier 3 (~60s including processing waits). Total: ~2 minutes.

---

## PIV-Automator-Hooks
tech_name: supermemory-ai
research_status: complete
endpoints_documented: 8
tier_1_count: 3
tier_2_count: 8
tier_3_count: 5
tier_4_count: 0
gotchas_count: 10
confidence: high
