# Chat system todo and remaining checks

## Completed checks

- [x] Audit existing chat surfaces, APIs, models, SSE transport and WebRTC call flow.
- [x] Fix reaction picker clipping/overflow with portal + viewport clamping and left/right alignment.
- [x] Fix microphone toggle using track state and refs; repeated toggles stay synchronized.
- [x] Fix camera toggle with in-place track enable/disable, placeholder UI and late-permission recovery.
- [x] Fix video rendering races (stream ref + post-render attachment), ICE restart/reconnect handling and cleanup.
- [x] Stabilize context value and stream lifecycle to avoid unnecessary re-renders and resource leaks.
- [x] Add shared media viewer and consistent thumbnail sizing across every chat surface and support-ticket attachment list.
- [x] Add database-backed group conversations, member roles, group info panel, leave/delete permissions and reactions.
- [x] Add targeted call signaling, server-side call claims, authoritative status events, duplicate-call guards and call-scoped ICE.
- [x] Add speaker/microphone/camera controls, movable local preview, media state signaling and accept/reject/end loaders.
- [x] Run unit tests (68 passing), targeted lint (clean) and production build (passing).

## Manual verification (requires real accounts in a browser)

These checks need at least two authenticated accounts and, for multi-device cases, two browsers/devices signed in as the **same** user. No authenticated session was available in this environment, so they are recorded here rather than claimed as done.

1. **Group management** — Create a group from `/admin/internal-chat`, upload a photo, add/remove members, promote/demote an admin, verify online dots, send replies/media/documents/links, react to a message, leave as a member, delete as the creator. Confirm every member's other tab receives `internal:group` updates without a refresh.
2. **Images** — Send a large and a small image in User Chat, the floating widget, Admin Chat, Internal Chat and a support ticket. Confirm uniform thumbnails, no navigation on click, zoom/pan, next/previous, Escape and video controls.
3. **Call initiation** — Start a customer call from a user with no staff assigned and confirm exactly one online staff member is notified (not all admins).
4. **Accept on another device** — Sign in as the recipient on two browsers. Accept on one; the other must stop ringing immediately and show the accepted status, with no second `RTCPeerConnection`.
5. **Status sync** — Reject and end calls from one side and confirm both participants' devices show the same terminal state and a single call event in history.
6. **Ringtone privacy** — With several staff accounts online, confirm only the selected recipient's devices ring; unrelated staff/customer sessions receive no `chat:signal`/`internal:signal`, `chat:call` or `internal:call` event.
7. **Mobile controls** — On a phone, toggle speaker, microphone and camera during a call, verify pressed states are visible, and confirm no crash when `setSinkId` is unavailable.
8. **Video feeds** — Confirm both local and remote feeds are visible, the local preview can be dragged/resized/reset, camera-off shows placeholders on both sides, and toggling video does not disconnect the call.
9. **Loaders** — Double-click accept/reject/end and confirm only one request is sent, buttons are disabled, and the UI updates after server confirmation.
10. **Regression** — Verify existing text/voice/file messaging, cursor pagination, replies, read receipts, attachments and support-ticket stages still work.

## Known scope constraints

- Customer support conversations remain one-to-one by design (one `chatConversations` document per customer). Group conversations therefore apply to the staff/admin/employee internal chat surface, where multiple real users exist; the customer-facing and ticket workflows keep their existing permission/stage model.
- Server-side call coordination lives in the shared in-process SSE registry (`globalThis`). A multi-process deployment still needs a shared pub/sub layer for presence/call claims, as previously documented in `backend_analysis.md`.
- Speaker routing depends on `HTMLMediaElement.setSinkId` and browser/device audio-output support; unsupported devices keep the state visible and degrade gracefully.
- Repository-wide `npm run lint` still fails on pre-existing violations in unrelated pages (e.g. reports, roles, notifications, user dashboard) and on the pre-existing effect pattern in `useNotificationSound.js`. All files changed by this upgrade lint clean.
- `git diff --check` and `npm run build` pass; build startup still triggers the existing `[meta-sync] Full reconcile` hook.
