# Chat system analysis

## Existing chat and messaging surfaces

| Surface | Entry points | Implementation |
|---|---|---|
| Customer support chat | `/user-dashboard/chat`; floating widget on user dashboard pages | `app/Component/Chat/UserChatInterface.jsx` is shared by the page and `FloatingChatWidget.jsx`. |
| Staff/customer support console | `/admin/chat` | `app/(admin)/admin/chat/page.jsx`; uses the shared support message bubble/composer. |
| Internal staff messaging | `/admin/internal-chat` | `app/(admin)/admin/internal-chat/page.jsx` with its internal composer and message bubble. |
| Support-ticket replies | `/user-dashboard/support-tickets` and `/admin/support-tickets` | Separate ticket workflow backed by `supportTickets.replies`; it is not backed by either chat message collection and was left unchanged to preserve ticket stages and permissions. |

The floating widget is not a separate messaging system: it renders the same customer interface and conversation data as the full customer chat page. Calls/signaling are provided by `CentralCallProvider` and the `/api/chat/*` or `/api/internal-chat/*` call endpoints.

## Existing APIs, storage, and real-time transport

### Customer support chat

- APIs: `/api/user/chat/{conversation,messages,attachments,read,unread}` and `/api/admin/chat/{conversations,messages,read,staff,unread}`.
- Storage: `chatConversations`, `chatMessages`, `chatAttachments`, and `chatCalls`.
- Conversation messages were already cursor-paginated; the initial page uses `CHAT_PAGE_SIZE` (25), and older pages are loaded on demand.
- Support staff and customer messages are delivered through the shared SSE stream (`chat:message`, `chat:read`, call events).

### Internal staff chat

- APIs: `/api/internal-chat/{conversations,messages,attachments,read,typing,unread,calls,signal}` plus per-conversation message history.
- Storage: `internalConversations`, `internalMessages`, and `internalCalls`; internal attachment bytes use the existing `chatAttachments` store.
- API authorization verifies the Firebase bearer token and staff role, and message/attachment reads verify conversation membership.
- `internal:message`, `internal:read`, typing, presence, and call events use the existing multiplexed SSE connection.

### SSE and subscriptions

`useSSE` shares one EventSource per authenticated UID in a tab. Providers subscribe/unsubscribe with effect cleanup, so the upgrade adds no polling and does not create per-chat sockets. The event registry tracks online state only while a known user's SSE connection is active, with a reconnect grace period. Staff receive presence events on the staff chat channel; customer browsers receive only the online state of staff assigned to their support conversation.

Current profile avatars are read from `users.avatar` for chat lists, conversation headers, message senders, and call signaling rather than relying on potentially stale participant snapshots. The Admin Dashboard topbar resolves its role label from the authenticated profile and current role catalog.

Incoming call audio uses a looping Web Audio buffer while the incoming-call state is active. A user gesture primes/resumes audio where possible; if autoplay is blocked, the call UI explains the restriction and offers an explicit sound-enable action. The existing 30-second unanswered-call timeout remains unchanged.

## Shared architecture added by the upgrade

- `ChatMessageBubble` and `InternalMessageBubble` now expose the same reply affordance and reply preview behavior for their respective attachment authorization paths.
- `ChatComposer` and `InternalComposer` display/cancel the pending reply and include the selected source message ID in the existing send request.
- `ChatReplyPreview` is used in the composer and inside sent message bubbles. `ChatInfoPanel` is reused by all three chat surfaces; the floating widget inherits it through `UserChatInterface`.
- `ChatDateSeparator` supplies date boundaries in all three message feeds.
- Existing `useChatPagination` remains the paging mechanism. `useChatScroll` retains reverse-history position, pins initial conversation loads to the end, follows incoming messages only when already at the bottom, and observes message element size changes.

## Data/API changes

- New messages can contain an additive `replyTo` snapshot with the referenced message ID, sender, type, concise text, and at most one attachment's metadata. A reply is accepted only when the referenced message belongs to the same conversation.
- Existing message IDs, conversation IDs, collection names, and ordinary message fields remain unchanged.
- New paged shared-content APIs:
  - `GET /api/user/chat/shared`
  - `GET /api/admin/chat/shared`
  - `GET /api/internal-chat/conversations/[id]/shared`
- The shared-content query returns bounded pages for media, documents, and URLs; it does not fetch attachment binary data to populate the index. Attachment opens still use the existing authorization endpoints.
- Added compound message indexes for conversation + message type + newest-first shared-content reads. Index creation uses the existing non-destructive `initializeIndexes` flow.
- No migration, reset, seed, or bulk record update was added.

## Scroll strategy

Each message feed keeps a stable scroll container and a bottom sentinel. Initial pages and conversation changes are positioned at the bottom after render; prepended history restores the prior `scrollTop` using the previous scroll height. Incoming messages follow the reader only when the last measured state was at the bottom. A visible scroll-to-latest control appears otherwise. `ResizeObserver` watches the feed and message rows so late image/attachment layout changes keep the bottom pinned when appropriate; conditionally mounted Admin and Internal Chat lists notify the hook when their scroll element enters the DOM, ensuring observation starts after conversation selection. The browser's normal scroll anchoring is retained when reading history.

## WhatsApp-style upgrade architecture (added after the original audit)

- **Media:** one global `ChatMediaProvider` (`app/Component/Chat/ChatMediaLightbox.jsx`) renders a single lightbox for message attachments, shared-content grids and support-ticket thumbnails. `ChatMediaAttachment` and `lib/chatMedia.js` normalize thumbnail sizing and item ordering. Attachment clicks never navigate.
- **Groups:** stored as `internalConversations` documents with `type: "group"`. Reusing that collection means the existing membership check, message insert, unread, read, typing, call, attachment and shared-content code paths work for groups without a parallel messaging system. Membership mutations invalidate the bounded membership cache.
- **Call privacy/sync:** SSE connections expose a per-tab `clientId`. Signals carry that id; the server claims a call once and emits `call-status` to every device of every participant. There is no channel broadcast for call offers or signaling. `lib/callState.js` centralizes status transitions and duration math for both chat systems.
- **Call UI:** `CentralCallProvider` owns WebRTC, ringtone, media controls and overlays. In-flight action guards, spinners, speaker (`setSinkId`), media-state signaling and a draggable/resizable local preview were added without introducing a second socket or a second WebRTC implementation.
- **Reactions:** additive `reactions` arrays on `chatMessages` / `internalMessages`, toggled through validated endpoints and broadcast with dedicated SSE events; rendered by a shared `MessageReactions` component.

## Current limitations found during inspection

- Video is displayed in the shared-media panel when video attachments exist, but the current upload allow-lists do not accept video files.
- Link entries are derived from URLs in text; the current message schema does not store generated page titles or rich link-preview metadata, so the domain is used as the title.
- The separate support-ticket reply workflow remains ticket-oriented and does not gain chat gestures or media tabs.
- The authenticated browser session was unavailable during local UI verification, so end-to-end gesture, SSE, and media checks still require an authorized test account.
