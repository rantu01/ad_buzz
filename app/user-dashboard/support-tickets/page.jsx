"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { TICKET_STAGES, ticketStageLabel, ticketStageColor } from "@/lib/ticketStages";
import { useUserAlerts } from "../components/UserAlertProvider";
import Swal from "sweetalert2";
import { Plus } from "lucide-react";
import NewTicketModal from "./NewTicketModal";
import Pagination from "@/app/Component/Pagination";
import { formatDate, formatDateTime } from "@/lib/dateFormat";
import { useChatMedia } from "@/app/Component/Chat/ChatMediaLightbox";

const ITEMS_PER_PAGE = 5;

function statusGroup(status) {
  const s = String(status || "open").toLowerCase();
  if (s === "closed") return "solved";
  if (s === "support_agent_reply" || s === "replied") return "waiting";
  return "progress";
}

export default function SupportTicketsPage() {
  const { user, loading: authLoading } = useAuth();
  const mediaViewer = useChatMedia();
  const { ticketSeq, lastTicketId, markTicketRead, markReadByRef, markReadByTypes, ticketUnread, refreshTickets } = useUserAlerts();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [adAccounts, setAdAccounts] = useState([]);
  const selectedRef = useRef(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  const fetchThread = async (ticketId) => {
    const uid = user?.uid;
    if (!uid || !ticketId) return null;
    try {
      const res = await fetch(
        `/api/user/support-tickets?uid=${encodeURIComponent(uid)}&id=${encodeURIComponent(String(ticketId))}`,
        { cache: "no-store" }
      );
      const data = await res.json();
      if (data.success && data.ticket) return data.ticket;
    } catch { /* ignore */ }
    return null;
  };

  const openTicketWithHistory = async (ticketId) => {
    if (!ticketId) return false;
    const full = await fetchThread(ticketId);
    if (full) {
      setReplyText("");
      markTicketRead(String(full._id));
      markReadByRef("ticket", String(full._id));
      setSelected({ ...full, unread: false });
      setTickets((prev) => {
        const exists = prev.some((t) => String(t._id) === String(full._id));
        if (exists) return prev.map((t) => (String(t._id) === String(full._id) ? { ...full, unread: false } : t));
        return [{ ...full, unread: false }, ...prev];
      });
      return true;
    }
    return false;
  };

  const loadTickets = async () => {
    if (!user?.uid) return;
    try {
      setError("");
      const res = await fetch(`/api/user/support-tickets?uid=${encodeURIComponent(user.uid)}`, { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        const list = data.tickets || [];
        setTickets(list);
        try {
          const deep = window.sessionStorage.getItem("ab_highlight_ticket");
          if (deep) {
            window.sessionStorage.removeItem("ab_highlight_ticket");
            const opened = await openTicketWithHistory(deep);
            if (opened) return;
          }
        } catch { /* ignore */ }
        setSelected((prev) => {
          if (prev) {
            const row = list.find((t) => String(t._id) === String(prev._id));
            if (row) {
              const sameCount = (row.replies?.length || 0) === (prev.replies?.length || 0);
              if (sameCount) return { ...prev, ...row, replies: prev.replies };
              return prev;
            }
            return prev;
          }
          return prev;
        });
      } else {
        setError(data.message || "Failed to load tickets.");
      }
    } catch {
      setError("Failed to load tickets.");
    } finally {
      setLoading(false);
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (user?.uid) {
      loadTickets();
      fetch(`/api/user/ad-accounts?uid=${encodeURIComponent(user.uid)}`)
        .then((r) => r.json())
        .then((d) => { if (d.success) setAdAccounts(d.adAccounts || []); })
        .catch(() => {});
    } else if (!authLoading) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, authLoading]);
  /* eslint-enable react-hooks/set-state-in-effect */

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (ticketSeq === 0) return;
    loadTickets();
    const openId = selectedRef.current?._id ? String(selectedRef.current._id) : null;
    const targetId = lastTicketId && (!openId || String(lastTicketId) === openId) ? String(lastTicketId) : openId;
    if (targetId) {
      (async () => {
        const full = await fetchThread(targetId);
        if (full && String(selectedRef.current?._id || "") === String(full._id)) {
          setSelected((prev) => {
            const prevCount = prev?.replies?.length || 0;
            const nextCount = full.replies?.length || 0;
            if (nextCount > prevCount || full.unread) {
              markTicketRead(String(full._id));
              markReadByRef("ticket", String(full._id));
            }
            return { ...full, unread: false };
          });
          setTickets((prev) => prev.map((t) => (String(t._id) === String(full._id) ? { ...full, unread: false } : t)));
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketSeq]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const openTicket = async (ticket) => {
    setSelected((prev) => {
      const prevReplies = prev && String(prev._id) === String(ticket?._id) ? prev.replies : undefined;
      return { ...ticket, replies: ticket?.replies ?? prevReplies };
    });
    setReplyText("");
    const full = await fetchThread(ticket?._id);
    if (full && String(selectedRef.current?._id || "") === String(full._id)) {
      markTicketRead(String(full._id));
      markReadByRef("ticket", String(full._id));
      setTickets((prev) => prev.map((t) => (String(t._id) === String(full._id) ? { ...full, unread: false } : t)));
      setSelected({ ...full, unread: false });
    } else if (ticket?._id && ticket.unread) {
      markTicketRead(String(ticket._id));
      markReadByRef("ticket", String(ticket._id));
      setTickets((prev) => prev.map((t) => (String(t._id) === String(ticket._id) ? { ...t, unread: false } : t)));
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selected) return;
    setSendingReply(true);
    try {
      const res = await fetch("/api/user/support-tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId: selected._id,
          uid: user.uid,
          message: replyText.trim(),
          userName: user.displayName || user.email?.split("@")[0] || "You",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to send reply.");
      setReplyText("");
      markReadByRef("ticket", String(data.ticket._id));
      setSelected({ ...data.ticket, unread: false });
      setTickets((prev) => prev.map((t) => (String(t._id) === String(data.ticket._id) ? { ...data.ticket, unread: false } : t)));
      Swal.fire({ icon: "success", title: "Reply Sent", timer: 1000, showConfirmButton: false });
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setSendingReply(false);
    }
  };

  const sortedTickets = [...tickets].sort((a, b) => {
    const au = a?.unread ? 1 : 0;
    const bu = b?.unread ? 1 : 0;
    if (au !== bu) return bu - au;
    return new Date(b?.updatedAt || b?.createdAt || 0) - new Date(a?.updatedAt || a?.createdAt || 0);
  });

  const totalPages = Math.max(1, Math.ceil(sortedTickets.length / ITEMS_PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paginatedTickets = sortedTickets.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const opened = tickets.length;
  const waiting = tickets.filter((t) => statusGroup(t.status) === "waiting").length;
  const inProgress = tickets.filter((t) => statusGroup(t.status) === "progress").length;
  const solved = tickets.filter((t) => statusGroup(t.status) === "solved").length;

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-10 text-slate-600 font-medium">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-slate-900">Support Tickets</h1>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#F59E0B] px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-[#D9910A] transition"
        >
          <Plus size={16} /> New Ticket
        </button>
      </div>

      {/* Statistics */}
      <div className="flex flex-wrap overflow-hidden rounded-2xl border border-slate-200 bg-white divide-x divide-slate-200">
        {[
          { label: "Opened", count: opened, desc: "All time" },
          { label: "Waiting for you", count: waiting, desc: "Nothing needed" },
          { label: "In progress", count: inProgress, desc: "We're on it" },
          { label: "Solved", count: solved, desc: "Done" },
        ].map((s) => (
          <div key={s.label} className="min-w-[50%] flex-1 px-5 py-4 text-center md:min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{s.count}</p>
            <p className="text-xs text-slate-400">{s.desc}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 bg-white">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Ticket</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Subject</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">About</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-500">Last update</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-500">Loading...</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-red-500">{error}</td>
                </tr>
              ) : paginatedTickets.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-16">
                    <div className="mx-auto flex max-w-sm flex-col items-center text-center">
                      <p className="text-sm font-semibold text-slate-900">No tickets yet</p>
                      <p className="mt-1 text-sm text-slate-500">Open a ticket whenever you need help and our team will reply here.</p>
                      <button
                        type="button"
                        onClick={() => setShowForm(true)}
                        className="mt-4 inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        <Plus size={14} /> Open ticket
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedTickets.map((t) => (
                  <tr
                    key={t._id}
                    onClick={() => openTicket(t)}
                    className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50"
                  >
                    <td className="px-5 py-3 font-medium text-slate-900">{t.ticketId}</td>
                    <td className="px-5 py-3 text-slate-700">{t.subject}</td>
                    <td className="px-5 py-3 text-slate-600">{(t.adAccounts && t.adAccounts.length ? t.adAccounts.map((a) => a.name).filter(Boolean).join(", ") : t.adAccountName) || "General"}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ticketStageColor(t.status)}`}>
                        {ticketStageLabel(t.status)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{formatDate(t.updatedAt || t.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-5 py-3">
          <Pagination page={safePage} totalPages={totalPages} onPageChange={setPage} />
        </div>
      </div>

      {/* Ticket detail */}
      {selected && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">{selected.subject}</h2>
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ticketStageColor(selected.status)}`}>
              {ticketStageLabel(selected.status)}
            </span>
          </div>
          <p className="text-xs text-slate-500 mb-3">
            Ticket Id: {selected.ticketId} &middot; From: {selected.email} &middot; {formatDateTime(selected.createdAt)}
          </p>
          {((selected.adAccounts && selected.adAccounts.length) || selected.adAccountName) && (
            <p className="text-xs text-amber-600 mb-3 font-medium">
              Ad Account: {(selected.adAccounts && selected.adAccounts.length
                ? selected.adAccounts.map((a) => a.name || a.metaAccountId).filter(Boolean).join(", ")
                : selected.adAccountName)}
            </p>
          )}
          <p className="text-sm text-slate-700 bg-slate-50 rounded-xl p-4">{selected.message}</p>

          {Array.isArray(selected.attachments) && selected.attachments.length > 0 && (
            <div className="mt-3">
              <h3 className="text-sm font-semibold text-slate-700 mb-2">Attachments ({selected.attachments.length})</h3>
              <div className="flex flex-wrap gap-2">
                {selected.attachments.map((a) => {
                  const url = `/api/support-tickets/attachments?ticketId=${encodeURIComponent(selected._id)}&attachmentId=${encodeURIComponent(a.id)}&uid=${encodeURIComponent(user.uid)}`;
                  if (String(a.type || "").startsWith("image/")) {
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          const images = (selected.attachments || []).filter((item) => String(item.type || "").startsWith("image/"));
                          mediaViewer?.open(images.map((item) => ({
                            id: item.id,
                            name: item.name,
                            type: item.type,
                            url: `/api/support-tickets/attachments?ticketId=${encodeURIComponent(selected._id)}&attachmentId=${encodeURIComponent(item.id)}&uid=${encodeURIComponent(user.uid)}`,
                          })), images.findIndex((item) => item.id === a.id));
                        }}
                        className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                      >
                        <img src={url} alt={a.name} className="h-24 w-24 object-cover" />
                      </button>
                    );
                  }
                  return (
                    <a
                      key={a.id}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <span className="truncate">{a.name}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-4">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Replies ({selected.replies?.length || 0})</h3>
            {(!selected.replies || selected.replies.length === 0) ? (
              <p className="text-sm text-slate-400">No replies yet.</p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {selected.replies.map((r, i) => (
                  <div key={i} className="rounded-xl bg-slate-50 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-slate-700">{r.by} <span className="text-slate-400 font-normal">({r.role})</span></span>
                      <span className="text-[11px] text-slate-400">{formatDateTime(r.createdAt)}</span>
                    </div>
                    <p className="text-sm text-slate-600">{r.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selected.status !== "closed" && (
            <form onSubmit={handleReply} className="mt-4 space-y-2">
              <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} placeholder="Type your reply..." disabled={sendingReply}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
              <button type="submit" disabled={sendingReply || !replyText.trim()}
                className="rounded-xl bg-[#F59E0B] px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-[#D9910A] transition disabled:opacity-50">
                {sendingReply ? "Sending..." : "Send Reply"}
              </button>
            </form>
          )}
        </div>
      )}

      <NewTicketModal
        open={showForm}
        onClose={() => setShowForm(false)}
        user={user}
        adAccounts={adAccounts}
        onCreated={(ticket) => {
          setTickets((prev) => [ticket, ...prev]);
          setSelected({ ...ticket, unread: false });
          setReplyText("");
          loadTickets();
        }}
      />

    </div>
  );
}