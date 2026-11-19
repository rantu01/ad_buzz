# Fast Data Fetching Analysis & Optimization Guide

## 1. Project Paths and Architecture

| Project | Path | Framework |
|---------|------|-----------|
| Reference (optimized) | `D:\Code\Project\Office Work\AD accont\adsbuzz-ui-next` | Next.js 15+ (App Router), MongoDB, native fetch |
| Target (to optimize) | `D:\Code\Project\Office Work\AD accont\ad-buzz` | Next.js 16 (App Router), MongoDB, React Query (partially), SSE |

### Reference Architecture
- **Frontend**: React Server Components + Client Components, native `fetch` with `apiFetch` utility, custom hooks (`useTopups`), `memo()` on view components
- **Backend**: Next.js API routes (`app/api/`), model layer (`src/models/`), utility layer (`src/utils/`, `src/lib/`)
- **Database**: MongoDB with connection pooling via `global._adsbuzzMongoClientPromise` in dev
- **Auth**: Session cookie middleware + `getRequestActor` utility
- **Cache**: In-memory TTL cache (`src/lib/cache.js`), memoized index creation

### Target Architecture
- **Frontend**: Next.js App Router, React Query (`@tanstack/react-query`) for some pages, custom hooks, SSE via `useSSE` hook
- **Backend**: Next.js API routes, model layer (`lib/`), Firebase Auth for authentication
- **Database**: MongoDB with `clientPromise` pattern
- **Auth**: Firebase Auth + custom session sync
- **Cache**: React Query with 30s staleTime, 5min gcTime
- **Realtime**: SSE via `/api/events` with channel-based multiplexing

---

## 2. Reference `/topups` Page File Map

| Layer | File | Role |
|-------|------|------|
| Page | `src/app/topups/page.jsx` | Thin wrapper: calls `useTopups` hook, passes to view |
| View | `src/components/views/TopupsView.jsx` | `memo()`-wrapped presentational component (845 lines) |
| Hook | `src/hooks/useTopups.js` | Data fetching, pagination, mutation actions, cache patching |
| API List | `src/app/api/topups/route.js` | `GET /api/topups?page=&limit=` — server-side paginated |
| API Detail | `src/app/api/invoices/[invoiceNo]/route.js` | `GET /api/invoices/:id` — full invoice with screenshots |
| API Mutations | `src/app/api/topups/[id]/{approve,reject,feedback,final-approve,final-reject,sync}/route.js` | PATCH/POST endpoints returning updated invoice |
| Model | `src/models/invoiceModel.js` | `queryTopups()`, `approveInvoice()`, `rejectInvoice()`, etc. |
| DB | `src/lib/db.js` | MongoDB connection pooling |
| Cache | `src/lib/cache.js` | In-memory TTL cache (30s default) |
| HTTP | `src/utils/http.js` | `asyncHandler`, `ApiError`, `ok()`, `fail()` |
| API Client | `src/utils/api.js` | `apiFetch()` — fetch wrapper with error normalization |
| Config | `src/config/index.js` | DB URI, name, upload settings |

---

## 3. Frontend Data-Fetching Flow (Reference)

### Initial Load
1. `useTopups()` mounts → `useEffect` calls `fetchTopups(1)`
2. `fetchTopups` deduplicates via `inflightRef` Map (key = `page:N`)
3. Calls `GET /api/topups?page=1&limit=20`
4. Response: `{ items: [...], total, pending, activeAudits, page, limit, totalPages }`
5. Sets state: `invoices`, `total`, `pendingCount`, `totalPages`
6. `loading` set to `false`

### Pagination
1. `goToPage(n)` → `fetchTopups(n)` → new API call with `page=n`
2. `loading` stays `false` during page transitions (no full-page spinner)
3. Only the table content updates

### Mutations (Approve/Reject/Feedback/Final-Approve/Final-Reject/Sync)
1. Action API call → returns updated invoice object
2. `patchRow(invoiceNo, updated)` — replaces the row in-place in the `invoices` array
3. `pendingCount` adjusted locally if the row crosses the pending boundary
4. **No full refetch** — the list stays intact, only the changed row updates

### Screenshot Loading
1. List rows include `paymentScreenshot` (URL string, not base64 blob)
2. `screenshots[]` array is **excluded** from list projection
3. Clicking "View Screenshot" → `openScreenshot(inv)` → `GET /api/invoices/:id` → full invoice with screenshots
4. Modal shows screenshots on demand

### Request Deduplication
```javascript
// Concurrent callers for the same page share one in-flight promise
const inflightRef = useRef(new Map());
const ongoing = inflightRef.current.get(key);
if (ongoing) return ongoing;
// ... create promise ...
inflightRef.current.set(key, promise);
```

### Stale Response Prevention
```javascript
const seqRef = useRef(0);
const seq = seqRef.current + 1;
seqRef.current = seq;
// ... async fetch ...
if (seqRef.current !== seq) return; // stale — don't update state
```

---

## 4. Backend Request-to-Database Flow (Reference)

### `GET /api/topups?page=1&limit=20`
1. Route handler calls `queryTopups({ page: 1, limit: 20 })`
2. `ensureInvoicesIndexesOnce()` — memoized index creation (runs once per process)
3. `buildTopupFilter({})` — empty filter for default view
4. **Parallel queries** via `Promise.all`:
   - `find(filter).project(TOPUP_LIST_PROJECTION).sort({ createdAtRaw: -1, date: -1 }).skip(0).limit(20).toArray()`
   - `countDocuments(filter)` — total count
   - `countDocuments(pendingFilter)` — pending count
   - `countDocuments({ approvalStatus: { $in: ACTIVE_STATES } })` — active audits count
5. Returns: `{ items, total, pending, activeAudits, page, limit, totalPages }`

### `PATCH /api/topups/:id/approve`
1. `getRequestActor(request)` — extracts actor from session
2. `approveInvoice(id, { actor })` — calls `applyAuditTransition`
3. `applyAuditTransition`: `findOne` → `updateOne` (push auditLog) → `findOne` again
4. Returns updated invoice with `mapInvoice()` normalization

### `GET /api/invoices/:id` (screenshot detail)
1. `getInvoiceByNo(invoiceNo)` — `findOne({ invoiceNo })` — returns full document
2. Includes `screenshots[]` array with URLs

---

## 5. React Query/SWR/Cache Configuration

### Reference Project
- **No React Query** — uses native `fetch` with custom hooks
- **In-memory TTL cache** (`src/lib/cache.js`):
  - `cacheGet(key, ttl=30000)` — returns cached value if fresh
  - `cacheSet(key, value, ttl=30000)` — stores with timestamp
  - `cacheInvalidate(keyPrefix)` — invalidates by prefix on mutations
  - `MAX_ENTRIES = 100` — LRU eviction
- **Aggregates memoization** (`computeInvoiceAggregates`):
  - 30s TTL cache for collection-wide aggregates
  - In-flight deduplication via `aggregatesInflight` promise
- **Index memoization** (`ensureInvoicesIndexesOnce`):
  - Runs once per process, memoized via module-level promise

### Target Project
- **React Query** (`@tanstack/react-query` v5):
  - Global config: `staleTime: 30000`, `gcTime: 5min`, `refetchOnWindowFocus: false`, `retry: 1`
  - Used on some pages (ad-accounts) but NOT on deposits, support-tickets, top-up-insights
- **SSE-based realtime** via `useSSE` hook
- **Polling fallback** at 60s intervals for badges

---

## 6. MongoDB Collections, Query Patterns, and Indexes

### Collections Used by `/topups`
| Collection | Operations |
|-----------|------------|
| `invoices` | `find` (paged, sorted), `countDocuments` (x3), `findOne`, `updateOne` |
| `customers` | Read via AppContext (pre-loaded) |

### Indexes on `invoices` Collection
```javascript
{ key: { createdAtRaw: -1, date: -1 }, name: "invoices_createdAt_date" }        // List sort
{ key: { date: 1 }, name: "invoices_date_asc" }                                  // Date-wise queries
{ key: { approvalStatus: 1, createdAtRaw: -1 }, name: "invoices_approval_status" } // Pending filter
{ key: { topupStatus: 1 }, name: "invoices_topup_status" }
{ key: { paymentStatus: 1 }, name: "invoices_payment_status" }
{ key: { paymentStatus: 1, date: 1 }, name: "invoices_payment_status_date" }
{ key: { customerId: 1 }, name: "invoices_customer_id" }
{ key: { source: 1 }, name: "invoices_source" }
{ key: { invoiceNo: 1 }, name: "invoices_invoice_no" }
{ key: { adAccountId: 1 }, name: "invoices_ad_account_id" }
{ key: { groupId: 1 }, name: "invoices_group_id" }
```

### Query Pattern → Index Mapping
| Query | Index Used |
|-------|-----------|
| `find({}).sort({ createdAtRaw: -1, date: -1 }).skip().limit()` | `invoices_createdAt_date` |
| `countDocuments({})` | Collection scan (fast for count) |
| `countDocuments({ approvalStatus: { $in: [...] } })` | `invoices_approval_status` |
| `countDocuments({ $or: [{ approvalStatus: { $in: [...] } }, { topupStatus: "Pending" }] })` | `invoices_approval_status` + `invoices_topup_status` |
| `findOne({ invoiceNo })` | `invoices_invoice_no` |

---

## 7. Pagination, Filtering, Sorting, and Search Implementation

### Reference `/topups`
- **Pagination**: Server-side `skip/limit` in MongoDB, 20 items per page
- **Filtering**: `buildTopupFilter()` builds MongoDB filter from query params (approvalStatus, paymentStatus, topupStatus, customerId, adAccount, date)
- **Search**: Regex-based on `invoiceNo`, `adAccountName`, `groupId`, `customerId` (case-insensitive)
- **Sorting**: `{ createdAtRaw: -1, date: -1 }` — newest first, indexed
- **Count queries**: 3 parallel `countDocuments` calls (total, pending, activeAudits)

---

## 8. API Response Structure and Payload Optimization

### List Response (lightweight)
```json
{
  "items": [
    {
      "invoiceNo": "ADB202610001",
      "date": "2026-10-12",
      "platform": "Meta",
      "adAccountName": "My Ad Account",
      "customerId": "CUST-001",
      "topupAmountUSD": 50.00,
      "totalAmountBDT": 6600,
      "approvalStatus": "Pending",
      "topupStatus": "Successfull",
      "createdAtRaw": "2026-10-12T10:30:00.000Z",
      "paymentScreenshot": "https://...",
      "auditLog": [{ "action": "created", "status": "Pending", "at": "..." }]
    }
  ],
  "total": 150,
  "pending": 5,
  "activeAudits": 3,
  "page": 1,
  "limit": 20,
  "totalPages": 8
}
```

### Excluded from List (Heavy Fields)
- `screenshots[]` — array of objects with URLs (can be multiple MB with base64)
- `payments[]` — payment history array
- `note` — free-text notes
- `serviceDetails`, `serviceFee` — service-specific fields

### Detail Response (on-demand)
- Full invoice document including `screenshots[]` and `payments[]`
- Fetched only when user clicks "View Screenshot"

---

## 9. Loading States, Rendering Behavior, and Perceived Performance

### Reference Loading Behavior
- **First load**: Full-page spinner (`loading ? <spinner> : <table>`)
- **Page transitions**: No spinner — table content swaps immediately
- **Mutation actions**: Per-row spinner on the action button (`busyKey` pattern)
- **Screenshot modal**: Skeleton text "Loading screenshot…" while fetching
- **Error handling**: `ErrorBanner` component with retry button
- **Empty state**: CheckCircle icon with "No Topup Records Yet"

### Key Perceived Performance Techniques
1. Server-side pagination → only 20 rows transferred, not thousands
2. Lightweight projection → no base64 blobs in list response
3. Parallel count queries → single round-trip for all counts
4. Optimistic row patching → no refetch after mutations
5. On-demand screenshot loading → list loads fast, images load when needed
6. Request deduplication → no duplicate API calls

---

## 10. Mutations, Cache Invalidation, and Realtime Update Behavior

### Reference Mutation Flow
1. User clicks "Approve" → `approveInvoice(invoiceNo)` called
2. API call → `PATCH /api/topups/:id/approve`
3. Backend: `findOne` → `updateOne` (set status, push auditLog) → `findOne` again
4. Returns updated invoice
5. Frontend: `patchRow(invoiceNo, data.invoice)` — replaces row in state
6. `pendingCount` decremented if row left pending states
7. Toast notification shown
8. **No refetch, no invalidation** — the row is already updated

### Target Project Mutation Flow (Current)
- **Deposits**: After approve/reject → `loadDeposits(page)` — full page refetch
- **Support Tickets**: After reply/status change → SSE triggers `loadTickets(page)` — full page refetch
- **Topup Insights**: No mutations (read-only page)

---

## 11. Verified Reasons Why `/topups` Loads Quickly

1. **Server-side pagination** — 20 rows per page, not the full ledger (~5k documents)
2. **Lightweight projection** — `screenshots[]`, `payments[]`, `note` excluded from list
3. **Parallel count queries** — total + pending + activeAudits in one round-trip
4. **Indexed sort** — `{ createdAtRaw: -1, date: -1 }` uses compound index
5. **Indexed counts** — `approvalStatus` and `topupStatus` indexes for pending counts
6. **On-demand detail loading** — screenshots fetched only when modal opens
7. **Optimistic row patching** — mutations update single rows without refetch
8. **Request deduplication** — prevents duplicate in-flight requests
9. **Stale response prevention** — seqRef ensures latest response wins
10. **Memoized index creation** — indexes created once per process, not per request
11. **Connection pooling** — MongoDB client reused via global promise
12. **`memo()` on view** — prevents unnecessary re-renders of the 845-line component

---

## 12. Performance Bottlenecks Discovered in the Reference Project

1. **`listTopups()` still fetches full collection** — used by older pages, downloads all invoices with `screenshots: 0` projection (still heavy)
2. **`listInvoices()` fetches all then filters client-side** — search is done in JavaScript, not in MongoDB
3. **`getCustomerTopupSummary()` fetches all customer invoices** — no pagination, loads full customer history
4. **`getSalesEntryReport()` fetches all invoices** — full collection scan for aggregation
5. **`getDailySalesReport()` fetches all invoices in date range** — no limit
6. **`computeInvoiceAggregates()` scans full collection** — memoized for 30s but first call is expensive
7. **`migrateEmbeddedPaymentScreenshots()` runs on startup** — scans all invoices for base64 data URLs
8. **`ensureLegacyInvoicesSynced()` runs on startup** — checks for legacy invoices, may trigger full sync

---

## 13. Reference Implementation Patterns Worth Reusing

| Pattern | Implementation | Benefit |
|---------|---------------|---------|
| Server-side pagination | `skip/limit` in MongoDB query | Transfers only needed rows |
| Lightweight projection | `.project({ screenshots: 0, payments: 0 })` | Excludes heavy fields from list |
| Parallel counts | `Promise.all([find, count, count, count])` | Single round-trip for all data |
| Request dedup | `inflightRef` Map with key = `page:N` | Prevents duplicate requests |
| Stale prevention | `seqRef` counter | Latest response wins |
| Optimistic patch | `patchRow(invoiceNo, updated)` | No refetch after mutation |
| On-demand detail | Separate `GET /api/invoices/:id` | Heavy fields loaded only when needed |
| Memoized indexes | `ensureInvoicesIndexesOnce()` | Indexes created once per process |
| TTL cache | 30s in-memory with LRU eviction | Avoids repeated expensive aggregations |
| In-flight dedup for aggregates | `aggregatesInflight` promise | Concurrent callers share one computation |
| `memo()` on view | `export default memo(TopupsView)` | Prevents unnecessary re-renders |

---

## 14. Target Project's Current Architecture and Problems

### Dashboard (`/admin`)
- **Single aggregated request** (good) — all stats from one API call
- **10+ parallel aggregations** in one request — efficient but slow on large collections
- **No caching** — every page load hits all aggregations
- **`initializeIndexes()` on every request** — memoized but still called
- **`startAutoMetaFetch()` at module level** — runs on every API call

### Deposit Verification
- **Server-side pagination** (good) — 20 items per page
- **Projection** excludes heavy fields (good)
- **After mutation**: Full page refetch instead of targeted row patch
- **SSE triggers full reload** — `loadDeposits(page)` refetches entire page
- **`initializeIndexes()` on every request**

### Support Tickets
- **List rows exclude replies** (good) — `TICKET_LIST_PROJECTION`
- **`getTicketStageTotals()`**: Full collection scan — `find({}).project({ status: 1 }).toArray()`
- **`getUnreadCountsByStage()`**: Another full collection scan
- **`getUnreadTicketState()`**: Multiple queries (unresolved + reads + items)
- **Count endpoint**: Calls 4 separate functions, each doing DB queries
- **In-memory pagination when uid present**: Fetches ALL tickets, then slices client-side
- **After mutation**: No targeted update — relies on SSE to trigger full reload

### Top-Up Insights
- **Monthly breakdown**: Single aggregation (good)
- **Day/month queries**: Fetch up to 10,000/500 records with `limit` but no server-side pagination
- **Client-side pagination**: `tableItems.slice()` — all data loaded upfront
- **`initializeIndexes()` on every request**

### Cross-Cutting Issues
1. **`initializeIndexes()` called on every API request** — memoized via promise but still adds overhead
2. **No request deduplication** — React Strict Mode can cause double fetches
3. **No stale response prevention** — race conditions possible
4. **No TTL caching for expensive aggregations** — dashboard aggregations re-run every time
5. **No optimistic row patching** — mutations trigger full refetches
6. **SSE triggers full page reloads** — not targeted row updates

---

## 15. Page-by-Page Optimization Plan for `ad-buzz`

### Phase A: Dashboard (`/admin`)
1. Add TTL caching for dashboard summary (30s)
2. Optimize `getTicketStageTotals()` — use aggregation instead of full scan
3. Optimize `getUnreadCountsByStage()` — use aggregation instead of full scan
4. Add request deduplication

### Phase B: Deposit Verification
1. Add optimistic row patching after approve/reject
2. Make SSE trigger targeted row update instead of full reload
3. Add request deduplication

### Phase C: Support Tickets
1. Replace `getTicketStageTotals()` full scan with aggregation
2. Replace `getUnreadCountsByStage()` full scan with aggregation
3. Add server-side pagination for unread filter (currently in-memory)
4. Add targeted row updates after reply/status change

### Phase D: Topup Insights
1. Add server-side pagination for transaction lists
2. Optimize day/month queries with proper indexing

### Phase E: All Remaining Pages
1. Apply projection best practices
2. Add request deduplication where missing
3. Ensure indexes exist for all query patterns

---

## 16. MongoDB Index Audit and Proposed Index Changes

### Current Indexes (from `lib/indexes.js`)
See the `INDEX_SPECS` array — 25 indexes across 12 collections.

### Proposed New Indexes

| Collection | Index | Supports | Notes |
|-----------|-------|----------|-------|
| `balanceLogs` | `{ type: 1, createdAt: -1 }` | Already exists | Serves insights, balance-logs |
| `balanceLogs` | `{ "metadata.accountId": 1, createdAt: -1 }` | Account-scoped topup history | May need addition |
| `supportTickets` | `{ status: 1, createdAt: -1 }` | Already exists | Serves ticket lists |
| `supportTickets` | `{ uid: 1, createdAt: -1 }` | Already exists | Serves customer ticket lists |

### Index Verification Status
- [ ] `explain("executionStats")` on representative queries
- [ ] Verify indexes exist in production MongoDB
- [ ] Check for redundant/duplicate indexes

---

## 17. Before-and-After Performance Measurements

### Reference `/topups` API
| Metric | Value |
|--------|-------|
| Response time (estimated) | 50-200ms (indexed, paginated) |
| Records fetched | 20 per page |
| Response payload | ~10-20KB (lightweight projection) |
| DB queries | 4 (1 find + 3 counts, parallel) |
| Duplicate requests | 0 (deduplicated) |

### Target Pages (Baseline → Optimized)
| Page | Metric | Before | After |
|------|--------|--------|-------|
| `/admin` | Aggregations per request | 10+ | 10+ (cached 30s) |
| `/admin` | Caching | None | 30s TTL + in-flight dedup |
| `/admin/deposits` | Mutation refetch | Full page | Optimistic row patch |
| `/admin/deposits` | Request dedup | None | inflightRef pattern |
| `/admin/support-tickets` | Full scans per count | 2 (getTicketStageTotals + getUnreadCountsByStage) | 0 (aggregation) |
| `/admin/support-tickets` | SSE trigger | Full page reload | Targeted row update |
| `/admin/top-up-insights` | Repeated monthly/range requests | Full aggregation/query each time | 30s server TTL cache + in-flight dedup for monthly summaries |

### Changes Implemented

#### 1. Support Ticket Model (`lib/supportTicketModel.js`)
- **`getTicketStageTotals()`**: Replaced `find({}).project({ status: 1 }).toArray()` full scan with `$group` aggregation
- **`getUnreadCountsByStage()`**: Replaced `find({ status: { $ne: "closed" } }).project({ status: 1 }).toArray()` full scan with `$group` aggregation + `$push` of IDs for read-set filtering

#### 2. Dashboard Summary (`app/api/admin/dashboard-summary/route.js`)
- Added 30s TTL cache for the entire dashboard summary response
- Added in-flight request deduplication via `dashboardInflight` promise
- Concurrent requests share one computation

#### 3. Deposit Verification (`app/(admin)/admin/deposits/page.jsx`)
- **Approve**: Replaced `loadDeposits(page)` with optimistic row patch — updates the single row in-place
- **Reject**: Replaced `loadDeposits(page)` with optimistic row patch — updates the single row in-place
- Added `inflightRef` request deduplication to `loadDeposits()`

#### 4. Support Tickets (`app/(admin)/admin/support-tickets/page.jsx`)
- SSE handler now does targeted row updates for the currently open ticket
- Full page reload only happens when the event is for a different ticket
- Reduces unnecessary network traffic and UI flicker

#### 5. Top-Up Insights (`app/(admin)/admin/top-up-insights/page.jsx`)
- Added `inflightRef` request deduplication to `fetchInsights()`
- Prevents duplicate requests when day + month + monthly effects trigger simultaneously
- API monthly summaries and range responses now use a short server-side TTL cache
- Monthly summary requests share one in-flight aggregation during cold loads
- Removed the unnecessary `metadata.accountId exists` filter for the all-account admin view

#### 6. Payment Methods (`app/(admin)/admin/payment-methods/page.jsx`)
- Added `inflightRef` request deduplication to `loadMethods()`
- Prevents duplicate fetches when component remounts or effects re-run

---

## 18. Tests Performed and Results

### Reference Project
- Existing test suite: `node --test tests/`
- No performance benchmarks found in test files

### Target Project
- Test suite: `node --test tests/accountMath.test.js tests/metaSyncState.test.js tests/prepaid.test.js tests/webhookAuth.test.js tests/httpUtil.test.js`
- Tests cover business logic, not performance

### Test Results (Final, After All Changes)
```
tests 33
suites 11
pass 33
fail 0
duration_ms 162.9
```
All 33 tests pass.

### Build Results (Final, After All Changes)
```
✓ Compiled successfully in 4.9s
✓ Generating static pages (72/72) in 839ms
```
Production build succeeds with no errors.

### Lint Results (Final, After All Changes)
- 44 errors, 5 warnings — all pre-existing in the codebase
- No new lint errors introduced by changes
- Pre-existing issues: `set-state-in-effect`, `refs during render`, `static-components`, `preserve-manual-memoization`

### Files Modified (Complete Summary)
| File | Change |
|------|--------|
| `lib/supportTicketModel.js` | Replaced 2 full collection scans with `$group` aggregations |
| `app/api/admin/dashboard-summary/route.js` | Added 30s TTL cache + in-flight dedup |
| `app/(admin)/admin/deposits/page.jsx` | Optimistic row patching + request dedup |
| `app/(admin)/admin/support-tickets/page.jsx` | SSE targeted updates (no full reload for open ticket) |
| `app/(admin)/admin/top-up-insights/page.jsx` | Request dedup for fetchInsights |
| `app/(admin)/admin/payment-methods/page.jsx` | Request dedup for loadMethods |

---

## 19. Unverified Assumptions and Limitations

1. **No live database access** — index verification requires `explain("executionStats")` against production MongoDB
2. **No production traffic data** — response time estimates are based on code analysis, not measurements
3. **MongoDB version unknown** — index behavior may vary by version
4. **Network latency unknown** — Atlas cluster location and latency not measured
5. **Data volume unknown** — collection sizes not verified
6. **Reference timings estimated** — no benchmark data available in reference project
7. **`initializeIndexes()` memoization** — verified in code but not under load
8. **SSE reliability** — assumed stable; reconnect behavior tested only in development
9. **Dashboard cache invalidation** — 30s TTL means stale data for up to 30s after mutations; acceptable for dashboard summaries but not for real-time displays
10. **Optimistic row patching** — assumes server returns the updated row in mutation responses; if the server fails, the row stays in its previous state (no rollback needed since the mutation failed)
11. **Aggregation vs full scan** — the new `$group` aggregations for `getTicketStageTotals()` and `getUnreadCountsByStage()` should be verified with `explain("executionStats")` to confirm index usage

---

## 20. Recommended Reusable Data-Fetching Conventions

### Frontend Conventions
1. **Server-side pagination** for all list pages — never fetch full collections
2. **Lightweight projections** — exclude heavy sub-documents (screenshots, replies, payments) from list views
3. **On-demand detail loading** — fetch heavy fields only when user opens a detail view
4. **Request deduplication** — use `inflightRef` pattern for concurrent requests
5. **Stale response prevention** — use `seqRef` counter pattern
6. **Optimistic row patching** — after mutations, patch the row in-place instead of refetching
7. **`memo()` on view components** — prevent unnecessary re-renders
8. **Parallel independent requests** — use `Promise.all` for independent data

### Backend Conventions
1. **Push filtering/sorting/pagination to MongoDB** — never fetch all then filter in JS
2. **Use `Promise.all` for independent queries** — parallelize counts and data fetch
3. **Create indexes for every query pattern** — idempotent, memoized
4. **Use projections** — exclude heavy fields from list responses
5. **Memoize expensive aggregations** — TTL cache with in-flight deduplication
6. **Return updated row from mutations** — enables optimistic patching
7. **Use connection pooling** — reuse MongoDB client across requests
8. **Debounce search inputs** — prevent every keystroke from hitting the database

### Cache Correctness Rules
1. Never mix data belonging to different users or authorization scopes
2. Mutations must invalidate or update all affected cached queries
3. Optimistic updates must be validated by server response
4. SSE events should reconcile with server, not trust payload counts
5. Stale data must never be presented as freshly verified
