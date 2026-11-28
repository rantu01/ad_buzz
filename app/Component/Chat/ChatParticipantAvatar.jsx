"use client";

import React, { useState } from "react";

function ChatParticipantAvatar({ person, size = "h-9 w-9", online = false, showOfflineIndicator = false }) {
  const name = person?.displayName || person?.email || "User";
  const [failedAvatar, setFailedAvatar] = useState(null);
  const imageFailed = failedAvatar === person?.avatar;

  return (
    <span className={`relative inline-flex ${size} shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600`}>
      {person?.avatar && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={person.avatar}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedAvatar(person?.avatar)}
          className="h-full w-full rounded-full object-cover"
        />
      ) : name.charAt(0).toUpperCase()}
      {(online || showOfflineIndicator) && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 z-10 h-3 w-3 rounded-full border-2 border-white ${online ? "bg-green-500" : "bg-slate-300"}`}
          title={online ? `${name} is online` : `${name} is offline`}
          aria-hidden="true"
        />
      )}
      <span className="sr-only">
        {name}{online ? " is online" : showOfflineIndicator ? " is offline" : ""}
      </span>
    </span>
  );
}

export default React.memo(ChatParticipantAvatar);
