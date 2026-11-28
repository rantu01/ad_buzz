const LINK_PATTERN = /https?:\/\/[^\s<>()]+/gi;

function isMedia(attachment) {
  return /^(image|video)\//i.test(String(attachment?.type || ""));
}

function fileItems(message, kind) {
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  return attachments
    .filter((attachment) => kind === "media"
      ? isMedia(attachment) || (message.messageType === "image" && !attachment.type)
      : !isMedia(attachment))
    .map((attachment) => ({
      id: `${message.messageId}:${attachment.id}`,
      messageId: message.messageId,
      senderName: message.senderNameSnapshot || "",
      createdAt: message.createdAt,
      messageType: kind,
      attachment,
    }));
}

export function sharedContentFilter(kind) {
  if (kind === "media") {
    return { $or: [{ messageType: "image" }, { "attachments.type": /^video\//i }] };
  }
  if (kind === "documents") return { messageType: "file" };
  if (kind === "links") return { messageType: "text", content: /https?:\/\/[^\s<>()]+/i };
  return null;
}

export function sharedContentFromMessages(messages, kind) {
  const items = [];
  for (const message of messages) {
    if (kind === "media" || kind === "documents") {
      items.push(...fileItems(message, kind));
      continue;
    }

    LINK_PATTERN.lastIndex = 0;
    for (const match of String(message.content || "").matchAll(LINK_PATTERN)) {
      const url = match[0].replace(/[.,!?;:)]+$/, "");
      try {
        const parsed = new URL(url);
        items.push({
          id: `${message.messageId}:${items.length}`,
          messageId: message.messageId,
          senderName: message.senderNameSnapshot || "",
          createdAt: message.createdAt,
          messageType: "link",
          title: parsed.hostname,
          url,
        });
      } catch {
        continue;
      }
    }
  }
  return items;
}

export function replySnapshot(message) {
  if (!message) return null;
  return {
    messageId: message.messageId,
    senderId: message.senderId,
    senderNameSnapshot: message.senderNameSnapshot || "",
    messageType: message.messageType || "text",
    content: String(message.content || "").slice(0, 240),
    attachments: (Array.isArray(message.attachments) ? message.attachments : [])
      .slice(0, 1)
      .map(({ id, name, type }) => ({ id, name, type })),
  };
}
