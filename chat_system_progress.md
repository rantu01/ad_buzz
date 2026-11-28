# Chat system progress

## Completed (original upgrade)

- Mapped the customer support page and floating widget, staff support console, internal staff chat, their APIs/models, cursor pagination, SSE, and the separate support-ticket reply workflow.
- Added server-validated reply references and snapshots for customer, staff, and internal messages. Existing collection/document structure remains additive and intact.
- Added swipe-to-reply plus a visible keyboard/pointer reply button, focused composer reply preview, cancellation, in-bubble previews, jump-to-source loading/highlighting, and linkified text across the three chat interfaces.
- Added date separators and sender grouping to all three message feeds. Delivery/read checks continue to use persisted `readBy` data.
- Added an info panel to each chat header with paginated media, documents, and extracted links. The customer floating widget receives the same functionality through the shared interface.
- Strengthened shared scroll handling with a stable bottom sentinel and resize observation while keeping cursor paging and older-message anchoring.
- Fixed delayed media/content scroll jumps in Admin Chat and Internal Chat by attaching resize observation when their conditionally mounted message lists enter the DOM; the always-mounted user chat remains unchanged.
- Added shared-content indexes and focused unit tests. No database rows were seeded or modified.
- Hydrated support-chat and internal-chat avatars from current `users.avatar` data, and surfaced actual SSE-backed online status in conversation lists, headers, and sender avatars.
- Routed staff presence changes only to customers assigned to that staff member, using the existing shared SSE transport and no polling.
- Made Admin Dashboard account/deposit/notification menus dismissible and keyboard-operable, and displayed the authenticated user's role label from the live role catalog.
- Replaced timer-driven incoming-call beeps with a continuous looping Web Audio ringtone; added an actionable warning when browser autoplay restrictions prevent playback. The existing missed-call timeout was preserved.

## Completed (WhatsApp-style upgrade)

### 1. Image and media display

- Added `ChatMediaProvider` / `ChatMediaLightbox` (`app/Component/Chat/ChatMediaLightbox.jsx`) mounted once in the root layout. It provides a single in-chat fullscreen viewer with zoom in/out/reset (buttons, wheel and keyboard), drag-to-pan while zoomed, next/previous navigation, Escape close, focus management, download, video controls, touch-sized controls and a `role="dialog"` / `aria-modal` contract.
- Added shared `ChatMediaAttachment` + `lib/chatMedia.js`. Image clicks now open the lightbox and **never navigate** to the raw attachment URL. Thumbnails use fixed responsive dimensions and `object-fit: cover` via `.chat-msg-media-thumb`; video thumbnails use `object-fit: contain`; the viewer preserves the original aspect ratio.
- Applied the shared renderer to `ChatMessageBubble` (user chat, floating widget and Admin Chat), `InternalMessageBubble` (Admin/employee Internal Chat) and `ChatInfoPanel` media grid (all surfaces).
- Replaced the ad-hoc preview modals in both customer and admin Support Tickets pages with the same lightbox, so support attachments behave like chat attachments.
- Added video (`mp4`, `webm`, `quicktime`) and audio MIME types to the customer and internal upload allow-lists so video/voice previews are backed by real uploads.

### 2. Group chat

- Groups are real `internalConversations` documents with `type: "group"`, name, description, optional photo attachment id, `participants`, `people`, per-member `unread`, `admins` and `createdBy`. They reuse the existing message/read/typing/attachment/call/shared-content APIs and the existing membership authorization instead of creating a second message system.
- Added `lib/groupChat.js` (pure validation/permission/reaction rules) and `lib/groupChatAuth.js` (verified token + group membership + admin gate).
- New APIs: `POST/GET /api/internal-chat/groups`, `PATCH/DELETE /api/internal-chat/groups/[id]`, `POST/DELETE/PATCH /api/internal-chat/groups/[id]/members`, `POST .../leave`, `GET/POST .../photo`, plus `POST /api/internal-chat/reactions` and `POST /api/user/chat/reactions`.
- Admin/internal chat UI gained a "New group" modal (name, description, photo, multi-select member picker), group-aware conversation rows/headers, a group Members tab with roles, online status, admin add/remove/promote actions, leave/delete with confirmation, per-member sender labels, and message reactions on every message.
- Group messages increment unread for **all** other members in a single Mongo update; attachment and shared-content reads still require membership.

### 3. Real-time call synchronization

- Added `lib/callState.js` with shared, tested lifecycle rules (normalized statuses, terminal guards, server-authoritative duration, ringtone stop predicate, signal dedupe keys). Both call routes now use it, so Customer Chat and Internal Chat behave identically.
- Added server-side call coordination to `lib/sseManager.js` (`claimCall`, `getCallClaim`, `setCallClaimStatus`, `releaseCallClaim`) plus `emitToUser` options and `emitToClient`. Every SSE connection now receives a `clientId` in the initial stream frame, exposed through `useSSE`'s `getSseClientId`.
- `chat:call-status` / `internal:call-status` events fan out to every device of every conversation participant. An accept, reject, end, cancel or missed status immediately stops ringtones and resets active calls on all devices.
- Duplicate offers/accepts are rejected server-side; a ringing call is reused instead of opening a second WebRTC session, and the client deduplicates signaling frames by call/type/device/candidate.
- ICE candidates are now call-scoped, so a candidate can no longer be injected into an unrelated peer connection. `RTCPeerConnection` handlers are nulled before close and on replacement.

### 4–6. Call controls, video UI and loading states

- `CentralCallProvider` now has in-flight guards for accept/reject/end/call and visible spinners (`callAction`) with disabled buttons and `aria-busy` semantics.
- Added speaker toggle using `HTMLMediaElement.setSinkId` when available (audio element for voice, video element for video), graceful fallback with an explanatory tooltip when unsupported.
- Added microphone and camera toggles that keep the peer connection alive; camera-off shows a clean avatar placeholder locally and signals `media` state so the remote side shows a placeholder too.
- Reworked the video layout: remote video sits above its controls, controls float at the bottom over a gradient instead of covering the feed, and a draggable/resizable local preview (position persisted per device) with a reset button replaces the fixed thumbnail.

### 7. Incoming-call privacy and ringtone

- Removed the `admin:chat` offer/signal broadcast from `/api/chat/signal`. Offers are delivered only to an explicitly resolved recipient uid; unreachable recipients return `delivered:false` and the call becomes missed via the existing timeout.
- Customer call/signal APIs now prefer a verified Firebase ID token (`lib/chatCallAuth.js`) while retaining the legacy uid path for existing clients. Receiver identity, role and conversation/call membership are validated server-side on every action.
- `chat:call` / `internal:call` notices and all call-status events use targeted `emitToUser`; no unrelated admin, employee or customer receives a call notification or ringtone.
- The ringtone stops on accept, reject, cancel, end, missed and on an accepted claim from another device of the same user.

## Completed (final bug fixes & performance pass)

- **Reaction picker:** rendered through a portal with viewport-clamped positioning (`lib/popoverPosition.js`), correct left/right bubble alignment, responsive grid on mobile, scroll/resize repositioning, outside-click/Escape close and no clipping by scrolling message feeds.
- **Microphone/camera state:** refs are now authoritative for mute/camera state, so rapid repeated toggles act on real track state instead of stale closures. Audio/video tracks are enabled/disabled in place; the UI mirrors the ref state.
- **Video rendering root causes:** remote streams are kept in a ref and attached by an effect after render (ontrack can fire before the `<video>` mounts); local video stays mounted and its `srcObject` is never cleared on camera toggle; a stable `MediaStream` is reused for all remote tracks with mute/unmute/ended listeners; late camera permission is recovered by acquiring a track and replacing it on the existing sender.
- **Connection resilience:** added controlled reconnect handling with a grace period, initiator-only ICE restart (`renegotiate` / `renegotiate-answer` signals) with a bounded retry count, and guarded remote-description/ICE application. All new timers are cleared on cleanup.
- **Performance:** call actions are exposed through a stable memoized context so the once-per-second duration tick no longer re-renders chat pages; ICE candidates are batched; old tracks are only stopped after a successful sender replacement; media state/stream versions drive attachment instead of remounting elements.

## Verification

- `npm test`: **72 tests passed**, including new `callState`, `groupChat`, `chatMedia` and `popoverPosition` suites.
- Targeted ESLint on every changed file: **passed with zero errors/warnings**. Repository-wide lint still reports pre-existing violations in unrelated admin/user pages and notification providers (see `chat_system_todo.md`).
- `npm run build`: **passed** after the final pass (Next.js compiled, TypeScript check passed, all routes generated including the new group/reaction APIs).
- `git diff --check`: passed.
- Live two-account/two-device browser verification remains outstanding: no authenticated browser session was available in this environment. The manual checklist is recorded in `chat_system_todo.md`.

## No data mutations

No seed messages, sample groups, reset, destructive migration or bulk update was added. Group records are created only through authenticated API calls from real users. Deleting a group removes only that group's own conversation/message/call records after an explicit admin-confirmed action.
