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
