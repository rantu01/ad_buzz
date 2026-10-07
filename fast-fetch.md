# Fast-Fetch Reference — How `/topups` in `adsbuzz-ui-next` Loads So Fast

Source project: `D:\Code\Project\Office Work\AD accont\adsbuzz-ui-next`
Source page: `http://localhost:3000/topups` → `src/app/topups/page.jsx`
Source API: `GET /api/topups?page=&limit=` → `src/app/api/topups/route.js`
Analyzed: 2026-10-07. All paths below are relative to the source project root.

Purpose: give OpenCode a copy-pasteable playbook to replicate this
high-performance list-fetching approach in another project (e.g. `ad-buzz`).
Nothing in the source project was modified for this doc.

---

## 1. TL;DR — why it feels instant

1. **Server-side pagination only.** The client never downloads the ledger.
   `PAGE_LIMIT = 20`, `GET /api/topups?page=N&limit=20`, MongoDB does
   `find(filter).project(...).sort(...).skip(...).limit(...)`. Only 20
   lightweight rows cross the wire per page.
2. **Tight MongoDB projection.** `TOPUP_LIST_PROJECTION` (17 fields) excludes
   MB-size blobs (`screenshots`, `payments`, `note`, service details).
   Heavy data loads on demand via `GET /api/invoices/[invoiceNo]`.
3. **Indexes match the query shape.** 11 indexes on `invoices`, notably the
   compound sort index `{ createdAtRaw: -1, date: -1 }` that serves the
   topups sort exactly. Indexes are ensured once per process.
4. **One shared `MongoClient` promise.** `src/lib/db.js` reuses a single
   connection (global in dev), so no connect handshake per request.
5. **Parallel data + counts.** `Promise.all([paged find, count(filter),
   count(pending), count(activeAudits)])` — 4 queries in one round trip
   instead of sequential awaits.
6. **No full refetch on mutation.** PATCH actions return the updated row;
   the client `patchRow()` splices it into state and adjusts badge counts
   locally.
7. **In-flight dedupe + stale-response guard** in the hook (Map of promises
   + sequence numbers) prevents StrictMode double-fetch and race overwrites.
8. **Deliberately NO cache layer on this route.** Speed comes from small
   payload + indexes, not from Redis/ISR/React-Query. `apiFetch` uses
   `cache: 'no-store'`. The in-memory `lib/cache.js` (30s TTL) exists but is
   **not** used by `GET /api/topups`. No `revalidate`, no `Cache-Control`,
   no `react-query/SWR`.

> Replicate items 1–6. Item 8 is a gap: add caching only after 1–6 are in place.

---

## 2. End-to-end architecture

```
Browser
  src/app/topups/page.jsx (49 lines, thin 'use client' wrapper)
    └─ src/hooks/useTopups.js (224 lines, state + fetch + mutations)
    └─ src/components/views/TopupsView.jsx (845 lines, memo table + modals)
         └─ src/components/common/Pagination.jsx (Prev/Next only)
         └─ fetch() via src/utils/api.js apiFetch() { cache: 'no-store' }
              │
              ▼
Next.js Route Handler
  src/app/api/topups/route.js (46 lines)
    └─ firstParam() alias normalization + Number(page)||1 / ||20
    └─ queryTopups() from src/models/invoiceModel.js
              │
              ▼
Model (no controller/service/repository layers exist in this project)
  src/models/invoiceModel.js
    ├─ buildTopupFilter()      (~lines 1298-1357)
    ├─ TOPUP_LIST_PROJECTION   (~lines 1273-1292)
    ├─ queryTopups()           (~lines 1366-1429)
    ├─ ensureInvoicesIndexesOnce() (~lines 101-110)
    └─ getCollection('invoices') from src/lib/db.js (native mongodb driver v7.5.0)
              │
              ▼
MongoDB `invoices` collection (topups = invoices with serviceType "Ad Account Topup")
```

Key fact: `src/` has **no** `controllers/`, `services/`, or `repositories/`
directories. Route → model function → native driver. There is no Mongoose
(hence no `.lean()` / `.select()` — the equivalents are `.project()` +
stripping `_id` in `mapInvoice()`).

---

## 3. Frontend data-fetching (`src/hooks/useTopups.js` + `page.jsx`)

### 3.1 Thin page component

`src/app/topups/page.jsx:1-49`:

```jsx
'use client';
import { useApp } from '@/context/AppContext';
import TopupsView from '@/components/views/TopupsView';
import { useTopups } from '@/hooks/useTopups';

export default function TopupsPage() {
  const app = useApp();
  const { invoices, loading, error, page, totalPages, total,
    pendingCount, limit, goToPage, approveInvoice, /* ... */ refetch }
    = useTopups(app.triggerToast);
  return <TopupsView invoices={invoices} /* ... */ onPageChange={goToPage} />;
}
```

No data logic, no `Suspense`, no `dynamic`/`lazy`, no `useMemo`, no search
state here. All fetching lives in the hook; all rendering in the view.

### 3.2 Hook essentials to copy

File: `src/hooks/useTopups.js`

```js
const PAGE_LIMIT = 20; // line 4

export function useTopups(triggerToast) {
  // Only the current server page lives in state — never the full ledger. (line 13)
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [pendingCount, setPendingCount] = useState(0);

  // Dedupe + race guard (lines 22-26, 28-69)
  const inflightRef = useRef(new Map()); // key `page:N` → promise
  const seqRef = useRef(0);              // monotonic request id

  const fetchTopups = useCallback(async (targetPage = 1) => {
    const safePage = Number.isFinite(Number(targetPage)) && Number(targetPage) > 0
      ? Math.floor(Number(targetPage)) : 1;
    const key = `page:${safePage}`;
    const ongoing = inflightRef.current.get(key);
    if (ongoing) return ongoing;         // share in-flight (StrictMode-safe)

    const seq = seqRef.current + 1;
    seqRef.current = seq;

    const promise = (async () => {
      try {
        const data = await apiFetch(`/api/topups?page=${safePage}&limit=${PAGE_LIMIT}`);
        if (seqRef.current !== seq) return data.items || data.topups || []; // drop stale
        setInvoices(data.items || data.topups || []);
        setPage(data.page || safePage);
        setTotal(Number(data.total) || 0);
        setTotalPages(Math.max(1, Number(data.totalPages) || 1));
        setPendingCount(data.activeAudits !== undefined
          ? Number(data.activeAudits) || 0 : Number(data.pending) || 0);
        setError(null);
        return data.items || data.topups || [];
      } catch (err) {
        if (seqRef.current !== seq) throw err;
        setError(err);
        triggerToast('error', 'Load Failed', getErrorMessage(err));
        throw err;
      } finally {
        inflightRef.current.delete(key);
        if (seqRef.current === seq) setLoading(false);
      }
    })();
    inflightRef.current.set(key, promise);
    return promise;
  }, [triggerToast]);

  useEffect(() => { fetchTopups(1); }, [fetchTopups]);
  const goToPage = useCallback((nextPage) => fetchTopups(nextPage), [fetchTopups]);
}
```

Notes:

- **No `react-query`/`SWR`/`axios`.** `package.json` deps are
  `next, react, react-dom, mongodb, firebase, firebase-admin, cloudinary,
  pdfkit, lucide-react, motion, recharts` — zero data-fetching libs.
  `src/utils/api.js:3-8` is a thin `fetch` wrapper with `cache: 'no-store'`.
- **No prefetching, no infinite scroll, no debounce, no `useMemo`.**
  Pagination is classic server-side `?page=&limit=` with a Prev/Next
  `Pagination.jsx` (`if (totalPages <= 1) return null`).
- **Whole-view `memo()` only** (`TopupsView.jsx:845: export default memo(TopupsView)`).
  No row memoization — fine at 20 rows/page, do not copy for large tables
  without adding `React.memo` rows / virtualization.

### 3.3 Mutation without refetch (`patchRow`, lines 80-93)

```js
// After a workflow action the backend returns the updated row: patch it in
// place and adjust the server-provided pending count locally — no full refetch.
const patchRow = useCallback((invoiceNo, updated) => {
  setInvoices(prev => prev.map(inv => {
    if (inv.invoiceNo !== invoiceNo) return inv;
    if (isActiveAudit(inv) && !isActiveAudit(updated)) {
      setPendingCount(c => Math.max(0, c - 1));
    } else if (!isActiveAudit(inv) && isActiveAudit(updated)) {
      setPendingCount(c => c + 1);
    }
    return updated;
  }));
}, []);

// e.g. lines 95-110
const approveInvoice = useCallback(async (invoiceNo) => {
  const data = await apiFetch(`/api/topups/${encodeURIComponent(invoiceNo)}/approve`, { method: 'PATCH' });
  patchRow(invoiceNo, data.invoice); // <- no fetchTopups() call
  triggerToast('success', 'Topup Approved', `Invoice ${invoiceNo} approved and settled.`);
  return data.invoice;
}, [triggerToast, patchRow]);
```

Same pattern for `reject / feedback / final-approve / final-reject / sync`
(lines 112-199). Per-row spinner via `busyKey` in the view
(`runAction(key, fn)`, `TopupsView.jsx:165-175`). No optimistic rollback —
failure only toasts.

### 3.4 Heavy blobs load on demand (`TopupsView.jsx:133-147`)

```js
// The invoices list no longer carries the heavy `screenshots` blobs (they made
// the list response huge and timed out). Load the full invoice — including its
// screenshots — on demand when the user explicitly wants to view them.
const openScreenshot = async (inv) => {
  setScreenshotTarget(inv);
  setScreenshotLoading(true);
  try {
    const data = await apiFetch(`/api/invoices/${encodeURIComponent(inv.invoiceNo)}`);
    if (data?.invoice) setScreenshotTarget(data.invoice);
  } catch { /* keep list record as fallback */ }
  finally { setScreenshotLoading(false); }
};
```

`collectScreenshots()` (lines 70-102) only reads `paymentScreenshot`; the
`screenshots[]` loop is commented out. This is the single biggest historical
win: previously embedded base64 data URLs (2–3 MB each) stalled list reads
for minutes (see `invoiceModel.js:112-120` comment).

---

## 4. API route pattern (`src/app/api/topups/route.js`, 46 lines)

```js
import { asyncHandler, ok } from "@/utils/http";
import { queryTopups } from "@/models/invoiceModel";

function firstParam(searchParams, names) { // lines 4-10: alias-tolerant param read
  for (const name of names) {
    const value = searchParams.get(name);
    if (value !== null && String(value).trim() !== "") return String(value).trim();
  }
  return "";
}

export const GET = asyncHandler(async (request) => {
  const { searchParams } = new URL(request.url);
  const onlyPending = searchParams.get("scope") === "pending";
  const result = await queryTopups({
    search: firstParam(searchParams, ["search", "q"]),
    onlyPending,
    approvalStatus: firstParam(searchParams, ["approvalStatus", "approval"]),
    paymentStatus: firstParam(searchParams, ["paymentStatus", "payment"]),
    topupStatus: firstParam(searchParams, ["topupStatus", "topup"]),
    customerId: firstParam(searchParams, ["customerId", "customer"]),
    adAccount: firstParam(searchParams, ["adAccount", "account"]),
    date: firstParam(searchParams, ["date", "month"]),
    page: Number(searchParams.get("page")) || 1,
    limit: Number(searchParams.get("limit")) || 20,
  });
  return ok({ // dual key for backward compat (lines 36-45)
    topups: result.items, items: result.items,
    total: result.total, pending: result.pending,
    activeAudits: result.activeAudits,
    page: result.page, limit: result.limit, totalPages: result.totalPages,
  });
});
```

Conventions to replicate:

- `asyncHandler` + `ok()`/`fail()` from `src/utils/http.js` — plain
  `NextResponse.json({ success: true, ...data })`. No `Cache-Control`,
  no `export const revalidate/dynamic/fetchCache` on this route.
- Alias-tolerant query params (`search|q`, `customerId|customer`, …) via
  `firstParam()`. Numbers parsed with `Number(x) || default`; hard clamp
  happens in the model (`limit ≤ 100`).
- Response always includes `{ items, total, page, limit, totalPages }` plus
  badge counts, so the client never derives pagination itself.
- Thin route: zero business logic; everything delegated to `queryTopups()`.
- Mutation routes are one-liners too, e.g.
  `src/app/api/topups/[id]/approve/route.js:5-13`:
  `approveInvoice(id, { actor })` → `ok({ message, invoice })`.

---

## 5. Database optimization (`src/models/invoiceModel.js` + `src/lib/db.js`)

### 5.1 Connection reuse — `src/lib/db.js:1-35`

```js
import { MongoClient } from "mongodb";
import config from "@/config"; // db.uri = MONGODB_URI, db.name = MONGODB_DB_NAME || "ad_buzz"
let client; let clientPromise;
if (config.isDevelopment) {
  if (!global._adsbuzzMongoClientPromise) {
    client = new MongoClient(config.db.uri);
    global._adsbuzzMongoClientPromise = client.connect();
  }
  clientPromise = global._adsbuzzMongoClientPromise; // survives HMR
} else {
  client = new MongoClient(config.db.uri);
  clientPromise = client.connect(); // reused via module scope
}
export async function getClient() { return clientPromise; }
export async function getDb() { return (await getClient()).db(config.db.name); }
export async function getCollection(name) { return (await getDb()).collection(name); }
```

No `maxPoolSize` tuning — driver defaults. No per-request connect.
`src/config/index.js:14-17` holds only `uri`/`name`.

### 5.2 Projection — `invoiceModel.js:1264-1292`

```js
const TOPUP_LIST_PROJECTION = {
  invoiceNo: 1, date: 1, platform: 1, adAccountName: 1, adAccountId: 1,
  customerId: 1, groupId: 1, topupAmountUSD: 1, totalAmountBDT: 1,
  paidAmountBDT: 1, dueAmountBDT: 1, paymentStatus: 1, paymentMethod: 1,
  approvalStatus: 1, topupStatus: 1, createdAtRaw: 1,
  paymentScreenshot: 1, auditLog: 1,
};
// Excluded: screenshots, payments, note, service detail fields → on-demand load.
```

Applied as `.project(TOPUP_LIST_PROJECTION)`. This is the native-driver
equivalent of Mongoose `.select()`; there is no `.lean()` (no Mongoose).

### 5.3 Filter builder — `invoiceModel.js:1298-1357`

Equality filters for exact fields; escaped case-insensitive regex only for
free-text (`search`, `adAccount`); prefix regex for month (`date.length===7`
→ `{ date: { $regex: '^YYYY-MM' } }`, else exact `{ date }`).
`escapeRegExp()` prevents regex injection. Empty filter short-circuits to
`{}` (single clause returned unwrapped, avoiding a needless `$and`).

### 5.4 Core query — `queryTopups()`, `invoiceModel.js:1366-1429`

```js
export async function queryTopups({ search="", onlyPending=false, /* ... */ page=1, limit=20 } = {}) {
  await ensureInvoicesIndexesOnce();              // memoized, idempotent
  const invoicesCollection = await getCollection("invoices");
  const filter = buildTopupFilter({ search, onlyPending, /* ... */ });
  const safePage = Number.isFinite(Number(page)) && Number(page) > 0 ? Math.floor(Number(page)) : 1;
  const rawLimit = Number(limit);
  const safeLimit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 100) : 20;
  const skip = (safePage - 1) * safeLimit;

  const pendingFilter = { $or: [
    { approvalStatus: { $in: AUDIT_ACTIVE_STATES } }, { topupStatus: "Pending" } ] };

  const [items, total, pending, activeAudits] = await Promise.all([
    invoicesCollection.find(filter)
      .project(TOPUP_LIST_PROJECTION)
      .sort({ createdAtRaw: -1, date: -1 })
      .skip(skip).limit(safeLimit).toArray(),
    invoicesCollection.countDocuments(filter),
    invoicesCollection.countDocuments(pendingFilter),
    invoicesCollection.countDocuments({ approvalStatus: { $in: AUDIT_ACTIVE_STATES } }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / safeLimit));
  return {
    items: items.map(({ _id, ...rest }) => mapInvoice(rest)), // strip _id, normalize
    total, pending, activeAudits, page: safePage, limit: safeLimit, totalPages,
  };
}
```

Rules embedded here:

- Clamp `limit ≤ 100`, default 20; `skip = (page-1) * limit` in Mongo, not JS.
- `countDocuments(filter)` (accurate for filtered totals), **not**
  `estimatedDocumentCount` (cannot take a filter — correctly avoided).
- `Promise.all` for data + 3 counts concurrently.
- No aggregation for the list (`$facet` only in `computeInvoiceAggregates()`
  for dashboards). Legacy `listTopups()` (lines 1437-1477) that did full
  `.find().toArray()` + in-JS `.filter()` is dead for this route — do not copy.

### 5.5 Indexes — `invoiceModel.js:66-110`

```js
const INVOICE_INDEXES = [
  { key: { createdAtRaw: -1, date: -1 }, name: "invoices_createdAt_date" }, // ← topups sort
  { key: { date: 1 },                    name: "invoices_date_asc" },
  { key: { approvalStatus: 1, createdAtRaw: -1 }, name: "invoices_approval_status" },
  { key: { topupStatus: 1 },             name: "invoices_topup_status" },
  { key: { paymentStatus: 1 },           name: "invoices_payment_status" },
  { key: { paymentStatus: 1, date: 1 },  name: "invoices_payment_status_date" },
  { key: { customerId: 1 },              name: "invoices_customer_id" },
  { key: { source: 1 },                 name: "invoices_source" },
  { key: { invoiceNo: 1 },              name: "invoices_invoice_no" },
  { key: { adAccountId: 1 },            name: "invoices_ad_account_id" },
  { key: { groupId: 1 },                name: "invoices_group_id" },
];

export async function ensureInvoicesIndexes() {
  const c = await getCollection("invoices");
  await Promise.all(INVOICE_INDEXES.map(({ key, name }) => c.createIndex(key, { name })));
}
let indexesPromise = null;
export function ensureInvoicesIndexesOnce() { // memoized per process
  if (!indexesPromise) {
    indexesPromise = ensureInvoicesIndexes().catch((e) => { indexesPromise = null; throw e; });
  }
  return indexesPromise;
}
```

`queryTopups()` awaits `ensureInvoicesIndexesOnce()` first — index creation is
idempotent (`createIndex` with names) and runs at most once per server
process. Code comment (lines 86-89): the shared MongoDB instance is
"pathologically slow for unindexed scans/sorts" so lists rely on these.

Known gap: free-text `search`/`adAccount` regexes are unindexed scans,
mitigated only by pagination + projection. A MongoDB text index or
Atlas Search would be the next step (not currently implemented).

### 5.6 Payload hygiene (historical fix — biggest win)

`invoiceModel.js:112-120` + `src/utils/upload.js` + `src/utils/api.js:43-54`:

- Old bug: sale checkout embedded full base64 image data URLs (2–3 MB each)
  in `paymentScreenshot`/`screenshots`, making list responses megabytes and
  stalling pages for minutes on throttled connections.
- Fix: `uploadScreenshot()` persists to Cloudinary (`secure_url` when
  configured) or `/uploads/...` and stores only the URL; a one-time
  idempotent migration rewrote legacy docs. List projection now excludes
  `screenshots` entirely.

---

## 6. Caching strategy (honest account — mostly ABSENT on this route)

| Layer | Implementation | Used by `/topups`? |
|---|---|---|
| Next.js fetch / route cache | `src/utils/api.js:5` forces `cache: 'no-store'` on every client fetch | Explicitly disabled |
| ISR / `revalidate` / `fetchCache` / `Cache-Control` | None on topups route or `next.config.mjs` | No |
| React-Query / SWR `staleTime` / `gcTime` / `keepPreviousData` / `prefetch` | No such dependency; hand-rolled hook | No |
| In-memory TTL cache `src/lib/cache.js` (`Map`, `DEFAULT_TTL = 30_000`, `MAX_ENTRIES = 100`, FIFO evict, `cacheGet/cacheSet/cacheInvalidate`) | Used by `invoices`, `customers`, `ad-accounts`, `topup-summary`, `monthly-insights` routes (key `GET:<path>:<url>`, writes invalidate by prefix) | **Not used by `GET /api/topups`** |
| RBAC permission cache `src/middlewares/rbac.js:6-8` (`CACHE_TTL_MS = 30_000`) | Caches role map | Not on topups path (route has no auth call) |
| MongoDB connection reuse (`src/lib/db.js`) | Module-global promise | Yes — the effective "cache" |
| Read-path index memo (`ensureInvoicesIndexesOnce`) | Per-process promise | Yes |
| Client in-flight dedupe (`inflightRef` Map) + seq guard | Per-hook | Yes |

`next.config.mjs` (15 lines): only `reactStrictMode: true`,
`images: { unoptimized: true }`, `serverExternalPackages: ['pdfkit']`.
No `headers()` cache policy, no PPR/ISR flags.

`src/middleware.js` (Edge): skips all `/api/*` (`SKIP_PREFIXES` includes
`/api/`); only redirects page visits without a session cookie to `/login`.
No API caching/auth logic.

Implication for replication: the page is fast **without** HTTP or
query-result caching. Add caching as an enhancement (e.g. 15–30s TTL on
`pending`/`activeAudits` badge counts, or `lib/cache.js` on the list route
with prefix invalidation on PATCH), not as the foundation.

---

## 7. Other contributing techniques

- **Flat response contract.** `{ items, total, pending, activeAudits, page,
  limit, totalPages }` — client renders directly, zero client-side
  filter/sort/count. (`TopupsView.jsx:149-160`: `pagedInvoices = invoices`.)
- **Global `loading.jsx` only** (`src/app/loading.jsx:1-10`, spinner + text).
  No `/topups/loading.jsx`, no `<Suspense>` streaming — client `loading` flag
  drives the spinner (`TopupsView.jsx:309-314`). `layout.jsx:77` is an async
  server layout with per-request auth guard, no Suspense boundary.
- **Central error wrapper.** `asyncHandler` in `src/utils/http.js:53-61`
  converts throws (incl. Mongo duplicate-key 11000 → 409) to JSON; client
  `apiFetch` throws structured `err.status/details`, `getErrorMessage()`
  normalizes display.
- **Pagination defaults vary by domain** (from repo-wide grep):
  `topups: 20`, `invoice-pages: 10`, `customers/ad-accounts: 50`,
  `cards: 200`, `invoices route MAX_PAGE_LIMIT: 200` with `limit=0` =
  everything. Keep list limits small (10–50); reserve large limits for
  exports.
- **No instrumentation.** No `instrumentation.*`, no per-query timing /
  `explain()`. Logging is `src/utils/logger.js` (levels only). Add
  `console.time`/APM around `queryTopups` when porting if you need proof.

---

## 8. Replication recipe for OpenCode (target: `ad-buzz` repo)

Apply in this order. Adapt `getCollection`/`ok`/`asyncHandler` names to the
target repo (`ad-buzz` uses `lib/mongodb.js` + `clientPromise`, and
`app/api/admin/*` routes — same ideas apply).

### Step 1 — Server-side pagination + clamped limits (model)

```js
// models/<domain>Model.js
const LIST_PROJECTION = { /* only columns the table renders + badge fields */ };
export async function queryPaged({ page = 1, limit = 20, /* filters */ } = {}) {
  await ensureIndexesOnce();
  const col = await getCollection("<collection>");
  const filter = buildFilter({ /* ... */ }); // === {} when no filters
  const safePage = Number.isFinite(+page) && +page > 0 ? Math.floor(+page) : 1;
  const safeLimit = Number.isFinite(+limit) && +limit > 0 ? Math.min(Math.floor(+limit), 100) : 20;
  const skip = (safePage - 1) * safeLimit;
  const [items, total] = await Promise.all([
    col.find(filter).project(LIST_PROJECTION).sort({ createdAtRaw: -1 }).skip(skip).limit(safeLimit).toArray(),
    col.countDocuments(filter),
  ]);
  return { items: items.map(({ _id, ...r }) => r),
    total, page: safePage, limit: safeLimit, totalPages: Math.max(1, Math.ceil(total / safeLimit)) };
}
```

### Step 2 — Projection discipline

- List projection: identity + amount + status + badge-presence fields only.
- Exclude arrays/blobs (`screenshots`, `payments`, `note`, base64).
- Full document only on `GET /api/<domain>/[id]` for modals.
- Never store base64 in list-read documents; upload binaries to
  Cloudinary/uploads and store URLs (see source `uploadScreenshot()`).

### Step 3 — Indexes matching sort + filters

```js
const INDEXES = [
  { key: { createdAtRaw: -1, date: -1 }, name: "<col>_createdAt_date" }, // must match .sort()
  { key: { status: 1, createdAtRaw: -1 }, name: "<col>_status" },         // filtered badge queries
  { key: { customerId: 1 }, name: "<col>_customer_id" },
  { key: { invoiceNo: 1 },  name: "<col>_invoice_no" },
];
let p = null;
export function ensureIndexesOnce() {
  if (!p) p = (async () => {
    const c = await getCollection("<col>");
    await Promise.all(INDEXES.map(({ key, name }) => c.createIndex(key, { name })));
  })().catch((e) => { p = null; throw e; });
  return p;
}
// await ensureIndexesOnce() at the top of every list query.
```

### Step 4 — Thin API route

```js
import { asyncHandler, ok } from "@/utils/http"; // or target-repo equivalent
import { queryPaged } from "@/models/<domain>Model";
export const GET = asyncHandler(async (request) => {
  const sp = new URL(request.url).searchParams;
  const result = await queryPaged({
    page: Number(sp.get("page")) || 1,
    limit: Number(sp.get("limit")) || 20,
    search: (sp.get("search") || sp.get("q") || "").trim(),
    // ... other filters
  });
  return ok({ items: result.items, ...result }); // keep `items` canonical
});
```

Return `{ items, total, page, limit, totalPages }` (+ badge counts) so the
client never computes pagination.

### Step 5 — Hook with dedupe + stale guard + patch-in-place

Copy `useTopups.js:22-78` (inflight Map + seq guard) verbatim, rename
`PAGE_LIMIT` per table (20 is a good default). Mutations must return the
updated row and call `patchRow(id, updated)` instead of refetching the page.
Adjust badge counts locally when a row crosses the pending boundary
(`useTopups.js:83-93`).

### Step 6 — Shared MongoClient (if target lacks it)

```js
import { MongoClient } from "mongodb";
let p;
if (process.env.NODE_ENV !== "production") {
  global._mongo ??= new MongoClient(process.env.MONGODB_URI).connect();
  p = global._mongo;
} else { p = new MongoClient(process.env.MONGODB_URI).connect(); }
export const getCollection = async (n) => (await p).db(process.env.MONGODB_DB_NAME).collection(n);
```

### Step 7 — Optional caching (do last)

- Badge counts (`pending`/`activeAudits`): cache 15–30s; invalidate on PATCH.
  Source `lib/cache.js:11-34` (`cacheGet/cacheSet/cacheInvalidate(prefix)`,
  30s TTL, 100-entry FIFO) is a proven minimal template — it is already used
  by sibling routes (`invoices`, `customers`, `ad-accounts`).
- Do **not** cache the paged list with a long TTL on write-heavy queues;
  the 20-row indexed query is already cheap.

---

## 9. Gaps / do-not-copy list

1. `GET /api/topups` has **no auth check** (no `requireAuth/requireStaff`
   call, unlike sibling domains). Always add auth in the target project.
2. **3 `countDocuments` per page load** (`filter`, `pendingFilter`,
   `activeAudits`). Fine at this scale, but the two unfiltered badge counts
   are cache candidates.
3. Regex `search`/`adAccount` filters are **unindexed scans**. Keep them, but
   consider a MongoDB text index / Atlas Search if the collection grows.
4. `goToPage` sets `setLoading(false)` (`useTopups.js:75-77`) — page changes
   show no loading state. Prefer `setLoading(true)` or skeleton.
5. `TopupsView` mounts 6 modals unconditionally and re-renders all 20 rows on
   any state change (only whole-view `memo`). Fine here; add row memo /
   `dynamic` imports for heavier tables.
6. `layout.jsx` auth guard blocks streaming (no `Suspense` boundary). Add
   route-level `loading.jsx` + Suspense when porting if first paint matters.

---

## 10. File reference (source project)

| Concern | File | Key lines |
|---|---|---|
| Page wrapper | `src/app/topups/page.jsx` | 1-49 |
| Fetch hook | `src/hooks/useTopups.js` | 1-224 (fetch 28-69, patch 83-93) |
| Table view | `src/components/views/TopupsView.jsx` | on-demand load 133-147, paging 149-160 |
| Pagination UI | `src/components/common/Pagination.jsx` | 5-28 |
| List API | `src/app/api/topups/route.js` | 1-46 |
| Mutation API (example) | `src/app/api/topups/[id]/approve/route.js` | 1-13 |
| Model: indexes | `src/models/invoiceModel.js` | 66-110 |
| Model: projection | `src/models/invoiceModel.js` | 1264-1292 |
| Model: filter | `src/models/invoiceModel.js` | 1298-1357 |
| Model: paged query | `src/models/invoiceModel.js` | 1366-1429 |
| DB singleton | `src/lib/db.js` | 1-35 |
| TTL cache (unused by topups) | `src/lib/cache.js` | 1-40 |
| Fetch wrapper | `src/utils/api.js` | 1-29, upload 43-54 |
| HTTP helpers | `src/utils/http.js` | 25-31, 53-81 |
| App config | `src/config/index.js` | 1-38 |
| Edge middleware | `src/middleware.js` | `SKIP_PREFIXES` incl. `/api/` |
| Deps / scripts | `package.json` | 1-33 (no query lib) |
| Next config | `next.config.mjs` | 1-15 |

Verification performed: read each file above in full (except 845-line view
and 1877-line model, read in relevant ranges) plus repo-wide grep for
`cache|revalidate|staleTime|gcTime|prefetch|lean|index|limit|skip` and
`Glob` confirming no `controllers/services/repositories` layers.
