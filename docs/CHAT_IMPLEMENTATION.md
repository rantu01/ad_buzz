# Live Support Chat System — Implementation Report

## Overview
A complete real-time live support chat system has been added for both Customer and Admin dashboards using the existing Next.js 16, MongoDB, Firebase Auth, and SSE infrastructure.

## Database
Collections (new):
- `chatConversations` — one conversation per customer, assignment/status/unread counters.
- `chatMessages` — shared messages with preserved sender identity.
- `chatCalls` — call sessions and history.
- `chatAttachments` — binary attachment storage.

Indexes added in `lib/indexes.js` for conversationId, customerId, assignedStaffId, status, message pagination, calls.

## Backend APIs
Customer:
- `GET /api/user/chat/conversation`
- `GET/POST /api/user/chat/messages`
- `POST/GET /api/user/chat/attachments`
- `GET /api/user/chat/unread`
- `POST /api/user/chat/read`

Admin/Staff:
- `GET /api/admin/chat/conversations`
- `GET/PATCH /api/admin/chat/conversations/[id]`
- `GET/POST /api/admin/chat/messages`
- `GET /api/admin/chat/staff`
- `GET /api/admin/chat/unread`
- `POST /api/admin/chat/read`

Shared:
- `POST/GET /api/chat/calls`
- `POST /api/chat/signal`

## Real-Time
Uses existing SSE (`/api/events`). Staff clients auto-subscribe to `admin:chat` channel. Events: `chat:message`, `chat:read`, `chat:call`, `chat:signal`.

## Frontend
Customer:
- Sidebar item "Chat" (`/user-dashboard/chat`) with unread badge.
- Floating chat widget (shared conversation) on all dashboard pages.
- Full chat page matching reference (header, welcome, bubbles, composer, right sidebar cards).

Admin:
- Sidebar item "Chat" (`/admin/chat`).
- Two-panel interface: conversation list, message history, composer, customer info/assignment.

Shared components: `app/Component/Chat/*`.

## Role-Based Identity
Sender identity derived from authenticated session on backend. `senderNameSnapshot` and `senderRole` stored immutably in each message. Supports all staff roles (Admin, Key Manager, Support Executive, etc.).

## Attachments, Emoji, Voice, Calls
- Attachments validated by type/size, stored in MongoDB, served with authorization.
- Emoji picker in composer.
- Voice recording via MediaRecorder with preview and upload.
- Audio/video calls via WebRTC with STUN, signaling over SSE, echo cancellation/noise suppression/AGC constraints.

## Environment Variables
STUN uses public Google STUN by default. For production TURN, configure secure TURN credentials server-side (do not expose in frontend). Suggested:
- `NEXT_PUBLIC_TURN_URL` (optional, non-secret URL only)
- Server-side TURN credential endpoint recommended for production.

## Performance
- Cursor/pagination for messages.
- SSE event-based updates (no 30-50s polling for chat).
- Shared conversation state between floating widget and full page.
- Indexes added.

## Testing
- Build passes.
- Lint run (pre-existing errors in unrelated files remain).
- Unit tests pass (33/33).
- API smoke tests passed for conversation, messages, staff identity, attachments, unread, calls, signaling.
