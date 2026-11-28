# API Status — Chat, Calling & Branding (2026-11-26)

Companion to `api-status.md` (Meta sync / SSE health). This file tracks the
new internal messaging system, the customer-call fix and the branding work.

## System A — customer support chat (existing, preserved)

- `POST /api/chat/calls` creates/updates voice or video calls. Caller membership
  and receiver role are validated; the accepting staff member is auto-assigned
  when the conversation was unassigned.
- `POST /api/chat/signal` relays offer/answer/ICE/end/reject/missed over SSE
  `chat:signal`. Offers with no reachable assigned staff (or none assigned)
  are broadcast on the staff-only `admin:chat` channel; `accepted` claims the
  call so only the first accepting staff keeps it.
- Event names/payloads (`chat:message`, `chat:read`, `chat:call`, `chat:signal`,
  `notify`) are unchanged; only additive fields (`system`, `byUid`,
  `delivered`) were introduced.

## System B — internal Admin/Staff chat (new)

Every endpoint requires a verified Firebase ID token (`Authorization: Bearer`)
and an existing staff user document. Identity is never taken from a
client-supplied uid.

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/internal-chat/users?search=` | staff token | Searchable staff directory + online flag (self excluded) |
| `GET/POST /api/internal-chat/conversations` | staff token | List my conversations / get-or-create (canonical pair key) |
| `GET /api/internal-chat/conversations/[id]/messages` | member token | Paginated history (`before`, `limit`) |
| `POST /api/internal-chat/messages` | member token | Send text/image/file/voice note; emits `internal:message` |
| `POST /api/internal-chat/read` | member token | Unread reset + `readBy` receipts; emits `internal:read` |
| `GET /api/internal-chat/unread` | staff token | Total unread for the sidebar badge |
| `POST /api/internal-chat/typing` | member token | Emits `internal:typing` to the peer |
| `POST/GET /api/internal-chat/attachments` | staff/member token | Validated upload (≤15 MB, allowlisted MIME) / download only through a conversation that references the file |
| `POST/GET /api/internal-chat/calls` | member token | Create/update/list voice/video calls; offline receivers recorded as missed |
| `POST /api/internal-chat/signal` | member token | WebRTC signaling; only the other conversation member may receive events |

SSE events: `internal:message`, `internal:read`, `internal:signal`,
`internal:call`, `internal:typing`, `internal:presence`. Delivery uses
`emitToUser` (or the staff-only `admin:chat` channel for presence); customers
never receive internal events. `GET /api/events` now rejects explicit
`admin:chat` / `admin:meta` channel requests from non-staff uids.

## Performance pass changes (2026-11-26)

- `POST /api/internal-chat/conversations` uses an atomic upsert on a unique
  canonical key and emits `internal:conversation` to the other participant.
- `POST /api/internal-chat/messages` and both customer-chat message routes
  accept `clientId` for idempotent optimistic sends (duplicate sends return the
  original message and are not re-broadcast / re-notified).
- `GET /api/internal-chat/conversations/[id]/messages` accepts `before` as an
  ISO timestamp cursor (legacy messageId still supported) and returns projected
  message fields only.
- `GET /api/internal-chat/unread` is a projected query, not an aggregation.
- SSE reconnects start at 1 s and notify consumers via `onReconnect` so unread
  counts, conversations, messages and notification logs re-sync.
- All internal endpoints derive identity from the verified ID token with a
  single user lookup (no role-document query).

Additive indexes: `chatMessages.clientId`, `internalMessages.clientId`,
`internalMessages {conversationId, createdAt:-1}`, `users {role, displayName, email}`.

## Attachment access (updated 2026-11-26)

`GET /api/internal-chat/attachments?attachmentId=&conversationId=&uid=` is used
by `<img>`/`<audio>`/`<a>` elements, which cannot send a Bearer header. It
accepts either a Bearer token or a `uid` query param, then requires: an existing
staff account, membership of the given internal conversation, and that the
attachment is referenced by a message in that conversation. Non-member staff
and customers receive 403. The upload path remains Bearer-only.

## Verification log

| Check | Result |
|---|---|
| `npm test` (45 unit tests) | ✅ Pass |
| `npm run build` (115 routes incl. `/admin/internal-chat` + 10 internal APIs) | ✅ Pass |
| `npm run lint` on changed files | ✅ No new errors (pre-existing unrelated errors remain) |
| Data-layer integration smoke test with real staff/customer uids | ✅ Pass; test records removed, customer chat data untouched |
| HTTP smoke test with real Firebase ID tokens (401/403, directory, conversations, messages, read/unread, calls) | ✅ Pass; test records removed |
| Two-device live WebRTC (voice/video, accept/reject/missed, ICE) | ⬜ Requires staging devices + HTTPS/camera/mic |

## Notice & Announcement APIs (2026-11-28)

All routes use verified Firebase ID tokens (`Authorization: Bearer`, attached
by `lib/authFetch.js`). Admin routes use `requireAdmin` with `view_notices` /
`manage_notices`; customer routes use `requireNoticeCustomer`, which rejects
non-customer roles and derives uid from the token — never from query params.

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/admin/notices` | staff (`view_notices`) | Paginated list + filters (`status`, `type`, `audienceType`, `search`) + per-notice stats and status counts; `?id=` returns one notice |
| `POST /api/admin/notices` | staff (`manage_notices`) | Create draft / published / scheduled notice; server validates audience, dates and recipient ids |
| `GET/PATCH/DELETE /api/admin/notices/[id]` | staff | Detail+history / safe field edits or `action=publish,schedule,archive` / delete draft only |
| `GET /api/admin/notices/[id]/recipients` | staff (`view_notices`) | Paginated recipients with read/ack timestamps + aggregated stats |
| `GET /api/admin/notices/customers` | staff (`view_notices`) | Escaped customer search by name, email, custom id, phone or uid |
| `GET /api/notices` | customer token | Notices addressed to this customer (`unreadOnly`, `importantOnly`, `pendingAck`, paging) |
| `GET /api/notices/counts` | customer token | Total / unread / pending acknowledgement / important-unread |
| `GET /api/notices/[id]` | customer token | Eligible notice detail; marks it read for this customer only |
| `POST /api/notices/[id]/read` | customer token | Idempotent server-side read receipt |
| `POST /api/notices/[id]/acknowledge` | customer token | Idempotent acknowledgement; preserves the first timestamp |

SSE events added: `notice:published`, `notice:updated` (plus admin channel
`admin:notices` with `notice.updated`, `notice.scheduled`, `notice.archived`,
`notice.deleted`). Targeted notices also reuse the existing `notify` event and
notification log so the current bell stays integrated; global notices avoid
per-customer notification rows and reconcile from `/api/notices/counts`.

## Notice fixes (2026-11-28)
- `GET /api/admin/notices` — fixed stats payload: `stats[id].total` and
  `stats[id].unread` are always numbers (previously an un-awaited promise
  serialized as `{}` / `null`, which crashed the admin table).
- `GET /api/admin/notices/customers?q=` — each result now includes `mongoId`
  (the real users `_id`) alongside `uid`, `email`, `displayName`, `customId`.
- `POST /api/admin/notices` and `PATCH /api/admin/notices/[id]` — accept
  recipient references as MongoDB `_id` **or** legacy Firebase uid, resolve
  them server-side to canonical uids, reject unknown ids with 400, and store
  `targetCustomerDetails` with both `mongoId` and `uid`.
- `GET /api/notices?needsAction=1` — new filter returning notices that are
  unread or mandatory-but-unacknowledged; used by the automatic modal queue.
- `POST /api/notices/[id]/read` remains read-only; `POST .../acknowledge`
  remains idempotent and revalidates eligibility against the token uid.

## Notice UI + delete APIs (2026-11-28)
- `DELETE /api/admin/notices/[id]` — now accepts draft, scheduled, published
  and archived notices. Draft/scheduled: hard delete of the notice and its own
  `noticeRecipients` rows (`mode: "hard"`). Published/archived: tombstone with
  `status: "deleted"`, `deletedAt`, `deletedBy` and a `deleted` history entry;
  recipient/read/acknowledgement records are preserved (`mode: "soft"`). Still
  requires `manage_notices` via `requireAdmin`. Tombstones are excluded from
  `GET /api/admin/notices` and from customer eligibility queries.
