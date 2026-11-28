# TODO — Ad Buzz chat, calling & branding work

## Bug fixes (2026-11-26) — complete
- [x] Fixed `.find is not a function` crash for users with unread counts by
      normalizing both numeric (API) and array (SSE) `unread` shapes, plus
      defensive array guards in the data layer and routes.
- [x] Fixed internal Chat image preview: attachment GET now authorizes
      `<img>`/`<a>` subresource requests via a uid param while enforcing staff
      role + conversation membership (verified with real PNG and tokens).

## Performance pass (2026-11-26) — complete
- [x] Measured actual before/after API latency with real tokens (no invented numbers).
- [x] Removed sequential DB round trips (auth, role lookup, N+1 user reads,
      post-write conversation reads, count/aggregation).
- [x] Atomic conversation upsert + unique key + `clientId` idempotency in both systems.
- [x] Optimistic conversation opening and sending with retry, caches, coalesced
      SSE refreshes, cursor pagination, memoization, lazy images.
- [x] Fast SSE reconnect + resync hook; unread/notification reconciliation.
- [x] Desktop notifications with one-time permission, dedupe, hidden-tab gating.
- [x] `npm test` 45/45, `npm run build`, lint (no new errors), SSE + idempotency smoke tests.

### Remaining verification (needs staging devices)
- [ ] Real two-device WebRTC (voice/video) and mobile rendering.
- [ ] Browser notification permission UX in a real browser (cannot be automated
      from this environment).
- [ ] Web Push after browser close — requires service worker + VAPID keys, not
      present; documented as a limitation rather than faked.

## Phase 1 — Codebase analysis (complete)
- [x] Map project structure, auth/roles, SSE realtime transport, DB models/indexes.
- [x] Trace System A (customer ↔ admin) chat + call flow end to end.
- [x] Identify customer-call root causes (unassigned conversation + disabled button,
      single-uid signaling with no staff-channel fallback, no `chat:call` listener,
      no ICE buffering, no authorization).
- [x] Locate all user-facing legacy branding strings.
- [x] Record findings in `backend_analysis.md`.

## Phase 2 — Documentation (complete)
- [x] `backend_analysis.md` — architecture, defects, DB/API plan.
- [x] `todo.md` — ordered implementation checklist.
- [x] `progress.md` — progress log (updated as work landed).
- [x] `api_status.md` — new/changed endpoint + event status.

## Phase 3 — Internal Admin/Staff chat (complete)
- [x] `lib/internalChatModel.js` — conversations/messages/calls, membership checks,
      unread counters, get-or-create with race-safe canonical key.
- [x] Indexes for the three new collections in `lib/indexes.js`.
- [x] Presence helpers in `lib/sseManager.js` (`getOnlineUids`, `isUidOnline`,
      `internal:presence`) and staff-only channel hardening in `app/api/events/route.js`.
- [x] Internal APIs (verified token + staff role on every route):
      users, conversations, messages, read, unread, typing, attachments,
      calls, signal.
- [x] `app/(admin)/admin/internal-chat/page.jsx` + components: directory/new
      chat, conversation list, thread, bubbles, composer, call history,
      responsive layouts, skeletons/empty/error states, toasts.
- [x] Sidebar navigation item with unread badge.
- [x] Realtime wiring: `internal:message`, `internal:read`, `internal:signal`,
      `internal:call`, `internal:typing`, `internal:presence`.

## Phase 4 — Customer → Admin calling fix (complete)
- [x] Enable customer call button when a conversation exists; target assigned
      staff when available, otherwise broadcast to the staff channel.
- [x] Server-side resolution/fan-out of offers + accepted marker in
      `/api/chat/signal`; existing event names and payload shapes preserved.
- [x] Auto-assign accepting staff to unassigned conversations in
      `/api/chat/calls`; validate caller membership and receiver role.
- [x] Add ICE buffering, video support and cleanup to `CentralCallProvider`
      without breaking existing customer voice calls.
- [x] Verify System A history/APIs unchanged; no data migration.

## Phase 5 — Branding (complete)
- [x] Replaced all 10 `AdsFixer` strings with `Ad Buzz` in
      `UserChatInterface.jsx` and `NewTicketModal.jsx`.
- [x] Root metadata title `Adsbuzz Portal` → `Ad Buzz Portal`.
- [x] Re-scanned case-insensitively; no user-facing legacy name remains.

## Phase 6 — Verification
- [x] `npm test` (45/45), `npm run build` (115 routes), `npm run lint` (no new
      errors in changed files; pre-existing unrelated errors remain).
- [x] API/data-layer smoke test with real Firebase user uids against MongoDB
      (no dummy data; test records removed afterwards).
- [ ] Manual two-device WebRTC checklist (needs staging devices, HTTPS,
      camera/mic): voice, video, accept/reject/missed, mute/camera, ICE on a
      lossy network, navigation cleanup, customer call to unassigned chat.

## Remaining / known limitations
- [ ] SSE manager is in-process; multi-process deployments need shared pub/sub
      (documented limitation; no second realtime architecture introduced).
- [ ] Live WebRTC verification cannot be completed from a code-only environment.
- [ ] Pre-existing chat/call endpoints still trust `uid` for backwards
      compatibility; new internal endpoints use verified tokens. SSE streams
      still identify clients by uid query param (existing convention).

## Notice & Announcement Management System (2026-11-28) — complete
- [x] Analyse existing architecture and reuse notification/SSE/RBAC patterns.
- [x] `notices` + `noticeRecipients` collections with indexes and safe upserts.
- [x] Admin CRUD, publish, schedule, archive, delete-draft and revision flows.
- [x] Rich text editor (Bengali/English), audience picker, structured changes.
- [x] Customer modal queue + Notice Center with server-side read/ack tracking.
- [x] Global (one document, lazy recipients) and individual/multi targeting.
- [x] Auth/authorization on every API; customer identity from verified token.
- [x] RBAC permissions + nav items on both panels; `Ads Buzz` branding only.
- [x] Tests: 86/86 unit tests, 21/21 isolated end-to-end checks, build + lint.

### Remaining notice verification (needs staging UI/tokens)
- [ ] Manual browser pass with real admin/customer Firebase accounts: modal
      animation and keyboard focus on mobile/tablet, toast placement, and
      two-browser SSE delivery of `notice:published`.
- [ ] Confirm non-admin staff can see the notices nav item only after an admin
      grants `view_notices` / `manage_notices` in Roles & Permissions (existing
      role documents are seeded with `$setOnInsert` and are never overwritten).

## Notice bug-fix pass (2026-11-28) — complete
- [x] Fix `/admin/notices` React crash (awaited stats count + defensive render).
- [x] Fix email-based individual selection (Mongo `_id` picker + server-side
      resolution to canonical auth uid, loading/empty/error states, preview).
- [x] Fix new-notice Publish/Schedule silently creating drafts.
- [x] Automatic modal for newly published and pending notices (SSE + polling +
      focus/login reconciliation).
- [x] Strict mandatory acknowledgement (no Escape/outside/close bypass, error
      state, duplicate-request guard, next notice auto-advance).
- [x] Verified with 86 unit tests, 28 API E2E checks, 20 browser UI checks,
      lint and production build. No production data was inserted or removed.

### Remaining (needs staging devices)
- [ ] Multi-process deployment SSE fan-out still requires shared pub/sub (the
      existing SSE manager is in-process, unchanged by this fix).

## Notice UI loading + delete pass (2026-11-28) — complete
- [x] Per-action loading states on admin notice rows and confirmation dialogs.
- [x] Editor save/publish/schedule loading states + duplicate guard; customer
      search loading indicator.
- [x] Customer Read notice loading state; Confirm shows a spinner, keeps the
      modal open on failure and re-enables afterwards.
- [x] Separate Delete action (with destructive confirmation) next to Archive.
- [x] Safe deletion strategy: hard delete for draft/scheduled, tombstone for
      published/archived so customer acknowledgement history survives.
- [x] Verified: 86 tests, lint, build, 18 browser checks, DB integrity check.
