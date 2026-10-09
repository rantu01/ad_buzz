"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import { TICKET_STAGES, ticketStageLabel, ticketStageColor } from "@/lib/ticketStages";
import { useUserAlerts } from "../components/UserAlertProvider";
import Swal from "sweetalert2";
import { Search } from "lucide-react";
import Pagination from "@/app/Component/Pagination";

const ITEMS_PER_PAGE = 20;

export default function SupportTicketsPage() {
  const { user, loading: authLoading } = useAuth();
  const { ticketSeq, markTicketRead, markReadByRef, markReadByTypes, ticketUnread, refreshTickets } = useUserAlerts();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [searchTicketId, setSearchTicketId] = useState("");
  const [selected, setSelected] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [sendingReply, setSendingReply] = useState(false);
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [adAccounts, setAdAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState("");

  const loadTickets = async () => {
    if (!user?.uid) return;
    try {
      const res = await fetch(`/api/user/support-tickets?uid=${encodeURIComponent(user.uid)}`, { cache: "no-store" });
      const data = await res.json();
      if (data.success) {
        const list = data.tickets || [];
        setTickets(list);
        setSelected((prev) => {
          // Deep-link from a notification: open the referenced ticket once.
          // Landing here counts as viewing it, so its unread state clears.
          try {
            const deep = window.sessionStorage.getItem("ab_highlight_ticket");
            if (deep) {
              window.sessionStorage.removeItem("ab_highlight_ticket");
              const match = list.find((t) => String(t._id) === deep);
              if (match) {
                setReplyText("");
                markTicketRead(String(match._id));
                markReadByRef("ticket", String(match._id));
                return { ...match, unread: false };
              }
            }
          } catch { /* selection still refreshes below */ }
          // Keep the open ticket in sync across live reloads.
          if (prev) {
            const match = list.find((t) => String(t._id) === String(prev._id));
            if (match) return match.unread === prev.unread ? prev : match;
            return prev;
          }
          return prev;
        });
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

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

  // Live update: a staff reply or stage change refreshes the list.
  useEffect(() => {
    if (ticketSeq > 0) loadTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketSeq]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      Swal.fire("Required", "Please fill in all fields.", "warning");
      return;
    }
    if (adAccounts.length > 0 && !selectedAccount) {
      Swal.fire("Required", "Please select the affected ad account.", "warning");
      return;
    }
    setSubmitting(true);
    try {
      const account = selectedAccount ? adAccounts.find((a) => a._id === selectedAccount) : null;
      const res = await fetch("/api/user/support-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          email: user.email,
          subject: subject.trim(),
          message: message.trim(),
          adAccountId: account?._id || null,
          adAccountMetaId: account?.metaAccountId || account?.accountId || null,
          adAccountName: account?.metaAccountName || account?.name || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to create ticket.");
      setTickets((prev) => [data.ticket, ...prev]);
      setSelected({ ...data.ticket, unread: false });
      setReplyText("");
      setShowForm(false);
      setSubject("");
      setMessage("");
      setSelectedAccount("");
      Swal.fire({ icon: "success", title: "Ticket Created", text: "Support will get back to you soon.", timer: 1500, showConfirmButton: false });
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setSubmitting(false);
    }
  };

  const openTicket = (ticket) => {
    setSelected(ticket);
    setReplyText("");
    // Opening a ticket means viewing it: clear its ticket flag and its
    // notification logs together so the bell updates immediately.
    if (ticket?._id && ticket.unread) {
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
      // The customer has seen their own reply: clear its unread flag and logs.
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

  const handleMarkAllTicketsRead = async () => {
    if (!user?.uid) return;
    try {
      await fetch("/api/user/support-tickets/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: user.uid, all: true }),
      });
      setTickets((prev) => prev.map((t) => ({ ...t, unread: false })));
      setSelected((prev) => (prev ? { ...prev, unread: false } : prev));
      // Also clear the ticket notification logs so the bell drops at once.
      markReadByTypes(["ticket_created", "ticket_reply", "ticket_stage"]);
      refreshTickets();
    } catch { /* ignore */ }
  };

  // Same client-side stage/search filtering as the admin list.
  const filteredTickets = tickets.filter((t) => {
    if (filter && t.status !== filter) return false;
    if (searchTicketId.trim() && !(t.ticketId || "").toLowerCase().includes(searchTicketId.trim().toLowerCase())) return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filteredTickets.length / ITEMS_PER_PAGE));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const paginatedTickets = filteredTickets.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  const goToPage = (p) => {
    setPage(Math.min(Math.max(1, p), totalPages));
  };

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-10 text-slate-600 font-medium">Loading...</div>;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Support Tickets</h1>
        <div className="flex items-center gap-2 shrink-0">
          {ticketUnread > 0 && (
            <button onClick={handleMarkAllTicketsRead}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">
              Mark all read ({ticketUnread})
            </button>
          )}
          <button onClick={() => setShowForm(!showForm)}
            className="rounded-lg bg-[#F59E0B] px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-[#D9910A] transition">
            {showForm ? "Cancel" : "New Ticket"}
          </button>
        </div>
      </div>
      <p className="text-sm text-slate-500 mb-6">Submit and track your support requests</p>

      {showForm && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Create New Ticket</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Subject *</label>
              <input type="text" required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief title of your issue"
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Affected Ad Account *</label>
              <select value={selectedAccount} onChange={(e) => setSelectedAccount(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary">
                <option value="">{adAccounts.length === 0 ? "-- No accounts available --" : "-- Select an account --"}</option>
                {adAccounts.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.metaAccountName || a.name} (ID: {(a.metaAccountId || a.accountId || "").replace(/^act_/, "")})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Message *</label>
              <textarea required value={message} onChange={(e) => setMessage(e.target.value)} rows={5} placeholder="Describe your issue in detail..."
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
            </div>
            <div className="flex justify-end">
              <button type="submit" disabled={submitting}
                className="rounded-xl bg-[#F59E0B] px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-[#D9910A] transition disabled:opacity-50">
                {submitting ? "Submitting..." : "Submit Ticket"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="mb-6 space-y-3">
        <div className="flex gap-2 flex-wrap">
          {[{ key: "", label: "All" }, ...TICKET_STAGES].map((s) => (
            <button key={s.key} onClick={() => { setFilter(s.key); setPage(1); }}
              className={`px-4 py-2 rounded-lg font-medium capitalize transition-colors text-sm ${filter === s.key ? "bg-[#F59E0B] text-slate-950" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="relative max-w-xs">
          <input type="text" value={searchTicketId} onChange={(e) => { setSearchTicketId(e.target.value); setPage(1); }}
            placeholder="Search by Ticket ID..."
            className="w-full rounded-lg border border-slate-200 pl-4 pr-10 py-2 text-sm outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1">
          {loading ? (
            <p className="text-slate-500">Loading...</p>
          ) : paginatedTickets.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">No tickets found.</div>
          ) : (
            <div className="space-y-3">
              {paginatedTickets.map((t) => (
                  <div key={t._id} onClick={() => openTicket(t)}
                    className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${selected?._id === t._id ? "border-amber-400 ring-1 ring-amber-400/50" : t.unread ? "border-amber-300 ring-1 ring-amber-300/40 bg-amber-50/40 hover:border-amber-400" : "border-slate-200 hover:border-slate-300"}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${ticketStageColor(t.status)}`}>{ticketStageLabel(t.status)}</span>
                        {t.unread && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                            <span className="h-1.5 w-1.5 rounded-full bg-white" /> New
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] text-slate-400">Ticket Id: {t.ticketId} &middot; {new Date(t.createdAt).toLocaleDateString("en-BD", { day: "2-digit", month: "short" })}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 truncate">{t.subject}</p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{t.email}</p>
                    {t.adAccountName && (
                      <p className="text-xs text-amber-600 truncate mt-0.5">Ad Account: {t.adAccountName}{t.adAccountMetaId ? ` (ID: ${t.adAccountMetaId.replace(/^act_/, "")})` : ""}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{t.message}</p>
                  </div>
              ))}
            </div>
          )}
          <Pagination page={safePage} totalPages={totalPages} onPageChange={goToPage} />
        </div>

        <div className="xl:col-span-2">
          {!selected ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
              <p className="text-lg">Select a ticket to view details</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="p-6 border-b border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-bold text-slate-900">{selected.subject}</h2>
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${ticketStageColor(selected.status)}`}>
                    {ticketStageLabel(selected.status)}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                    Ticket Id: {selected.ticketId} &middot; From: {selected.email} &middot; {new Date(selected.createdAt).toLocaleString("en-BD")}
                  </p>
                  {selected.adAccountName && (
                    <p className="text-xs text-amber-600 mt-1.5 font-medium">
                      Ad Account: {selected.adAccountName}{selected.adAccountMetaId ? ` (ID: ${selected.adAccountMetaId.replace(/^act_/, "")})` : ""}
                    </p>
                  )}
                <p className="mt-3 text-sm text-slate-700 bg-slate-50 rounded-xl p-4">{selected.message}</p>
              </div>

              <div className="p-6 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Replies ({selected.replies?.length || 0})</h3>
                {(!selected.replies || selected.replies.length === 0) ? (
                  <p className="text-sm text-slate-400">No replies yet.</p>
                ) : (
                  <div className="space-y-3 max-h-60 overflow-y-auto">
                    {selected.replies.map((r, i) => (
                      <div key={i} className="rounded-xl bg-slate-50 p-4">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-slate-700">{r.by} <span className="text-slate-400 font-normal">({r.role})</span></span>
                          <span className="text-[11px] text-slate-400">{new Date(r.createdAt).toLocaleString("en-BD")}</span>
                        </div>
                        <p className="text-sm text-slate-600">{r.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selected.status !== "closed" && (
                <div className="p-6">
                  <form onSubmit={handleReply} className="space-y-3">
                    <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} placeholder="Type your reply..." disabled={sendingReply}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
                    <div className="flex gap-2">
                      <button type="submit" disabled={sendingReply || !replyText.trim()}
                        className="rounded-xl bg-[#F59E0B] px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-[#D9910A] transition disabled:opacity-50">
                        {sendingReply ? "Sending..." : "Send Reply"}
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {selected.status === "closed" && (
                <div className="p-6 text-center text-sm text-slate-400">This ticket is closed.</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
