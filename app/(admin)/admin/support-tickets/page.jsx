"use client";

import { useEffect, useState } from "react";
import { useAdmin } from "../components/AdminProvider";
import { hasPermission } from "@/lib/permissions";
import Swal from "sweetalert2";

const STATUS_COLORS = {
  open: "bg-blue-50 text-blue-700",
  in_progress: "bg-amber-50 text-amber-700",
  replied: "bg-purple-50 text-purple-700",
  closed: "bg-slate-50 text-slate-600",
};

export default function SupportTicketsPage() {
  const { profile } = useAdmin();
  const role = profile?.role || "customer";
  const canManage = hasPermission(role, "manage_tickets");

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState(null);
  const [replyText, setReplyText] = useState("");

  const loadTickets = async () => {
    setLoading(true);
    try {
      const q = filter ? `?status=${filter}` : "";
      const res = await fetch(`/api/admin/support-tickets${q}`);
      const data = await res.json();
      if (data.success) setTickets(data.tickets || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { loadTickets(); }, [filter]);

  const openTicket = async (ticket) => {
    setSelected(ticket);
    setReplyText("");
  };

  const handleStatusChange = async (ticketId, status) => {
    const res = await fetch("/api/admin/support-tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId, action: status }),
    });
    const data = await res.json();
    if (data.success) {
      setSelected(data.ticket);
      loadTickets();
    }
  };

  const handleReply = async (e) => {
    e.preventDefault();
    if (!replyText.trim() || !selected) return;
    const res = await fetch("/api/admin/support-tickets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticketId: selected._id, action: "reply", reply: replyText.trim(), staffName: profile?.displayName || profile?.email || "Staff", staffRole: profile?.role }),
    });
    const data = await res.json();
    if (data.success) {
      setReplyText("");
      setSelected(data.ticket);
      loadTickets();
    } else {
      Swal.fire("Error", data.message, "error");
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Support Tickets</h1>
      <p className="text-sm text-slate-500 mb-6">View and manage user support tickets</p>

      <div className="mb-6 flex gap-2 flex-wrap">
        {["", "open", "in_progress", "replied", "closed"].map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className={`px-4 py-2 rounded-lg font-medium capitalize transition-colors text-sm ${filter === s ? "bg-[#F59E0B] text-slate-950" : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
            {s || "All"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1">
          {loading ? (
            <p className="text-slate-500">Loading...</p>
          ) : tickets.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">No tickets found.</div>
          ) : (
            <div className="space-y-3">
              {tickets.map((t) => (
                  <div key={t._id} onClick={() => openTicket(t)}
                    className={`bg-white rounded-xl border p-4 cursor-pointer transition-all ${selected?._id === t._id ? "border-amber-400 ring-1 ring-amber-400/50" : "border-slate-200 hover:border-slate-300"}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${STATUS_COLORS[t.status] || "bg-slate-50 text-slate-600"}`}>{t.status?.replace(/_/g, " ")}</span>
                      <span className="text-[11px] text-slate-400">Ticket Id: {t.ticketId} &middot; {new Date(t.createdAt).toLocaleDateString("en-BD", { day: "2-digit", month: "short" })}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 truncate">{t.subject}</p>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{t.email}</p>
                    {t.adAccountName && (
                      <p className="text-xs text-amber-600 truncate mt-0.5">Ad Account: {t.adAccountName}{t.adAccountMetaId ? ` (${t.adAccountMetaId})` : ""}</p>
                    )}
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">{t.message}</p>
                  </div>
              ))}
            </div>
          )}
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
                  <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[selected.status] || "bg-slate-50 text-slate-600"}`}>
                    {selected.status?.replace(/_/g, " ")}
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                    Ticket Id: {selected.ticketId} &middot; From: {selected.email} &middot; {new Date(selected.createdAt).toLocaleString("en-BD")}
                  </p>
                  {selected.adAccountName && (
                    <p className="text-xs text-amber-600 mt-1.5 font-medium">
                      Ad Account: {selected.adAccountName}{selected.adAccountMetaId ? ` (Meta ID: ${selected.adAccountMetaId})` : ""}
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

              {canManage && selected.status !== "closed" && (
                <div className="p-6">
                  <form onSubmit={handleReply} className="space-y-3">
                    <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} placeholder="Type your reply..."
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
                    <div className="flex gap-2">
                      <button type="submit" disabled={!replyText.trim()}
                        className="rounded-xl bg-[#F59E0B] px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-[#D9910A] transition disabled:opacity-50">
                        Send Reply
                      </button>
                      {selected.status !== "in_progress" && (
                        <button type="button" onClick={() => handleStatusChange(selected._id, "in_progress")}
                          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Mark In Progress</button>
                      )}
                      <button type="button" onClick={() => handleStatusChange(selected._id, "closed")}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">Close Ticket</button>
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
