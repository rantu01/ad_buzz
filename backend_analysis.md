# Backend Analysis — Ad Buzz chat, calling and branding

Last updated: 2026-11-26. This document records the Phase 1 codebase analysis and the
Phase 2 implementation plan for the internal Admin/Staff chat, the customer call
fix, and the branding replacement. It is based on direct inspection of the
repository; no data was modified.

## 1. Project shape

- Next.js 16.2.7 App Router (`app/`), React 19, Tailwind CSS 4, MongoDB driver 7,
  Firebase Admin + Firebase client auth, TanStack Query, sweetalert2, lucide-react.
- Route groups: `app/(site)` (public + `/login`), `app/(admin)` (`/admin/*`),
  `app/user-dashboard/*`. Root layout mounts `SettingsProvider → AuthProvider →
  QueryProvider → CentralCallProvider`.
- `package.json` has **no Socket.IO dependency**. Realtime is **SSE**:
  `app/api/events/route.js` + `lib/sseManager.js` + `app/Component/Hooks/useSSE.js`.
  The hook multiplexes every subscriber for a uid onto one `EventSource`, with
  reconnect/backoff. `sseManager` stores clients in in-process memory
  (`clientsByUid`, `channelClients`) and exposes
  `emitToUser(uid, event, data)`, `emitToChannel(channel, event, data)`,
  `emitToAll`, `getUidClientCount(uid)`.
- SSE auto-subscribes **staff** connections to `admin:meta` and `admin:chat`;
  customers are only targeted via `emitToUser`. `?channel=` is honored for any
  client (see hardening item H1 below).

## 2. Identity, auth and roles

- `app/Component/Auth/AuthProvider.jsx` exposes the Firebase user object
  (`user.uid`, `user.getIdToken()`). `app/api/auth/sync-user/route.js` upserts a
  `users` doc keyed by `uid` (role defaults to `customer`).
- `lib/apiAuth.js` is the **verified-token** helper: `getAuthenticatedUser(request)`
  reads `Authorization: Bearer <Firebase ID token>`, verifies it, then loads the
  `users` doc. `requireAdmin(request, permission)` enforces staff roles and DBA
  role overrides. `lib/authFetch.js` attaches the token client-side.
- `lib/permissions.js` / `lib/rbacCatalog.js` define staff roles
  (`admin`, `director`, `hr`, `key_manager`, `accounts_manager`,
  `approval_manager`, `support_executive`, legacy `technical_manager`) and
  `customer`. `isStaffRole(role)` is the existing staff gate.
- Existing chat/call APIs (`app/api/user/chat/*`, `app/api/admin/chat/*`,
  `app/api/chat/calls`, `app/api/chat/signal`) **trust a client-supplied `uid`
  query/body parameter**; role checks are done by looking up that uid. This is a
  pre-existing convention; new internal-chat endpoints will be stricter
  (verified token required) without changing the old endpoints' contracts.

## 3. System A — existing Customer ↔ Admin chat (preserve)

Collections in `lib/chatModel.js`: `chatConversations` (one per customer,
`customerId`, `assignedStaffId`, `unreadForStaff/Customer`), `chatMessages`,
`chatCalls`, `chatAttachments`. Indexes live in `lib/indexes.js` lines 178-187.

Frontend:
- `app/Component/Chat/UserChatInterface.jsx` — customer full page and compact
  floating widget (`FloatingChatWidget.jsx`). Voice call button calls
  `useCentralCall().startCall({conversationId, targetUid: conversation.assignedStaffId})`.
- `app/(admin)/admin/chat/page.jsx` — staff conversation list, assignment,
  status, messages, voice call button to `selectedConv.customerId`.
- `app/Component/Chat/ChatComposer.jsx` / `ChatMessageBubble.jsx` — shared UI
  (text, attachments, voice notes, emoji, read receipts).

Backend: `/api/user/chat/{conversation,messages,read,unread,attachments}`,
`/api/admin/chat/{conversations,[id],messages,read,unread,staff}`,
`/api/chat/calls`, `/api/chat/signal`. Realtime events: `chat:message`,
`chat:read`, `chat:call`, `chat:signal`.

### 3.1 Why customer → admin calls fail

Evidence (confirmed by code inspection):

1. `getOrCreateConversation()` creates `assignedStaffId: null`
   (`lib/chatModel.js:55`) and nothing auto-assigns a staff member on the
   customer path (`app/api/user/chat/conversation/route.js:12`). Assignment only
   happens manually from the admin chat page (`assignTo()` at
   `app/(admin)/admin/chat/page.jsx:113-123`).
2. The customer call button is `disabled={!conversation?.assignedStaffId}`
   (`UserChatInterface.jsx:99`). With the default unassigned conversation the
   button is permanently disabled — the primary root cause.
3. Even when assigned, `/api/chat/signal` only emits to that single uid
   (`app/api/chat/signal/route.js:13-17`). If that staff member is offline
   (or the assignment is stale) the offer reaches nobody; there is no fallback
   to the staff channel for signaling.
4. `app/api/chat/calls` broadcasts the `chat:call` notice to `admin:chat`, but
   the centralized call provider does not listen to `chat:call` at all — only
   `chat:signal` (`CentralCallProvider.jsx:309`). So no UI path can recover the
   call from the notice.
5. Video was removed from the call provider (`progress.md:10-11`); there is no
   camera track, remote `<video>` element, or camera toggle. WebRTC is audio-only.
6. ICE candidates are sent immediately on `onicecandidate`; if they arrive
   before `setRemoteDescription`, `addIceCandidate` silently fails
   (`CentralCallProvider.jsx:338-341`). No buffering exists.
7. No authorization on `/api/chat/calls` or `/api/chat/signal`: any caller can
   forge a `uid`, create calls, or inject signaling into another conversation.

### 3.2 Customer-call fix plan (minimal, no data migration)

- Enable the customer call button whenever a conversation exists; pass the
  assigned staff uid when present, otherwise no target (server resolves).
- `/api/chat/signal`: when an offer has no reachable target, fan out to the
  staff-only `admin:chat` channel; broadcast an `accepted` marker so only the
  first accepting staff keeps the call. Add `system: "customer"` to payloads.
- `/api/chat/calls`: when a customer call is accepted and the conversation is
  unassigned, assign that staff member so later calls have a direct target.
  Validate that the caller belongs to the conversation and that the receiver is
  a staff member for customer-initiated calls.
- Extend `sseManager` with `getOnlineUids()` so the API can choose a reachable
  target and report "no staff online" instead of silently ringing forever.
- Harden `app/api/events/route.js` so `admin:chat` and `admin:meta` explicit
  channel requests are staff-only (H1).
- Preserve all existing endpoint shapes and all existing conversation data.

## 4. System B — new internal Admin/Staff chat (to build)

Strictly separate from System A. New collections and APIs; no writes to
`chatConversations`, `chatMessages`, `chatCalls`, or `chatAttachments` records
created by the customer system (only the shared binary attachment store is
reused, with new authorization).

### 4.1 Collections

- `internalConversations`: `conversationId`, canonical `key` (sorted uids,
  unique index), `participants: [uidA, uidB]`, `unread: [{uid, count}]`,
  `lastMessage`, `lastMessageAt`, `lastMessageSenderId`, `createdAt`, `updatedAt`.
- `internalMessages`: `messageId`, `conversationId`, `senderId`, `receiverId`,
  `messageType` (`text|image|file|voice|call_event|system`), `content`,
  `attachments`, `readBy`, `callMetadata`, timestamps.
- `internalCalls`: `callId`, `conversationId`, `callType` (`voice|video`),
  `initiatorId`, `receiverId`, `status`, `startedAt`, `answeredAt`, `endedAt`,
  `duration`, timestamps.
- Attachments: reuse the `chatAttachments` binary collection through new
  internal endpoints; authorization derived from internal conversation
  membership. No deletion/rewrite of existing attachments.
- Indexes added to `lib/indexes.js`: unique `key`, `participants`,
  `lastMessageAt`, `conversationId+createdAt` for messages and calls, unique
  `messageId`/`callId`.

### 4.2 APIs (all require a verified Firebase token; staff role only)

| Endpoint | Purpose |
|---|---|
| `GET /api/internal-chat/users?search=` | Searchable staff directory + online status (self excluded) |
| `GET /api/internal-chat/conversations?search=&page=&limit=` | My conversations with peer info, preview, unread, online |
| `POST /api/internal-chat/conversations` `{peerUid}` | Get-or-create (unique canonical key; race-safe) |
| `GET /api/internal-chat/conversations/[id]/messages?before=&limit=` | Paginated history (membership checked) |
| `POST /api/internal-chat/messages` | Send text/file/image; SSE to both members |
| `POST /api/internal-chat/read` | Reset unread + `readBy` receipts; SSE update |
| `GET /api/internal-chat/unread` | Total unread badge |
| `POST /api/internal-chat/typing` | Throttled typing indicator signal |
| `POST/GET /api/internal-chat/attachments` | Upload/download with membership checks and type/size validation |
| `POST/GET /api/internal-chat/calls` | Create/update/list calls with membership + role validation |
| `POST /api/internal-chat/signal` | WebRTC offer/answer/ICE/end; only to the other member |

Realtime events are targeted with `emitToUser` only (never a public channel):
`internal:message`, `internal:read`, `internal:signal`, `internal:call`,
`internal:typing`, `internal:presence`. `internal:presence` is broadcast on the
staff-only `admin:chat` channel when a staff SSE client connects/disconnects.

### 4.3 Frontend

- New staff-only page `app/(admin)/admin/internal-chat/page.jsx` with
  `components/` subfolder: conversation list, directory/new-chat modal,
  thread, bubbles, composer, call history panel. Reuses existing Tailwind
  tokens, lucide icons, sweetalert2 toasts and responsive conventions.
- Sidebar nav item added for staff only; route guard already allows unmapped
  admin paths for all staff.
- `CentralCallProvider` extended with a per-call `system` (`customer|internal`)
  and `callType` (`voice|video`): real `getUserMedia` audio/video tracks,
  ICE buffering, accept/reject/end/cancel, mute/camera toggles, remote/local
  video elements, duration, cleanup on unmount. Both systems share one provider
  and one SSE transport.

## 5. Branding

Case-insensitive scan found exactly 10 user-facing `AdsFixer` strings:
`app/Component/Chat/UserChatInterface.jsx` lines 82, 92, 94, 114, 116, 139, 144
and `app/user-dashboard/support-tickets/NewTicketModal.jsx` lines 200, 250, 376.
Also the root metadata title `Adsbuzz Portal` (`app/layout.js:19`) is a browser
tab label and will become `Ad Buzz Portal`. No database names, API paths, env
vars, or third-party credentials are renamed. No email/PDF templates contain the
old name in this repository.

## 6. Hardening items

- **H1** Restrict explicit `?channel=admin:chat|admin:meta` requests to verified
  staff uids in `app/api/events/route.js`, matching existing auto-subscribe
  behavior. Customers keep targeted `emitToUser` delivery.
- **H2** Internal endpoints derive identity from the verified token; a supplied
  uid must match the token (or is ignored). Conversation membership is checked
  on every read/write/call/signal.
- **H3** Attachment uploads validated by MIME type and size; downloads require
  membership in a conversation that references the attachment.
- **H4** SSE manager is per-process; with multiple Node processes, realtime
  events would need shared pub/sub. Documented as an existing platform
  limitation — no second realtime architecture introduced.

## 7. Performance analysis (2026-11-26, second pass)

### Measured bottleneck
A probe against the live MongoDB (`scripts/tmp-perf.mjs`, real Firebase tokens,
real staff uids, production server, median of 5 warm requests) showed latencies
quantised in ~250 ms steps:

| Endpoint | Before | After |
|---|---|---|
| `GET /api/internal-chat/users` | 755.8 ms | 496.1 ms |
| `GET /api/internal-chat/conversations` | 757.3 ms | 495.5 ms |
| `POST /api/internal-chat/conversations` | 1008.1 ms | 740.2 ms |
| `GET .../messages` | 1008.5 ms | 496.9 ms |
| `GET /api/internal-chat/unread` | 760.4 ms | 492.5 ms |
| `GET /api/internal-chat/calls` | 1007.8 ms | 496.0 ms |
| `POST /api/internal-chat/messages` | 2017.8 ms | 1239.7 ms |

Root cause: the database is remote (~250 ms/RTT). The old paths spent 3–8
**sequential** round trips per request: token check + role document lookup,
repeated user lookups, `countDocuments` on list, an aggregation for unread, a
separate conversation read after every write, and a non-atomic conversation
creation flow. On the client, starting a chat waited for ~5 serial requests.

### Backend optimizations implemented
- `lib/internalChatAuth.js`: verified-token check + **one** user lookup; staff
  membership comes from the user document (no role-document round trip).
- `lib/internalChatModel.js`:
  - atomic `findOneAndUpdate({key}, {$setOnInsert}, {upsert:true})` guarded by a
    unique `key` index — simultaneous creation by both participants converges;
  - batched `$in` user lookup for snapshots instead of two separate reads;
  - bounded 5-minute membership cache (membership is immutable) removes a read
    from every message/call/signal request;
  - one `findOneAndUpdate` writes message preview **and** unread increment and
    returns the updated conversation for the SSE payload;
  - unread total is a projected `find` + reduce instead of `$unwind/$group`;
  - list endpoint drops `countDocuments` and loads only the requested page;
  - `before` accepts an ISO cursor (no pivot query) and message projections
    limit the payload; `clientId` unique-sparse index gives idempotent sends;
  - targeted internal index bootstrap instead of awaiting the whole 35-index
    set on the first chat request.
- `lib/chatModel.js` (customer chat): same `clientId` idempotency and an
  updated-conversation snapshot attached non-enumerably so message routes no
  longer re-read the conversation after writing.

### Frontend / realtime optimizations implemented
- New conversation opens **optimistically** (temporary conversation + peer
  snapshot) with an "Opening..." indicator; rapid clicks reuse one in-flight
  promise; if a conversation already exists locally it opens immediately.
- Messages render optimistically with `clientId`, sending spinner, and retry;
  SSE echoes reconcile by `messageId`/`clientId` (no duplicates).
- Per-conversation message/call caches make switching instant; an `openSeqRef`
  discards stale responses; SSE refreshes are coalesced into one list request.
- `useSSE`: first reconnect retry 1 s (was 15 s), exponential backoff to 15 s,
  `onReconnect` hook so chat/unread/notifications re-sync after a reconnect.
- `internal:conversation` SSE event tells the other participant immediately.
- `React.memo` on conversation items/bubbles, lazy-decoded avatars/images,
  auto-scroll only when near the bottom, cursor-based "Load earlier messages".
- Browser notifications (Notification API) with one-time permission request
  after a user gesture, `document.hidden` gating, per-id/tag dedupe, and a
  client registry that suppresses toasts for the active conversation.
- No new dependencies; still one SSE connection per uid per tab.

### Limitation
True Web Push after the browser is disconnected requires a service worker and
VAPID keys, neither of which exists here. Desktop notifications work while the
page is loaded (including a background tab); unread state is re-synced from
MongoDB on reconnect/focus so nothing is lost.

## 8. Verification plan

1. `npm test`, `npm run lint`, `npm run build` after each phase.
2. API smoke tests with real Firebase tokens and real users against MongoDB
   (no dummy data): conversation create/list/messages/read for each participant
   pair; cross-user 403 checks; call create/accept/end/history; signal delivery.
3. Manual two-browser WebRTC check (voice + video, accept/reject/missed, mute,
   camera, ICE on slow network, navigation cleanup) — requires staging devices.
