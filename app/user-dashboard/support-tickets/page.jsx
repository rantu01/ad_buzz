"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/Component/Auth/AuthProvider";
import Swal from "sweetalert2";

export default function SupportTicketsPage() {
  const { user, loading: authLoading } = useAuth();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [replyText, setReplyText] = useState({});
  const [replyingTo, setReplyingTo] = useState(null);
  const [sendingReply, setSendingReply] = useState(false);
  const [adAccounts, setAdAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState("");

  const loadTickets = async () => {
    if (!user?.uid) return;
    try {
      const res = await fetch(`/api/user/support-tickets?uid=${encodeURIComponent(user.uid)}`);
      const data = await res.json();
      if (data.success) setTickets(data.tickets || []);
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
  }, [user?.uid, authLoading]);

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

  const handleReply = async (ticketId) => {
    const text = replyText[ticketId];
    if (!text?.trim()) {
      Swal.fire("Required", "Please write a reply.", "warning");
      return;
    }
    setSendingReply(true);
    setReplyingTo(ticketId);
    try {
      const res = await fetch("/api/user/support-tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticketId,
          uid: user.uid,
          message: text.trim(),
          userName: user.displayName || user.email?.split("@")[0] || "You",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "Failed to send reply.");
      setTickets((prev) => prev.map((t) => (t._id === ticketId ? data.ticket : t)));
      setReplyText((prev) => ({ ...prev, [ticketId]: "" }));
      Swal.fire({ icon: "success", title: "Reply Sent", timer: 1000, showConfirmButton: false });
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setSendingReply(false);
      setReplyingTo(null);
    }
  };

  if (authLoading) return <div className="max-w-7xl mx-auto px-4 py-10 text-slate-600 font-medium">Loading...</div>;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm text-slate-500 font-medium uppercase tracking-wider">Support</p>
          <h1 className="text-3xl font-bold text-slate-900 mt-0.5">Support Tickets</h1>
          <p className="text-sm text-slate-600 mt-1">Submit and track your support requests</p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="rounded-xl bg-[#F59E0B] px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-[#D9910A] transition">
          {showForm ? "Cancel" : "New Ticket"}
        </button>
      </div>

      {showForm && (
        <div className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
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

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="h-4 w-48 bg-slate-200 rounded mb-3" />
              <div className="h-3 w-full bg-slate-200 rounded mb-2" />
              <div className="h-3 w-3/4 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 shadow-sm text-center">
          <p className="text-lg font-semibold text-slate-700">No tickets yet</p>
          <p className="mt-1 text-sm text-slate-500">Click "New Ticket" to create your first support request.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tickets.map((t) => (
            <div key={t._id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-base font-semibold text-slate-900">{t.subject} <span className="text-sm font-normal text-slate-400">Ticket Id: {t.ticketId}</span></h3>
                <StatusBadge status={t.status} />
              </div>
              {t.adAccountName && (
                <p className="text-xs text-amber-600 font-medium mb-2">Ad Account: {t.adAccountName}</p>
              )}
              <div className="rounded-xl bg-slate-50 p-4 mb-3">
                <p className="text-xs text-slate-400 mb-1">You</p>
                <p className="text-sm text-slate-700">{t.message}</p>
              </div>

              {t.replies && t.replies.length > 0 && (
                <div className="space-y-2 mb-4">
                  {t.replies.map((r, i) => (
                    <div key={i} className={`rounded-xl p-3 ${r.role === "customer" ? "bg-blue-50 ml-6" : "bg-slate-50"}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-slate-700">{r.by}</span>
                        <span className="text-[11px] text-slate-400">{new Date(r.createdAt).toLocaleString("en-BD")}</span>
                      </div>
                      <p className="text-sm text-slate-600">{r.text}</p>
                    </div>
                  ))}
                </div>
              )}

              {t.status !== "closed" && (
                <div className="border-t border-slate-100 pt-4">
                  {replyingTo === t._id ? (
                    <div className="space-y-3">
                      <textarea value={replyText[t._id] || ""} onChange={(e) => setReplyText((prev) => ({ ...prev, [t._id]: e.target.value }))}
                        rows={2} placeholder="Type your reply..." disabled={sendingReply}
                        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary" />
                      <div className="flex gap-2">
                        <button onClick={() => handleReply(t._id)} disabled={sendingReply || !replyText[t._id]?.trim()}
                          className="rounded-xl bg-[#F59E0B] px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-[#D9910A] transition disabled:opacity-50">
                          {sendingReply ? "Sending..." : "Send Reply"}
                        </button>
                        <button onClick={() => setReplyText((prev) => ({ ...prev, [t._id]: "" }))}
                          className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setReplyText((prev) => ({ ...prev, [t._id]: replyText[t._id] || "" })) || setReplyingTo(t._id)}
                      className="text-sm font-medium text-[#F59E0B] hover:text-[#D9910A] transition">
                      Reply
                    </button>
                  )}
                </div>
              )}

              {t.status === "closed" && (
                <p className="text-xs text-slate-400 pt-3 border-t border-slate-100">This ticket is closed.</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const colors = {
    open: "bg-blue-50 text-blue-700",
    in_progress: "bg-amber-50 text-amber-700",
    replied: "bg-purple-50 text-purple-700",
    closed: "bg-slate-50 text-slate-600",
  };
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colors[status] || "bg-slate-50 text-slate-600"}`}>
      {status?.replace(/_/g, " ") || "open"}
    </span>
  );
}
