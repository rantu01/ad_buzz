"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Download, ExternalLink, File, Image, Link as LinkIcon, Users, X, Camera, Trash2, LogOut, ShieldCheck, Shield } from "lucide-react";
import { isImageType, isVideoType } from "@/lib/chatMedia";
import { useChatMedia } from "@/app/Component/Chat/ChatMediaLightbox";
import ChatParticipantAvatar from "@/app/Component/Chat/ChatParticipantAvatar";
import { ROLE_LABELS } from "@/lib/rbacCatalog";

const TABS = [
  { id: "media", label: "Media", icon: Image },
  { id: "documents", label: "Documents", icon: File },
  { id: "links", label: "Links", icon: LinkIcon },
];

function formatSize(bytes) {
  const size = Number(bytes) || 0;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })
    : "";
}

export default function ChatInfoPanel({
  conversationKey, fetchPage, getAttachmentUrl, onClose,
  group = null, uid = null, onlineMap = {}, canManage = false, onGroupAction = null,
}) {
  const [activeTab, setActiveTab] = useState(group ? "members" : "media");
  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadedKey, setLoadedKey] = useState("");
  const fetchPageRef = useRef(fetchPage);
  const inFlightRef = useRef(0);
  const generationRef = useRef(0);
  const loadRef = useRef(null);
  const closeButtonRef = useRef(null);
  const groupNameRef = useRef(null);
  const groupDescriptionRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const mediaViewer = useChatMedia();
  const tabs = group ? [{ id: "members", label: "Members", icon: Users }, ...TABS] : TABS;
  const queryKey = `${conversationKey || ""}:${activeTab}`;

  useEffect(() => { fetchPageRef.current = fetchPage; }, [fetchPage]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const load = useCallback(async (reset = false) => {
    if (activeTab === "members") return;
    const generation = generationRef.current;
    if (inFlightRef.current === generation) return;
    inFlightRef.current = generation;
    setLoading(true);
    setError("");
    try {
      const data = await fetchPageRef.current({ kind: activeTab, before: reset ? null : cursor, limit: 24 });
      if (generation !== generationRef.current) return;
      setItems((prev) => {
        const next = reset ? data.items || [] : [...prev, ...(data.items || [])];
        const seen = new Set();
        return next.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
      });
      setCursor(data.nextCursor || null);
      setHasMore(Boolean(data.hasMore));
      setLoadedKey(queryKey);
      setError("");
    } catch (loadError) {
      if (generation === generationRef.current) setError(loadError.message || "Could not load shared items.");
    } finally {
      if (generation === generationRef.current) {
        inFlightRef.current = 0;
        setLoading(false);
      }
    }
  }, [activeTab, cursor, queryKey]);
  useEffect(() => { loadRef.current = load; }, [load]);

  useEffect(() => {
    const generation = ++generationRef.current;
    inFlightRef.current = generation;
    let active = true;
    const loadInitial = async () => {
      if (activeTab === "members") {
        setItems([]);
        setLoadedKey(queryKey);
        setLoading(false);
        return;
      }
      try {
        const data = await fetchPageRef.current({ kind: activeTab, before: null, limit: 24 });
        if (!active || generation !== generationRef.current) return;
        setItems(data.items || []);
        setCursor(data.nextCursor || null);
        setHasMore(Boolean(data.hasMore));
        setError("");
        setLoadedKey(queryKey);
      } catch (loadError) {
        if (!active || generation !== generationRef.current) return;
        setItems([]);
        setError(loadError.message || "Could not load shared items.");
        setLoadedKey(queryKey);
      } finally {
        if (active && generation === generationRef.current) {
          inFlightRef.current = 0;
          setLoading(false);
        }
      }
    };
    loadInitial();
    return () => {
      active = false;
      if (inFlightRef.current === generation) inFlightRef.current = 0;
    };
  }, [activeTab, conversationKey, queryKey]);

  const visibleItems = loadedKey === queryKey ? items : [];
  const visibleHasMore = loadedKey === queryKey && hasMore;
  const isInitialLoading = loading || loadedKey !== queryKey;
  const retry = () => loadRef.current?.(visibleItems.length === 0);
  const closePanel = () => {
    onCloseRef.current?.();
    requestAnimationFrame(() => document.querySelector('[aria-label="Shared conversation information"]')?.focus());
  };

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onCloseRef.current?.();
        requestAnimationFrame(() => document.querySelector('[aria-label="Shared conversation information"]')?.focus());
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <aside className="absolute inset-y-0 right-0 z-30 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-xl" aria-label="Conversation information">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">{group ? group.name || "Group information" : "Shared content"}</h2>
          <p className="text-xs text-slate-500">
            {group ? `${(group.participants || []).length} members · ${group.description || "No description"}` : "Browse items shared in this conversation"}
          </p>
        </div>
        <button ref={closeButtonRef} type="button" onClick={closePanel} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500" aria-label="Close shared content">
          <X size={18} />
        </button>
      </header>

      <nav className="grid grid-cols-3 border-b border-slate-200" aria-label="Shared content types">
        {tabs.map(({ id, label, icon: TabIcon }) => (
          <button key={id} type="button" aria-pressed={activeTab === id} onClick={() => setActiveTab(id)}
            className={`flex min-h-11 items-center justify-center gap-1 border-b-2 px-2 text-xs font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500 ${activeTab === id ? "border-orange-500 text-orange-700" : "border-transparent text-slate-500 hover:bg-slate-50"}`}>
            <TabIcon size={14} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isInitialLoading && visibleItems.length === 0 && <p className="py-8 text-center text-sm text-slate-500" role="status">Loading shared items…</p>}
        {error && <div className="py-6 text-center"><p className="text-sm text-red-600">{error}</p><button type="button" onClick={retry} className="mt-2 text-sm font-semibold text-orange-700 underline">Try again</button></div>}
        {!isInitialLoading && !error && visibleItems.length === 0 && activeTab !== "members" && <p className="py-8 text-center text-sm text-slate-500">{visibleHasMore ? "No items on this page. Load more to continue." : `No ${activeTab} shared yet.`}</p>}

        {activeTab === "members" && group && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-orange-100 text-lg font-bold text-orange-700">
                {group.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={group.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (group.name || "G").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-slate-900">{group.name}</p>
                <p className="text-xs text-slate-500">{group.description || "No description"}</p>
                <p className="text-[11px] text-slate-400">Created by {group.createdBy === uid ? "you" : (group.people || []).find((p) => p.uid === group.createdBy)?.displayName || "a member"}</p>
              </div>
              {canManage && onGroupAction && (
                <label className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-600 hover:bg-slate-200" title="Change group photo">
                  <Camera size={17} />
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) onGroupAction("photo", file);
                    event.target.value = "";
                  }} />
                </label>
              )}
            </div>
            {canManage && onGroupAction && (
              <div className="space-y-2 rounded-xl border border-slate-200 p-3">
                <p className="text-xs font-semibold text-slate-700">Group details</p>
                <input
                  key={`${group.conversationId}-name`}
                  ref={groupNameRef}
                  defaultValue={group.name || ""}
                  maxLength={100}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-orange-400 focus:outline-none"
                  aria-label="Group name"
                />
                <textarea
                  key={`${group.conversationId}-description`}
                  ref={groupDescriptionRef}
                  defaultValue={group.description || ""}
                  maxLength={500}
                  rows={2}
                  placeholder="Description"
                  className="w-full resize-none rounded-lg border border-slate-200 px-2 py-1.5 text-sm focus:border-orange-400 focus:outline-none"
                  aria-label="Group description"
                />
                <button
                  type="button"
                  onClick={() => onGroupAction("details", {
                    name: groupNameRef.current?.value || "",
                    description: groupDescriptionRef.current?.value || "",
                  })}
                  className="min-h-10 w-full rounded-lg bg-slate-800 px-3 text-sm font-semibold text-white hover:bg-slate-700"
                >
                  Save details
                </button>
              </div>
            )}
            <ul className="divide-y divide-slate-100">
              {(group.people || []).map((person) => {
                const isAdmin = (group.admins || []).includes(person.uid);
                const online = onlineMap[person.uid] ?? person.online ?? false;
                return (
                  <li key={person.uid} className="flex items-center gap-2 py-2">
                    <span className="relative">
                      <ChatParticipantAvatar person={person} size="h-9 w-9" online={online} showOfflineIndicator />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">{person.displayName || person.email}</p>
                      <p className="text-[11px] text-slate-500">{isAdmin ? "Group admin" : ROLE_LABELS[person.role] || String(person.role || "Member").replace(/_/g, " ")}</p>
                    </div>
                    {canManage && person.uid !== group.createdBy && onGroupAction && (
                      <button type="button" onClick={() => onGroupAction("role", { uid: person.uid, role: isAdmin ? "member" : "admin" })} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100" aria-label={isAdmin ? `Demote ${person.displayName}` : `Make ${person.displayName} an admin`}>
                        {isAdmin ? <Shield size={16} /> : <ShieldCheck size={16} />}
                      </button>
                    )}
                    {canManage && person.uid !== group.createdBy && person.uid !== uid && onGroupAction && (
                      <button type="button" onClick={() => onGroupAction("remove", person.uid)} className="flex h-9 w-9 items-center justify-center rounded-full text-red-500 hover:bg-red-50" aria-label={`Remove ${person.displayName}`}>
                        <X size={16} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {onGroupAction && (
              <div className="space-y-2 border-t border-slate-100 pt-3">
                {canManage && (
                  <button type="button" onClick={() => onGroupAction("add-members")} className="min-h-11 w-full rounded-lg bg-orange-500 px-3 text-sm font-semibold text-white hover:bg-orange-600">Add members</button>
                )}
                {group.createdBy !== uid && (
                  <button type="button" onClick={() => onGroupAction("leave")} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"><LogOut size={16} /> Leave group</button>
                )}
                {canManage && (
                  <button type="button" onClick={() => onGroupAction("delete")} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-red-200 text-sm font-semibold text-red-600 hover:bg-red-50"><Trash2 size={16} /> Delete group</button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === "media" && (
          <div className="grid grid-cols-2 gap-2">
            {visibleItems.map((item) => {
              const url = getAttachmentUrl(item.attachment, item.messageId);
              const type = String(item.attachment?.type || "");
              const isVideo = isVideoType(type);
              const mediaItems = visibleItems
                .filter((candidate) => isImageType(candidate.attachment?.type) || isVideoType(candidate.attachment?.type))
                .map((candidate) => ({
                  id: candidate.id,
                  name: candidate.attachment?.name || "Shared media",
                  type: candidate.attachment?.type,
                  url: getAttachmentUrl(candidate.attachment, candidate.messageId),
                  messageId: candidate.messageId,
                }));
              const mediaIndex = Math.max(0, mediaItems.findIndex((candidate) => candidate.id === item.id));
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => mediaViewer?.open(mediaItems, mediaIndex)}
                  className="group relative aspect-square w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500"
                  aria-label={`View ${item.attachment?.name || "shared media"}`}
                >
                  {isVideo ? (
                    <video src={url} preload="metadata" muted className="h-full w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={item.attachment?.name || "Shared image"} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                  )}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-2 py-1 text-xs text-white">{item.attachment?.name || "Shared media"}</span>
                </button>
              );
            })}
          </div>
        )}

        {activeTab === "documents" && (
          <ul className="divide-y divide-slate-100">
            {visibleItems.map((item) => {
              const attachment = item.attachment || {};
              const url = getAttachmentUrl(attachment, item.messageId);
              return (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  <File size={20} className="shrink-0 text-slate-500" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{attachment.name || "Document"}</p>
                    <p className="text-xs text-slate-500">{String(attachment.type || "File")} · {formatSize(attachment.size)} · {formatDate(item.createdAt)}</p>
                  </div>
                  <a href={url} target="_blank" rel="noreferrer" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500" aria-label={`Open or download ${attachment.name || "document"}`}>
                    <Download size={17} />
                  </a>
                </li>
              );
            })}
          </ul>
        )}

        {activeTab === "links" && (
          <ul className="divide-y divide-slate-100">
            {visibleItems.map((item) => (
              <li key={item.id} className="py-3">
                <a href={item.url} target="_blank" rel="noreferrer" className="flex items-start gap-3 rounded-md p-2 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-500">
                  <ExternalLink size={17} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-800">{item.title}</span>
                    <span className="block break-all text-xs text-blue-700">{item.url}</span>
                    <span className="mt-1 block text-[11px] text-slate-500">Shared {formatDate(item.createdAt)}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {visibleHasMore && (
        <footer className="border-t border-slate-200 p-3">
          <button type="button" onClick={() => load(false)} disabled={loading} className="min-h-11 w-full rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {loading ? "Loading…" : "Load more"}
          </button>
        </footer>
      )}
    </aside>
  );
}
